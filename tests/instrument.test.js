import { test, expect } from "bun:test";
import { PerformanceState } from "../src/state.js";
const key = { degree: 0, black: false };
function running() {
  const s = new PerformanceState();
  s.finishStart(s.beginStart());
  s.advance(0);
  return s;
}
function through(s, from, end) {
  const frames = [];
  for (let i = from; i <= end; i++) frames.push(s.advance(i));
  return frames;
}
function capture(s) {
  s.press("a", key);
  s.record();
  const end = s.rec.end;
  through(s, s.step + 1, end);
  return s.slots.find(Boolean);
}
test("four empty recording slots and no generated music on PLAY", () => {
  const s = running();
  expect(s.slots).toEqual([null, null, null, null]);
  expect(s.advance(1).attacks).toEqual([]);
});
test("held degree follows tonality and release stops only live voice", () => {
  const s = running();
  s.press("a", key);
  expect(s.advance(1).attacks[0].notes).toEqual([60, 63, 67]);
  s.setKey(2);
  expect(s.advance(2).attacks[0].notes).toEqual([62, 65, 69]);
  s.release("a");
  expect(s.advance(3).cuts).toContain("live");
});
test("recording held note produces a full four-bar loop without silencing live", () => {
  const s = running();
  const clip = capture(s);
  expect(clip.events[0]).toMatchObject({
    tick: 0,
    duration: 3072,
    notes: [60, 63, 67],
  });
  expect(s.rec).toBe(null);
  expect(s.live.notes).toEqual([60, 63, 67]);
  s.release("a");
  const f = s.advance(s.step + 1);
  expect(f.cuts).toContain("live");
  expect(s.slots[0].events).toEqual(clip.events);
  expect(s.slots[0].settings).toEqual(clip.settings);
});
test("saved notes and timbre remain fixed after live changes", () => {
  const s = running();
  const clip = structuredClone(capture(s));
  s.setKey(2);
  s.setTimbre(2);
  s.advance(s.step + 1);
  expect(s.slots[0].events).toEqual(clip.events);
  expect(s.slots[0].settings).toEqual(clip.settings);
});
test("four additive recordings; deletion frees a slot; reset clears all", () => {
  const s = running();
  for (let i = 0; i < 4; i++) capture(s);
  expect(s.slots.filter(Boolean).length).toBe(4);
  expect(s.record()).toBe(false);
  s.deleteSlot(2);
  expect(s.record()).toBe(true);
  s.reset();
  expect(s.slots.every((x) => x === null)).toBe(true);
  expect(s.status).toBe("stopped");
});
test("REC captures arp notes and changed tonality, including held notes at its start", () => {
  const s = running();
  s.press("a", key);
  s.setArp(3);
  s.record();
  for (let i = 1; i <= s.rec.end; i++) {
    if (i === 32) s.setKey(2);
    s.advance(i);
    if (!s.rec) break;
  }
  const e = s.slots[0].events;
  expect(e.length).toBe(64);
  expect(e.every((x) => x.notes.length === 1)).toBe(true);
  expect(e.some((x) => x.notes.includes(62))).toBe(true);
});
test("STOP cancels unfinished candidate and keeps completed slots", () => {
  const s = running();
  const clip = structuredClone(capture(s));
  s.record();
  s.advance(s.step + 1);
  s.stop();
  expect(s.rec).toBe(null);
  expect(s.slots[0].events).toEqual(clip.events);
  expect(s.slots[0].settings).toEqual(clip.settings);
});
test("manual bass uses pads; linked bass follows the keyboard root without extra chord", () => {
  const s = running();
  s.press("a", key);
  s.setMode("bass");
  expect(s.advance(1).attacks[0].notes).toEqual([36]);
  s.bassMode = "manual";
  expect(s.notes()).toEqual([]);
  s.press("pad", { degree: 4, black: false, pad: true });
  expect(s.advance(2).attacks[0].notes).toEqual([43]);
});
import {
  chordNotes,
  arpIndex,
  validClip,
  filterFrequency,
} from "../src/patterns.js";
test("white degrees produce triads, sevenths and ninths; black keys remain major triads", () => {
  expect(chordNotes(0, "minor", key, 2)).toEqual([60, 63, 67, 70, 74]);
  expect(chordNotes(0, "minor", { degree: 0, black: true }, 2)).toEqual([
    61, 65, 68,
  ]);
  for (let tonic = 0; tonic < 12; tonic++)
    for (const scale of ["minor", "major"])
      for (let degree = 0; degree <= 7; degree++)
        for (let richness = 0; richness <= 2; richness++) {
          const notes = chordNotes(
            tonic,
            scale,
            { degree, black: false },
            richness,
          );
          expect(validClip([{ tick: 0, duration: 3072, notes }])).toBe(true);
        }
});
test("UP/DOWN never duplicates endpoint; down starts at top", () => {
  expect(Array.from({ length: 9 }, (_, i) => arpIndex(i, 3, "updown"))).toEqual(
    [0, 1, 2, 1, 0, 1, 2, 1, 0],
  );
  expect(arpIndex(0, 5, "down")).toBe(4);
});
test("release and chord change capture actual shortened durations", () => {
  const s = running();
  s.press("a", key);
  s.record();
  through(s, 1, 19);
  s.setKey(2);
  through(s, 20, 23);
  s.release("a");
  through(s, 24, 80);
  expect(s.slots[0].events).toEqual([
    { tick: 0, duration: 192, notes: [60, 63, 67] },
    { tick: 192, duration: 192, notes: [62, 65, 69] },
  ]);
});
test("empty REC is rejected without claiming a saved slot", () => {
  const s = running();
  s.record();
  through(s, 1, 80);
  expect(s.slots.filter(Boolean)).toHaveLength(0);
  expect(s.error).toContain("пустая");
});
test("settings are captured at REC start, not at arm or commit", () => {
  const s = running();
  s.press("a", key);
  s.record();
  s.setTimbre(1);
  through(s, 1, 16);
  s.setTimbre(2);
  through(s, 17, 80);
  expect(s.slots[0].settings.timbre).toBe(1);
});
test("loop mute and volume never change notes or live; stop/restart aligns loops", () => {
  const s = running();
  capture(s);
  const events = structuredClone(s.slots[0].events);
  s.toggleSlot(0);
  s.setSlotVolume(0, 25);
  s.advance(96);
  expect(s.slots[0].active).toBe(false);
  expect(s.live.notes.length).toBe(3);
  expect(s.slots[0].volume).toBe(25);
  s.toggleSlot(0);
  s.advance(112);
  s.stop();
  s.finishStart(s.beginStart());
  expect(s.advance(0).attacks.some((e) => e.source === "loop0")).toBe(true);
  expect(s.slots[0].events).toEqual(events);
});
test("last held key wins, releasing it restores previous key; stray key-up is harmless", () => {
  const s = running();
  s.press("a", key);
  s.press("s", { degree: 1, black: false });
  expect(s.notes()).toEqual([62, 65, 68]);
  s.release("s");
  s.release("unknown");
  expect(s.notes()).toEqual([60, 63, 67]);
});
test("BPM uses bar boundaries, preserves clip pitches; stale PLAY cannot restart STOP", () => {
  const s = running();
  capture(s);
  const events = structuredClone(s.slots[0].events);
  s.setBpm(160);
  expect(s.bpm).toBe(120);
  s.advance(96);
  expect(s.bpm).toBe(160);
  expect(s.slots[0].events).toEqual(events);
  s.stop();
  const gen = s.beginStart();
  s.stop();
  expect(s.finishStart(gen)).toBe(false);
});
test("invalid note data and durations cannot become loop data; filter is bounded", () => {
  expect(validClip([{ tick: 0, duration: 0, notes: [60] }])).toBe(false);
  expect(validClip([{ tick: 0, duration: 3072, notes: [NaN] }])).toBe(false);
  expect(validClip([{ tick: 48, duration: 3072, notes: [60] }])).toBe(false);
  expect(filterFrequency(50)).toBe(1800);
});

import { TIMBRE_NAMES } from "../src/patterns.js";
test("six selectable timbres retain the selected sound in new recordings", () => {
  expect(TIMBRE_NAMES).toHaveLength(6);
  const state = running();
  state.setTimbre(5);
  expect(state.timbre).toBe(5);
  const clip = capture(state);
  expect(clip.settings.timbre).toBe(5);
});
