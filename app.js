/* JLPT 상용한자 2136 학습 앱 — 토리파 암기법 + 퀴즈 */
(function () {
  "use strict";
  const DATA = (window.HANJA_DATA || []).slice().sort((a, b) => a.day - b.day);
  const app = document.getElementById("app");
  const pageTitle = document.getElementById("pageTitle");
  const topRight = document.getElementById("topRight");
  const dayNav = document.getElementById("dayNav");
  const voiceSelect = document.getElementById("voiceSelect");

  /* ---------- storage ---------- */
  const LS = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} }
  };
  LS.del("hz_prog_study"); // 카드 학습 모드 제거 → 잔여 데이터 정리
  const quizBest = LS.get("hz_quiz_best", {});   // day -> best %
  const toripa = LS.get("hz_toripa", {});        // "day:mode" -> {checks, phase, doneAt, rev6At, rev3At}
  const saveTp = () => LS.set("hz_toripa", toripa);

  /* ---------- progress backup / restore ---------- */
  function exportProgress() {
    const payload = {
      app: "jlpt-hanja", version: 3, exportedAt: new Date().toISOString(),
      quiz: quizBest, toripa,
      toripaLevels: LS.get("hz_toripa_levels", null), quizLevels: LS.get("hz_quiz_levels", null),
      voice: LS.get("hz_voice_name", null)
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `jlpt-hanja-progress-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function importProgress(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const p = JSON.parse(reader.result);
        if (p.app !== "jlpt-hanja" || (!p.quiz && !p.toripa)) throw new Error("형식이 올바르지 않습니다.");
        // 병합: 더 높은 점수/진행 단계를 유지 (v2 파일의 카드 학습 진도는 무시)
        Object.entries(p.quiz || {}).forEach(([d, v]) => { quizBest[d] = Math.max(quizBest[d] || 0, v); });
        LS.set("hz_quiz_best", quizBest);
        if (p.toripa) {
          Object.entries(p.toripa).forEach(([k, v]) => { if (!toripa[k] || (v.phase || 0) >= (toripa[k].phase || 0)) toripa[k] = v; });
          saveTp();
        }
        if (Array.isArray(p.toripaLevels)) LS.set("hz_toripa_levels", p.toripaLevels);
        if (Array.isArray(p.quizLevels)) LS.set("hz_quiz_levels", p.quizLevels);
        if (p.voice) LS.set("hz_voice_name", p.voice);
        alert("진도를 불러왔습니다. 기존 진도와 더 높은 값으로 병합했습니다.");
        go("home");
      } catch (e) { alert("불러오기 실패: " + e.message); }
    };
    reader.readAsText(file);
  }
  function resetProgress() {
    if (!confirm("토리파 진행 상태와 퀴즈 점수를 모두 초기화할까요?\n(되돌릴 수 없습니다. 필요하면 먼저 '진도 내보내기'로 백업하세요.)")) return;
    Object.keys(quizBest).forEach(k => delete quizBest[k]);
    Object.keys(toripa).forEach(k => delete toripa[k]);
    LS.set("hz_quiz_best", quizBest); saveTp(); LS.del("hz_prog_study");
    go("home");
  }

  /* ---------- TTS ---------- */
  let voices = [], chosenVoice = null;
  const FEMALE_RE = /kyoko|haruka|nanami|ayumi|sayaka|o-?ren|mizuki|tomoko|google\s*日本語|siri.*(female|1|2)|female|女性/i;
  const MALE_RE = /otoya|ichiro|hattori|takeshi|male|男性/i;
  function isFemale(v) { return FEMALE_RE.test(v.name); }
  function loadVoices() {
    voices = speechSynthesis.getVoices().filter(v => /ja(-|_)?JP|Japanese|日本/i.test(v.lang + v.name));
    if (!voices.length) voices = speechSynthesis.getVoices();
    voices.sort((a, b) => (isFemale(b) - isFemale(a)) || (MALE_RE.test(a.name) - MALE_RE.test(b.name)));
    voiceSelect.innerHTML = "";
    voices.forEach((v, i) => {
      const o = document.createElement("option");
      const tag = isFemale(v) ? " ・여성" : MALE_RE.test(v.name) ? " ・남성" : (/ja/i.test(v.lang) ? " ・日本語" : "");
      o.value = i; o.textContent = v.name.replace(/\s*\(.*?\)/, "") + tag;
      voiceSelect.appendChild(o);
    });
    const savedName = LS.get("hz_voice_name", null);
    let idx = savedName ? voices.findIndex(v => v.name === savedName) : -1;
    if (idx < 0) idx = voices.findIndex(isFemale);
    if (idx < 0) idx = 0;
    voiceSelect.value = idx;
    chosenVoice = voices[idx] || null;
  }
  voiceSelect.onchange = () => { chosenVoice = voices[voiceSelect.value]; LS.set("hz_voice_name", chosenVoice ? chosenVoice.name : null); };
  const hasTTS = "speechSynthesis" in window;
  if (hasTTS) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  else voiceSelect.parentElement.hidden = true;
  function speak(text) {
    if (!hasTTS || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP"; u.rate = 0.9;
    if (chosenVoice) u.voice = chosenVoice;
    speechSynthesis.speak(u);
  }
  const cancelSpeech = () => { if (hasTTS) speechSynthesis.cancel(); };

  /* ---------- helpers ---------- */
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; };
  const esc = s => String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const pad2 = n => String(n).padStart(2, "0");
  const dayOf = day => DATA.find(x => x.day === day);
  // 단어 전체 히라가나: furigana(한자부분 읽기) + 단어 끝 오쿠리가나
  function fullReading(r) {
    let fu = (r.furigana || "").trim();
    const rd = (r.reading || "").replace(/[()（）]/g, "").trim();
    if (!fu) fu = rd;
    const w = r.word || "";
    const m = w.match(/[ぁ-ゟ]+$/);
    if (m) { const oku = m[0]; if (fu && !fu.endsWith(oku)) fu += oku; }
    return fu || rd || w;
  }
  const fmtTime = t => {
    const dt = new Date(t), today = new Date();
    const hm = `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
    return dt.toDateString() === today.toDateString() ? `오늘 ${hm}` : `${dt.getMonth() + 1}/${dt.getDate()} ${hm}`;
  };

  /* ---------- JLPT 레벨 선택 (토리파·퀴즈 공용) ---------- */
  const ALL_LEVELS = ["N5", "N4", "N3", "N2", "N1"];
  const QUIZ_LEVEL_DEFAULT = ["N5", "N4", "N3", "N2"];
  function loadLevels(key, def) {
    const v = (LS.get(key, null) || def).filter(l => ALL_LEVELS.includes(l));
    return v.length ? v : def.slice();
  }
  // 저장된 선택 ∩ 이 일차에 존재하는 레벨. 교집합이 비면 존재하는 레벨 전체.
  function effectiveLevels(saved, avail) {
    const s = saved.filter(l => avail.includes(l));
    return s.length ? s : avail.slice();
  }
  function levelChips(avail, selected, counts, onChange) {
    const wrap = el("div", "chips");
    avail.forEach(l => {
      const on = selected.includes(l);
      const b = el("button", "chip " + l + (on ? " on" : ""));
      b.type = "button";
      b.setAttribute("aria-pressed", on);
      b.innerHTML = `<b>${l}</b>` + (counts ? `<span class="num">${counts[l] || 0}</span>` : "");
      b.onclick = () => {
        let next;
        if (on) { if (selected.length <= 1) return; next = selected.filter(x => x !== l); }
        else next = ALL_LEVELS.filter(x => selected.includes(x) || x === l);
        onChange(next);
      };
      wrap.appendChild(b);
    });
    return wrap;
  }

  /* ---------- 토리파 데이터 ---------- */
  const H6 = 6 * 3600e3, D3 = 3 * 24 * 3600e3;
  function tpState(day, mode) {
    const k = day + ":" + mode;
    if (!toripa[k]) toripa[k] = { checks: {}, phase: 0, doneAt: null, rev6At: null, rev3At: null };
    return toripa[k];
  }
  // levels: null이면 무필터. 한자: jlpt 없는 카드는 항상 포함. 단어: 예시 단어는 부모 카드 기준, 기출 단어는 자체 레벨 기준.
  function tpItems(day, mode, levels) {
    const d = dayOf(day);
    const lv = levels && levels.length ? new Set(levels) : null;
    const cardOk = c => !lv || !c.jlpt || lv.has(c.jlpt);
    if (mode === "hanja") return d.cards.filter(cardOk).map(c => {
      const kun = c.readings.filter(r => r.type === "훈독" && r.reading).map(r => r.reading);
      const on = c.readings.filter(r => r.type === "음독" && r.reading).map(r => r.reading);
      const rw = c.readings.find(r => r.word);
      return {
        id: c.id, front: c.char, meaning: c.gloss, lvl: c.jlpt || null,
        reading: [kun.length ? "훈독 " + kun.join(", ") : "", on.length ? "음독 " + on.join(", ") : ""].filter(Boolean).join(" · "),
        ex: rw ? `${rw.word} ${fullReading(rw)}` + (rw.meaning ? ` · ${rw.meaning}` : "") : "",
        speak: rw ? fullReading(rw) : c.char
      };
    });
    const items = [], seen = new Set();
    d.cards.forEach(c => {
      if (cardOk(c)) c.readings.forEach(r => {
        if (r.word && !seen.has(r.word)) { seen.add(r.word); items.push({ id: "w:" + r.word, front: r.word, meaning: r.meaning || "", reading: fullReading(r), ex: "", speak: fullReading(r), lvl: c.jlpt || null }); }
      });
      (c.related || []).forEach(rw => {
        if (rw.w && !seen.has(rw.w) && (!lv || lv.has(rw.l))) { seen.add(rw.w); items.push({ id: "w:" + rw.w, front: rw.w, meaning: rw.m || "", reading: rw.r || "", ex: "", speak: rw.r || rw.w, lvl: rw.l }); }
      });
    });
    return items;
  }
  function tpLevelCounts(day, mode) {
    const c = {};
    tpItems(day, mode, null).forEach(it => { if (it.lvl) c[it.lvl] = (c[it.lvl] || 0) + 1; });
    return c;
  }
  const GLOBAL_POOL = {};
  function getGlobalPool(mode) {
    return GLOBAL_POOL[mode] || (GLOBAL_POOL[mode] = DATA.flatMap(d => tpItems(d.day, mode, null)));
  }
  // pools 순서대로 훑어 서로 다른 오답 n개를 채움
  function pickDistractors(it, keyFn, n, pools) {
    const seen = new Set([keyFn(it)]), out = [];
    for (const pool of pools) {
      for (const x of shuffle(pool)) {
        const k = keyFn(x);
        if (!k || seen.has(k)) continue;
        seen.add(k); out.push(x);
        if (out.length >= n) return out;
      }
    }
    return out;
  }
  // 토리파 판정용 4지선다. 단어 모드는 뜻/읽기 교차 출제.
  function makeQuestion(it, mode, pools, i) {
    const reading = () => {
      const dis = pickDistractors(it, x => x.reading, 3, pools);
      return { it, type: "읽기 고르기", promptBig: it.front, promptSub: "이 단어의 읽기는?", correct: it.reading, options: shuffle([it.reading, ...dis.map(x => x.reading)]), jp: true, speakAns: it.speak, reveal: it };
    };
    const meaning = () => {
      const dis = pickDistractors(it, x => x.meaning, 3, pools);
      return { it, type: "뜻 고르기", promptBig: it.front, promptSub: mode === "hanja" ? "이 한자의 뜻과 음은?" : "이 단어의 뜻은?", correct: it.meaning, options: shuffle([it.meaning, ...dis.map(x => x.meaning)]), jp: false, speakAns: it.speak, reveal: it };
    };
    if (mode === "word" && i % 2 === 1 && it.reading) return reading();
    if (it.meaning) return meaning();
    if (it.reading) return reading();
    return null;
  }

  /* ---------- 공용 문제 카드 ---------- */
  // q: {type, promptBig, promptSub, promptJpSmall?, correct, options, jp, speakAns?, reveal?}
  // o: {head, onBack, backLabel, progress, tag, guide, onAnswer(ok), nextLabel, onNext}
  function questionCard(host, q, o) {
    host.innerHTML = "";
    const wrap = el("div", "qwrap");
    const head = el("div", "qhead");
    if (o.onBack) { const b = el("button", "btn ghost sm", o.backLabel || "← 목록"); b.onclick = o.onBack; head.appendChild(b); }
    head.appendChild(el("span", "qpos num", esc(o.head || "")));
    wrap.appendChild(head);
    if (o.progress != null) { const t = el("div", "track"); t.appendChild(el("i")).style.width = Math.round(o.progress * 100) + "%"; wrap.appendChild(t); }

    const card = el("div", "card q");
    card.appendChild(el("div", "qtype", esc(q.type) + (o.tag ? ` <span class="qtag">${esc(o.tag)}</span>` : "")));
    if (o.guide) card.appendChild(el("p", "cap", esc(o.guide)));
    const big = el("div", "big jp" + (q.promptJpSmall ? " md" : ""), esc(q.promptBig));
    card.appendChild(el("div", "prompt")).appendChild(big);
    card.appendChild(el("div", "qsub", esc(q.promptSub)));

    const opts = el("div", "opts");
    const reveal = el("div", "reveal inset"); reveal.hidden = true;
    const next = el("button", "btn pri", o.nextLabel || "다음 ▶"); next.hidden = true; next.onclick = o.onNext;
    q.options.forEach(opt => {
      const b = el("button", "opt" + (q.jp ? " jp" : ""), esc(opt));
      b.onclick = () => {
        const ok = opt === q.correct;
        [...opts.children].forEach(x => { x.disabled = true; if (x.textContent === q.correct) x.classList.add("correct"); });
        if (!ok) b.classList.add("wrong");
        if (q.reveal) {
          const it = q.reveal;
          reveal.innerHTML =
            `<div class="rv-head">${ok ? "😃 정답" : "🤔 오답"} <span class="rv-front jp">${esc(it.front)}</span></div>` +
            (it.meaning ? `<div class="mn-big">${esc(it.meaning)}</div>` : "") +
            (it.reading ? `<div class="rd jp">${esc(it.reading)}</div>` : "") +
            (it.ex ? `<div class="ex jp">${esc(it.ex)}</div>` : "");
          const sp = el("button", "spk", "🔊"); sp.title = "발음 듣기"; sp.onclick = () => speak(it.speak);
          reveal.appendChild(sp);
          reveal.hidden = false;
        }
        if (q.speakAns) speak(q.speakAns);
        next.hidden = false; next.focus();
        if (o.onAnswer) o.onAnswer(ok);
      };
      opts.appendChild(b);
    });
    const foot = el("div", "qfoot"); foot.appendChild(next);
    card.append(opts, reveal, foot);
    wrap.appendChild(card);
    host.appendChild(wrap);
  }

  /* ---------- 셸: 제목 · 사이드바 · 라우터 ---------- */
  const MANDANG = [
    [1, 6, "첫째 마당", "초급 · JLPT N5·N4"],
    [7, 18, "둘째 마당", "중급 · JLPT N3·N2"],
    [19, 30, "셋째 마당", "고급 · JLPT N1"]
  ];
  const mandOf = day => MANDANG.find(([a, b]) => day >= a && day <= b);
  let curDay = null, lastMode = "toripa";

  function setTitle(text, right) {
    pageTitle.textContent = text;
    topRight.innerHTML = "";
    if (right) topRight.appendChild(right);
  }
  // 두 모드 중 가장 앞선 진행 단계 (0~7)
  function tpStepsDone(day) {
    return Math.max(0, ...["hanja", "word"].map(m => {
      const s = toripa[day + ":" + m]; if (!s) return 0;
      let n = Math.min(s.phase || 0, 5); if (s.rev6At) n = 6; if (s.rev3At) n = 7; return n;
    }));
  }
  function dayStatus(d) {
    const steps = tpStepsDone(d.day);
    return { tp: steps >= 7 ? "done" : steps > 0 ? "progress" : "none", steps, quiz: quizBest[d.day] ?? null };
  }
  function renderSidebar() {
    dayNav.innerHTML = "";
    MANDANG.forEach(([a, b, name, sub]) => {
      dayNav.appendChild(el("span", "nav-label", `${esc(name)} · ${esc(sub)}`));
      DATA.filter(d => d.day >= a && d.day <= b).forEach(d => {
        const btn = el("button");
        btn.dataset.day = d.day; btn.title = `${pad2(d.day)}일차 · ${d.category}`;
        btn.innerHTML = `<span class="dn num">${pad2(d.day)}</span><span class="dc">${esc(d.category)}</span><span class="dm"></span>`;
        btn.onclick = () => go("day", d.day);
        dayNav.appendChild(btn);
      });
    });
    refreshSidebar();
  }
  function refreshSidebar() {
    dayNav.querySelectorAll("button").forEach(b => {
      const day = +b.dataset.day, s = dayStatus(dayOf(day));
      b.classList.toggle("on", day === curDay);
      b.querySelector(".dm").innerHTML = `<i class="dot ${s.tp}" title="토리파 ${s.steps}/7단계"></i>` + (s.quiz != null ? `<span class="num">${s.quiz}%</span>` : "");
    });
    const on = dayNav.querySelector("button.on");
    if (on && on.scrollIntoViewIfNeeded) on.scrollIntoViewIfNeeded(false);
  }
  function go(view, arg) {
    window.scrollTo(0, 0);
    cancelSpeech();
    curDay = view === "day" ? arg : null;
    if (view === "day") renderDay(arg); else renderHome();
    refreshSidebar();
  }

  /* ---------- HOME (개요) ---------- */
  function renderHome() {
    setTitle("개요");
    app.innerHTML = "";
    const totalCards = DATA.reduce((s, d) => s + d.cards.length, 0);
    const sts = DATA.map(dayStatus);
    const doneDays = sts.filter(s => s.tp === "done").length;
    const progDays = sts.filter(s => s.tp === "progress").length;
    const quizVals = Object.values(quizBest);
    const avg = quizVals.length ? Math.round(quizVals.reduce((a, b) => a + b, 0) / quizVals.length) : null;

    const ov = el("div", "card");
    ov.appendChild(el("h2", null, "학습 현황"));
    ov.appendChild(el("p", "cap", "왼쪽에서 일차를 고르거나 아래 카드에서 바로 시작하세요. 토리파 암기법 7단계로 외우고 퀴즈로 확인합니다. 진도는 이 브라우저에 저장됩니다."));
    const tiles = el("div", "tiles");
    const tile = (lb, v, lg) => { const t = el("div", "tile"); t.innerHTML = `<div class="lb">${lb}</div><div class="v num">${v}</div>` + (lg ? `<div class="lg">${lg}</div>` : ""); tiles.appendChild(t); };
    tile("전체 일차", DATA.length, "3개 마당");
    tile("상용한자", totalCards.toLocaleString() + "<small>자</small>");
    tile("토리파 완료 일차", doneDays, progDays ? `<span class="dl up">진행 중 ${progDays}</span>` : "7단계까지 마친 일차");
    tile("퀴즈 응시 일차", quizVals.length, "최고점 기록 기준");
    tile("퀴즈 평균 최고점", avg != null ? avg + "<small>%</small>" : "—");
    ov.appendChild(tiles);
    app.appendChild(ov);

    MANDANG.forEach(([a, b, name, sub]) => {
      const c = el("div", "card");
      c.appendChild(el("h2", null, `${esc(name)} <span class="small-note">${esc(sub)}</span>`));
      const grid = el("div", "day-grid");
      DATA.filter(d => d.day >= a && d.day <= b).forEach(d => grid.appendChild(dayTile(d)));
      c.appendChild(grid);
      app.appendChild(c);
    });
  }
  function dayTile(d) {
    const s = dayStatus(d);
    const t = el("div", "day-tile");
    t.innerHTML =
      `<div class="dt-top"><span class="badge num">${pad2(d.day)}일차</span>` +
      (s.quiz != null ? `<span class="badge quiz num">최고 ${s.quiz}%</span>` : "") + `</div>` +
      `<div class="dt-cat">${esc(d.category)}</div>` +
      `<div class="dt-meta num">한자 ${d.cards.length}자 · 토리파 ${s.steps}/7단계</div>` +
      `<div class="track ${s.tp}"><i style="width:${Math.round(s.steps / 7 * 100)}%"></i></div>`;
    const btns = el("div", "dt-btns");
    const b1 = el("button", "btn pri sm", "토리파"); b1.onclick = () => { lastMode = "toripa"; go("day", d.day); };
    const b2 = el("button", "btn ghost sm", "퀴즈"); b2.onclick = () => { lastMode = "quiz"; go("day", d.day); };
    btns.append(b1, b2); t.appendChild(btns);
    return t;
  }

  /* ---------- DAY: 모드 바 + 콘텐츠 ---------- */
  function renderDay(day) {
    const d = dayOf(day);
    const m = mandOf(day);
    setTitle(`${pad2(day)}일차 · ${d.category}`, el("span", "badge", `${esc(m[2])} · ${esc(m[3])}`));
    app.innerHTML = "";
    const bar = el("div", "card modebar");
    const host = el("div", "host");

    // 현재 모드에 필요한 레벨 정보
    function tpCtx() {
      const tpMode = LS.get("hz_toripa_mode", "hanja");
      const counts = tpLevelCounts(day, tpMode);
      const avail = ALL_LEVELS.filter(l => counts[l]);
      return { tpMode, counts, avail, levels: effectiveLevels(loadLevels("hz_toripa_levels", ALL_LEVELS), avail) };
    }
    function qzCtx() {
      const counts = {};
      d.cards.forEach(c => (c.related || []).forEach(rw => { counts[rw.l] = (counts[rw.l] || 0) + 1; }));
      const avail = ALL_LEVELS.filter(l => counts[l]);
      return { counts, avail, levels: effectiveLevels(loadLevels("hz_quiz_levels", QUIZ_LEVEL_DEFAULT), avail) };
    }
    const rerender = () => { cancelSpeech(); drawBar(); drawMode(); };

    function drawBar() {
      bar.innerHTML = "";
      const row1 = el("div", "modebar-row");
      const seg = el("div", "seg");
      [["toripa", "토리파 암기"], ["quiz", "퀴즈"]].forEach(([k, label]) => {
        const b = el("button", k === lastMode ? "on" : "", label);
        b.onclick = () => { if (lastMode !== k) { lastMode = k; rerender(); } };
        seg.appendChild(b);
      });
      row1.appendChild(seg);
      if (lastMode === "toripa") {
        const { tpMode } = tpCtx();
        const sub = el("div", "seg sub");
        [["hanja", "한자"], ["word", "예시·기출 단어"]].forEach(([k, label]) => {
          const b = el("button", k === tpMode ? "on" : "", label);
          b.onclick = () => { if (tpMode !== k) { LS.set("hz_toripa_mode", k); rerender(); } };
          sub.appendChild(b);
        });
        row1.appendChild(sub);
      }
      bar.appendChild(row1);

      const row2 = el("div", "modebar-row lv");
      if (lastMode === "toripa") {
        const c = tpCtx();
        if (c.avail.length) {
          row2.appendChild(el("span", "lv-label", "학습 레벨"));
          row2.appendChild(levelChips(c.avail, c.levels, c.counts, next => { LS.set("hz_toripa_levels", next); rerender(); }));
          row2.appendChild(el("span", "small-note", c.tpMode === "hanja" ? "레벨 미표기 한자는 항상 포함" : "예시 단어는 한자 레벨 기준"));
        }
      } else {
        const c = qzCtx();
        if (c.avail.length) {
          row2.appendChild(el("span", "lv-label", "기출 단어 레벨"));
          row2.appendChild(levelChips(c.avail, c.levels, c.counts, next => { LS.set("hz_quiz_levels", next); rerender(); }));
          row2.appendChild(el("span", "small-note", "한자·예시 단어 문제는 항상 출제"));
        }
      }
      if (row2.children.length) bar.appendChild(row2);
    }
    function drawMode() {
      if (lastMode === "toripa") { const c = tpCtx(); renderToripa(day, host, c.tpMode, c.levels); }
      else { const c = qzCtx(); renderQuiz(day, host, c.levels); }
    }
    drawBar(); drawMode();
    app.append(bar, host);
  }

  /* ---------- 토리파 암기법 ---------- */
  const TP_STEPS = [
    { t: "쭉 보면서 모르는 것 체크", d: "4지선다로 풀어 틀린 것에 ✔ 체크." },
    { t: "체크한 것 입으로 4~5번 암기", d: "발음을 듣고 소리 내어 따라 읽어요." },
    { t: "뜻 가리고 확인 — 모르면 더블체크", d: "다시 풀어 틀리면 ✔✔ 더블체크." },
    { t: "더블체크 뜻 가리고 적기 (1회독)", d: "종이에 적고 보기로 채점. 틀리면 ✔✔✔ 쓰리체크." },
    { t: "노트에 적고 뜻 말해보기", d: "더블·쓰리체크를 노트에 정리하고 뜻을 말해봐요." },
    { t: "잠자기 전 · 6시간 후 복습", d: "다시 풀어 기억을 장기기억으로!" },
    { t: "3일 뒤 최종 복습", d: "마지막으로 한 번 더 확인해요." }
  ];

  function renderToripa(day, host, mode, levels) {
    const all = tpItems(day, mode, levels);
    const allUnf = tpItems(day, mode, null);
    const pools = [all, allUnf, getGlobalPool(mode)];
    const chk = (st, n) => all.filter(it => (st.checks[it.id] || 0) >= n);
    const marks = (st, it) => "✔".repeat(st.checks[it.id] || 0);

    /* ----- 허브: 단계 목록 ----- */
    function hub() {
      const st = tpState(day, mode);
      host.innerHTML = "";
      const card = el("div", "card");
      card.appendChild(el("h2", null, "토리파 암기법 · 7단계"));
      card.appendChild(el("p", "cap", "안다/모른다는 4지선다 문제로 판정합니다. 틀릴 때마다 체크가 올라가고, 체크된 것만 다음 단계로 넘어갑니다."));

      const c1 = chk(st, 1).length, c2 = chk(st, 2).length, c3 = chk(st, 3).length;
      const sum = el("div", "tp-sum");
      sum.innerHTML =
        `<span>학습 대상 <b class="num">${all.length}</b>개` +
        (all.length !== allUnf.length ? ` <span class="small-note num">(전체 ${allUnf.length}개 중 선택 레벨)</span>` : "") + `</span>` +
        `<span class="badge c1 num">✔ 체크 ${c1}</span><span class="badge c2 num">✔✔ 더블 ${c2}</span><span class="badge c3 num">✔✔✔ 쓰리 ${c3}</span>`;
      card.appendChild(sum);

      const now = Date.now();
      const list = el("div", "steps");
      TP_STEPS.forEach((s, i) => {
        const n = i + 1;
        let status, btn = null, hint = "";
        if (n <= 5) {
          status = st.phase >= n ? "done" : st.phase === n - 1 ? "now" : "lock";
          if (status !== "lock") {
            btn = el("button", "btn sm " + (status === "now" ? "pri" : "ghost"), status === "done" ? "다시 하기" : "시작");
            btn.onclick = () => runStep(n);
          }
        } else {
          const at = st.doneAt ? st.doneAt + (n === 6 ? H6 : D3) : null;
          const doneAt = n === 6 ? st.rev6At : st.rev3At;
          if (doneAt) { status = "done"; btn = el("button", "btn sm ghost", "다시 하기"); }
          else if (st.phase >= 5 && at && now >= at) { status = "now"; btn = el("button", "btn sm pri", "복습 시작"); }
          else { status = "lock"; hint = st.phase >= 5 && at ? `${fmtTime(at)}부터 가능` : "1~5단계를 먼저 끝내세요"; }
          if (btn) btn.onclick = () => runStep(n);
        }
        const row = el("div", "step " + status);
        row.innerHTML = `<span class="stno num">${status === "done" ? "✓" : n}</span>` +
          `<div class="stx"><div class="t">${esc(s.t)}</div><div class="d">${esc(s.d)}${hint ? ` <em>${esc(hint)}</em>` : ""}</div></div>`;
        if (btn) row.appendChild(btn);
        list.appendChild(row);
      });
      card.appendChild(list);

      const foot = el("div", "tp-foot");
      const quizBtn = el("button", "btn sec", `체크 단어 퀴즈 (${c1})`);
      quizBtn.disabled = !c1;
      quizBtn.onclick = () => tpQuiz();
      const resetBtn = el("button", "btn ghost danger", "이 일차 토리파 초기화");
      resetBtn.onclick = () => {
        if (!confirm(`이 일차(${mode === "hanja" ? "한자" : "단어"})의 체크와 진행 상태를 모두 초기화할까요?`)) return;
        toripa[day + ":" + mode] = { checks: {}, phase: 0, doneAt: null, rev6At: null, rev3At: null };
        saveTp(); refreshSidebar(); hub();
      };
      foot.append(quizBtn, resetBtn);
      card.appendChild(foot);
      host.appendChild(card);
    }

    function emptyStep(n) {
      host.innerHTML = "";
      const r = el("div", "card result");
      r.appendChild(el("div", "score", `${n}단계`));
      r.appendChild(el("div", "pct", "선택한 레벨에는 이 단계의 대상 항목이 없어요. 레벨을 바꾸거나 1단계를 다시 진행하세요."));
      const hb = el("button", "btn ghost", "단계 목록"); hb.onclick = hub;
      r.appendChild(hb); host.appendChild(r);
    }

    /* ----- 2단계: 듣고 따라 말하기 ----- */
    function cardRunner(n, cfg) {
      let i = 0, spoke = 0;
      function draw() {
        const it = cfg.items[i];
        host.innerHTML = "";
        const wrap = el("div", "qwrap");
        const head = el("div", "qhead");
        const back = el("button", "btn ghost sm", "← 단계 목록"); back.onclick = hub;
        head.append(back, el("span", "qpos num", `${n}단계 · ${i + 1} / ${cfg.items.length}`));
        wrap.appendChild(head);
        const t = el("div", "track"); t.appendChild(el("i")).style.width = (i / cfg.items.length * 100) + "%"; wrap.appendChild(t);

        const card = el("div", "card q");
        card.appendChild(el("div", "qtype", esc(cfg.title) + ` <span class="qtag">${marks(tpState(day, mode), it)}</span>`));
        card.appendChild(el("p", "cap", esc(cfg.guide)));
        const prompt = el("div", "prompt");
        prompt.appendChild(el("div", "big jp", esc(it.front)));
        const spk = el("button", "spk big", "🔊"); spk.title = "발음 듣기";
        const cnt = el("div", "tp-cnt num", `듣고 따라 말하기 ${spoke}회 / 4~5회`);
        spk.onclick = () => { speak(it.speak); spoke++; cnt.textContent = `듣고 따라 말하기 ${spoke}회 / 4~5회`; };
        prompt.appendChild(spk);
        card.append(prompt, cnt);
        const back2 = el("div", "reveal inset");
        back2.innerHTML =
          (it.meaning ? `<div class="mn-big">${esc(it.meaning)}</div>` : "") +
          (it.reading ? `<div class="rd jp">${esc(it.reading)}</div>` : "") +
          (it.ex ? `<div class="ex jp">${esc(it.ex)}</div>` : "");
        card.appendChild(back2);
        const foot = el("div", "qfoot");
        const nx = el("button", "btn pri", i < cfg.items.length - 1 ? "다음 ▶" : "완료");
        nx.onclick = () => { i++; spoke = 0; if (i < cfg.items.length) draw(); else cfg.onDone(); };
        foot.appendChild(nx); card.appendChild(foot);
        wrap.appendChild(card); host.appendChild(wrap);
      }
      draw();
    }

    /* ----- 판정 단계 (1·3·4·6·7): 4지선다 ----- */
    function quizRunner(n, cfg) {
      const st = tpState(day, mode);
      const items = cfg.items;
      let i = 0;
      function advance() { i++; if (i < items.length) draw(); else cfg.onDone(); }
      function draw() {
        const it = items[i];
        const q = makeQuestion(it, mode, pools, i);
        if (!q) return advance();
        questionCard(host, q, {
          head: `${n}단계 · ${i + 1} / ${items.length}`, onBack: hub, backLabel: "← 단계 목록",
          progress: i / items.length, tag: marks(st, it), guide: cfg.guide,
          onAnswer: ok => { if (!ok) { cfg.onWrong(it, st); saveTp(); } },
          nextLabel: i < items.length - 1 ? "다음 ▶" : "완료", onNext: advance
        });
      }
      draw();
    }

    /* ----- 단계별 실행 ----- */
    function runStep(n) {
      const st = tpState(day, mode);
      const done = msg => { saveTp(); refreshSidebar(); stepDone(n, msg); };
      const items = n === 1 ? all : n <= 3 ? chk(st, 1) : n <= 5 ? chk(st, 2) : null;
      if (n !== 1 && n !== 5 && n <= 5 && !items.length) return emptyStep(n);

      if (n === 1) {
        if (st.phase >= 1 && chk(st, 1).length && !confirm("1단계를 다시 하면 현재 레벨 항목의 체크가 초기화됩니다. 계속할까요?")) return;
        all.forEach(it => { delete st.checks[it.id]; });   // 다른 레벨의 체크는 보존
        st.phase = 0; st.doneAt = null; st.rev6At = null; st.rev3At = null; saveTp();
        quizRunner(1, {
          guide: "보기에서 뜻을 고르세요. 틀리면 ✔ 체크됩니다.", items: all,
          onWrong: (it, st) => { st.checks[it.id] = 1; },
          onDone: () => {
            st.phase = 1;
            if (!chk(st, 1).length) { st.phase = 5; st.doneAt = Date.now(); done("모르는 것이 없어요! 🎉 1~5단계를 건너뛰고 복습 일정만 잡았어요."); }
            else done(`체크 ${chk(st, 1).length}개! 이제 입으로 소리 내어 외울 차례예요.`);
          }
        });
      } else if (n === 2) {
        cardRunner(2, {
          title: "2단계 · 입으로 4~5번 암기", guide: "🔊를 누르고 4~5번 소리 내어 따라 읽으세요.", items,
          onDone: () => { st.phase = Math.max(st.phase, 2); done("이제 뜻을 가리고 스스로 확인해봐요."); }
        });
      } else if (n === 3) {
        quizRunner(3, {
          guide: "뜻을 먼저 떠올린 뒤 보기를 고르세요. 틀리면 ✔✔ 더블체크.", items,
          onWrong: (it, st) => { st.checks[it.id] = Math.max(st.checks[it.id] || 0, 2); },
          onDone: () => {
            st.phase = Math.max(st.phase, 3);
            const c2 = chk(st, 2).length;
            if (!c2) { st.phase = 5; st.doneAt = Date.now(); done("더블체크가 없어요! 4·5단계는 건너뛰고 복습 일정을 잡았어요. 🎉"); }
            else done(`더블체크 ${c2}개. 이제 종이에 적어볼 차례예요.`);
          }
        });
      } else if (n === 4) {
        quizRunner(4, {
          guide: "종이에 뜻을 직접 적은 뒤 보기를 골라 채점하세요. 틀리면 ✔✔✔ 쓰리체크.", items,
          onWrong: (it, st) => { st.checks[it.id] = 3; },
          onDone: () => { st.phase = Math.max(st.phase, 4); done("1회독 완료! 이제 노트에 정리해요."); }
        });
      } else if (n === 5) {
        noteStep(st);
      } else {
        let rv = chk(st, 2); if (!rv.length) rv = chk(st, 1); if (!rv.length) rv = all;
        quizRunner(n, {
          guide: "뜻을 종이에 적어본 뒤 보기를 골라 채점하세요. 틀리면 체크가 올라갑니다.", items: shuffle(rv),
          onWrong: (it, st) => { st.checks[it.id] = Math.min((st.checks[it.id] || 1) + 1, 3); },
          onDone: () => {
            if (n === 6) st.rev6At = Date.now(); else st.rev3At = Date.now();
            done(n === 6 ? "복습 완료! 장기기억으로 가는 중이에요. 3일 뒤에 한 번 더!" : "최종 복습까지 완료! 🎉 이 일차는 장기기억에 들어갔어요.");
          }
        });
      }
    }

    /* ----- 5단계: 노트 정리 ----- */
    function noteStep(st) {
      const items = chk(st, 2);
      host.innerHTML = "";
      const wrap = el("div", "qwrap");
      const head = el("div", "qhead");
      const back = el("button", "btn ghost sm", "← 단계 목록"); back.onclick = hub;
      head.append(back, el("span", "qpos num", `5단계 · 노트 정리 (${items.length}개)`));
      wrap.appendChild(head);
      const card = el("div", "card");
      card.appendChild(el("h2", null, "5단계 · 노트에 적고 뜻 말해보기"));
      card.appendChild(el("p", "cap", "더블·쓰리체크 단어를 노트에 옮겨 적고, 한 줄씩 뜻을 말해본 뒤 '뜻'을 눌러 확인하세요."));
      const listEl = el("div", "note-list");
      items.forEach(it => {
        const row = el("div", "note-row inset");
        const left = el("div", "l");
        left.innerHTML = `<span class="chk-mark">${marks(st, it)}</span><span class="w jp">${esc(it.front)}</span>` + (it.reading ? ` <span class="fu jp">${esc(it.reading)}</span>` : "");
        const mnBox = el("span", "mn-hide", esc(it.meaning || "—"));
        const mn = el("button", "btn ghost sm", "뜻"); mn.onclick = () => mnBox.classList.toggle("show");
        const sp = el("button", "spk", "🔊"); sp.title = "발음 듣기"; sp.onclick = () => speak(it.speak);
        row.append(left, mnBox, mn, sp);
        listEl.appendChild(row);
      });
      if (!items.length) listEl.appendChild(el("p", "cap", "더블체크 이상인 항목이 없어요. 바로 복습 일정을 시작할 수 있어요."));
      card.appendChild(listEl);
      const doneBtn = el("button", "btn pri", "5단계 완료 — 복습 일정 시작");
      doneBtn.style.marginTop = "14px";
      doneBtn.onclick = () => {
        st.phase = 5; st.doneAt = st.doneAt || Date.now(); saveTp(); refreshSidebar();
        stepDone(5, `노트 정리 완료! 6시간 후(${fmtTime(st.doneAt + H6)})와 3일 뒤(${fmtTime(st.doneAt + D3)})에 다시 복습하세요.`);
      };
      card.appendChild(doneBtn);
      wrap.appendChild(card); host.appendChild(wrap);
    }

    /* ----- 단계 완료 화면 ----- */
    function stepDone(n, msg) {
      const st = tpState(day, mode);
      host.innerHTML = "";
      const r = el("div", "card result");
      r.appendChild(el("div", "score", `${n}단계 완료`));
      r.appendChild(el("div", "pct", esc(msg)));
      const btns = el("div", "result-btns");
      if (n < 5 && st.phase < 5) { const nxt = el("button", "btn pri", `${st.phase + 1}단계 계속 ▶`); nxt.onclick = () => runStep(st.phase + 1); btns.appendChild(nxt); }
      if (chk(st, 1).length) { const q = el("button", "btn sec", "체크 단어 퀴즈"); q.onclick = () => tpQuiz(); btns.appendChild(q); }
      const hb = el("button", "btn ghost", "단계 목록"); hb.onclick = hub; btns.appendChild(hb);
      r.appendChild(btns);
      host.appendChild(r);
    }

    /* ----- 체크 단어 퀴즈 ----- */
    function tpQuiz() {
      const st = tpState(day, mode);
      const qs = shuffle(all.filter(it => st.checks[it.id])).map((it, i) => makeQuestion(it, mode, pools, i)).filter(Boolean);
      if (!qs.length) { alert("체크된 단어가 없어요. 먼저 1단계를 진행하세요."); return hub(); }
      let cur = 0, score = 0, wrongs = [];
      function draw() {
        const q = qs[cur];
        questionCard(host, q, {
          head: `체크 단어 퀴즈 · ${cur + 1} / ${qs.length} · 점수 ${score}`, onBack: hub, backLabel: "← 단계 목록",
          progress: cur / qs.length, tag: marks(st, q.it),
          onAnswer: ok => { if (ok) score++; else { wrongs.push(q); st.checks[q.it.id] = Math.min((st.checks[q.it.id] || 1) + 1, 3); saveTp(); } },
          nextLabel: cur < qs.length - 1 ? "다음 ▶" : "결과 보기", onNext: () => { cur++; cur < qs.length ? draw() : finish(); }
        });
      }
      function finish() {
        const pct = Math.round(score / qs.length * 100);
        host.innerHTML = "";
        const r = el("div", "card result");
        r.appendChild(el("div", "score num", `${score}/${qs.length}`));
        r.appendChild(el("div", "pct", `${pct}% · ` + (pct === 100 ? "완벽해요! 🎉" : pct >= 70 ? "잘했어요! 👏" : "틀린 단어는 체크가 올라갔어요. 다시 복습해요 💪")));
        const btns = el("div", "result-btns");
        const again = el("button", "btn pri", "다시 풀기"); again.onclick = () => tpQuiz();
        const hb = el("button", "btn ghost", "단계 목록"); hb.onclick = hub;
        btns.append(again, hb); r.appendChild(btns);
        if (wrongs.length) {
          const rev = el("div", "review");
          rev.appendChild(el("h3", null, `틀린 문제 ${wrongs.length}개 복습`));
          wrongs.forEach(q => rev.appendChild(el("div", "r inset", `<span class="jp">${esc(q.promptBig)}</span> → <b>${esc(q.correct)}</b>`)));
          r.appendChild(rev);
        }
        host.appendChild(r);
      }
      draw();
    }

    hub();
  }

  /* ---------- 퀴즈 ---------- */
  const ALL_READINGS = [];
  DATA.forEach(d => d.cards.forEach(c => c.readings.forEach(r => { if (r.word && (r.furigana || r.reading)) ALL_READINGS.push({ ...r, char: c.char, gloss: c.gloss }); })));

  function pickDistinct(pool, correct, keyFn, n) {
    const key = keyFn(correct);
    const seen = new Set([key]);
    const out = [];
    for (const item of shuffle(pool)) {
      const k = keyFn(item);
      if (!seen.has(k)) { seen.add(k); out.push(item); }
      if (out.length >= n) break;
    }
    return out;
  }

  function buildQuestions(day, count, levels) {
    const d = dayOf(day);
    const cards = d.cards;
    const lvSet = levels && levels.length ? new Set(levels) : null;
    const wordItems = [];
    const seenW = new Set();
    const addWord = (word, reading, meaning) => {
      if (!word || !reading || seenW.has(word)) return;
      seenW.add(word);
      wordItems.push({ word, furigana: reading, reading, meaning });
    };
    cards.forEach(c => c.readings.forEach(r => { if (r.word && (r.furigana || r.reading)) addWord(r.word, fullReading(r), r.meaning); }));
    // 관련 기출 단어(JLPT)도 퀴즈 대상에 포함 (선택한 레벨만)
    cards.forEach(c => (c.related || []).forEach(rw => { if (!lvSet || lvSet.has(rw.l)) addWord(rw.w, rw.r, rw.m); }));
    const qs = [];
    const cardPool = shuffle(cards);
    const wordPool = shuffle(wordItems);
    let ci = 0, wi = 0;
    const localReadPool = wordItems.length >= 4 ? wordItems : ALL_READINGS;
    const glossPool = cards.length >= 4 ? cards : DATA.flatMap(x => x.cards);
    const cardQ = c => {
      const dis = pickDistinct(glossPool, c, x => x.gloss, 3);
      return { type: "뜻·음 고르기", promptBig: c.char, promptSub: "이 한자의 뜻과 음은?", correct: c.gloss, options: shuffle([c.gloss, ...dis.map(x => x.gloss)]), jp: false };
    };
    while (qs.length < count && (ci < cardPool.length || wi < wordPool.length)) {
      const type = qs.length % 3;
      if (type === 0 && ci < cardPool.length) {
        qs.push(cardQ(cardPool[ci++]));
      } else if (type === 1 && wi < wordPool.length) {
        const r = wordPool[wi++];
        const ans = r.furigana || r.reading;
        const dis = pickDistinct(localReadPool, r, x => (x.furigana || x.reading), 3);
        qs.push({ type: "읽기 고르기", promptBig: r.word, promptSub: "이 단어의 읽기는?", correct: ans, options: shuffle([ans, ...dis.map(x => x.furigana || x.reading)]), jp: true });
      } else if (wi < wordPool.length) {
        const r = wordPool[wi++];
        const dis = pickDistinct(localReadPool, r, x => x.word, 3);
        qs.push({ type: "단어 고르기", promptBig: (r.furigana || r.reading), promptSub: r.meaning ? "뜻: " + r.meaning : "이 읽기의 단어는?", promptJpSmall: true, correct: r.word, options: shuffle([r.word, ...dis.map(x => x.word)]), jp: true });
      } else if (ci < cardPool.length) {
        qs.push(cardQ(cardPool[ci++]));
      } else break;
    }
    return qs;
  }

  function renderQuiz(day, host, levels) {
    let count = 10, questions = [], cur = 0, score = 0, wrongs = [];
    const maxAvail = buildQuestions(day, 9999, levels).length;

    function setup() {
      host.innerHTML = "";
      const card = el("div", "card");
      card.appendChild(el("h2", null, "퀴즈 설정"));
      card.appendChild(el("p", "cap", `한자 뜻·음, 단어 읽기, 읽기→단어 문제가 번갈아 출제됩니다. 선택한 레벨 기준 최대 ${maxAvail}문제까지 낼 수 있어요.`));
      card.appendChild(el("div", "setup-q", "몇 문제를 풀까요?"));
      const opts = [10, 20, 30, 50].filter(n => n < maxAvail);
      opts.push(maxAvail);
      const pick = el("div", "count-pick");
      opts.forEach(n => {
        const b = el("button", "btn sec", n === maxAvail ? `전체 <span class="num">(${maxAvail})</span>` : `<span class="num">${n}</span>문제`);
        b.onclick = () => { count = n; start(); };
        pick.appendChild(b);
      });
      card.appendChild(pick);
      if (quizBest[day] != null) card.appendChild(el("p", "cap", `이 일차 최고점 ${quizBest[day]}%`));
      host.appendChild(card);
    }
    function start() { questions = buildQuestions(day, count, levels); cur = 0; score = 0; wrongs = []; draw(); }
    function draw() {
      const q = questions[cur];
      questionCard(host, q, {
        head: `${cur + 1} / ${questions.length} · 점수 ${score}`, onBack: setup, backLabel: "← 퀴즈 설정",
        progress: cur / questions.length,
        onAnswer: ok => { if (ok) score++; else wrongs.push(q); },
        nextLabel: cur < questions.length - 1 ? "다음 ▶" : "결과 보기", onNext: () => { cur++; cur < questions.length ? draw() : finish(); }
      });
    }
    function finish() {
      const pct = Math.round(score / questions.length * 100);
      quizBest[day] = Math.max(quizBest[day] || 0, pct);
      LS.set("hz_quiz_best", quizBest);
      refreshSidebar();
      host.innerHTML = "";
      const r = el("div", "card result");
      r.appendChild(el("div", "score num", `${score}/${questions.length}`));
      const msg = pct === 100 ? "완벽해요! 🎉" : pct >= 70 ? "잘했어요! 👏" : "다시 복습해봐요 💪";
      r.appendChild(el("div", "pct", `${pct}% · ${msg}` + (quizBest[day] ? ` · 최고점 ${quizBest[day]}%` : "")));
      const btns = el("div", "result-btns");
      const again = el("button", "btn pri", "다시 풀기"); again.onclick = start;
      const change = el("button", "btn sec", "문제 수 변경"); change.onclick = setup;
      const home = el("button", "btn ghost", "개요"); home.onclick = () => go("home");
      btns.append(again, change, home);
      r.appendChild(btns);
      if (wrongs.length) {
        const rev = el("div", "review");
        rev.appendChild(el("h3", null, `틀린 문제 ${wrongs.length}개 복습`));
        wrongs.forEach(q => rev.appendChild(el("div", "r inset", `<span class="jp">${esc(q.promptBig)}</span> → <b>${esc(q.correct)}</b> <span class="small-note">(${esc(q.promptSub)})</span>`)));
        r.appendChild(rev);
      }
      host.appendChild(r);
    }
    setup();
  }

  /* ---------- init ---------- */
  if (!DATA.length) { app.innerHTML = "<p>데이터를 불러오지 못했습니다.</p>"; return; }
  const brand = document.getElementById("brand");
  brand.onclick = () => go("home");
  brand.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go("home"); } };
  const impFile = document.getElementById("impFile");
  document.getElementById("expBtn").onclick = exportProgress;
  document.getElementById("impBtn").onclick = () => impFile.click();
  document.getElementById("resetBtn").onclick = resetProgress;
  impFile.onchange = () => { if (impFile.files[0]) importProgress(impFile.files[0]); impFile.value = ""; };
  renderSidebar();
  go("home");
})();
