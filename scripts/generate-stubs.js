import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const SAMPLE_RATE = 44100;
const BPM = 120;
const BEATS_PER_BAR = 4;
const BAR_SECONDS = (60 / BPM) * BEATS_PER_BAR;
const FRAMES = Math.round(SAMPLE_RATE * BAR_SECONDS);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function midiToHz(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function encodeWav(samples) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i += 1) {
    const sample = clamp(samples[i], -1, 1);
    view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return buffer;
}

function emptyBuffer() {
  return new Float32Array(FRAMES);
}

function addHit(buffer, startFrame, duration, fn) {
  const length = Math.min(buffer.length - startFrame, Math.floor(duration * SAMPLE_RATE));
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    buffer[startFrame + i] += fn(t, i / length);
  }
}

function kick(t) {
  const env = Math.exp(-t * 18);
  return env * Math.sin(2 * Math.PI * (90 * t + 60 * t * Math.exp(-t * 20)));
}

function snare(t) {
  const env = Math.exp(-t * 16);
  const noise = Math.random() * 2 - 1;
  return env * (noise * 0.7 + Math.sin(2 * Math.PI * 180 * t) * 0.3);
}

function hat(t) {
  return Math.exp(-t * 50) * (Math.random() * 2 - 1) * 0.35;
}

function tom(t, freq) {
  return Math.exp(-t * 10) * Math.sin(2 * Math.PI * freq * t) * 0.7;
}

function noteTone(t, freq, duration, type) {
  const env = Math.min(1, t / 0.01) * Math.exp(-t * (2.2 / duration));
  const phase = 2 * Math.PI * freq * t;
  let wave = Math.sin(phase);
  if (type === "square") wave = Math.sign(Math.sin(phase)) * 0.7;
  if (type === "saw") wave = ((freq * t) % 1) * 2 - 1;
  if (type === "triangle") {
    const p = (freq * t) % 1;
    wave = p < 0.5 ? p * 4 - 1 : 3 - p * 4;
  }
  return env * wave * 0.28;
}

function sixteenthFrame(index) {
  return Math.floor((index / 16) * FRAMES);
}

function makeDrum(hits) {
  const buffer = emptyBuffer();
  hits.forEach((hit) => {
    addHit(buffer, sixteenthFrame(hit.step), hit.duration, hit.fn);
  });
  return buffer;
}

function makePitched(events, type) {
  const buffer = emptyBuffer();
  events.forEach((event) => {
    addHit(buffer, sixteenthFrame(event.step), event.beats * 0.5, (t) =>
      noteTone(t, midiToHz(event.note), event.beats * 0.5, type),
    );
  });
  return buffer;
}

const files = {
  "public/assets/audio/drums/drums-01.wav": makeDrum([
    { step: 0, duration: 0.35, fn: kick },
    { step: 4, duration: 0.2, fn: snare },
    { step: 8, duration: 0.35, fn: kick },
    { step: 12, duration: 0.2, fn: snare },
    { step: 2, duration: 0.08, fn: hat },
    { step: 6, duration: 0.08, fn: hat },
    { step: 10, duration: 0.08, fn: hat },
    { step: 14, duration: 0.08, fn: hat },
  ]),
  "public/assets/audio/drums/drums-02.wav": makeDrum([
    { step: 0, duration: 0.3, fn: kick },
    { step: 3, duration: 0.25, fn: kick },
    { step: 6, duration: 0.18, fn: snare },
    { step: 10, duration: 0.3, fn: kick },
    { step: 12, duration: 0.18, fn: snare },
    { step: 14, duration: 0.12, fn: (t) => tom(t, 140) },
    { step: 1, duration: 0.06, fn: hat },
    { step: 5, duration: 0.06, fn: hat },
    { step: 9, duration: 0.06, fn: hat },
    { step: 13, duration: 0.06, fn: hat },
  ]),
  "public/assets/audio/drums/drums-03.wav": makeDrum([
    { step: 0, duration: 0.28, fn: kick },
    { step: 8, duration: 0.28, fn: kick },
    { step: 4, duration: 0.16, fn: snare },
    { step: 7, duration: 0.1, fn: snare },
    { step: 12, duration: 0.16, fn: snare },
    { step: 15, duration: 0.08, fn: hat },
    ...[0, 2, 4, 6, 8, 10, 12, 14].map((step) => ({
      step,
      duration: 0.05,
      fn: hat,
    })),
  ]),
  "public/assets/audio/drums/drums-04.wav": makeDrum([
    { step: 0, duration: 0.4, fn: kick },
    { step: 8, duration: 0.22, fn: (t) => tom(t, 90) },
    { step: 10, duration: 0.18, fn: (t) => tom(t, 130) },
    { step: 12, duration: 0.2, fn: snare },
    { step: 4, duration: 0.08, fn: hat },
    { step: 6, duration: 0.08, fn: hat },
    { step: 14, duration: 0.1, fn: hat },
  ]),
  "public/assets/audio/bass/bass-01.wav": makePitched(
    [
      { step: 0, note: 36, beats: 2 },
      { step: 8, note: 36, beats: 1 },
      { step: 12, note: 38, beats: 1 },
    ],
    "square",
  ),
  "public/assets/audio/bass/bass-02.wav": makePitched(
    [
      { step: 0, note: 38, beats: 1 },
      { step: 4, note: 41, beats: 1 },
      { step: 8, note: 43, beats: 1 },
      { step: 12, note: 41, beats: 1 },
    ],
    "saw",
  ),
  "public/assets/audio/bass/bass-03.wav": makePitched(
    [
      { step: 0, note: 36, beats: 0.5 },
      { step: 3, note: 36, beats: 0.5 },
      { step: 6, note: 43, beats: 0.5 },
      { step: 8, note: 36, beats: 0.5 },
      { step: 11, note: 34, beats: 0.5 },
      { step: 14, note: 36, beats: 0.5 },
    ],
    "square",
  ),
  "public/assets/audio/bass/bass-04.wav": makePitched(
    [
      { step: 0, note: 43, beats: 2 },
      { step: 8, note: 41, beats: 1 },
      { step: 12, note: 36, beats: 1 },
    ],
    "triangle",
  ),
  "public/assets/audio/chords/chords-01.wav": (() => {
    const a = makePitched(
      [
        { step: 0, note: 48, beats: 4 },
        { step: 0, note: 52, beats: 4 },
        { step: 0, note: 55, beats: 4 },
      ],
      "triangle",
    );
    return a;
  })(),
  "public/assets/audio/chords/chords-02.wav": makePitched(
    [
      { step: 0, note: 50, beats: 2 },
      { step: 0, note: 53, beats: 2 },
      { step: 0, note: 57, beats: 2 },
      { step: 8, note: 48, beats: 2 },
      { step: 8, note: 52, beats: 2 },
      { step: 8, note: 55, beats: 2 },
    ],
    "saw",
  ),
  "public/assets/audio/chords/chords-03.wav": makePitched(
    [
      { step: 0, note: 52, beats: 1 },
      { step: 0, note: 55, beats: 1 },
      { step: 0, note: 59, beats: 1 },
      { step: 8, note: 50, beats: 1 },
      { step: 8, note: 53, beats: 1 },
      { step: 8, note: 57, beats: 1 },
    ],
    "triangle",
  ),
  "public/assets/audio/chords/chords-04.wav": makePitched(
    [
      { step: 0, note: 48, beats: 4 },
      { step: 0, note: 51, beats: 4 },
      { step: 0, note: 55, beats: 4 },
      { step: 0, note: 58, beats: 4 },
    ],
    "saw",
  ),
  "public/assets/audio/melodies/melody-01.wav": makePitched(
    [
      { step: 0, note: 72, beats: 1 },
      { step: 4, note: 76, beats: 1 },
      { step: 8, note: 79, beats: 1 },
      { step: 12, note: 76, beats: 1 },
    ],
    "sine",
  ),
  "public/assets/audio/melodies/melody-02.wav": makePitched(
    [
      { step: 0, note: 67, beats: 0.5 },
      { step: 2, note: 72, beats: 0.5 },
      { step: 4, note: 74, beats: 0.5 },
      { step: 6, note: 76, beats: 0.5 },
      { step: 10, note: 74, beats: 0.5 },
      { step: 12, note: 72, beats: 1 },
    ],
    "triangle",
  ),
  "public/assets/audio/melodies/melody-03.wav": makePitched(
    [
      { step: 0, note: 79, beats: 2 },
      { step: 8, note: 76, beats: 1 },
      { step: 12, note: 72, beats: 1 },
    ],
    "sine",
  ),
  "public/assets/audio/melodies/melody-04.wav": makePitched(
    [
      { step: 0, note: 72, beats: 0.5 },
      { step: 3, note: 71, beats: 0.5 },
      { step: 4, note: 72, beats: 0.5 },
      { step: 8, note: 76, beats: 0.5 },
      { step: 11, note: 74, beats: 0.5 },
      { step: 12, note: 72, beats: 1 },
    ],
    "square",
  ),
};

for (const [path, samples] of Object.entries(files)) {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(join(path), encodeWav(samples));
  console.log("wrote", path);
}
