export const DEFAULT_BPM = 120;
export const MIN_BPM = 60;
export const MAX_BPM = 160;

export const KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const SCALES = {
  major: { id: "major", name: "MAJ", intervals: [0, 2, 4, 5, 7, 9, 11] },
  minor: { id: "minor", name: "MIN", intervals: [0, 2, 3, 5, 7, 8, 10] },
  pentatonic: { id: "pentatonic", name: "PENT", intervals: [0, 3, 5, 7, 10] },
};

export const CATEGORIES = [
  { id: "drums", label: "DRUMS" },
  { id: "bass", label: "BASS" },
  { id: "chords", label: "CHORDS" },
  { id: "melodies", label: "MELODIES" },
];

export const PATTERNS = [
  { id: "drums-01", name: "DRUM 01", category: "drums", color: "coral", file: "/assets/audio/drums/drums-01.wav", instrument: "player" },
  { id: "drums-02", name: "DRUM 02", category: "drums", color: "coral", file: "/assets/audio/drums/drums-02.wav", instrument: "player" },
  { id: "drums-03", name: "DRUM 03", category: "drums", color: "coral", file: "/assets/audio/drums/drums-03.wav", instrument: "player" },
  { id: "drums-04", name: "DRUM 04", category: "drums", color: "coral", file: "/assets/audio/drums/drums-04.wav", instrument: "player" },
  { id: "bass-01", name: "BASS 01", category: "bass", color: "cyan", file: "/assets/audio/bass/bass-01.wav", instrument: "player" },
  { id: "bass-02", name: "BASS 02", category: "bass", color: "cyan", file: "/assets/audio/bass/bass-02.wav", instrument: "player" },
  { id: "bass-03", name: "BASS 03", category: "bass", color: "cyan", file: "/assets/audio/bass/bass-03.wav", instrument: "player" },
  { id: "bass-04", name: "BASS 04", category: "bass", color: "cyan", file: "/assets/audio/bass/bass-04.wav", instrument: "player" },
  { id: "chords-01", name: "CHORD 01", category: "chords", color: "violet", file: "/assets/audio/chords/chords-01.wav", instrument: "player" },
  { id: "chords-02", name: "CHORD 02", category: "chords", color: "violet", file: "/assets/audio/chords/chords-02.wav", instrument: "player" },
  { id: "chords-03", name: "CHORD 03", category: "chords", color: "violet", file: "/assets/audio/chords/chords-03.wav", instrument: "player" },
  { id: "chords-04", name: "CHORD 04", category: "chords", color: "violet", file: "/assets/audio/chords/chords-04.wav", instrument: "player" },
  { id: "melodies-01", name: "MELO 01", category: "melodies", color: "lime", file: "/assets/audio/melodies/melody-01.wav", instrument: "player" },
  { id: "melodies-02", name: "MELO 02", category: "melodies", color: "lime", file: "/assets/audio/melodies/melody-02.wav", instrument: "player" },
  { id: "melodies-03", name: "MELO 03", category: "melodies", color: "lime", file: "/assets/audio/melodies/melody-03.wav", instrument: "player" },
  { id: "melodies-04", name: "MELO 04", category: "melodies", color: "lime", file: "/assets/audio/melodies/melody-04.wav", instrument: "player" },
];

export function createPatternState() {
  return PATTERNS.map((pattern, index) => ({
    ...pattern,
    number: String(index % 4 + 1).padStart(2, "0"),
    active: false,
    armed: false,
  }));
}
