import * as Tone from "tone";
import { DEFAULT_BPM, KEYS, MAX_BPM, MIN_BPM, PATTERNS } from "./patterns.js";

const SOURCE_BPM = 120;
const SCALE_SHIFT = {
  major: 0,
  minor: -3,
  pentatonic: 5,
};

const master = new Tone.Volume(-8).toDestination();
const players = new Map();
const activeIds = new Set();

let playing = false;
let pitch = 0;
let keyIndex = 0;
let scaleId = "minor";
let onBeat = null;
let barLoop = null;
let beatLoop = null;
let ready = Promise.resolve();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rateFor(pattern) {
  const tempoRate = Tone.Transport.bpm.value / SOURCE_BPM;
  if (pattern.category === "drums") return tempoRate;
  const semitones = pitch + keyIndex + (SCALE_SHIFT[scaleId] || 0);
  return tempoRate * 2 ** (semitones / 12);
}

function applyRates() {
  for (const pattern of PATTERNS) {
    const player = players.get(pattern.id);
    if (player) player.playbackRate = rateFor(pattern);
  }
}

function startActivePlayers(time) {
  for (const pattern of PATTERNS) {
    if (!activeIds.has(pattern.id)) continue;
    const player = players.get(pattern.id);
    if (!player) continue;
    player.playbackRate = rateFor(pattern);
    if (player.state === "started") player.stop(time);
    player.start(time, 0);
  }
}

export function bootAudio() {
  ready = (async () => {
    Tone.Transport.bpm.value = DEFAULT_BPM;
    Tone.Transport.timeSignature = [4, 4];

    for (const pattern of PATTERNS) {
      const player = new Tone.Player({
        url: pattern.file,
        loop: false,
        fadeIn: 0.008,
        fadeOut: 0.02,
      }).connect(master);
      players.set(pattern.id, player);
    }

    await Tone.loaded();
    applyRates();

    barLoop = new Tone.Loop((time) => {
      startActivePlayers(time);
    }, "1m");
    barLoop.start(0);

    beatLoop = new Tone.Loop((time) => {
      if (!onBeat) return;
      Tone.Draw.schedule(() => onBeat(), time);
    }, "4n");
    beatLoop.start(0);
  })();

  return ready;
}

export function setBeatCallback(callback) {
  onBeat = callback;
}

export function isPlaying() {
  return playing;
}

export function getBpm() {
  return Math.round(Tone.Transport.bpm.value);
}

export function setBpm(value) {
  Tone.Transport.bpm.value = clamp(value, MIN_BPM, MAX_BPM);
  applyRates();
  return getBpm();
}

export function getPitch() {
  return pitch;
}

export function setPitch(value) {
  pitch = clamp(Math.round(value), -12, 12);
  applyRates();
  return pitch;
}

export function getKey() {
  return KEYS[keyIndex];
}

export function setKey(index) {
  keyIndex = ((index % KEYS.length) + KEYS.length) % KEYS.length;
  applyRates();
  return getKey();
}

export function cycleKey(step) {
  return setKey(keyIndex + step);
}

export function getScale() {
  return scaleId;
}

export function setScale(id) {
  scaleId = id;
  applyRates();
  return scaleId;
}

export function setMasterVolume(percent) {
  const value = clamp(percent, 0, 100);
  master.volume.value = Tone.gainToDb(Math.max(value / 100, 0.0001));
}

export function isPadActive(id) {
  return activeIds.has(id);
}

export function isPadPending(id) {
  const player = players.get(id);
  return playing && activeIds.has(id) && player?.state !== "started";
}

export function setPadActive(id, nextActive) {
  const player = players.get(id);
  if (nextActive) {
    activeIds.add(id);
  } else {
    activeIds.delete(id);
    if (player && player.state === "started") player.stop();
  }
  return activeIds.has(id);
}

export function togglePad(id) {
  return setPadActive(id, !activeIds.has(id));
}

export async function togglePlay() {
  await ready;
  await Tone.start();

  if (playing) {
    Tone.Transport.pause();
    playing = false;
    for (const pattern of PATTERNS) {
      const player = players.get(pattern.id);
      if (player && player.state === "started") player.stop();
    }
    return playing;
  }

  Tone.Transport.start();
  playing = true;
  return playing;
}

export function stop() {
  for (const pattern of PATTERNS) {
    const player = players.get(pattern.id);
    if (player && player.state === "started") player.stop();
  }
  Tone.Transport.stop();
  Tone.Transport.position = 0;
  playing = false;
}

export function resetAll() {
  stop();
  activeIds.clear();
  pitch = 0;
  keyIndex = 0;
  scaleId = "minor";
  Tone.Transport.bpm.value = DEFAULT_BPM;
  setMasterVolume(80);
  applyRates();
}
