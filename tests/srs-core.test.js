"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../srs-core.js");

const DAY = 86400000, MIN = 60000;

test("intervals by box", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(S.intervalOf), [10 * MIN, DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY]);
});
test("nextBox: up to 6, wrong resets to 1", () => {
  assert.equal(S.nextBox(1, true), 2); assert.equal(S.nextBox(6, true), 6); assert.equal(S.nextBox(5, false), 1);
});
test("answer: wrong increments n, right moves box and due", () => {
  const now = 1e12;
  assert.deepEqual(S.answer({ b: 3, due: 0, n: 2 }, false, now), { b: 1, due: now + 10 * MIN, n: 3 });
  assert.deepEqual(S.answer({ b: 3, due: 0, n: 2 }, true, now), { b: 4, due: now + 7 * DAY, n: 2 });
  assert.deepEqual(S.answer(undefined, false, now), { b: 1, due: now + 10 * MIN, n: 1 });
});
test("answer repeat: right → box 2, wrong stays box 1 without n++", () => {
  const now = 1e12;
  assert.deepEqual(S.answer({ b: 1, due: 0, n: 1 }, true, now, { repeat: true }), { b: 2, due: now + DAY, n: 1 });
  assert.deepEqual(S.answer({ b: 1, due: 0, n: 1 }, false, now, { repeat: true }), { b: 1, due: now + 10 * MIN, n: 1 });
});
test("firstLook", () => {
  assert.deepEqual(S.firstLook(true, 5), { b: 4, due: 5 + 7 * DAY, n: 0 });
  assert.deepEqual(S.firstLook(false, 5), { b: 1, due: 5 + 10 * MIN, n: 1 });
});
test("newPerDay: ceil, cap, overCap, zero/negative days, nothing left", () => {
  assert.deepEqual(S.newPerDay({ remaining: 100, studyDays: 7, cap: 40 }), { m: 15, overCap: false });
  assert.deepEqual(S.newPerDay({ remaining: 4863, studyDays: 16, cap: 40 }), { m: 40, overCap: true });
  assert.deepEqual(S.newPerDay({ remaining: 50, studyDays: 0, cap: 40 }), { m: 40, overCap: true });
  assert.deepEqual(S.newPerDay({ remaining: 50, studyDays: -3, cap: 100 }), { m: 50, overCap: false });
  assert.deepEqual(S.newPerDay({ remaining: 0, studyDays: 10, cap: 40 }), { m: 0, overCap: false });
});
test("newAllowedToday: subtracts today's count, resets on new day, blocks over 150", () => {
  assert.equal(S.newAllowedToday({ m: 40, introduced: { day: "2026-11-20", n: 15 }, today: "2026-11-20", dueNow: 0 }), 25);
  assert.equal(S.newAllowedToday({ m: 40, introduced: { day: "2026-11-19", n: 40 }, today: "2026-11-20", dueNow: 0 }), 40);
  assert.equal(S.newAllowedToday({ m: 40, introduced: null, today: "2026-11-20", dueNow: 150 }), 40);
  assert.equal(S.newAllowedToday({ m: 40, introduced: null, today: "2026-11-20", dueNow: 151 }), 0);
  assert.equal(S.newAllowedToday({ m: 10, introduced: { day: "2026-11-20", n: 12 }, today: "2026-11-20", dueNow: 0 }), 0);
});
test("composeSession: due first, fill with fresh up to 20", () => {
  const due = Array.from({ length: 5 }, (_, i) => "d" + i), fresh = Array.from({ length: 30 }, (_, i) => "f" + i);
  const s = S.composeSession({ due, fresh });
  assert.equal(s.review.length, 5); assert.equal(s.fresh.length, 15); assert.equal(s.fresh[0], "f0");
  const big = S.composeSession({ due: Array.from({ length: 25 }, (_, i) => "d" + i), fresh });
  assert.equal(big.review.length, 20); assert.equal(big.fresh.length, 0);
});
test("dayKey uses local date", () => {
  assert.equal(S.dayKey(new Date(2026, 10, 20, 23, 59).getTime()), "2026-11-20");
  assert.equal(S.dayKey(new Date(2026, 10, 21, 0, 1).getTime()), "2026-11-21");
});
