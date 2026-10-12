import {
  ROLES,
  BAR_STEPS,
  PHRASE_STEPS,
  STEP_TICKS,
  generatePhrase,
  validPhrase,
} from "./patterns.js";
const copyEvents = (events) =>
  events.map((event) => ({ ...event, notes: [...event.notes] }));
export function nextBar(step) {
  return (Math.floor(step / BAR_STEPS) + 1) * BAR_STEPS;
}
export function clamp(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(min, Math.min(max, Math.round(number)))
    : min;
}

// Plain musical data only. No DOM, Web Audio objects or independent clock.
export class PerformanceState {
  constructor(seed = 1) {
    this.seed = seed;
    this.generation = 0;
    this.recordSerial = 0;
    this.status = "stopped";
    this.error = "";
    this.selected = "keys";
    this.step = -1;
    this.bpm = 120;
    this.pendingBpm = null;
    this.volume = 80;
    this.rec = null;
    this.motion = 0;
    this.motionChanged = false;
    this.tracks = Object.fromEntries(
      ROLES.map(({ id }) => [
        id,
        {
          id,
          desired: id === "keys",
          active: false,
          pending: null,
          filter: 100,
          loopDesired: false,
          loopActive: false,
          loopPending: null,
          loopOrigin: 0,
          clip: null,
          phrase: null,
          origin: 0,
        },
      ]),
    );
  }
  select(id) {
    if (this.tracks[id]) this.selected = id;
  }
  beginStart() {
    if (this.status !== "stopped" && this.status !== "error") return null;
    this.status = "starting";
    this.error = "";
    return ++this.generation;
  }
  finishStart(generation) {
    if (generation !== this.generation || this.status !== "starting")
      return false;
    this.status = "running";
    this.step = -1;
    for (const track of Object.values(this.tracks)) {
      track.active = track.desired;
      track.pending = null;
      track.origin = 0;
      track.phrase = null;
      track.loopActive = track.loopDesired && Boolean(track.clip);
      track.loopPending = null;
      track.loopOrigin = 0;
    }
    return true;
  }
  stop(error = "") {
    ++this.generation;
    this.cancelRecording();
    this.status = error ? "error" : "stopped";
    this.error = error;
    this.step = -1;
    if (this.pendingBpm) this.bpm = this.pendingBpm.value;
    this.pendingBpm = null;
    for (const track of Object.values(this.tracks)) {
      track.loopActive = false;
      track.loopPending = null;
      track.active = false;
      track.pending = null;
      track.phrase = null;
    }
  }
  toggle(id) {
    const track = this.tracks[id];
    if (!track) return;
    track.desired = !track.desired;

    track.pending =
      this.status === "running" && track.desired !== track.active
        ? (this.rec?.target === id ? this.rec.end : nextBar(this.step))
        : null;
  }
  toggleLoop(id) {
    const track = this.tracks[id];
    if (!track?.clip) return;
    track.loopDesired = !track.loopDesired;
    track.loopPending =
      this.status === "running" && track.loopDesired !== track.loopActive
        ? nextBar(this.step)
        : null;
  }
  setMotion(value) {
    const motion = clamp(value, 0, 100);
    if (motion !== this.motion) this.motionChanged = true;
    this.motion = motion;
  }
  setBpm(value) {
    value = clamp(value, 60, 160);
    if (this.status === "running")
      this.pendingBpm =
        value === this.bpm ? null : { value, step: nextBar(this.step) };
    else this.bpm = value;
  }
  record() {
    const track = this.tracks[this.selected];
    if (this.status !== "running" || this.rec) return false;
    const start = nextBar(this.step);
    if (!track.desired || !track.active) {
      track.desired = true;
      track.pending = start;
    }
    this.rec = {
      token: ++this.recordSerial,
      target: this.selected,
      phase: "armed",
      start,
      end: start + PHRASE_STEPS,
      events: [],
      generation: this.generation,
    };
    return true;
  }
  cancelRecording() {
    this.rec = null;
  }
  commitRecording(token, generation) {
    if (
      !this.rec ||
      this.rec.token !== token ||
      generation !== this.generation ||
      this.rec.phase !== "finalizing"
    )
      return false;
    const { target, events } = this.rec;
    if (!validPhrase(target, events)) {
      this.cancelRecording();
      this.error = "Recording could not be saved. Previous phrase kept.";
      return false;
    }
    const track = this.tracks[target];
    track.clip = copyEvents(events);
    track.loopOrigin = this.rec.start;
    track.loopDesired = track.loopActive = true;
    track.loopPending = null;
    track.desired = track.active = false;
    track.pending = null;
    this.rec = null;
    return true;
  }
  advance(step) {
    if (this.status !== "running") return { attacks: [], cuts: [] };
    this.step = step;
    const frame = { attacks: [], cuts: [], bpm: null };
    if (this.motionChanged) {
      if (this.rec?.target === "keys" && this.rec.phase === "recording") {
        const tick = (step - this.rec.start) * STEP_TICKS;
        // Capture the real early note-off when the dial releases a held chord.
        for (const event of this.rec.events)
          event.duration = Math.min(event.duration, tick - event.tick);
      }
      frame.cuts.push("keys");
      this.motionChanged = false;
    }
    if (this.pendingBpm && step >= this.pendingBpm.step) {
      this.bpm = this.pendingBpm.value;
      this.pendingBpm = null;
      frame.bpm = this.bpm;
    }
    for (const track of Object.values(this.tracks)) {
      if (track.pending !== null && step >= track.pending) {
        track.active = track.desired;
        track.pending = null;
        frame.cuts.push(track.id);
        track.origin = step;
        track.phrase = null;
      }
    }
    for (const track of Object.values(this.tracks)) {
      if (track.loopPending !== null && step >= track.loopPending) {
        track.loopActive = track.loopDesired;
        track.loopPending = null;
        track.loopOrigin = step;
        frame.cuts.push(`${track.id}:loop`);
      }
    }
    if (this.rec?.phase === "armed" && step >= this.rec.start) {
      this.rec.phase = "recording";
      const track = this.tracks[this.rec.target];
      // REC owns its full capture interval, even if LIVE was queued off.
      if (!track.active) {
        track.active = true;
        track.origin = step;
        track.phrase = null;
        frame.cuts.push(track.id);
      }
    }
    if (this.rec?.phase === "recording" && step >= this.rec.end) {
      this.rec.phase = "finalizing";
      const token = this.rec.token;
      const generation = this.generation;
      const target = this.rec.target;
      if (this.commitRecording(token, generation)) {
        frame.cuts.push(target, `${target}:loop`);
      }
    }
    for (const track of Object.values(this.tracks)) {
      if (!track.loopActive || !track.clip) continue;
      const position = ((step - track.loopOrigin) % PHRASE_STEPS + PHRASE_STEPS) % PHRASE_STEPS;
      for (const event of track.clip) {
        if (event.tick === position * STEP_TICKS)
          frame.attacks.push({ role: track.id, source: "loop", ...event });
      }
    }
    for (const track of Object.values(this.tracks)) {
      if (!track.active) continue;
      const position =
        (((step - track.origin) % PHRASE_STEPS) + PHRASE_STEPS) % PHRASE_STEPS;
      if (!track.phrase || position === 0)
        track.phrase = generatePhrase(track.id, this.seed++);
      let played = track.phrase;
      if (track.id === "keys" && this.motion > 0) {
        const bar = Math.floor(position / BAR_STEPS);
        const chord = track.phrase.find(e => e.tick === bar * BAR_STEPS * STEP_TICKS);
        const spacing = this.motion < 34 ? 4 : this.motion < 67 ? 2 : 1;
        played = position % spacing === 0 ? [{
          tick: position * STEP_TICKS,
          duration: spacing * STEP_TICKS,
          notes: [chord.notes[Math.floor(position / spacing) % chord.notes.length]],
          velocity: 0.48,
        }] : [];
      }
      for (const event of played) {
        if (event.tick !== position * STEP_TICKS) continue;
        frame.attacks.push({ role: track.id, source: "live", ...event });
        if (this.rec?.target === track.id && this.rec.phase === "recording") {
          const tick = (step - this.rec.start) * STEP_TICKS;
          this.rec.events.push({
            ...event,
            notes: [...event.notes],
            tick,
            duration: Math.min(
              event.duration,
              (this.rec.end - step) * STEP_TICKS,
            ),
          });
        }
      }
    }
    return frame;
  }
  snapshot() {
    return {
      status: this.status,
      error: this.error,
      generation: this.generation,
      selected: this.selected,
      step: this.step,
      bpm: this.bpm,
      pendingBpm: this.pendingBpm ? { ...this.pendingBpm } : null,
      volume: this.volume,
      motion: this.motion,
      rec: this.rec
        ? {
            target: this.rec.target,
            phase: this.rec.phase,
            start: this.rec.start,
            end: this.rec.end,
          }
        : null,
      tracks: Object.values(this.tracks).map(
        ({ id, desired, active, pending, filter, clip, loopDesired, loopActive, loopPending }) => ({
          id,
          desired,
          active,
          pending,
          filter,
          loopDesired,
          loopActive,
          loopPending,
          saved: Boolean(clip),
          eventCount: clip?.length ?? 0,
        }),
      ),
    };
  }
}
