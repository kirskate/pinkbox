import { test, expect } from "bun:test";
import { PerformanceState } from "../src/state.js";

function run() {
  const state = new PerformanceState(17);
  state.finishStart(state.beginStart());
  state.advance(0);
  return state;
}
function advance(state, from, through) {
  const events = [];
  for (let step = from; step <= through; step++)
    events.push(...state.advance(step).attacks);
  return events;
}
function capture(state) {
  state.record();
  advance(state, 1, 80);
}

test("saved loop plays independently with live switched off", () => {
  const state = run();
  capture(state);
  expect(state.tracks.keys.desired).toBe(false);
  expect(state.tracks.keys.loopDesired).toBe(true);
  expect(state.advance(96).attacks.some(e => e.source === "loop")).toBe(true);
  state.toggle("keys");
  state.advance(112);
  expect(state.advance(128).attacks.some(e => e.source === "loop")).toBe(true);
  state.toggle("keys");
  state.advance(144);
  expect(state.advance(160).attacks.some(e => e.source === "loop")).toBe(true);
});

test("live mute during recording does not cancel four-bar capture", () => {
  const state = run();
  state.record();
  state.advance(16);
  state.toggle("keys");
  advance(state, 17, 80);
  expect(state.tracks.keys.clip?.length).toBeGreaterThan(0);
});

test("chord control separates notes and REC captures changes", () => {
  const state = run();
  state.setMotion(100);
  state.record();
  const events = advance(state, 1, 80);
  expect(events.filter(e => e.role === "keys" && e.source === "live")
    .every(e => e.notes.length === 1)).toBe(true);
  expect(state.tracks.keys.clip.length).toBe(64);
});

test("REC on a silent role survives LIVE off while waiting for the bar", () => {
  const state = run();
  state.select("bass");
  state.record();
  state.toggle("bass");
  advance(state, 1, 80);
  expect(Boolean(state.tracks.bass.clip)).toBe(true);
  expect(state.tracks.bass.loopActive).toBe(true);
});

test("REC captures chord-to-notes changes without rewriting a completed loop", () => {
  const state = run();
  state.record();
  advance(state, 1, 31);
  state.setMotion(100);
  advance(state, 32, 80);
  const clip = structuredClone(state.tracks.keys.clip);
  expect(clip.some(e => e.notes.length === 4)).toBe(true);
  expect(clip.some(e => e.notes.length === 1)).toBe(true);
  state.setMotion(0);
  state.toggle("keys");
  advance(state, 81, 160);
  expect(state.tracks.keys.clip).toEqual(clip);
});

test("recorded chord ends when the live dial releases it", () => {
  const state = run();
  state.record();
  advance(state, 1, 19);
  state.setMotion(100);
  advance(state, 20, 80);
  expect(state.tracks.keys.clip[0].duration).toBe(4 * 48);
});
