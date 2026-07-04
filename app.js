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
      app: "jlpt-hanja", version: 1, exportedAt: new Date().toISOString(),
      study: studyProg, quiz: quizBest, voice: LS.get("hz_voice_name", null)
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
    LS.set("hz_prog_study", studyProg); LS.set("hz_quiz_best", quizBest);
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
    setCrumbs(view, arg);
  }
  function setCrumbs(view, arg) {
    if (view === "home") { crumbs.innerHTML = ""; return; }
    const d = DATA.find(x => x.day === arg);
    const label = view === "study" ? "카드 학습" : "퀴즈";
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
    const b2 = el("button", "btn sec", "퀴즈"); b2.onclick = () => go("quiz", d.day);
    btns.append(b1, b2); c.appendChild(btns);
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

  function buildQuestions(day, count) {
    const d = DATA.find(x => x.day === day);
    const cards = d.cards;
    const wordItems = [];
    const seenW = new Set();
    const addWord = (word, reading, meaning) => {
      if (!word || !reading || seenW.has(word)) return;
      seenW.add(word);
      wordItems.push({ word, furigana: reading, reading, meaning });
    };
    cards.forEach(c => c.readings.forEach(r => { if (r.word && (r.furigana || r.reading)) addWord(r.word, fullReading(r), r.meaning); }));
    // 관련 기출 단어(JLPT)도 퀴즈 대상에 포함
    cards.forEach(c => (c.related || []).forEach(rw => addWord(rw.w, rw.r, rw.m)));
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

  function renderQuiz(day) {
    const d = DATA.find(x => x.day === day);
    const maxAvail = buildQuestions(day, 9999).length; // 생성 가능한 최대 문제 수
    let count = Math.min(10, maxAvail);
    let questions = [], cur = 0, score = 0, wrongs = [];

    function setup() {
      app.innerHTML = "";
      const wrap = el("div", "quizwrap");
      const head = el("div", "qhead");
      const back = el("button", "btn ghost", "← 목록"); back.onclick = () => go("home");
      head.append(back, el("span", null, `${String(day).padStart(2, "0")}일차 · ${esc(d.category)}`));
      wrap.appendChild(head);
      const qc = el("div", "qcard");
      qc.appendChild(el("div", "qtype", "퀴즈 설정"));
      qc.appendChild(el("div", "setup-q", "몇 문제를 풀까요?"));
      qc.appendChild(el("div", "qsub", `이 일차에서 최대 ${maxAvail}문제까지 낼 수 있어요.`));
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
      questions = buildQuestions(day, count); cur = 0; score = 0; wrongs = []; draw();
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
