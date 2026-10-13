import {
  BAR_STEPS,
  SLOT_COUNT,
  TIMBRE_NAMES,
  PHRASE_STEPS,
  STEP_TICKS,
  chordNotes,
  arpIndex,
  validClip,
} from "./patterns.js";
export function clamp(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(min, Math.min(max, Math.round(number)))
    : min;
}
export function nextBar(step) {
  return (Math.floor(step / BAR_STEPS) + 1) * BAR_STEPS;
}
export class PerformanceState {
  constructor() {
    this.generation = 0;
    this.status = "stopped";
    this.error = "";
    this.step = -1;
    this.bpm = 120;
    this.pendingBpm = null;
    this.volume = 75;
    this.tonic = 0;
    this.scale = "minor";
    this.richness = 0;
    this.arp = 0;
    this.direction = "up";
    this.timbre = 0;
    this.filter = 100;
    this.mode = "keys";
    this.bassMode = "link";
    this.held = new Map();
    this.live = { notes: [], signature: "", end: Infinity };
    this.arpOrigin = 0;
    this.arpCount = 0;
    this.slots = Array(SLOT_COUNT).fill(null);
    this.serial = 0;
    this.rec = null;
    this.deleted = [];
  }
  position() {
    const positions = [...this.held.values()];
    return (
      (this.mode === "bass"
        ? positions.filter((p) => (this.bassMode === "manual" ? p.pad : !p.pad))
        : positions.filter((p) => !p.pad)
      ).at(-1) ?? null
    );
  }
  notes() {
    const p = this.position();
    if (!p) return [];
    const notes = chordNotes(this.tonic, this.scale, p, this.richness);
    return this.mode === "bass" ? [notes[0] - 24] : notes;
  }
  settings() {
    return {
      timbre: this.mode === "bass" ? "bass" : this.timbre,
      filter: this.filter,
    };
  }
  press(id, position) {
    if (this.held.has(id)) return;
    this.held.set(id, {
      degree: clamp(position.degree, 0, 7),
      black: Boolean(position.black),
      pad: Boolean(position.pad),
    });
  }
  release(id) {
    this.held.delete(id);
  }
  releaseAll() {
    this.held.clear();
  }
  setKey(value) {
    this.tonic = clamp(value, 0, 11);
  }
  setScale(value) {
    if (["minor", "major"].includes(value)) this.scale = value;
  }
  setRichness(value) {
    this.richness = clamp(value, 0, 2);
  }
  setArp(value) {
    this.arp = clamp(value, 0, 3);
  }
  setDirection(value) {
    if (["up", "down", "updown"].includes(value)) this.direction = value;
  }
  setTimbre(value) {
    this.timbre = clamp(value, 0, TIMBRE_NAMES.length - 1);
  }
  setMode(value) {
    if (["keys", "bass"].includes(value)) this.mode = value;
  }
  beginStart() {
    if (!["stopped", "error"].includes(this.status)) return null;
    this.status = "starting";
    this.error = "";
    return ++this.generation;
  }
  finishStart(generation) {
    if (generation !== this.generation || this.status !== "starting")
      return false;
    this.status = "running";
    this.step = -1;
    this.live = { notes: [], signature: "", end: Infinity };
    for (const slot of this.slots)
      if (slot) {
        slot.origin = 0;
        slot.active = slot.enabled;
        slot.pending = null;
      }
    return true;
  }
  stop(error = "") {
    ++this.generation;
    this.status = error ? "error" : "stopped";
    this.error = error;
    this.rec = null;
    this.releaseAll();
    this.live = { notes: [], signature: "", end: Infinity };
    this.step = -1;
    if (this.pendingBpm) this.bpm = this.pendingBpm.value;
    this.pendingBpm = null;
    for (const slot of this.slots)
      if (slot) {
        slot.active = false;
        slot.pending = null;
      }
  }
  reset() {
    this.stop();
    this.slots.fill(null);
    this.deleted = [];
  }
  setBpm(value) {
    const bpm = clamp(value, 60, 160);
    if (this.status === "running")
      this.pendingBpm =
        bpm === this.bpm ? null : { value: bpm, step: nextBar(this.step) };
    else this.bpm = bpm;
  }
  record() {
    const index = this.slots.findIndex((slot) => slot === null);
    if (this.status !== "running" || this.rec || index < 0) return false;
    const start = nextBar(this.step);
    this.error = "";
    this.rec = {
      index,
      phase: "armed",
      start,
      end: start + PHRASE_STEPS,
      events: [],
      open: null,
      settings: null,
    };
    return true;
  }
  closeCapture(step) {
    if (!this.rec?.open) return;
    const event = this.rec.open;
    event.duration =
      Math.min(step, this.rec.end) * STEP_TICKS -
      this.rec.start * STEP_TICKS -
      event.tick;
    if (event.duration > 0) this.rec.events.push(event);
    this.rec.open = null;
  }
  captureAttack(step, notes) {
    if (
      this.rec?.phase !== "recording" ||
      step >= this.rec.end ||
      !notes.length
    )
      return;
    this.closeCapture(step);
    this.rec.open = {
      tick: (step - this.rec.start) * STEP_TICKS,
      duration: 0,
      notes: [...notes],
    };
  }
  toggleSlot(index) {
    const slot = this.slots[index];
    if (!slot) return;
    slot.enabled = !slot.enabled;
    slot.pending =
      this.status === "running" && slot.enabled !== slot.active
        ? nextBar(this.step)
        : null;
  }
  setSlotVolume(index, value) {
    if (this.slots[index]) this.slots[index].volume = clamp(value, 0, 100);
  }
  deleteSlot(index) {
    if (!this.slots[index]) return;
    this.slots[index] = null;
    this.deleted.push(`loop${index}`);
  }
  advance(step) {
    const frame = { attacks: [], cuts: [], bpm: null };
    if (this.status !== "running") return frame;
    this.step = step;
    frame.cuts.push(...this.deleted.splice(0));
    if (this.pendingBpm && step >= this.pendingBpm.step) {
      this.bpm = this.pendingBpm.value;
      this.pendingBpm = null;
      frame.bpm = this.bpm;
    }
    if (this.rec?.phase === "armed" && step >= this.rec.start) {
      this.rec.phase = "recording";
      this.rec.settings = this.settings();
      this.captureAttack(step, this.live.notes);
    }
    if (this.rec?.phase === "recording" && step >= this.rec.end) {
      this.closeCapture(this.rec.end);
      const rec = this.rec;
      if (validClip(rec.events)) {
        this.slots[rec.index] = {
          id: ++this.serial,
          events: rec.events,
          settings: rec.settings,
          volume: 75,
          enabled: true,
          active: true,
          pending: null,
          origin: rec.end,
        };
      } else
        this.error =
          "Запись пустая: удерживай клавишу или играй пэдами во время REC.";
      this.rec = null;
    }
    const notes = this.notes();
    const position = this.position();
    const signature = notes.length
      ? JSON.stringify([
          position,
          notes,
          this.arp,
          this.direction,
          this.settings().timbre,
        ])
      : "";
    const changed = signature !== this.live.signature;
    const arp = this.mode === "keys" && this.arp > 0;
    if (changed || this.live.end <= step) {
      if (this.live.notes.length) {
        frame.cuts.push("live");
        this.closeCapture(step);
      }
      this.live.notes = [];
      if (changed) {
        this.arpOrigin = step;
        this.arpCount = 0;
      }
    }
    this.live.signature = signature;
    const spacing = [0, 4, 2, 1][this.arp];
    const due =
      notes.length && (arp ? (step - this.arpOrigin) % spacing === 0 : changed);
    if (due) {
      if (this.live.notes.length) {
        frame.cuts.push("live");
        this.closeCapture(step);
      }
      const played = arp
        ? [notes[arpIndex(this.arpCount++, notes.length, this.direction)]]
        : notes;
      this.live.notes = [...played];
      this.live.end = arp ? step + spacing : Infinity;
      frame.attacks.push({
        source: "live",
        notes: played,
        duration: Infinity,
        settings: this.settings(),
      });
      this.captureAttack(step, played);
    }
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (!slot) continue;
      if (slot.pending !== null && step >= slot.pending) {
        slot.active = slot.enabled;
        slot.pending = null;
        frame.cuts.push(`loop${i}`);
      }
      if (!slot.active) continue;
      const tick =
        ((((step - slot.origin) % PHRASE_STEPS) + PHRASE_STEPS) %
          PHRASE_STEPS) *
        STEP_TICKS;
      for (const event of slot.events)
        if (event.tick === tick)
          frame.attacks.push({
            source: `loop${i}`,
            notes: event.notes,
            duration: event.duration / STEP_TICKS,
            settings: slot.settings,
          });
    }
    return frame;
  }
  snapshot() {
    return {
      status: this.status,
      error: this.error,
      generation: this.generation,
      step: this.step,
      bpm: this.bpm,
      pendingBpm: this.pendingBpm,
      volume: this.volume,
      tonic: this.tonic,
      scale: this.scale,
      richness: this.richness,
      arp: this.arp,
      direction: this.direction,
      timbre: this.timbre,
      filter: this.filter,
      mode: this.mode,
      bassMode: this.bassMode,
      held: [...this.held.values()],
      notes: this.notes(),
      rec: this.rec
        ? {
            index: this.rec.index,
            phase: this.rec.phase,
            start: this.rec.start,
            end: this.rec.end,
          }
        : null,
      slots: this.slots.map((slot) =>
        slot
          ? {
              id: slot.id,
              volume: slot.volume,
              enabled: slot.enabled,
              active: slot.active,
              pending: slot.pending,
              settings: slot.settings,
              eventCount: slot.events.length,
              origin: slot.origin,
            }
          : null,
      ),
    };
  }
}
