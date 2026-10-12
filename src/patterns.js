// One harmonic world. All roles share C minor; no pitch changes with tempo.
export const ROLES = [
  { id: "keys", name: "KEYS", character: "Soft chords", color: "#c3ee67" },
  {
    id: "synth",
    name: "SYNTH",
    character: "Spacious melody",
    color: "#fdbe73",
  },
  { id: "bass", name: "BASS", character: "Low pulse", color: "#78dfdd" },
  { id: "arp", name: "ARP", character: "Moving notes", color: "#c7b0ff" },
];
export const PPQ = 192;
export const STEP_TICKS = PPQ / 4;
export const BAR_STEPS = 16;
export const PHRASE_STEPS = 64;
export const DEFAULT_BPM = 120;
export const WORLD_NOTES = new Set([0, 2, 3, 5, 7, 8, 10]);
export const RANGES = {
  keys: [48, 70],
  synth: [72, 82],
  bass: [31, 43],
  arp: [60, 82],
};

export function randomSource(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function generatePhrase(role, seed) {
  if (!RANGES[role]) throw new Error("Unknown musical role");
  const random = randomSource(seed);
  const choose = (values) => values[Math.floor(random() * values.length)];
  const events = [];
  const add = (step, duration, notes, velocity) =>
    events.push({
      tick: step * STEP_TICKS,
      duration: Math.min(duration, PHRASE_STEPS - step) * STEP_TICKS,
      notes: Array.isArray(notes) ? notes : [notes],
      velocity,
    });
  for (let bar = 0; bar < 4; bar++) {
    const base = bar * BAR_STEPS;
    if (role === "keys") {
      add(
        base,
        choose([10, 12, 14]),
        choose([
          [48, 55, 63, 70],
          [51, 58, 60, 67],
          [55, 58, 63, 67],
        ]),
        0.55,
      );
    } else if (role === "bass") {
      add(base, 3, 36, 0.72);
      add(base + 6, 2, choose([36, 43]), 0.55);
      add(base + 8, 3, choose([36, 39]), 0.66);
      if (random() > 0.4) add(base + 14, 1, 31, 0.45);
    } else if (role === "synth") {
      add(base, choose([3, 5]), choose([72, 75, 79]), 0.38);
      if (random() > 0.3) add(base + 8, 3, choose([75, 79, 82]), 0.32);
      if (random() > 0.55) add(base + 13, 2, choose([77, 79]), 0.28);
    } else {
      const notes = choose([
        [60, 67, 75, 70],
        [63, 70, 79, 75],
        [67, 72, 82, 75],
      ]);
      for (let step = 0; step < 16; step += 2) {
        // Keep a reliable pulse even at 60 BPM; vary notes and accents, not gaps.
        add(
          base + step,
          1,
          notes[(step / 2 + bar) % notes.length],
          (step % 4 === 0 ? 0.4 : 0.28) * (0.9 + random() * 0.1),
        );
      }
    }
  }
  return events;
}
export function validPhrase(role, events) {
  const range = RANGES[role];
  return Boolean(
    range &&
    Array.isArray(events) &&
    events.length &&
    events.length <= 64 &&
    events.every(
      (event) =>
        Number.isInteger(event.tick) &&
        event.tick >= 0 &&
        event.tick < PHRASE_STEPS * STEP_TICKS &&
        event.tick % STEP_TICKS === 0 &&
        Number.isInteger(event.duration) &&
        event.duration > 0 &&
        event.duration % STEP_TICKS === 0 &&
        event.tick + event.duration <= PHRASE_STEPS * STEP_TICKS &&
        Number.isFinite(event.velocity) &&
        event.velocity > 0 &&
        event.velocity <= 1 &&
        Array.isArray(event.notes) &&
        event.notes.length > 0 &&
        event.notes.length <= 4 &&
        event.notes.every(
          (note) =>
            Number.isInteger(note) &&
            note >= range[0] &&
            note <= range[1] &&
            WORLD_NOTES.has(note % 12),
        ),
    ),
  );
}
export function filterFrequency(value) {
  return 180 * (18000 / 180) ** (Math.max(0, Math.min(100, value)) / 100);
}
