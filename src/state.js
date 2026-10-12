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
    this.tracks = Object.fromEntries(
      ROLES.map(({ id }) => [
        id,
        {
          id,
          desired: id === "keys",
          active: false,
          pending: null,
          filter: 100,
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
      track.phrase = track.clip ? copyEvents(track.clip) : null;
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
      track.active = false;
      track.pending = null;
      track.phrase = null;
    }
  }
  toggle(id) {
    const track = this.tracks[id];
    if (!track) return;
    track.desired = !track.desired;
    if (!track.desired && this.rec?.target === id) this.cancelRecording();
    track.pending =
      this.status === "running" && track.desired !== track.active
        ? nextBar(this.step)
        : null;
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
    if (
      this.status !== "running" ||
      this.rec ||
      !track.active ||
      !track.desired
    )
      return false;
    const start = nextBar(this.step);
    this.rec = {
      token: ++this.recordSerial,
      target: this.selected,
      phase: "armed",
      start,
      end: start + PHRASE_STEPS,
      events: [],
      generation: this.generation,
      previousOrigin: track.origin,
    };
    return true;
  }
  cancelRecording() {
    if (this.rec) {
      const track = this.tracks[this.rec.target];
      if (this.rec.phase !== "armed" && track.clip) {
        track.phrase = copyEvents(track.clip);
        track.origin = this.rec.previousOrigin;
      }
    }
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
    this.tracks[target].clip = copyEvents(events);
    this.rec = null;
    return true;
  }
  advance(step) {
    if (this.status !== "running") return { attacks: [], cuts: [] };
    this.step = step;
    const frame = { attacks: [], cuts: [], bpm: null, finalize: null };
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
        track.phrase = track.clip ? copyEvents(track.clip) : null;
      }
    }
    if (this.rec?.phase === "armed" && step >= this.rec.start) {
      this.rec.phase = "recording";
      const track = this.tracks[this.rec.target];
      if (track.clip) {
        // Replacing a saved layer captures a fresh live candidate.
        track.origin = step;
        track.phrase = generatePhrase(track.id, this.seed++);
        frame.cuts.push(track.id);
      }
    }
    if (this.rec?.phase === "recording" && step >= this.rec.end) {
      this.rec.phase = "finalizing";
      const track = this.tracks[this.rec.target];
      track.phrase = copyEvents(this.rec.events);
      track.origin = this.rec.start;
      frame.finalize = { token: this.rec.token, generation: this.generation };
    }
    for (const track of Object.values(this.tracks)) {
      if (!track.active) continue;
      const position =
        (((step - track.origin) % PHRASE_STEPS) + PHRASE_STEPS) % PHRASE_STEPS;
      const recording =
        this.rec?.target === track.id &&
        ["recording", "finalizing"].includes(this.rec.phase);
      if (
        !track.phrase ||
        (position === 0 &&
          !track.clip &&
          !(recording && this.rec.phase === "finalizing"))
      )
        track.phrase = generatePhrase(track.id, this.seed++);
      for (const event of track.phrase) {
        if (event.tick !== position * STEP_TICKS) continue;
        frame.attacks.push({ role: track.id, ...event });
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
      rec: this.rec
        ? {
            target: this.rec.target,
            phase: this.rec.phase,
            start: this.rec.start,
            end: this.rec.end,
          }
        : null,
      tracks: Object.values(this.tracks).map(
        ({ id, desired, active, pending, filter, clip }) => ({
          id,
          desired,
          active,
          pending,
          filter,
          saved: Boolean(clip),
          eventCount: clip?.length ?? 0,
        }),
      ),
    };
  }
}
