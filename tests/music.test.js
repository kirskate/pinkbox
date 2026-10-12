import { test, expect } from "bun:test";
import {
  generatePhrase,
  validPhrase,
  ROLES,
  STEP_TICKS,
  PHRASE_STEPS,
  filterFrequency,
} from "../src/patterns.js";
import { PerformanceState, nextBar } from "../src/state.js";
function running(seed = 17) {
  const state = new PerformanceState(seed);
  state.finishStart(state.beginStart());
  return state;
}
function advanceThrough(state, start, end) {
  const frames = [];
  for (let i = start; i <= end; i++) frames.push(state.advance(i));
  return frames;
}
function recorded(state, role = "keys") {
  state.select(role);
  state.advance(0);
  expect(state.record()).toBe(true);
  advanceThrough(state, 1, 80);
  expect(state.rec).toBe(null);
  return state.tracks[role].clip;
}
test("generator: 4000 reproducible bounded phrases, same C minor world", () => {
  for (const { id } of ROLES)
    for (let seed = 0; seed < 1000; seed++) {
      const phrase = generatePhrase(id, seed);
      expect(validPhrase(id, phrase)).toBe(true);
      expect(phrase[0].tick).toBe(0);
      expect(generatePhrase(id, seed)).toEqual(phrase);
    }
});
test("invalid candidates reject nonfinite data, out-of-world notes, overflow and excess voices", () => {
  const phrase = generatePhrase("keys", 2);
  for (const change of [
    { tick: -48 },
    { duration: Infinity },
    { notes: [61] },
    { velocity: NaN },
    { duration: PHRASE_STEPS * STEP_TICKS + 1 },
    { notes: [48, 48, 48, 48, 48] },
  ]) {
    expect(validPhrase("keys", [{ ...phrase[0], ...change }])).toBe(false);
  }
  expect(validPhrase("keys", [])).toBe(false);
  expect(() => generatePhrase("unknown", 0)).toThrow();
});
test("initial readiness, no autoplay, single start and stale async start cancellation", () => {
  const state = new PerformanceState();
  expect(state.status).toBe("stopped");
  expect(state.tracks.keys.desired).toBe(true);
  expect(state.tracks.keys.active).toBe(false);
  expect(state.record()).toBe(false);
  const generation = state.beginStart();
  expect(state.beginStart()).toBe(null);
  state.stop();
  expect(state.finishStart(generation)).toBe(false);
});
test("next available bar is strictly beyond scheduled frame, including boundaries", () => {
  expect(nextBar(-1)).toBe(0);
  expect(nextBar(0)).toBe(16);
  expect(nextBar(15)).toBe(16);
  expect(nextBar(16)).toBe(32);
});
test("layer queued changes and double click cancellation, stopped selection retained", () => {
  const state = running();
  state.advance(3);
  state.toggle("bass");
  expect(state.tracks.bass.pending).toBe(16);
  expect(state.tracks.bass.active).toBe(false);
  state.toggle("bass");
  expect(state.tracks.bass.pending).toBe(null);
  state.toggle("bass");
  state.advance(15);
  expect(state.tracks.bass.active).toBe(false);
  const frame = state.advance(16);
  expect(state.tracks.bass.active).toBe(true);
  expect(frame.attacks.some((event) => event.role === "bass")).toBe(true);
  state.stop();
  expect(state.tracks.bass.desired).toBe(true);
  state.finishStart(state.beginStart());
  expect(state.tracks.bass.active).toBe(true);
});
test("REC fixed target, four bars, actual live events and exact loop repeats", () => {
  const state = running(); state.advance(0); state.record();
  const {start,end} = state.rec; state.select("bass");
  expect(state.record()).toBe(false);
  const frames = advanceThrough(state,1,end);
  const captured = frames.flatMap((frame,index) => index+1>=start && index+1<end
    ? frame.attacks.filter(e=>e.role==="keys" && e.source==="live").map(({role,source,...e})=>({...e,tick:(index+1-start)*STEP_TICKS,duration:Math.min(e.duration,(end-index-1)*STEP_TICKS)})) : []);
  expect(end-start).toBe(64); expect(state.rec).toBe(null);
  expect(state.tracks.keys.clip).toEqual(captured);
  const first=advanceThrough(state,end+1,end+64).flatMap(f=>f.attacks.filter(e=>e.source==="loop"));
  const second=advanceThrough(state,end+65,end+128).flatMap(f=>f.attacks.filter(e=>e.source==="loop"));
  expect(first).toEqual(second);
});
test("STOP cancels replacement and stale commits preserve old phrase",()=>{
  const state=running(); const old=structuredClone(recorded(state));
  state.record(); const token=state.rec.token, generation=state.generation;
  advanceThrough(state,81,110);state.stop();
  expect(state.rec).toBe(null); expect(state.tracks.keys.clip).toEqual(old);
  expect(state.commitRecording(token,generation)).toBe(false);
});
test("replacement captures live while old loop plays independently",()=>{
  const state=running();const old=structuredClone(recorded(state));
  state.setMotion(100); state.record(); const end=state.rec.end;
  const frames=advanceThrough(state,81,end-1);
  expect(state.tracks.keys.clip).toEqual(old);
  expect(frames.some(f=>f.attacks.some(e=>e.source==="live") && f.attacks.some(e=>e.source==="loop"))).toBe(true);
  state.advance(end);expect(state.tracks.keys.clip).not.toEqual(old);
  expect(state.tracks.keys.active).toBe(false);
});
test("corrupt recording preserves previous loop",()=>{
  const state=running();const old=structuredClone(recorded(state));state.record();
  const end=state.rec.end;advanceThrough(state,81,end-1);state.rec.events[0].notes=[61];state.advance(end);
  expect(state.tracks.keys.clip).toEqual(old);expect(state.error).toContain("Previous phrase kept");
});
test("BPM clamps and applies at bar, REC length stays ticks, notes unchanged", () => {
  const state = running();
  state.advance(0);
  state.record();
  state.setBpm(160);
  expect(state.bpm).toBe(120);
  expect(state.advance(15).bpm).toBe(null);
  expect(state.advance(16).bpm).toBe(160);
  expect(state.rec.end - state.rec.start).toBe(64);
  state.setBpm(60);
  advanceThrough(state, 17, 80);
  expect(state.rec).toBe(null);
  const clip = structuredClone(state.tracks.keys.clip);
  state.setBpm(999);
  advanceThrough(state, 81, 100);
  expect(state.bpm).toBe(160);
  expect(state.tracks.keys.clip).toEqual(clip);
  state.stop();
  state.setBpm(-2);
  expect(state.bpm).toBe(60);
});
test("STOP retains clips and selected layers; restart aligns origin zero", () => {
  const state = running();
  const clip = structuredClone(recorded(state));
  state.stop();
  expect(state.tracks.keys.clip).toEqual(clip);
  expect(state.tracks.keys.loopDesired).toBe(true);
  state.finishStart(state.beginStart());
  const frame = state.advance(0);
  expect(
    frame.attacks.filter((e) => e.role === "keys").map(({ role, source, ...e }) => e),
  ).toEqual(clip.filter((e) => e.tick === 0));
});
test("filter mapping smooth logarithmic range without changing events", () => {
  expect(filterFrequency(0)).toBe(180);
  expect(filterFrequency(100)).toBe(18000);
  expect(filterFrequency(50)).toBe(1800);
  expect(filterFrequency(-50)).toBe(180);
});
test("all four roles execute under long stress without expanding clip storage", () => {
  const state = new PerformanceState(11);
  for (const role of ["synth", "bass", "arp"]) state.toggle(role);
  state.finishStart(state.beginStart());
  recorded(state);
  const clip = structuredClone(state.tracks.keys.clip);
  let attacks = 0;
  for (let step = 81; step < 16000; step++) {
    if (step % 71 === 0) state.setBpm(step % 2 ? 60 : 160);
    const frame = state.advance(step);
    attacks += frame.attacks.length;
    expect(frame.attacks.length).toBeLessThanOrEqual(4);
    expect(
      Object.values(state.tracks).every((t) => t.phrase.length <= 64),
    ).toBe(true);
  }
  expect(attacks).toBeGreaterThan(10000);
  expect(state.tracks.keys.clip).toEqual(clip);
});

test("first REC captures live music without replacing it at the start boundary", () => {
  const state = running();
  state.advance(0);
  const initial = structuredClone(state.tracks.keys.phrase);
  state.record();
  advanceThrough(state, 1, 15);
  const start = state.advance(16);
  expect(start.cuts).not.toContain("keys");
  expect(state.tracks.keys.phrase).toEqual(initial);
  expect(
    start.attacks
      .filter((e) => e.role === "keys")
      .map(({ role, source, ...event }) => event),
  ).toEqual(initial.filter((event) => event.tick === 16 * STEP_TICKS));
  advanceThrough(state, 17, 79);
  const end = state.advance(80);
  expect(state.tracks.keys.loopOrigin).toBe(16);
  expect(
    end.attacks
      .filter((e) => e.role === "keys")
      .map(({ role, source, ...event }) => event),
  ).toEqual(state.tracks.keys.clip.filter((event) => event.tick === 0));
});

test("all four recording slots remain independent through sequential recordings", () => {
  const state = new PerformanceState(24);
  for (const role of ["bass", "synth", "arp"]) state.toggle(role);
  state.finishStart(state.beginStart());
  state.advance(0);
  const previous = {};
  for (const role of ["keys", "bass", "synth", "arp"]) {
    state.select(role);
    expect(state.record()).toBe(true);
    const end = state.rec.end;
    advanceThrough(state, state.step + 1, end);
    expect(state.rec).toBe(null);
    for (const [id, clip] of Object.entries(previous))
      expect(state.tracks[id].clip).toEqual(clip);
    previous[role] = structuredClone(state.tracks[role].clip);
    expect(validPhrase(role, previous[role])).toBe(true);
  }
});

test("loop toggle cancellation and restart keep saved events",()=>{
 const state=running();const old=structuredClone(recorded(state));
 state.toggleLoop("keys");state.toggleLoop("keys");
 state.advance(96);expect(state.tracks.keys.loopActive).toBe(true);
 state.stop();state.finishStart(state.beginStart());expect(state.advance(0).attacks.some(e=>e.source==="loop")).toBe(true);
 expect(state.tracks.keys.clip).toEqual(old);
});

test("ARP maintains the movement: no attack gap beyond an eighth note at 60 BPM", () => {
  for (let seed = 0; seed < 1000; seed++) {
    const phrase = generatePhrase("arp", seed);
    const ticks = phrase.map((event) => event.tick);
    ticks.push(PHRASE_STEPS * STEP_TICKS);
    for (let index = 1; index < ticks.length; index++) {
      expect(ticks[index] - ticks[index - 1]).toBeLessThanOrEqual(
        2 * STEP_TICKS,
      );
    }
  }
});
