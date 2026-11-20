"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../srs-core.js");

const DAY = 86400000, MIN = 60000;

test("intervals by box", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(S.intervalOf), [10 * MIN, DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY, 60 * DAY]);
});
test("nextBox: up to 7, stays at max, wrong resets to 1", () => {
  assert.equal(S.nextBox(1, true), 2); assert.equal(S.nextBox(6, true), 7);
  assert.equal(S.nextBox(7, true), 7); assert.equal(S.nextBox(5, false), 1);
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
test("newAllowedToday: subtracts today's count, resets on new day, blocks over 250", () => {
  assert.equal(S.newAllowedToday({ m: 40, introduced: { day: "2026-11-20", n: 15 }, today: "2026-11-20", dueNow: 0 }), 25);
  assert.equal(S.newAllowedToday({ m: 40, introduced: { day: "2026-11-19", n: 40 }, today: "2026-11-20", dueNow: 0 }), 40);
  assert.equal(S.newAllowedToday({ m: 40, introduced: null, today: "2026-11-20", dueNow: 250 }), 40);
  assert.equal(S.newAllowedToday({ m: 40, introduced: null, today: "2026-11-20", dueNow: 251 }), 0);
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

test("migrateToripa: checked box 2 first, known box 4, 30 per day from tomorrow", () => {
  const now = new Date(2026, 10, 20, 15).getTime();
  const tomorrow = new Date(2026, 10, 21).getTime();
  const checked = Array.from({ length: 31 }, (_, i) => "c" + i);
  const out = S.migrateToripa({ checked, known: ["k0", "c0"], srs: {}, now });
  assert.deepEqual(out.c0, { b: 2, due: tomorrow, n: 1 });
  assert.equal(out.c29.due, tomorrow);
  assert.equal(out.c30.due, tomorrow + DAY);
  assert.deepEqual(out.k0, { b: 4, due: tomorrow + DAY, n: 0 });
  assert.equal(Object.keys(out).length, 32);
});
test("migrateToripa: never overwrites existing queue entries", () => {
  const out = S.migrateToripa({ checked: ["国際"], known: ["h:0001"], srs: { "国際": { b: 5, due: 1, n: 0 } }, now: 0 });
  assert.equal(out["国際"], undefined);
  assert.equal(out["h:0001"].b, 4);
});

test("todayNew: items introduced today are not counted twice (few study days left)", () => {
  const today = "2026-11-20";
  // 남은 60개, 학습일 1일, 상한 40: 오늘 30개를 본 뒤에도 10개를 더 낼 수 있어야 함
  assert.deepEqual(S.todayNew({ remaining: 30, studyDays: 1, cap: 40, introduced: { day: today, n: 30 }, today, dueNow: 0 }),
    { m: 40, overCap: true, allowed: 10 });
  // 남은 200개, 3일, 상한 100: 하루 67개
  assert.equal(S.todayNew({ remaining: 150, studyDays: 3, cap: 100, introduced: { day: today, n: 50 }, today, dueNow: 0 }).allowed, 17);
  // 어제 기록은 오늘 계산에 넣지 않음
  assert.deepEqual(S.todayNew({ remaining: 100, studyDays: 10, cap: 40, introduced: { day: "2026-11-19", n: 30 }, today, dueNow: 0 }),
    { m: 10, overCap: false, allowed: 10 });
  assert.equal(S.todayNew({ remaining: 100, studyDays: 10, cap: 40, introduced: null, today, dueNow: 251 }).allowed, 0);
});

test("elapsedDays: counts from start day, clamps to 1~total", () => {
  const now = new Date(2026, 10, 20, 15).getTime();   // 2026-11-20
  assert.equal(S.elapsedDays("2026-11-20", now, 169), 1);   // 첫날
  assert.equal(S.elapsedDays("2026-11-19", now, 169), 2);   // 하루 지남
  assert.equal(S.elapsedDays("2026-11-01", now, 169), 20);
  assert.equal(S.elapsedDays("2026-12-01", now, 169), 1);   // 미래 시작일은 1로 자름
  assert.equal(S.elapsedDays("2026-01-01", now, 30), 30);   // 전체 일자를 넘지 않음
  assert.equal(S.elapsedDays(null, now, 169), 0);           // 시작일 없음
  assert.equal(S.elapsedDays("2026-11-20", now, 0), 0);     // 전체 일자 0
  assert.equal(S.elapsedDays("bad", now, 169), 0);
});
test("isDayKey", () => {
  assert.equal(S.isDayKey("2026-11-20"), true);
  assert.equal(S.isDayKey("2026-1-2"), false);
  assert.equal(S.isDayKey(null), false);
  assert.equal(S.isDayKey(20261120), false);
});
test("countDone: box 4 and above counts, box 3 does not", () => {
  const srs = { a: { b: 3 }, b: { b: 4 }, c: { b: 6 }, d: { b: 1 } };
  assert.equal(S.countDone(["a", "b", "c", "d"], srs), 2);
  assert.equal(S.countDone(["a", "b", "c", "d", "missing"], srs), 2);
  assert.equal(S.countDone([], srs), 0);
  assert.equal(S.countDone(["a"], {}), 0);   // 큐에 없는 항목은 세지 않음
});
