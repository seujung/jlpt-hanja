/* JLPT 상용한자 2136 학습 앱 */
(function () {
  "use strict";
  const DATA = (window.HANJA_DATA || []).slice().sort((a, b) => a.day - b.day);
  const app = document.getElementById("app");
  const crumbs = document.getElementById("crumbs");
  const voiceSelect = document.getElementById("voiceSelect");
  document.getElementById("homeBtn").onclick = () => go("home");

  /* ---------- storage ---------- */
  const LS = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };
  const studyProg = LS.get("hz_prog_study", {});   // day -> studied count
  const quizBest = LS.get("hz_quiz_best", {});      // day -> best %

  /* ---------- progress backup / restore ---------- */
  function exportProgress() {
    const payload = {
      app: "jlpt-hanja", version: 2, exportedAt: new Date().toISOString(),
      study: studyProg, quiz: quizBest, toripa: LS.get("hz_toripa", {}), voice: LS.get("hz_voice_name", null)
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
        if (p.app !== "jlpt-hanja" || !p.study) throw new Error("형식이 올바르지 않습니다.");
        // 병합: 더 높은 진도/점수를 유지
        Object.entries(p.study || {}).forEach(([d, v]) => { studyProg[d] = Math.max(studyProg[d] || 0, v); });
        Object.entries(p.quiz || {}).forEach(([d, v]) => { quizBest[d] = Math.max(quizBest[d] || 0, v); });
        LS.set("hz_prog_study", studyProg); LS.set("hz_quiz_best", quizBest);
        if (p.toripa) {
          Object.entries(p.toripa).forEach(([k, v]) => { if (!toripa[k] || (v.phase || 0) >= (toripa[k].phase || 0)) toripa[k] = v; });
          LS.set("hz_toripa", toripa);
        }
        if (p.voice) LS.set("hz_voice_name", p.voice);
        alert("진도를 불러왔습니다. 기존 진도와 더 높은 값으로 병합했습니다.");
        renderHome();
      } catch (e) { alert("불러오기 실패: " + e.message); }
    };
    reader.readAsText(file);
  }
  function resetProgress() {
    if (!confirm("학습 진도와 퀴즈 점수를 모두 초기화할까요?\n(되돌릴 수 없습니다. 필요하면 먼저 '진도 내보내기'로 백업하세요.)")) return;
    Object.keys(studyProg).forEach(k => delete studyProg[k]);
    Object.keys(quizBest).forEach(k => delete quizBest[k]);
    Object.keys(toripa).forEach(k => delete toripa[k]);
    LS.set("hz_prog_study", studyProg); LS.set("hz_quiz_best", quizBest); LS.set("hz_toripa", toripa);
    renderHome();
  }

  /* ---------- TTS ---------- */
  let voices = [], chosenVoice = null;
  // 알려진 일본어 여성/남성 음성 이름 (플랫폼별)
  const FEMALE_RE = /kyoko|haruka|nanami|ayumi|sayaka|o-?ren|mizuki|tomoko|google\s*日本語|siri.*(female|1|2)|female|女性/i;
  const MALE_RE = /otoya|ichiro|hattori|takeshi|male|男性/i;
  function isFemale(v) { return FEMALE_RE.test(v.name); }
  function loadVoices() {
    voices = speechSynthesis.getVoices().filter(v => /ja(-|_)?JP|Japanese|日本/i.test(v.lang + v.name));
    if (!voices.length) voices = speechSynthesis.getVoices(); // fallback
    // 여성 음성을 앞으로 정렬 (남성은 뒤로)
    voices.sort((a, b) => (isFemale(b) - isFemale(a)) || (MALE_RE.test(a.name) - MALE_RE.test(b.name)));
    voiceSelect.innerHTML = "";
    voices.forEach((v, i) => {
      const o = document.createElement("option");
      const tag = isFemale(v) ? " ・여성" : MALE_RE.test(v.name) ? " ・남성" : (/ja/i.test(v.lang) ? " ・日本語" : "");
      o.value = i; o.textContent = v.name.replace(/\s*\(.*?\)/, "") + tag;
      voiceSelect.appendChild(o);
    });
    // 저장된 선택이 없으면 여성 음성을 기본값으로
    const savedName = LS.get("hz_voice_name", null);
    let idx = savedName ? voices.findIndex(v => v.name === savedName) : -1;
    if (idx < 0) idx = voices.findIndex(isFemale);
    if (idx < 0) idx = 0;
    voiceSelect.value = idx;
    chosenVoice = voices[idx] || null;
  }
  voiceSelect.onchange = () => { chosenVoice = voices[voiceSelect.value]; LS.set("hz_voice_name", chosenVoice ? chosenVoice.name : null); };
  if ("speechSynthesis" in window) {
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  } else {
    voiceSelect.parentElement.style.display = "none";
  }
  function speak(text) {
    if (!("speechSynthesis" in window) || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP"; u.rate = 0.9;
    if (chosenVoice) u.voice = chosenVoice;
    speechSynthesis.speak(u);
  }

  /* ---------- helpers ---------- */
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; };
  const esc = s => (s || "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  // 단어 전체 히라가나: furigana(한자부분 읽기) + 단어 끝 오쿠리가나
  function fullReading(r) {
    let fu = (r.furigana || "").trim();
    const rd = (r.reading || "").replace(/[()（）]/g, "").trim();
    if (!fu) fu = rd;
    const w = r.word || "";
    const m = w.match(/[ぁ-ゟ]+$/); // 단어 끝 히라가나(오쿠리가나)
    if (m) { const oku = m[0]; if (fu && !fu.endsWith(oku)) fu += oku; }
    return fu || rd || w;
  }
  const speakText = r => fullReading(r); // best pronunciation source

  /* ---------- router ---------- */
  function go(view, arg) {
    window.scrollTo(0, 0);
    speechSynthesis && speechSynthesis.cancel();
    if (view === "home") renderHome();
    else if (view === "study") renderStudy(arg);
    else if (view === "quiz") renderQuiz(arg);
    else if (view === "toripa") renderToripa(arg);
    setCrumbs(view, arg);
  }
  function setCrumbs(view, arg) {
    if (view === "home") { crumbs.innerHTML = ""; return; }
    const d = DATA.find(x => x.day === arg);
    const label = view === "study" ? "카드 학습" : view === "toripa" ? "토리파 암기" : "퀴즈";
    crumbs.innerHTML = `· <b>${String(arg).padStart(2, "0")}일차</b> ${esc(d.category)} · ${label}`;
  }

  /* ---------- HOME ---------- */
  function renderHome() {
    app.innerHTML = "";
    app.appendChild(el("h1", null, "일차별 상용한자 암기장"));
    const total = DATA.reduce((s, d) => s + d.cards.length, 0);
    app.appendChild(el("p", "sub", `총 ${DATA.length}일차 · 한자 ${total}자 · 카드를 뒤집어 익히고, 발음을 듣고, 퀴즈로 복습하세요.`));

    // 진도 백업/복원 도구
    const bar = el("div", "prog-tools");
    const info = el("span", "prog-info");
    const doneDays = Object.keys(studyProg).length;
    info.textContent = `학습한 일차 ${doneDays}개 · 진도는 이 브라우저에 저장됩니다`;
    const expBtn = el("button", "btn ghost", "⬇ 진도 내보내기");
    const impBtn = el("button", "btn ghost", "⬆ 진도 불러오기");
    const resetBtn = el("button", "btn ghost danger", "🗑 진도 초기화");
    const fileIn = el("input"); fileIn.type = "file"; fileIn.accept = "application/json,.json"; fileIn.style.display = "none";
    expBtn.onclick = exportProgress;
    impBtn.onclick = () => fileIn.click();
    resetBtn.onclick = resetProgress;
    fileIn.onchange = () => { if (fileIn.files[0]) importProgress(fileIn.files[0]); };
    bar.append(info, expBtn, impBtn, resetBtn, fileIn);
    app.appendChild(bar);

    const mandInfo = [
      [1, 6, "첫째 마당 · 초급 (JLPT N5·N4)"],
      [7, 18, "둘째 마당 · 중급 (JLPT N3·N2)"],
      [19, 30, "셋째 마당 · 고급 (JLPT N1)"]
    ];
    mandInfo.forEach(([a, b, title]) => {
      app.appendChild(el("div", "mand", title));
      const grid = el("div", "grid");
      DATA.filter(d => d.day >= a && d.day <= b).forEach(d => grid.appendChild(dayCard(d)));
      app.appendChild(grid);
    });
  }
  function dayCard(d) {
    const c = el("div", "daycard");
    const studied = studyProg[d.day] || 0;
    const pct = Math.round(studied / d.cards.length * 100);
    const best = quizBest[d.day];
    c.appendChild(el("div", "no", String(d.day).padStart(2, "0") + "일차"));
    c.appendChild(el("div", "cat", esc(d.category)));
    c.appendChild(el("div", "meta", `한자 ${d.cards.length}자 · 학습 ${pct}%` + (best != null ? ` · 최고점 ${best}%` : "")));
    const bar = el("div", "bar"); bar.appendChild(el("i")).style.width = pct + "%"; c.appendChild(bar);
    const btns = el("div", "btns");
    const b1 = el("button", "btn pri", "카드 학습"); b1.onclick = () => go("study", d.day);
    const b3 = el("button", "btn sec toripa", "토리파"); b3.onclick = () => go("toripa", d.day);
    const b2 = el("button", "btn sec", "퀴즈"); b2.onclick = () => go("quiz", d.day);
    btns.append(b1, b3, b2); c.appendChild(btns);
    return c;
  }

  /* ---------- STUDY (flashcards) ---------- */
  function renderStudy(day) {
    const d = DATA.find(x => x.day === day);
    // 이전 학습 기록이 있으면 마지막 본 카드에서 이어서 시작
    const resumeIdx = Math.min(Math.max((studyProg[day] || 1) - 1, 0), d.cards.length - 1);
    let order = d.cards.map((_, i) => i), idx = resumeIdx, shuffled = false, flipped = false;

    app.innerHTML = "";
    const top = el("div", "study-top");
    const back = el("button", "btn ghost", "← 목록"); back.onclick = () => go("home");
    const prog = el("div", "prog");
    const shufBtn = el("button", "btn ghost", "🔀 섞기");
    const quizBtn = el("button", "btn sec", "이 일차 퀴즈"); quizBtn.style.flex = "0"; quizBtn.onclick = () => go("quiz", day);
    shufBtn.onclick = () => { shuffled = !shuffled; order = shuffled ? shuffle(d.cards.map((_, i) => i)) : d.cards.map((_, i) => i); idx = 0; flipped = false; shufBtn.classList.toggle("on", shuffled); draw(); };
    top.append(back, prog, shufBtn, quizBtn);
    app.appendChild(top);

    const wrap = el("div", "flashwrap");
    const card = el("div", "card");
    const inner = el("div", "card-inner");
    card.appendChild(inner);
    card.onclick = () => { flipped = !flipped; card.classList.toggle("flipped", flipped); };
    wrap.appendChild(card);

    const nav = el("div", "navbtns");
    const prev = el("button", "btn sec", "◀ 이전");
    const flip = el("button", "btn pri", "뒤집기");
    const next = el("button", "btn sec", "다음 ▶");
    prev.onclick = e => { e.stopPropagation(); if (idx > 0) { idx--; flipped = false; draw(); } };
    next.onclick = e => { e.stopPropagation(); if (idx < order.length - 1) { idx++; flipped = false; draw(); } };
    flip.onclick = e => { e.stopPropagation(); flipped = !flipped; card.classList.toggle("flipped", flipped); };
    nav.append(prev, flip, next);
    wrap.appendChild(nav);
    app.appendChild(wrap);

    function draw() {
      const c = d.cards[order[idx]];
      card.classList.toggle("flipped", flipped);
      prog.textContent = `${idx + 1} / ${order.length}`;
      // save progress (furthest reached)
      studyProg[day] = Math.max(studyProg[day] || 0, idx + 1);
      LS.set("hz_prog_study", studyProg);

      // 음독/훈독 읽기 모음
      const kun = c.readings.filter(r => r.type === "훈독" && r.reading).map(r => r.reading);
      const on = c.readings.filter(r => r.type === "음독" && r.reading).map(r => r.reading);
      const yomiParts = [];
      if (kun.length) yomiParts.push(`훈독 ${kun.join(", ")}`);
      if (on.length) yomiParts.push(`음독 ${on.join(", ")}`);

      const front = el("div", "face front");
      front.appendChild(el("div", "char jp", esc(c.char)));
      front.appendChild(el("div", "gloss", esc(c.gloss)));
      if (yomiParts.length)
        front.appendChild(el("div", "front-yomi jp", "(" + esc(yomiParts.join(" · ")) + ")"));
      front.appendChild(el("div", "hint", "카드를 누르면 예시 단어가 나와요"));

      const backF = el("div", "face back");
      const h = el("div"); h.style.display = "flex"; h.style.alignItems = "center"; h.style.flexWrap = "wrap";
      h.innerHTML = `<span class="bchar jp">${esc(c.char)}</span><span class="bgloss">${esc(c.gloss)}</span>` +
        (c.jlpt ? `<span class="lvl-badge ${c.jlpt}">${c.jlpt}</span>` : "");
      backF.appendChild(h);
      // 음독/훈독 요약
      const summary = el("div", "yomi-summary");
      summary.innerHTML =
        `<span class="yomi kun"><b>훈독</b> <span class="jp">${kun.length ? esc(kun.join(", ")) : "—"}</span></span>` +
        `<span class="yomi on"><b>음독</b> <span class="jp">${on.length ? esc(on.join(", ")) : "—"}</span></span>`;
      backF.appendChild(summary);
      c.readings.forEach(r => {
        const row = el("div", "reading-row");
        const txt = el("div", "txtcol");
        const rd = el("div", "rd-line");
        rd.innerHTML = `<span class="yomi-tag ${r.type === "훈독" ? "kun" : "on"}">${r.type}</span>` +
          (r.reading ? `<span class="rd jp">${esc(r.reading)}</span>` : "");
        txt.appendChild(rd);
        const wline = el("div"); wline.className = "jp";
        wline.innerHTML = `<span class="wd jp">${esc(r.word || "")}</span> <span class="fu">${esc(fullReading(r))}</span>`;
        txt.appendChild(wline);
        if (r.meaning) txt.appendChild(el("div", "mn", esc(r.meaning)));
        const sp = el("button", "spk", "🔊");
        sp.title = "발음 듣기";
        sp.onclick = ev => { ev.stopPropagation(); speak(speakText(r)); };
        row.append(txt, sp);
        backF.appendChild(row);
      });
      // 관련 기출 단어 (JLPT)
      if (c.related && c.related.length) {
        backF.appendChild(el("div", "rel-title", "관련 기출 단어 (JLPT)"));
        c.related.forEach(rw => {
          const row = el("div", "rel-row");
          const txt = el("div", "txtcol");
          const top = el("div", "jp");
          top.innerHTML = `<span class="lvl-badge sm ${rw.l}">${rw.l}</span>` +
            `<span class="rel-w jp">${esc(rw.w)}</span> <span class="fu">${esc(rw.r)}</span>`;
          txt.appendChild(top);
          if (rw.m) txt.appendChild(el("div", "mn", esc(rw.m)));
          const sp = el("button", "spk", "🔊");
          sp.title = "발음 듣기";
          sp.onclick = ev => { ev.stopPropagation(); speak(rw.r || rw.w); };
          row.append(txt, sp);
          backF.appendChild(row);
        });
      }
      inner.innerHTML = "";
      inner.append(front, backF);
    }
    draw();
  }

  /* ---------- TORIPA (토리파 암기법) ---------- */
  const toripa = LS.get("hz_toripa", {});
  const saveTp = () => LS.set("hz_toripa", toripa);
  const H6 = 6 * 3600e3, D3 = 3 * 24 * 3600e3;
  function tpState(day, mode) {
    const k = day + ":" + mode;
    if (!toripa[k]) toripa[k] = { checks: {}, phase: 0, doneAt: null, rev6At: null, rev3At: null };
    return toripa[k];
  }
  function tpItems(day, mode) {
    const d = DATA.find(x => x.day === day);
    if (mode === "hanja") return d.cards.map(c => {
      const kun = c.readings.filter(r => r.type === "훈독" && r.reading).map(r => r.reading);
      const on = c.readings.filter(r => r.type === "음독" && r.reading).map(r => r.reading);
      const rw = c.readings.find(r => r.word);
      return {
        id: c.id, front: c.char, meaning: c.gloss,
        reading: [kun.length ? "훈독 " + kun.join(", ") : "", on.length ? "음독 " + on.join(", ") : ""].filter(Boolean).join(" · "),
        ex: rw ? `${rw.word} ${fullReading(rw)}` + (rw.meaning ? ` · ${rw.meaning}` : "") : "",
        speak: rw ? fullReading(rw) : c.char
      };
    });
    const items = [], seen = new Set();
    d.cards.forEach(c => {
      c.readings.forEach(r => {
        if (r.word && !seen.has(r.word)) { seen.add(r.word); items.push({ id: "w:" + r.word, front: r.word, meaning: r.meaning || "", reading: fullReading(r), ex: "", speak: fullReading(r) }); }
      });
      (c.related || []).forEach(rw => {
        if (rw.w && !seen.has(rw.w)) { seen.add(rw.w); items.push({ id: "w:" + rw.w, front: rw.w, meaning: rw.m || "", reading: rw.r || "", ex: "", speak: rw.r || rw.w, lvl: rw.l }); }
      });
    });
    return items;
  }
  const fmtTime = t => {
    const dt = new Date(t), today = new Date();
    const hm = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
    return dt.toDateString() === today.toDateString() ? `오늘 ${hm}` : `${dt.getMonth() + 1}/${dt.getDate()} ${hm}`;
  };

  const TP_STEPS = [
    { t: "쭉 보면서 모르는 것 체크", d: "아는 것 / 모르는 것을 빠르게 나눠요." },
    { t: "체크한 것 입으로 4~5번 암기", d: "발음을 듣고 소리 내어 따라 읽어요." },
    { t: "뜻 가리고 확인 — 모르면 더블체크", d: "뜻을 떠올려 본 뒤 확인해요." },
    { t: "더블체크 뜻 가리고 적기 (1회독)", d: "종이에 직접 적고 스스로 채점해요." },
    { t: "노트에 적고 뜻 말해보기", d: "더블·쓰리체크를 노트에 정리하고 뜻을 말해봐요." },
    { t: "잠자기 전 · 6시간 후 복습", d: "다시 보고 뜻을 적으면 장기기억으로!" },
    { t: "3일 뒤 최종 복습", d: "마지막으로 한 번 더 확인해요." }
  ];

  function renderToripa(day) {
    const d = DATA.find(x => x.day === day);
    let mode = LS.get("hz_toripa_mode", "hanja");

    const chk = (st, n) => tpItems(day, mode).filter(it => (st.checks[it.id] || 0) >= n);

    /* ----- 허브: 단계 목록 ----- */
    function hub() {
      const st = tpState(day, mode);
      app.innerHTML = "";
      const wrap = el("div", "quizwrap");
      const head = el("div", "qhead");
      const back = el("button", "btn ghost", "← 목록"); back.onclick = () => go("home");
      head.append(back, el("span", null, `${String(day).padStart(2, "0")}일차 · ${esc(d.category)} · 토리파 암기법`));
      wrap.appendChild(head);

      // 모드 탭
      const tabs = el("div", "tp-tabs");
      [["hanja", "한자"], ["word", "예시·기출 단어"]].forEach(([m, label]) => {
        const b = el("button", "tp-tab" + (mode === m ? " on" : ""), label);
        b.onclick = () => { mode = m; LS.set("hz_toripa_mode", m); hub(); };
        tabs.appendChild(b);
      });
      wrap.appendChild(tabs);

      const items = tpItems(day, mode);
      const c1 = chk(st, 1).length, c2 = chk(st, 2).length, c3 = chk(st, 3).length;
      const sum = el("div", "tp-sum");
      sum.innerHTML = `전체 <b>${items.length}</b>개 · <span class="tag c1">✔ 체크 ${c1}</span> <span class="tag c2">✔✔ 더블 ${c2}</span> <span class="tag c3">✔✔✔ 쓰리 ${c3}</span>`;
      wrap.appendChild(sum);

      const now = Date.now();
      const list = el("div", "tp-steps");
      TP_STEPS.forEach((s, i) => {
        const n = i + 1;
        const row = el("div", "tp-step");
        let status, btn = null;
        if (n <= 5) {
          if (st.phase >= n) { status = "done"; }
          else if (st.phase === n - 1) { status = "now"; }
          else status = "lock";
          if (status !== "lock") {
            btn = el("button", "btn " + (status === "now" ? "pri" : "ghost"), status === "done" ? "다시 하기" : "시작");
            btn.style.flex = "0";
            btn.onclick = () => runStep(n);
          }
        } else {
          const at = n === 6 ? (st.doneAt ? st.doneAt + H6 : null) : (st.doneAt ? st.doneAt + D3 : null);
          const doneAt = n === 6 ? st.rev6At : st.rev3At;
          if (doneAt) status = "done";
          else if (st.phase >= 5 && at && now >= at) {
            status = "now";
            btn = el("button", "btn pri", "복습 시작"); btn.style.flex = "0";
            btn.onclick = () => runStep(n);
          } else {
            status = "lock";
            row.dataset.hint = st.phase >= 5 && at ? `${fmtTime(at)}부터 가능` : "1~5단계를 먼저 끝내세요";
          }
          if (doneAt) {
            btn = el("button", "btn ghost", "다시 하기"); btn.style.flex = "0";
            btn.onclick = () => runStep(n);
          }
        }
        const ic = status === "done" ? "✅" : status === "now" ? "▶️" : "🔒";
        const txt = el("div", "tp-step-txt");
        txt.innerHTML = `<div class="t">${ic} <b>${n}단계</b> ${esc(s.t)}</div><div class="d">${esc(s.d)}${row.dataset.hint ? ` · <em>${esc(row.dataset.hint)}</em>` : ""}</div>`;
        row.appendChild(txt);
        if (btn) row.appendChild(btn);
        list.appendChild(row);
      });
      wrap.appendChild(list);

      // 하단 도구
      const foot = el("div", "tp-foot");
      const quizBtn = el("button", "btn sec", `체크 단어 퀴즈 (${c1})`);
      quizBtn.disabled = !c1;
      quizBtn.onclick = () => tpQuiz();
      const resetBtn = el("button", "btn ghost danger", "이 일차 토리파 초기화");
      resetBtn.onclick = () => {
        if (!confirm("이 일차의 체크와 진행 상태를 초기화할까요?")) return;
        toripa[day + ":" + mode] = { checks: {}, phase: 0, doneAt: null, rev6At: null, rev3At: null };
        saveTp(); hub();
      };
      foot.append(quizBtn, resetBtn);
      wrap.appendChild(foot);
      app.appendChild(wrap);
    }

    /* ----- 공용 카드 러너 ----- */
    // cfg: {title, guide, items, hideBack, judge:{yes,no,onNo}, plainNext, onDone}
    function cardRunner(n, cfg) {
      const st = tpState(day, mode);
      let i = 0, revealed = !cfg.hideBack, spoke = 0;
      function draw() {
        app.innerHTML = "";
        const wrap = el("div", "quizwrap");
        const head = el("div", "qhead");
        const back = el("button", "btn ghost", "← 단계 목록"); back.onclick = () => hub();
        head.append(back, el("span", null, `${n}단계 · ${i + 1} / ${cfg.items.length}`));
        wrap.appendChild(head);
        const bar = el("div", "qbar"); bar.appendChild(el("i")).style.width = (i / cfg.items.length * 100) + "%";
        wrap.appendChild(bar);

        const it = cfg.items[i];
        const qc = el("div", "qcard");
        qc.appendChild(el("div", "qtype", cfg.title));
        qc.appendChild(el("div", "qsub", cfg.guide));
        const prompt = el("div", "qprompt");
        prompt.appendChild(el("span", "big jp", esc(it.front)));
        const spk = el("button", "spk big-spk", "🔊");
        spk.onclick = () => { speak(it.speak); spoke++; if (cfg.countSpeak) cnt.textContent = `듣고 따라 말하기 ${spoke}회 / 4~5회`; };
        prompt.appendChild(spk);
        qc.appendChild(prompt);
        let cnt = null;
        if (cfg.countSpeak) { cnt = el("div", "tp-cnt", `듣고 따라 말하기 ${spoke}회 / 4~5회`); qc.appendChild(cnt); }

        const backBox = el("div", "tp-back" + (revealed ? "" : " hidden"));
        backBox.innerHTML =
          (it.meaning ? `<div class="mn-big">${esc(it.meaning)}</div>` : "") +
          (it.reading ? `<div class="rd jp">${esc(it.reading)}</div>` : "") +
          (it.ex ? `<div class="ex jp">${esc(it.ex)}</div>` : "");
        qc.appendChild(backBox);

        const btns = el("div", "tp-judge");
        if (!revealed) {
          const rv = el("button", "btn pri", "뜻 보기");
          rv.onclick = () => { revealed = true; draw(); };
          btns.appendChild(rv);
        } else if (cfg.judge) {
          const yes = el("button", "btn ok", cfg.judge.yes);
          const no = el("button", "btn bad", cfg.judge.no);
          yes.onclick = () => next(true);
          no.onclick = () => { cfg.judge.onNo(it, st); saveTp(); next(false); };
          btns.append(yes, no);
        } else {
          const nx = el("button", "btn pri", i < cfg.items.length - 1 ? "다음 ▶" : "완료");
          nx.onclick = () => next(true);
          btns.appendChild(nx);
        }
        qc.appendChild(btns);
        wrap.appendChild(qc);
        app.appendChild(wrap);
        if (cfg.autoSpeak && !cfg.countSpeak) speak(it.speak);
      }
      function next() {
        i++; revealed = !cfg.hideBack; spoke = 0;
        if (i < cfg.items.length) draw();
        else { cfg.onDone(); }
      }
      draw();
    }

    /* ----- 단계별 실행 ----- */
    function runStep(n) {
      const st = tpState(day, mode);
      const all = tpItems(day, mode);
      const done = msg => { saveTp(); stepDone(n, msg); };

      if (n === 1) {
        // 다시 하기 시 체크 초기화 여부
        if (st.phase >= 1 && Object.keys(st.checks).length && !confirm("1단계를 다시 하면 기존 체크가 초기화됩니다. 계속할까요?")) return;
        st.checks = {}; st.phase = 0; st.doneAt = null; st.rev6At = null; st.rev3At = null; saveTp();
        cardRunner(1, {
          title: "1단계 · 모르는 것 체크", guide: "뜻을 보고, 이미 아는 것인지 판단하세요.",
          items: all, hideBack: false,
          judge: { yes: "😃 알아요", no: "🤔 몰라요 (✔ 체크)", onNo: (it, st) => { st.checks[it.id] = 1; } },
          onDone: () => {
            st.phase = 1;
            if (!chk(st, 1).length) { st.phase = 5; st.doneAt = Date.now(); done("모르는 것이 없어요! 🎉 1~5단계를 건너뛰고 복습 일정만 잡았어요."); }
            else done(`체크 ${chk(st, 1).length}개! 이제 입으로 소리 내어 외울 차례예요.`);
          }
        });
      } else if (n === 2) {
        cardRunner(2, {
          title: "2단계 · 입으로 4~5번 암기", guide: "🔊를 누르고 4~5번 소리 내어 따라 읽으세요.",
          items: chk(st, 1), hideBack: false, countSpeak: true,
          onDone: () => { st.phase = Math.max(st.phase, 2); done("이제 뜻을 가리고 스스로 확인해봐요."); }
        });
      } else if (n === 3) {
        cardRunner(3, {
          title: "3단계 · 뜻 가리고 확인", guide: "뜻을 먼저 떠올린 다음 '뜻 보기'를 누르세요.",
          items: chk(st, 1), hideBack: true,
          judge: { yes: "맞았다 ✓", no: "몰랐다 (✔✔ 더블체크)", onNo: (it, st) => { st.checks[it.id] = Math.max(st.checks[it.id] || 0, 2); } },
          onDone: () => {
            st.phase = Math.max(st.phase, 3);
            const c2 = chk(st, 2).length;
            if (!c2) { st.phase = 5; st.doneAt = Date.now(); done("더블체크가 없어요! 4·5단계는 건너뛰고 복습 일정을 잡았어요. 🎉"); }
            else done(`더블체크 ${c2}개. 이제 종이에 적어볼 차례예요.`);
          }
        });
      } else if (n === 4) {
        cardRunner(4, {
          title: "4단계 · 뜻 가리고 적기 (1회독)", guide: "종이에 뜻을 직접 적은 뒤 '뜻 보기'로 채점하세요.",
          items: chk(st, 2), hideBack: true,
          judge: { yes: "맞게 적었다 ✓", no: "틀렸다 (✔✔✔ 쓰리체크)", onNo: (it, st) => { st.checks[it.id] = 3; } },
          onDone: () => { st.phase = Math.max(st.phase, 4); done("1회독 완료! 이제 노트에 정리해요."); }
        });
      } else if (n === 5) {
        noteStep(st);
      } else if (n === 6 || n === 7) {
        let items = chk(st, 2); if (!items.length) items = chk(st, 1); if (!items.length) items = all;
        cardRunner(n, {
          title: n === 6 ? "6단계 · 6시간 후 복습" : "7단계 · 3일 뒤 최종 복습", guide: "뜻을 종이에 적어본 뒤 '뜻 보기'로 채점하세요.",
          items: shuffle(items), hideBack: true,
          judge: { yes: "기억났다 ✓", no: "잊어버렸다 ✗", onNo: (it, st) => { st.checks[it.id] = Math.min((st.checks[it.id] || 1) + 1, 3); } },
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
      app.innerHTML = "";
      const wrap = el("div", "quizwrap");
      const head = el("div", "qhead");
      const back = el("button", "btn ghost", "← 단계 목록"); back.onclick = () => hub();
      head.append(back, el("span", null, `5단계 · 노트 정리 (${items.length}개)`));
      wrap.appendChild(head);
      const qc = el("div", "qcard");
      qc.appendChild(el("div", "qtype", "5단계 · 노트에 적고 뜻 말해보기"));
      qc.appendChild(el("div", "qsub", "더블·쓰리체크 단어를 노트에 옮겨 적고, 한 줄씩 뜻을 말해본 뒤 '뜻'을 눌러 확인하세요."));
      const listEl = el("div", "tp-note");
      items.forEach(it => {
        const row = el("div", "tp-note-row");
        const marks = "✔".repeat(st.checks[it.id] || 0);
        const left = el("div", "l");
        left.innerHTML = `<span class="chk-mark">${marks}</span><span class="w jp">${esc(it.front)}</span>` + (it.reading ? ` <span class="fu jp">${esc(it.reading)}</span>` : "");
        const mn = el("button", "btn ghost sm", "뜻");
        const mnBox = el("span", "mn-hide", esc(it.meaning || "—"));
        mn.onclick = () => { mnBox.classList.toggle("show"); };
        const sp = el("button", "spk", "🔊"); sp.onclick = () => speak(it.speak);
        row.append(left, mnBox, mn, sp);
        listEl.appendChild(row);
      });
      qc.appendChild(listEl);
      const doneBtn = el("button", "btn pri", "5단계 완료 — 복습 일정 시작");
      doneBtn.style.marginTop = "14px";
      doneBtn.onclick = () => {
        st.phase = 5; st.doneAt = st.doneAt || Date.now(); saveTp();
        stepDone(5, `노트 정리 완료! 6시간 후(${fmtTime(st.doneAt + H6)})와 3일 뒤(${fmtTime(st.doneAt + D3)})에 다시 복습하세요.`);
      };
      qc.appendChild(doneBtn);
      wrap.appendChild(qc);
      app.appendChild(wrap);
    }

    /* ----- 단계 완료 화면 ----- */
    function stepDone(n, msg) {
      const st = tpState(day, mode);
      app.innerHTML = "";
      const wrap = el("div", "quizwrap");
      const r = el("div", "result");
      r.appendChild(el("div", "score", `${n}단계 완료`));
      r.appendChild(el("div", "pct", msg));
      const btns = el("div"); btns.style.cssText = "display:flex;gap:10px;justify-content:center;flex-wrap:wrap";
      const nxt = n < 5 && st.phase < 5 ? el("button", "btn pri", `${st.phase + 1}단계 계속 ▶`) : null;
      if (nxt) { nxt.style.flex = "0"; nxt.onclick = () => runStep(st.phase + 1); btns.appendChild(nxt); }
      if (chk(st, 1).length) {
        const q = el("button", "btn sec", "체크 단어 퀴즈"); q.style.flex = "0"; q.onclick = () => tpQuiz(); btns.appendChild(q);
      }
      const hb = el("button", "btn ghost", "단계 목록"); hb.onclick = () => hub(); btns.appendChild(hb);
      r.appendChild(btns);
      wrap.appendChild(r);
      app.appendChild(wrap);
    }

    /* ----- 체크 단어 퀴즈 ----- */
    function tpQuiz() {
      const st = tpState(day, mode);
      const pool = tpItems(day, mode);
      const items = pool.filter(it => st.checks[it.id]);
      const qs = [];
      shuffle(items).forEach((it, i) => {
        if (mode === "word" && i % 2 === 1 && it.reading) {
          const dis = pickDistinct(pool.filter(x => x.reading), it, x => x.reading, 3);
          qs.push({ it, type: "읽기 고르기", promptBig: it.front, promptSub: "이 단어의 읽기는?", correct: it.reading, options: shuffle([it.reading, ...dis.map(x => x.reading)]), jp: true, speakAns: it.speak });
        } else if (it.meaning) {
          const dis = pickDistinct(pool.filter(x => x.meaning), it, x => x.meaning, 3);
          qs.push({ it, type: "뜻 고르기", promptBig: it.front, promptSub: mode === "hanja" ? "이 한자의 뜻과 음은?" : "이 단어의 뜻은?", correct: it.meaning, options: shuffle([it.meaning, ...dis.map(x => x.meaning)]), jp: false, speakAns: it.speak });
        }
      });
      if (!qs.length) { alert("체크된 단어가 없어요. 먼저 1단계를 진행하세요."); return hub(); }
      let cur = 0, score = 0, wrongs = [];
      function draw() {
        app.innerHTML = "";
        const wrap = el("div", "quizwrap");
        const head = el("div", "qhead");
        const back = el("button", "btn ghost", "← 단계 목록"); back.onclick = () => hub();
        head.append(back, el("span", null, `체크 단어 퀴즈 · ${cur + 1} / ${qs.length} · 점수 ${score}`));
        wrap.appendChild(head);
        const bar = el("div", "qbar"); bar.appendChild(el("i")).style.width = (cur / qs.length * 100) + "%";
        wrap.appendChild(bar);
        const q = qs[cur];
        const qc = el("div", "qcard");
        qc.appendChild(el("div", "qtype", q.type + ` · ${"✔".repeat(st.checks[q.it.id] || 0)}`));
        const prompt = el("div", "qprompt");
        prompt.appendChild(el("span", "big jp", esc(q.promptBig)));
        qc.appendChild(prompt);
        qc.appendChild(el("div", "qsub", esc(q.promptSub)));
        const opts = el("div", "opts");
        q.options.forEach(opt => {
          const b = el("button", "opt" + (q.jp ? " jp" : ""), esc(opt));
          b.onclick = () => {
            [...opts.children].forEach(x => { x.disabled = true; if (x.textContent === q.correct) x.classList.add("correct"); });
            if (opt === q.correct) score++;
            else { b.classList.add("wrong"); wrongs.push(q); st.checks[q.it.id] = Math.min((st.checks[q.it.id] || 1) + 1, 3); saveTp(); }
            if (q.speakAns) speak(q.speakAns);
            nextBtn.style.display = "inline-block";
          };
          opts.appendChild(b);
        });
        qc.appendChild(opts);
        const foot = el("div", "qfoot"); foot.appendChild(el("span"));
        const nextBtn = el("button", "btn pri", cur < qs.length - 1 ? "다음 ▶" : "결과 보기");
        nextBtn.style.display = "none"; nextBtn.style.flex = "0";
        nextBtn.onclick = () => { cur++; cur < qs.length ? draw() : finish(); };
        foot.appendChild(nextBtn);
        qc.appendChild(foot);
        wrap.appendChild(qc);
        app.appendChild(wrap);
      }
      function finish() {
        const pct = Math.round(score / qs.length * 100);
        app.innerHTML = "";
        const wrap = el("div", "quizwrap");
        const r = el("div", "result");
        r.appendChild(el("div", "score", `${score}/${qs.length}`));
        r.appendChild(el("div", "pct", `${pct}% · ` + (pct === 100 ? "완벽해요! 🎉" : pct >= 70 ? "잘했어요! 👏" : "틀린 단어는 체크가 올라갔어요. 다시 복습해요 💪")));
        const btns = el("div"); btns.style.cssText = "display:flex;gap:10px;justify-content:center;flex-wrap:wrap";
        const again = el("button", "btn pri", "다시 풀기"); again.style.flex = "0"; again.onclick = () => tpQuiz();
        const hb = el("button", "btn ghost", "단계 목록"); hb.onclick = () => hub();
        btns.append(again, hb);
        r.appendChild(btns);
        if (wrongs.length) {
          const rev = el("div", "review");
          rev.appendChild(el("h3", null, `틀린 문제 ${wrongs.length}개 복습`));
          wrongs.forEach(q => rev.appendChild(el("div", "r", `<span class="jp">${esc(q.promptBig)}</span> → <b>${esc(q.correct)}</b>`)));
          r.appendChild(rev);
        }
        wrap.appendChild(r);
        app.appendChild(wrap);
      }
      draw();
    }

    hub();
  }

  /* ---------- QUIZ ---------- */
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
    const d = DATA.find(x => x.day === day);
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
    // meaning questions from cards
    const cardPool = shuffle(cards);
    // word/reading questions from wordItems
    const wordPool = shuffle(wordItems);
    let ci = 0, wi = 0;
    const localReadPool = wordItems.length >= 4 ? wordItems : ALL_READINGS;
    while (qs.length < count && (ci < cardPool.length || wi < wordPool.length)) {
      const type = qs.length % 3;
      if (type === 0 && ci < cardPool.length) {
        const c = cardPool[ci++];
        const dis = pickDistinct(cards.length >= 4 ? cards : DATA.flatMap(x => x.cards), c, x => x.gloss, 3);
        qs.push({
          type: "뜻·음 고르기", promptBig: c.char, promptSub: "이 한자의 뜻과 음은?",
          speak: null, correct: c.gloss,
          options: shuffle([c.gloss, ...dis.map(x => x.gloss)])
        });
      } else if (type === 1 && wi < wordPool.length) {
        const r = wordPool[wi++];
        const ans = r.furigana || r.reading;
        const dis = pickDistinct(localReadPool, r, x => (x.furigana || x.reading), 3);
        qs.push({
          type: "읽기 고르기", promptBig: r.word, promptSub: "이 단어의 읽기는?",
          speak: ans, correct: ans,
          options: shuffle([ans, ...dis.map(x => x.furigana || x.reading)])
        });
      } else if (wi < wordPool.length) {
        const r = wordPool[wi++];
        const dis = pickDistinct(localReadPool, r, x => x.word, 3);
        qs.push({
          type: "단어 고르기", promptBig: (r.furigana || r.reading), promptSub: r.meaning ? "뜻: " + r.meaning : "이 읽기의 단어는?",
          promptJpSmall: true, speak: (r.furigana || r.reading), correct: r.word,
          options: shuffle([r.word, ...dis.map(x => x.word)])
        });
      } else if (ci < cardPool.length) {
        const c = cardPool[ci++];
        const dis = pickDistinct(cards.length >= 4 ? cards : DATA.flatMap(x => x.cards), c, x => x.gloss, 3);
        qs.push({ type: "뜻·음 고르기", promptBig: c.char, promptSub: "이 한자의 뜻과 음은?", speak: null, correct: c.gloss, options: shuffle([c.gloss, ...dis.map(x => x.gloss)]) });
      } else break;
    }
    return qs;
  }

  const ALL_LEVELS = ["N5", "N4", "N3", "N2", "N1"];
  function renderQuiz(day) {
    const d = DATA.find(x => x.day === day);
    // 관련 기출 단어 레벨 선택 (복수 선택, 기본값 N5~N2). 브라우저에 저장된 선택 우선.
    let levels = (LS.get("hz_quiz_levels", null) || ["N5", "N4", "N3", "N2"]).filter(l => ALL_LEVELS.includes(l));
    if (!levels.length) levels = ["N5", "N4", "N3", "N2"];
    // 이 일차의 관련 단어에 실제로 존재하는 레벨만 노출
    const availLevels = ALL_LEVELS.filter(l => d.cards.some(c => (c.related || []).some(rw => rw.l === l)));
    let count = 10, questions = [], cur = 0, score = 0, wrongs = [];

    function maxFor() { return buildQuestions(day, 9999, levels).length; }

    function setup() {
      app.innerHTML = "";
      const wrap = el("div", "quizwrap");
      const head = el("div", "qhead");
      const back = el("button", "btn ghost", "← 목록"); back.onclick = () => go("home");
      head.append(back, el("span", null, `${String(day).padStart(2, "0")}일차 · ${esc(d.category)}`));
      wrap.appendChild(head);
      const qc = el("div", "qcard");
      qc.appendChild(el("div", "qtype", "퀴즈 설정"));

      // 관련 기출 단어(JLPT) 레벨 선택 — 복수 선택
      if (availLevels.length) {
        qc.appendChild(el("div", "setup-q", "관련 기출 단어(JLPT) 레벨"));
        qc.appendChild(el("div", "qsub", "퀴즈에 포함할 단어 레벨을 선택하세요. 여러 개 고를 수 있어요."));
        const lvPick = el("div", "level-pick");
        availLevels.forEach(l => {
          const on = levels.includes(l);
          const b = el("button", "lvl-toggle " + l + (on ? " on" : ""), l);
          b.onclick = () => {
            if (levels.includes(l)) { if (levels.length > 1) levels = levels.filter(x => x !== l); }
            else levels = ALL_LEVELS.filter(x => levels.includes(x) || x === l);
            LS.set("hz_quiz_levels", levels);
            setup();
          };
          lvPick.appendChild(b);
        });
        qc.appendChild(lvPick);
      }

      const maxAvail = maxFor();
      qc.appendChild(el("div", "setup-q", "몇 문제를 풀까요?"));
      qc.appendChild(el("div", "qsub", `선택한 레벨 기준 최대 ${maxAvail}문제까지 낼 수 있어요.`));
      const opts = [10, 20, 30, 50].filter(n => n < maxAvail);
      opts.push(maxAvail); // 전체
      const pill = el("div", "count-pick");
      opts.forEach(n => {
        const b = el("button", "btn sec", n === maxAvail ? `전체 (${maxAvail})` : `${n}문제`);
        b.onclick = () => { count = n; start(); };
        pill.appendChild(b);
      });
      qc.appendChild(pill);
      wrap.appendChild(qc);
      app.appendChild(wrap);
    }

    function start() {
      questions = buildQuestions(day, count, levels); cur = 0; score = 0; wrongs = []; draw();
    }

    function draw() {
      app.innerHTML = "";
      const wrap = el("div", "quizwrap");
      const head = el("div", "qhead");
      const back = el("button", "btn ghost", "← 목록"); back.onclick = () => go("home");
      head.append(back, el("span", null, `${cur + 1} / ${questions.length} · 점수 ${score}`));
      wrap.appendChild(head);
      const bar = el("div", "qbar"); bar.appendChild(el("i")).style.width = (cur / questions.length * 100) + "%";
      wrap.appendChild(bar);

      const q = questions[cur];
      const qc = el("div", "qcard");
      qc.appendChild(el("div", "qtype", q.type));
      const prompt = el("div", "qprompt");
      const big = el("span", "big jp" + (q.promptJpSmall ? "" : ""), esc(q.promptBig));
      if (q.promptJpSmall) big.style.fontSize = "40px";
      prompt.appendChild(big);
      qc.appendChild(prompt);
      qc.appendChild(el("div", "qsub", esc(q.promptSub)));

      const opts = el("div", "opts");
      const isJp = q.type !== "뜻·음 고르기";
      q.options.forEach(opt => {
        const b = el("button", "opt" + (isJp ? " jp" : ""), esc(opt));
        b.onclick = () => choose(b, opt, q, opts);
        opts.appendChild(b);
      });
      qc.appendChild(opts);

      const foot = el("div", "qfoot");
      foot.appendChild(el("span"));
      const nextBtn = el("button", "btn pri", cur < questions.length - 1 ? "다음 ▶" : "결과 보기");
      nextBtn.style.display = "none"; nextBtn.style.flex = "0";
      nextBtn.onclick = () => { cur++; cur < questions.length ? draw() : finish(); };
      foot.appendChild(nextBtn);
      qc.appendChild(foot);
      qc._next = nextBtn;
      wrap.appendChild(qc);
      app.appendChild(wrap);
    }

    function choose(btn, opt, q, opts) {
      [...opts.children].forEach(b => { b.disabled = true; if (b.textContent === q.correct) b.classList.add("correct"); });
      if (opt === q.correct) score++;
      else { btn.classList.add("wrong"); wrongs.push(q); }
      app.querySelector(".qcard")._next.style.display = "inline-block";
    }

    function finish() {
      const pct = Math.round(score / questions.length * 100);
      quizBest[day] = Math.max(quizBest[day] || 0, pct);
      LS.set("hz_quiz_best", quizBest);
      app.innerHTML = "";
      const wrap = el("div", "quizwrap");
      const r = el("div", "result");
      r.appendChild(el("div", "score", `${score}/${questions.length}`));
      const msg = pct === 100 ? "완벽해요! 🎉" : pct >= 70 ? "잘했어요! 👏" : "다시 복습해봐요 💪";
      r.appendChild(el("div", "pct", `${pct}% · ${msg}` + (quizBest[day] ? ` · 최고점 ${quizBest[day]}%` : "")));
      const btns = el("div"); btns.style.display = "flex"; btns.style.gap = "10px"; btns.style.justifyContent = "center";
      const again = el("button", "btn pri", "다시 풀기"); again.style.flex = "0"; again.onclick = () => start();
      const change = el("button", "btn sec", "문제 수 변경"); change.style.flex = "0"; change.onclick = () => setup();
      const study = el("button", "btn sec", "카드 학습"); study.style.flex = "0"; study.onclick = () => go("study", day);
      const home = el("button", "btn ghost", "목록"); home.onclick = () => go("home");
      btns.append(again, change, study, home);
      r.appendChild(btns);
      if (wrongs.length) {
        const rev = el("div", "review");
        rev.appendChild(el("h3", null, `틀린 문제 ${wrongs.length}개 복습`));
        wrongs.forEach(q => rev.appendChild(el("div", "r", `<span class="jp">${esc(q.promptBig)}</span> → <b>${esc(q.correct)}</b> <span style="color:var(--mut)">(${esc(q.promptSub)})</span>`)));
        r.appendChild(rev);
      }
      wrap.appendChild(r);
      app.appendChild(wrap);
    }
    setup();
  }

  /* ---------- init ---------- */
  if (!DATA.length) { app.innerHTML = "<p>데이터를 불러오지 못했습니다.</p>"; return; }
  go("home");
})();
