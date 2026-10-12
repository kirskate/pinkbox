import * as Tone from "tone";
import { ROLES, PPQ, STEP_TICKS, filterFrequency } from "./patterns.js";
import { PerformanceState, clamp } from "./state.js";

const TIMBRES = {
  keys: {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.025, decay: 0.4, sustain: 0.32, release: 0.25 },
    volume: -15,
  },
  synth: {
    oscillator: { type: "sine" },
    envelope: { attack: 0.03, decay: 0.25, sustain: 0.4, release: 0.18 },
    volume: -16,
  },
  bass: {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.008, decay: 0.15, sustain: 0.48, release: 0.08 },
    volume: -13,
  },
  arp: {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.005, decay: 0.08, sustain: 0.15, release: 0.07 },
    volume: -20,
  },
};
export class AudioEngine {
  constructor() {
    this.state = new PerformanceState(Math.floor(Math.random() * 0xffffffff));
    this.listeners = new Set();
    this.transport = Tone.getTransport();
    this.transport.PPQ = PPQ;
    this.transport.timeSignature = 4;
    this.session = null;
    this.master = null;
    this.retired = new Set();
    this.scheduleId = null;
    this.history = [];
    this.createdSessions = 0;
    this.disposedSessions = 0;
    this.context = Tone.getContext();
    this.context.lookAhead = 0.06;
    this.context.updateInterval = 0.02;
    this.onContextState = () => {
      if (this.state.status === "running" && this.context.state !== "running")
        this.stop("Audio was interrupted. Press PLAY to continue.");
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
    const tracks = {};
    try {
      for (const { id } of ROLES) {
        const filter = new Tone.Filter(
          filterFrequency(this.state.tracks[id].filter),
          "lowpass",
        ).connect(gate);
        tracks[id] = { instrument: null, filter, voices: [] };
        tracks[id].instrument =
          id === "keys"
            ? new Tone.PolySynth({
                voice: Tone.Synth,
                maxPolyphony: 8,
                options: TIMBRES[id],
              }).connect(filter)
            : new Tone.Synth(TIMBRES[id]).connect(filter);
      }
    } catch (error) {
      for (const track of Object.values(tracks)) {
        track.instrument?.dispose();
        track.filter.dispose();
      }
      gate.dispose();
      throw error;
    }
    this.createdSessions++;
    return { gate, tracks, generation: this.state.generation, disposed: false };
  }
  disposeSession(session) {
    if (!session || session.disposed) return;
    session.disposed = true;
    for (const track of Object.values(session.tracks)) {
      track.instrument.dispose();
      track.filter.dispose();
      track.voices = [];
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
        throw new Error("Browser could not enable audio");
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
      // The first Draw confirmation displays RUNNING at the audible start.
    } catch (error) {
      if (generation !== this.state.generation) {
        this.disposeSession(candidate);
        return;
      }
      this.stop(`Audio could not start: ${error.message}`);
    }
  }
  release(track, role, time) {
    if (role === "keys") track.instrument.releaseAll(time);
    else track.instrument.triggerRelease(time);
    track.voices = [];
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
      for (const [role, track] of Object.entries(session.tracks)) {
        if (frame.cuts.includes(role)) this.release(track, role, time);
        const ending = track.voices.filter((voice) => voice.end <= step);
        for (const voice of ending) {
          if (role === "keys")
            track.instrument.triggerRelease(
              voice.notes.map((note) =>
                Tone.Frequency(note, "midi").toFrequency(),
              ),
              time,
            );
          else track.instrument.triggerRelease(time);
        }
        track.voices = track.voices.filter((voice) => voice.end > step);
      }
      for (const event of frame.attacks) {
        const track = session.tracks[event.role];
        const notes = event.notes.map((note) =>
          Tone.Frequency(note, "midi").toFrequency(),
        );
        if (event.role === "keys")
          track.instrument.triggerAttack(notes, time, event.velocity);
        else track.instrument.triggerAttack(notes[0], time, event.velocity);
        track.voices.push({
          end: step + event.duration / STEP_TICKS,
          notes: event.notes,
        });
      }
      this.history.push({
        step,
        time,
        ticks: this.transport.getTicksAtTime(time),
        bpm: this.state.bpm,
        attacks: frame.attacks.length,
      });
      if (this.history.length > 128) this.history.shift();
      const snapshot = this.state.snapshot();
      Tone.getDraw().schedule(() => {
        if (
          session !== this.session ||
          session.generation !== this.state.generation
        )
          return;
        if (frame.finalize) {
          this.state.commitRecording(
            frame.finalize.token,
            frame.finalize.generation,
          );
          // Keep the audible step while displaying the committed transaction.
          snapshot.rec = this.state.snapshot().rec;
          snapshot.tracks = snapshot.tracks.map((track) => ({
            ...track,
            saved: Boolean(this.state.tracks[track.id].clip),
            eventCount: this.state.tracks[track.id].clip?.length ?? 0,
          }));
          snapshot.error = this.state.error;
        }
        // Delayed audio confirmations must not undo a later UI selection or edit.
        snapshot.selected = this.state.selected;
        snapshot.volume = this.state.volume;
        snapshot.tracks = snapshot.tracks.map((track) => ({
          ...track,
          filter: this.state.tracks[track.id].filter,
          desired: this.state.tracks[track.id].desired,
        }));
        this.publish(snapshot);
      }, time);
    } catch (error) {
      this.stop(`Playback interrupted: ${error.message}`);
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
      // Never reopen this gate: it may still own attacks inside Tone's lookahead.
      session.gate.gain.cancelAndHoldAtTime(now);
      session.gate.gain.linearRampToValueAtTime(0, now + 0.012);
      this.retired.add(session);
      // Resource cleanup only, not a musical clock. Transport schedules notes.
      this.context.setTimeout(() => this.disposeSession(session), 0.16);
    }
    this.publish();
  }
  select(id) {
    this.state.select(id);
    this.publish();
  }
  toggle(id) {
    this.state.toggle(id);
    this.publish();
  }
  record() {
    this.state.record();
    this.publish();
  }
  setBpm(value) {
    this.state.setBpm(value);
    this.publish();
  }
  setVolume(value) {
    this.state.volume = clamp(value, 0, 100);
    this.master?.gain.rampTo((this.state.volume / 100) * 0.8, 0.02);
    this.publish();
  }
  setFilter(value) {
    const track = this.state.tracks[this.state.selected];
    track.filter = clamp(value, 0, 100);
    this.session?.tracks[track.id].filter.frequency.rampTo(
      filterFrequency(track.filter),
      0.03,
    );
    this.publish();
  }
  diagnostics() {
    return {
      contextState: this.context.state,
      transportState: this.transport.state,
      sessions: Number(Boolean(this.session)) + this.retired.size,
      createdSessions: this.createdSessions,
      disposedSessions: this.disposedSessions,
      listeners: this.listeners.size,
      scheduleCount: this.scheduleId === null ? 0 : 1,
      voices: this.session
        ? Object.values(this.session.tracks).reduce(
            (sum, track) => sum + track.voices.length,
            0,
          )
        : 0,
      keysActiveVoices: this.session?.tracks.keys.instrument.activeVoices ?? 0,
      instruments: this.session ? Object.keys(this.session.tracks).length : 0,
      history: this.history.map((frame) => ({ ...frame })),
      snapshot: this.state.snapshot(),
    };
  }
  dispose() {
    this.stop();
    for (const session of this.retired) this.disposeSession(session);
    this.context.off("statechange", this.onContextState);
    this.master?.dispose();
    this.master = null;
    this.listeners.clear();
  }
}
