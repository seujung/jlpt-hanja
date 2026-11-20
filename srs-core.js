/* 항목별 간격 반복 스케줄러 — 브라우저(window.SrsCore)와 Node 테스트(module.exports)에서 함께 씁니다.
 * DOM과 저장소를 모릅니다. app.js가 결과를 hz_srs에 저장합니다. */
(function (root) {
  "use strict";
  const MIN = 60000, DAY = 86400000;
  /** 인덱스 = 상자. 1 = 10분, 2 = 1일, 3 = 3일, 4 = 7일, 5 = 14일, 6 = 30일 */
  const INTERVALS = [0, 10 * MIN, DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY];
  const MAX_BOX = 6, KNOWN_BOX = 4;
  const DUE_BLOCK = 150, SESSION_SIZE = 20, DEFAULT_CAP = 40, CAP_MIN = 10, CAP_MAX = 100;

  const intervalOf = box => INTERVALS[Math.min(Math.max(box | 0, 1), MAX_BOX)];
  const nextBox = (box, ok) => (ok ? Math.min((box || 1) + 1, MAX_BOX) : 1);

  /** 답 하나를 반영한 새 항목 상태입니다. repeat: 회차 끝 재출제(맞히면 상자 2, 틀려도 n 그대로). */
  function answer(entry, ok, now, opts) {
    const e = entry || { b: 1, n: 0 };
    const repeat = !!(opts && opts.repeat);
    const b = repeat ? (ok ? 2 : 1) : nextBox(e.b, ok);
    const n = (e.n || 0) + (!ok && !repeat ? 1 : 0);
    return { b, due: now + intervalOf(b), n };
  }

  /** 새 항목을 처음 본 결과입니다. 맞히면 "이미 아는 항목"(상자 4), 아니면 상자 1입니다. */
  function firstLook(ok, now) {
    return ok ? { b: KNOWN_BOX, due: now + intervalOf(KNOWN_BOX), n: 0 } : { b: 1, due: now + intervalOf(1), n: 1 };
  }

  /** 하루 새 항목 수 M입니다. 남은 학습일이 0 이하이면 하루로 보고 상한까지 냅니다. */
  function newPerDay({ remaining, studyDays, cap }) {
    if (!(remaining > 0)) return { m: 0, overCap: false };
    const raw = Math.ceil(remaining / Math.max(studyDays, 1));
    return { m: Math.min(raw, cap), overCap: raw > cap };
  }

  /** 오늘 더 낼 수 있는 새 항목 수입니다. 지금 복습할 항목이 150개를 넘으면 0입니다. */
  function newAllowedToday({ m, introduced, today, dueNow }) {
    if (dueNow > DUE_BLOCK) return 0;
    const used = introduced && introduced.day === today ? introduced.n || 0 : 0;
    return Math.max(0, m - used);
  }

  /** 한 회차의 문제 키입니다. 복습을 먼저 채우고 남는 자리에 새 항목을 넣습니다. */
  function composeSession({ due, fresh, size }) {
    const n = size || SESSION_SIZE;
    const review = due.slice(0, n);
    return { review, fresh: fresh.slice(0, n - review.length) };
  }

  const pad = v => String(v).padStart(2, "0");
  /** 현지 날짜 YYYY-MM-DD */
  function dayKey(now) {
    const d = new Date(now);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /**
   * 토리파 진도를 복습 큐로 옮길 항목입니다. 새로 넣을 항목만 돌려줍니다.
   * checked(틀렸던 항목) → 상자 2, known(1단계에서 맞힌 항목) → 상자 4.
   * 큐에 이미 있는 키와 중복 키는 건너뜁니다. checked를 먼저, 하루 perDay개씩 내일 0시부터 배치합니다.
   */
  function migrateToripa({ checked, known, srs, now, perDay }) {
    const per = perDay || 30, out = {}, order = [];
    const add = (key, b, n) => {
      if (Object.prototype.hasOwnProperty.call(srs, key) || out[key]) return;
      out[key] = { b, due: 0, n }; order.push(key);
    };
    checked.forEach(k => add(k, 2, 1));
    known.forEach(k => add(k, KNOWN_BOX, 0));
    order.forEach((k, i) => {
      const d = new Date(now);
      d.setHours(24, 0, 0, 0);                    // 내일 0시(현지)
      d.setDate(d.getDate() + Math.floor(i / per));
      out[k].due = d.getTime();
    });
    return out;
  }

  const api = {
    INTERVALS, DUE_BLOCK, SESSION_SIZE, DEFAULT_CAP, CAP_MIN, CAP_MAX,
    intervalOf, nextBox, answer, firstLook, newPerDay, newAllowedToday, composeSession, dayKey, migrateToripa
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SrsCore = api;
})(typeof window !== "undefined" ? window : globalThis);
