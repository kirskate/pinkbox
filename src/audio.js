import * as Tone from "tone";
import { PPQ, STEP_TICKS, filterFrequency } from "./patterns.js";
import { PerformanceState, clamp } from "./state.js";
const PRESETS = {
  0: {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.025, decay: 0.3, sustain: 0.55, release: 0.12 },
    volume: -23,
  },
  1: {
    oscillator: { type: "sine" },
    envelope: { attack: 0.008, decay: 0.3, sustain: 0.45, release: 0.16 },
    volume: -22,
  },
  2: {
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.018, decay: 0.25, sustain: 0.4, release: 0.12 },
    volume: -27,
  },
  bass: {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.008, decay: 0.12, sustain: 0.7, release: 0.08 },
    volume: -19,
  },
};
export class AudioEngine {
  constructor() {
    this.state = new PerformanceState();
    this.listeners = new Set();
    this.transport = Tone.getTransport();
    this.transport.PPQ = PPQ;
    this.transport.timeSignature = 4;
    this.context = Tone.getContext();
    this.context.lookAhead = 0.04;
    this.context.updateInterval = 0.01;
    this.session = null;
    this.master = null;
    this.retired = new Set();
    this.scheduleId = null;
    this.createdSessions = 0;
    this.disposedSessions = 0;
    this.history = [];
    this.onContextState = () => {
      if (this.state.status === "running" && this.context.state !== "running")
        this.stop("Звук прерван. Нажми PLAY.");
    };
    this.context.on("statechange", this.onContextState);
  }
  subscribe(callback) {
    this.listeners.add(callback);
    callback(this.state.snapshot());
    return () => this.listeners.delete(callback);
  }
  publish(snapshot = this.state.snapshot()) {
    for (const callback of this.listeners) callback(snapshot);
  }
  createSession() {
    if (!this.master)
      this.master = new Tone.Gain(
        (this.state.volume / 100) * 0.8,
      ).toDestination();
    const gate = new Tone.Gain(0).connect(this.master);
    const channels = {};
    try {
      for (const id of ["live", "loop0", "loop1", "loop2", "loop3", "loop4"]) {
        const gain = new Tone.Gain(id === "live" ? 1 : 0).connect(gate);
        const filter = new Tone.Filter(18000, "lowpass").connect(gain);
        channels[id] = {
          gain,
          filter,
          synth: null,
          end: Infinity,
          sounding: false,
          preset: null,
          cutoff: null,
        };
        channels[id].synth = new Tone.PolySynth({
          voice: Tone.Synth,
          maxPolyphony: 16,
          options: PRESETS[0],
        }).connect(filter);
      }
    } catch (error) {
      for (const channel of Object.values(channels)) {
        channel.synth?.dispose();
        channel.filter.dispose();
        channel.gain.dispose();
      }
      gate.dispose();
      throw error;
    }
    this.createdSessions++;
    return {
      gate,
      channels,
      generation: this.state.generation,
      disposed: false,
    };
  }
  disposeSession(session) {
    if (!session || session.disposed) return;
    session.disposed = true;
    for (const c of Object.values(session.channels)) {
      c.synth.dispose();
      c.filter.dispose();
      c.gain.dispose();
    }
    session.gate.dispose();
    this.retired.delete(session);
    this.disposedSessions++;
  }
  async play() {
    const generation = this.state.beginStart();
    if (generation === null) return;
    this.publish();
    let candidate;
    try {
      await Tone.start();
      if (generation !== this.state.generation) return;
      if (this.context.state !== "running")
        throw new Error("Браузер не разрешил звук");
      candidate = this.createSession();
      if (!this.state.finishStart(generation)) {
        this.disposeSession(candidate);
        return;
      }
      this.session = candidate;
      this.transport.cancel(0);
      this.transport.bpm.cancelScheduledValues(0);
      this.transport.bpm.value = this.state.bpm;
      this.scheduleId = this.transport.scheduleRepeat(
        (time) => this.frame(candidate, time),
        `${STEP_TICKS}i`,
        0,
      );
      const start = Tone.now();
      candidate.gate.gain.setValueAtTime(1, start);
      this.transport.start(start, 0);
    } catch (error) {
      if (generation !== this.state.generation) {
        this.disposeSession(candidate);
        return;
      }
      this.stop(`Не удалось включить звук: ${error.message}`);
    }
  }
  release(channel, time) {
    channel.synth.releaseAll(time);
    channel.sounding = false;
    channel.end = Infinity;
  }
  applySound(channel, settings, time) {
    if (channel.preset !== settings.timbre) {
      channel.synth.set(PRESETS[settings.timbre]);
      channel.preset = settings.timbre;
    }
    if (channel.cutoff !== settings.filter) {
      channel.filter.frequency.setTargetAtTime(
        filterFrequency(settings.filter),
        time,
        0.01,
      );
      channel.cutoff = settings.filter;
    }
  }
  frame(session, time) {
    if (
      session !== this.session ||
      session.generation !== this.state.generation
    )
      return;
    try {
      const step = Math.round(this.transport.getTicksAtTime(time) / STEP_TICKS);
      const frame = this.state.advance(step);
      if (frame.bpm !== null)
        this.transport.bpm.setValueAtTime(frame.bpm, time);
      for (const [id, channel] of Object.entries(session.channels)) {
        if (frame.cuts.includes(id) || channel.end <= step)
          this.release(channel, time);
        if (id !== "live") {
          const slot = this.state.slots[Number(id.slice(4))];
          const value = slot?.active ? slot.volume / 100 : 0;
          if (channel.level !== value) {
            channel.gain.gain.setTargetAtTime(value, time, 0.005);
            channel.level = value;
          }
        }
      }
      for (const event of frame.attacks) {
        const channel = session.channels[event.source];
        if (channel.sounding) this.release(channel, time);
        this.applySound(channel, event.settings, time);
        channel.synth.triggerAttack(
          event.notes.map((n) => Tone.Frequency(n, "midi").toFrequency()),
          time,
          0.65,
        );
        channel.sounding = true;
        channel.end = Number.isFinite(event.duration)
          ? step + event.duration
          : Infinity;
      }
      this.history.push({
        step,
        time,
        bpm: this.state.bpm,
        attacks: frame.attacks.length,
      });
      if (this.history.length > 128) this.history.shift();
      Tone.getDraw().schedule(() => {
        if (
          session === this.session &&
          session.generation === this.state.generation
        )
          this.publish({ ...this.state.snapshot(), step });
      }, time);
    } catch (error) {
      this.stop(`Воспроизведение прервано: ${error.message}`);
    }
  }
  stop(error = "") {
    const session = this.session;
    this.session = null;
    this.state.stop(error);
    const now = this.context.immediate();
    if (this.scheduleId !== null) {
      this.transport.clear(this.scheduleId);
      this.scheduleId = null;
    }
    this.transport.stop(now);
    this.transport.cancel(0);
    Tone.getDraw().cancel(0);
    if (session) {
      session.gate.gain.cancelAndHoldAtTime(now);
      session.gate.gain.linearRampToValueAtTime(0, now + 0.012);
      this.retired.add(session);
      this.context.setTimeout(() => this.disposeSession(session), 0.18);
    }
    this.publish();
  }
  reset() {
    this.stop();
    this.state.reset();
    this.publish();
  }
  press(id, position) {
    this.state.press(id, position);
    this.publish();
    if (["stopped", "error"].includes(this.state.status)) void this.play();
  }
  releaseKey(id) {
    this.state.release(id);
    this.publish();
  }
  releaseKeys() {
    this.state.releaseAll();
    this.publish();
  }
  edit(method, value) {
    this.state[method](value);
    this.publish();
  }
  record() {
    this.state.record();
    this.publish();
  }
  setBpm(value) {
    this.edit("setBpm", value);
  }
  setVolume(value) {
    this.state.volume = clamp(value, 0, 100);
    this.master?.gain.rampTo((this.state.volume / 100) * 0.8, 0.02);
    this.publish();
  }
  setFilter(value) {
    this.state.filter = clamp(value, 0, 100);
    const channel = this.session?.channels.live;
    if (channel) {
      channel.filter.frequency.rampTo(filterFrequency(this.state.filter), 0.02);
      channel.cutoff = this.state.filter;
    }
    this.publish();
  }
  toggleSlot(index) {
    this.state.toggleSlot(index);
    this.publish();
  }
  setSlotVolume(index, value) {
    this.state.setSlotVolume(index, value);
    const channel = this.session?.channels[`loop${index}`];
    const slot = this.state.slots[index];
    if (channel && slot?.active) {
      channel.gain.gain.rampTo(slot.volume / 100, 0.02);
      channel.level = slot.volume / 100;
    }
    this.publish();
  }
  deleteSlot(index) {
    this.state.deleteSlot(index);
    const channel = this.session?.channels[`loop${index}`];
    if (channel) {
      channel.gain.gain.rampTo(0, 0.012);
      channel.level = 0;
    }
    this.publish();
  }
  diagnostics() {
    return {
      sessions: Number(Boolean(this.session)) + this.retired.size,
      createdSessions: this.createdSessions,
      disposedSessions: this.disposedSessions,
      scheduleCount: this.scheduleId === null ? 0 : 1,
      listeners: this.listeners.size,
      instruments: this.session ? Object.keys(this.session.channels).length : 0,
      history: [...this.history],
      snapshot: this.state.snapshot(),
    };
  }
  dispose() {
    this.stop();
    for (const session of this.retired) this.disposeSession(session);
    this.context.off("statechange", this.onContextState);
    this.master?.dispose();
    this.listeners.clear();
  }
}
