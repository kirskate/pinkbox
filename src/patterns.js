// The laptop letters trigger positions, never absolute pitches.
export const PPQ = 192;
export const STEP_TICKS = 48;
export const BAR_STEPS = 16;
export const PHRASE_STEPS = 64;
export const NOTE_NAMES = [
  "C",
  "C♯",
  "D",
  "E♭",
  "E",
  "F",
  "F♯",
  "G",
  "A♭",
  "A",
  "B♭",
  "B",
];
export const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
};
export const TIMBRE_NAMES = ["SOFT", "GLASS", "ANALOG"];
export const KEY_BINDINGS = {
  KeyA: { degree: 0, black: false },
  KeyW: { degree: 0, black: true },
  KeyS: { degree: 1, black: false },
  KeyE: { degree: 1, black: true },
  KeyD: { degree: 2, black: false },
  KeyF: { degree: 3, black: false },
  KeyT: { degree: 3, black: true },
  KeyG: { degree: 4, black: false },
  KeyY: { degree: 4, black: true },
  KeyH: { degree: 5, black: false },
  KeyU: { degree: 5, black: true },
  KeyJ: { degree: 6, black: false },
  KeyK: { degree: 7, black: false },
};
export function scaleNote(tonic, scale, degree) {
  return 60 + tonic + SCALES[scale][degree % 7] + 12 * Math.floor(degree / 7);
}
export function chordNotes(tonic, scale, position, richness = 0) {
  const root = scaleNote(tonic, scale, position.degree);
  if (position.black) return [root + 1, root + 5, root + 8];
  return Array.from({ length: 3 + richness }, (_, i) =>
    scaleNote(tonic, scale, position.degree + i * 2),
  );
}
export function arpIndex(index, length, direction) {
  if (direction === "down") return length - 1 - (index % length);
  if (direction === "updown") {
    const phase = index % (length * 2 - 2);
    return phase < length ? phase : length * 2 - 2 - phase;
  }
  return index % length;
}
export function validClip(events) {
  return (
    Array.isArray(events) &&
    events.length > 0 &&
    events.length <= 64 &&
    events.every(
      (e) =>
        Number.isInteger(e.tick) &&
        e.tick >= 0 &&
        e.tick < PHRASE_STEPS * STEP_TICKS &&
        e.tick % STEP_TICKS === 0 &&
        Number.isInteger(e.duration) &&
        e.duration > 0 &&
        e.duration % STEP_TICKS === 0 &&
        e.tick + e.duration <= PHRASE_STEPS * STEP_TICKS &&
        Array.isArray(e.notes) &&
        e.notes.length > 0 &&
        e.notes.length <= 5 &&
        e.notes.every((n) => Number.isInteger(n) && n >= 24 && n <= 108),
    )
  );
}
export function filterFrequency(value) {
  return 180 * 100 ** (Math.max(0, Math.min(100, value)) / 100);
}
