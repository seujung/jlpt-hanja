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
  const tpRandom = () => LS.get("hz_toripa_random", false);   // 토리파 학습 순서 무작위 여부
  const setTpRandom = v => LS.set("hz_toripa_random", !!v);

  /* ---------- progress backup / restore ---------- */
  function exportProgress() {
    const payload = {
      app: "jlpt-hanja", version: 5, exportedAt: new Date().toISOString(),
      quiz: quizBest, toripa,
      toripaLevels: LS.get("hz_toripa_levels", null), quizLevels: LS.get("hz_quiz_levels", null),
      voice: LS.get("hz_voice_name", null), toripaRandom: LS.get("hz_toripa_random", null),
      target: LS.get("hz_target", null), exam: LS.get("hz_exam", null),
      srs: LS.get("hz_srs", {}), traps: LS.get("hz_traps", {}), mock: LS.get("hz_mock", [])
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
        if (typeof p.toripaRandom === "boolean") setTpRandom(p.toripaRandom);
        if (ALL_LEVELS.includes(p.target)) LS.set("hz_target", p.target);
        if (typeof p.exam === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.exam)) LS.set("hz_exam", p.exam);
        // 복습 큐: 없는 단어만 추가 / 함정 통계: 더 큰 값 / 모의 시험: 시각 기준 합치기
        Object.entries(p.srs || {}).forEach(([w, e]) => { if (!srs[w] && e && typeof e.due === "number") srs[w] = e; });
        saveSrs();
        Object.entries(p.traps || {}).forEach(([k, v]) => { traps[k] = Math.max(traps[k] || 0, +v || 0); });
        LS.set("hz_traps", traps);
        if (Array.isArray(p.mock)) {
          const seen = new Set(mockHist.map(h => h.at));
          p.mock.forEach(h => { if (h && !seen.has(h.at)) mockHist.push(h); });
          mockHist.sort((a, b) => a.at - b.at);
          if (mockHist.length > 60) mockHist.splice(0, mockHist.length - 60);
          LS.set("hz_mock", mockHist);
        }
        alert("진도를 불러왔습니다. 기존 진도와 더 높은 값으로 병합했습니다.");
        go("home");
      } catch (e) { alert("불러오기 실패: " + e.message); }
    };
    reader.readAsText(file);
  }
  function resetProgress() {
    if (!confirm("토리파 진행 상태, 퀴즈 점수, 복습 큐, 함정 통계, 모의 시험 기록을 모두 초기화할까요?\n(되돌릴 수 없습니다. 필요하면 먼저 '진도 내보내기'로 백업하세요.)")) return;
    Object.keys(quizBest).forEach(k => delete quizBest[k]);
    Object.keys(toripa).forEach(k => delete toripa[k]);
    Object.keys(srs).forEach(k => delete srs[k]);
    Object.keys(traps).forEach(k => delete traps[k]);
    mockHist.length = 0;
    LS.set("hz_quiz_best", quizBest); saveTp(); LS.del("hz_prog_study");
    saveSrs(); LS.set("hz_traps", traps); LS.set("hz_mock", mockHist);
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

  /* ---------- JLPT 실전: 한자·단어 색인 ---------- */
  const HIRA_RE = /^[ぁ-ゟー]+$/;
  const KANJI_RE = /[一-龯々]/;
  const addTo = (m, k, v) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v); };
  const CHARS = new Map();                       // 한자 → {on, kun, ko(한국음)}
  const ON2CHARS = new Map(), KO2CHARS = new Map();
  const CARD_BY_ID = new Map();
  DATA.forEach(d => d.cards.forEach(c => {
    CARD_BY_ID.set(c.id, c);
    const clean = s => s.replace(/[(（].*?[)）]/g, "").replace(/[^ぁ-ゟ]/g, "");
    const on = [...new Set(c.readings.filter(r => r.type === "음독" && r.reading).map(r => clean(r.reading)))].filter(Boolean);
    const kun = [...new Set(c.readings.filter(r => r.type === "훈독" && r.reading).map(r => clean(r.reading)))].filter(Boolean);
    const ko = c.gloss.trim().split(/\s+/).pop();
    CHARS.set(c.char, { on, kun, ko, lvl: c.jlpt || null });
    on.forEach(o => addTo(ON2CHARS, o, c.char));
    if (ko) addTo(KO2CHARS, ko, c.char);
  }));
  const WORDS = new Map();                        // 단어 → {w, r, m, l, src: [{day, char}]}
  const READ2WORDS = new Map(), WORD2READS = new Map();
  const DAY_WORDS = new Map();                    // 일차 → 그 일차에 나오는 단어 집합
  function addWordIdx(w, r, m, l, day, char) {
    if (!w || !r || !HIRA_RE.test(r) || !KANJI_RE.test(w)) return;
    addTo(READ2WORDS, r, w); addTo(WORD2READS, w, r); addTo(DAY_WORDS, day, w);
    let cur = WORDS.get(w);
    if (!cur || (!cur.l && l)) { cur = { w, r, m: m || "", l: l || null, src: cur ? cur.src : [] }; WORDS.set(w, cur); }
    if (!cur.src.some(s => s.day === day && s.char === char)) cur.src.push({ day, char });
  }
  DATA.forEach(d => d.cards.forEach(c => {
    (c.related || []).forEach(rw => addWordIdx(rw.w, rw.r, rw.m, rw.l, d.day, c.char));
    c.readings.forEach(r => { if (r.word) addWordIdx(r.word, fullReading(r), r.meaning, null, d.day, c.char); });
  }));
  // 시험 범위 안의 단원을 출처 목록 앞으로 옮긴다 (단원별 오답 집계는 첫 출처 기준)
  const srcFirst = (src, days) => (src || []).slice().sort((a, b) => days.includes(b.day) - days.includes(a.day));
  // 출처 단원 표시: "07일차 · 수·시간·위치 · 横". data-goday 버튼을 누르면 그 일차로 이동한다.
  function srcHtml(src, max = 3) {
    if (!src || !src.length) return "";
    const chips = src.slice(0, max).map(s => {
      const d = dayOf(s.day);
      return `<button type="button" class="src-chip" data-goday="${s.day}" title="${pad2(s.day)}일차로 이동"><b class="num">${pad2(s.day)}일차</b> ${esc(d ? d.category : "")}${s.char ? ` · <span class="jp">${esc(s.char)}</span>` : ""}</button>`;
    }).join("");
    return `<span class="src-list">${chips}${src.length > max ? `<span class="small-note">외 ${src.length - max}곳</span>` : ""}</span>`;
  }
  const ALL_WORDS = [...WORDS.values()];

  /* ---------- 漢字読み 함정 보기: 장음·촉음·탁음·요음 변형 ---------- */
  const DAKU = {};
  ["かが", "きぎ", "くぐ", "けげ", "こご", "さざ", "しじ", "すず", "せぜ", "そぞ", "ただ", "ちぢ", "つづ", "てで", "とど",
    "はばぱ", "ひびぴ", "ふぶぷ", "へべぺ", "ほぼぽ"].forEach(g => [...g].forEach(ch => { DAKU[ch] = [...g].filter(x => x !== ch); }));
  const O_COL = "おこごそぞとどのほぼぽもよょろ", U_COL = "くぐすずつづぬふぶぷむゆゅる", E_COL = "けげせぜてでねへべぺめれ";
  const I_COL = "きぎしじちにひびぴみり";
  const SOKU_NEXT = /^[かきくけこさしすせそたちつてとぱぴぷぺぽ]/;
  const SMALL = { "ゃ": "や", "ゅ": "ゆ", "ょ": "よ" }, BIG = { "や": "ゃ", "ゆ": "ゅ", "よ": "ょ" };
  const TRAP_LABEL = { long: "장음", soku: "촉음", daku: "탁음", yoon: "요음", homo: "동음 한자", ko: "한국음 같은 한자", other: "기타" };
  // compound: 한자만으로 된 2자 이상 단어(음독어). 장음 넣기·촉음 만들기는 음독어에서만 쓴다.
  function trapReadings(r, compound) {
    const a = [...r], out = [];
    const add = (s, tag) => { if (s && s !== r && HIRA_RE.test(s) && !out.some(x => x.r === s)) out.push({ r: s, tag }); };
    const rep = (i, s, n = 1) => a.slice(0, i).join("") + s + a.slice(i + n).join("");
    for (let i = 0; i < a.length; i++) {
      const ch = a[i], nx = a[i + 1];
      if (ch === "う" && i > 0 && (O_COL.includes(a[i - 1]) || U_COL.includes(a[i - 1]))) add(rep(i, ""), "long");
      if (ch === "い" && i > 0 && E_COL.includes(a[i - 1])) add(rep(i, ""), "long");
      if (compound && O_COL.includes(ch) && nx !== "う" && !(nx in SMALL)) add(rep(i + 1, "う", 0), "long");
      if (ch === "っ") { add(rep(i, ""), "soku"); add(rep(i, "つ"), "soku"); add(rep(i, "く"), "soku"); }
      if (compound && "くつちき".includes(ch) && i > 0 && nx && SOKU_NEXT.test(nx)) add(rep(i, "っ"), "soku");
      if (DAKU[ch]) DAKU[ch].forEach(x => { if (i > 0 || !"ぱぴぷぺぽ".includes(x)) add(rep(i, x), "daku"); });
      if (SMALL[ch]) add(rep(i, SMALL[ch]), "yoon");
      if (BIG[ch] && i > 0 && I_COL.includes(a[i - 1])) add(rep(i, BIG[ch]), "yoon");
    }
    return out;
  }
  // 함정 유형이 겹치지 않게 n개를 고른다. 이 단어의 다른 실제 읽기는 오답에서 뺀다.
  function pickTraps(word, r, n) {
    const real = WORD2READS.get(word) || new Set([r]);
    const compound = [...word].length >= 2 && [...word].every(ch => KANJI_RE.test(ch));
    const cands = shuffle(trapReadings(r, compound).filter(x => !real.has(x.r)));
    const out = [], used = new Set();
    for (const x of cands) if (!used.has(x.tag)) { used.add(x.tag); out.push(x); if (out.length >= n) return out; }
    for (const x of cands) if (!out.includes(x)) { out.push(x); if (out.length >= n) return out; }
    return out;
  }
  // 表記 오답: 한 글자를 음독이 같은 한자 또는 한국음이 같은 한자로 바꾼다. 같은 읽기의 실제 단어는 뺀다.
  function hyokiCands(e) {
    const a = [...e.w], same = READ2WORDS.get(e.r) || new Set(), homo = [], ko = [];
    const seen = new Set([e.w]);
    a.forEach((ch, i) => {
      const info = CHARS.get(ch); if (!info) return;
      const rep = x => a.slice(0, i).join("") + x + a.slice(i + 1).join("");
      const push = (list, x, tag) => { const s = rep(x); if (x !== ch && !seen.has(s) && !same.has(s)) { seen.add(s); list.push({ w: s, tag }); } };
      info.on.forEach(o => (ON2CHARS.get(o) || []).forEach(x => push(homo, x, "homo")));
      (KO2CHARS.get(info.ko) || []).forEach(x => push(ko, x, "ko"));
    });
    // 자주 쓰는 한자(N5~N2)로 바꾼 보기를 먼저 쓴다. 낯선 한자는 함정으로 덜 그럴듯하다.
    const rank = x => { const l = CHARS.get([...x.w].find((ch, i) => ch !== a[i]))?.lvl; return !l ? 2 : l === "N1" ? 1 : 0; };
    const byRank = list => shuffle(list).sort((p, q) => rank(p) - rank(q));
    return [...byRank(homo), ...byRank(ko)];
  }

  /* ---------- 한국 한자음 → 일본 음독 대응 규칙 ---------- */
  const JONG = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
  const jongOf = s => { const c = String(s || "").charCodeAt(String(s || "").length - 1) - 0xAC00; return c >= 0 && c < 11172 ? JONG[c % 28] : null; };
  const KO_RULES = {
    "ㅇ": { end: ["う", "い"], txt: "ㅇ 받침 → 장음 〜う·〜い" },
    "ㄴ": { end: ["ん"], txt: "ㄴ 받침 → 〜ん" },
    "ㅁ": { end: ["ん"], txt: "ㅁ 받침 → 〜ん" },
    "ㅂ": { end: ["う", "つ"], txt: "ㅂ 받침 → 장음 〜う (일부 〜つ)" },
    "ㄱ": { end: ["く", "き"], txt: "ㄱ 받침 → 〜く·〜き", soku: /^[かきくけこ]/, sokuTxt: "뒤 음이 か행이면 촉음(っ)이 되기 쉬움" },
    "ㄹ": { end: ["つ", "ち"], txt: "ㄹ 받침 → 〜つ·〜ち", soku: /^[かきくけこさしすせそたちつてとはひふへほ]/, sokuTxt: "뒤 음이 か·さ·た·は행이면 촉음(っ)이 되기 쉬움 (は행은 ぱ행으로)" }
  };
  function koHint(word) {
    const a = [...(word || "")], rows = [];
    a.forEach((ch, i) => {
      const info = CHARS.get(ch); if (!info || !info.ko) return;
      const rule = KO_RULES[jongOf(info.ko)];
      let verdict = "", soku = "";
      if (rule && info.on.length) {
        const ok = info.on.some(o => rule.end.some(e => o.endsWith(e)));
        verdict = `<span class="kh-v ${ok ? "ok" : "ex"}">${ok ? "규칙대로" : "예외"}</span>`;
      }
      const ni = rule && rule.soku && CHARS.get(a[i + 1]);
      if (ni && ni.on.some(o => rule.soku.test(o))) soku = `<div class="small-note">${esc(rule.sokuTxt)}</div>`;
      rows.push(`<tr><td class="jp kh-c">${esc(ch)}</td><td>${esc(info.ko)}</td><td class="jp">${esc(info.on.join("・") || "—")}</td>` +
        `<td>${!info.on.length ? '<span class="small-note">음독 없음 (훈독만 씀)</span>' : rule ? esc(rule.txt) : '<span class="small-note">받침 없음</span>'} ${verdict}${soku}</td></tr>`);
    });
    if (!rows.length) return "";
    return `<div class="kohint"><div class="kh-title">한국 한자음으로 음독 추론</div><table><thead><tr><th>한자</th><th>한국음</th><th>음독</th><th>대응 규칙</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  }

  /* ---------- JLPT 문제 생성 (漢字読み · 表記) ---------- */
  function jlptQ(e, kind, pool) {
    const reveal = { front: e.w, meaning: e.m, reading: e.r, ex: "", speak: e.r };
    const base = { entry: e, kind, reveal, hint: koHint(e.w), speakAns: e.r, jp: true, src: e.src };
    const fill = (list, keyFn, n, seen) => {
      for (const x of shuffle(pool)) { if (list.length >= n) break; const k = keyFn(x); if (k && !seen.has(k)) { seen.add(k); list.push(k); } }
    };
    if (kind === "hyoki") {
      const ds = hyokiCands(e).slice(0, 3), tags = {};
      ds.forEach(x => { tags[x.w] = x.tag; });
      const opts = ds.map(x => x.w);
      fill(opts, x => x.w, 3, new Set([e.w, ...opts, ...(READ2WORDS.get(e.r) || [])]));
      return { ...base, section: "表記", type: "表記 · 한자 표기", promptBig: e.r, promptJpSmall: true, promptSub: "이 단어를 한자로 쓰면?", correct: e.w, options: shuffle([e.w, ...opts]), tags };
    }
    const ts = pickTraps(e.w, e.r, 3), tags = {};
    ts.forEach(x => { tags[x.r] = x.tag; });
    const opts = ts.map(x => x.r);
    fill(opts, x => x.r, 3, new Set([e.r, ...opts, ...(WORD2READS.get(e.w) || [])]));
    return { ...base, section: "漢字読み", type: "漢字読み · 읽기", promptBig: e.w, promptJpSmall: [...e.w].length > 3, promptSub: "이 단어의 읽기로 알맞은 것은?", correct: e.r, options: shuffle([e.r, ...opts]), tags };
  }

  /* ---------- 목표 레벨 · 시험일 ---------- */
  const targetLevel = () => { const l = LS.get("hz_target", "N2"); return ALL_LEVELS.includes(l) ? l : "N2"; };
  const levelsUpTo = l => ALL_LEVELS.slice(0, ALL_LEVELS.indexOf(l) + 1);
  function setTarget(l) {
    LS.set("hz_target", l);
    LS.set("hz_toripa_levels", levelsUpTo(l));
    LS.set("hz_quiz_levels", levelsUpTo(l));
  }
  const TARGET_DAYS = { N5: 6, N4: 6, N3: 18, N2: 18, N1: 30 };   // 목표 레벨이 다루는 마지막 일차
  const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const today0 = () => { const n = new Date(); n.setHours(0, 0, 0, 0); return n; };
  function nextExamDate() {   // JLPT: 7월·12월 첫째 일요일
    const now = today0();
    for (let y = now.getFullYear(); y < now.getFullYear() + 2; y++) for (const m of [6, 11]) {
      const d = new Date(y, m, 1); d.setDate(1 + (7 - d.getDay()) % 7);
      if (d >= now) return ymd(d);
    }
    return ymd(now);
  }
  const examDate = () => LS.get("hz_exam", null) || nextExamDate();
  const daysUntil = s => { const [y, m, d] = s.split("-").map(Number); return Math.round((new Date(y, m - 1, d) - today0()) / 864e5); };

  /* ---------- 복습 큐 (SRS) · 함정 통계 ---------- */
  const srs = LS.get("hz_srs", {});              // 단어 → {b: 상자 1~6, due, n: 틀린 횟수}
  const saveSrs = () => LS.set("hz_srs", srs);
  const SRS_IV = [0, 10 * 60e3, 864e5, 3 * 864e5, 7 * 864e5, 14 * 864e5, 30 * 864e5];
  function srsWrong(w) {
    if (!WORDS.has(w)) return;
    const e = srs[w] || { b: 1, n: 0 };
    e.b = 1; e.n = (e.n || 0) + 1; e.due = Date.now() + SRS_IV[1];
    srs[w] = e; saveSrs();
  }
  function srsRight(w) {
    const e = srs[w]; if (!e) return;
    e.b = Math.min((e.b || 1) + 1, 6); e.due = Date.now() + SRS_IV[e.b];
    saveSrs();
  }
  const srsDue = () => { const now = Date.now(); return Object.keys(srs).filter(w => WORDS.has(w) && srs[w].due <= now); };
  // 토리파 항목을 복습 큐에 넣는다. 한자 항목은 그 한자의 예시 단어를 넣는다.
  function srsFromItem(it, mode) {
    if (mode === "word") return srsWrong(it.front);
    const c = CARD_BY_ID.get(it.id);
    if (c) c.readings.forEach(r => { if (r.word) srsWrong(r.word); });
  }
  const traps = LS.get("hz_traps", {});           // 함정 유형 → 걸린 횟수
  function trackPicks(picks) {
    (picks || []).forEach(p => { if (!p.ok && p.tag) traps[p.tag] = (traps[p.tag] || 0) + 1; });
    LS.set("hz_traps", traps);
  }
  const mockHist = LS.get("hz_mock", []);        // [{at, lvl, ok, n, sec}]

  /* ---------- 토리파 데이터 ---------- */
  const H6 = 6 * 3600e3, D3 = 3 * 24 * 3600e3;
  function tpState(day, mode) {
    const k = day + ":" + mode;
    if (!toripa[k]) toripa[k] = { checks: {}, phase: 0, doneAt: null, rev6At: null, rev3At: null, run: null };
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
  // 토리파 판정용 문제: 뜻(한국어)과 일본어 읽기를 각각 4지선다로 묻고, 둘 다 맞아야 "안다"
  function makeQuestion(it, mode, pools) {
    const parts = [];
    if (it.meaning) {
      const dis = pickDistractors(it, x => x.meaning, 3, pools);
      parts.push({ sub: mode === "hanja" ? "이 한자의 뜻과 음(한국어)은?" : "이 단어의 뜻은?", correct: it.meaning, options: shuffle([it.meaning, ...dis.map(x => x.meaning)]), jp: false });
    }
    if (it.reading) {
      // 단어 읽기는 시험처럼 장음·촉음·탁음·요음 함정으로 오답을 만들고, 모자라면 다른 단어 읽기로 채운다
      const ts = mode === "word" && HIRA_RE.test(it.reading) ? pickTraps(it.front, it.reading, 3) : [];
      const tags = {}; ts.forEach(x => { tags[x.r] = x.tag; });
      const opts = ts.map(x => x.r);
      const seen = new Set([it.reading, ...opts]);
      pickDistractors(it, x => x.reading, 6, pools).forEach(x => { if (opts.length < 3 && !seen.has(x.reading)) { seen.add(x.reading); opts.push(x.reading); } });
      parts.push({ sub: mode === "hanja" ? "이 한자의 일본어 읽기(훈독·음독)는?" : "이 단어의 일본어 읽기는?", correct: it.reading, options: shuffle([it.reading, ...opts]), jp: true, tags });
    }
    if (!parts.length) return null;
    const type = parts.length === 2 ? "뜻 · 읽기 고르기" : parts[0].jp ? "읽기 고르기" : "뜻 고르기";
    return { it, type, promptBig: it.front, parts, speakAns: it.speak, reveal: it, hint: koHint(it.front) };
  }

  /* ---------- 공용 문제 카드 ---------- */
  // q: {type, promptBig, promptJpSmall?, parts:[{sub, correct, options, jp, tags?}], speakAns?, reveal?, hint?}
  //    (parts 대신 promptSub/correct/options/jp/tags 단일 필드도 허용, tags: 오답 보기 → 함정 유형)
  // o: {head, onBack, backLabel, progress, tag, guide, onAnswer(allCorrect, picks), nextLabel, onNext}
  function questionCard(host, q, o) {
    const parts = q.parts || [{ sub: q.promptSub, correct: q.correct, options: q.options, jp: q.jp, tags: q.tags }];
    const picks = [];
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
    const prompt = el("div", "prompt"); prompt.appendChild(big); card.appendChild(prompt);

    let done = 0, allOk = true;
    const anyJp = parts.some(p => p.jp);
    let syncHint = () => {};
    if (q.speakAns) {
      // 읽기를 묻는 문제는 발음이 정답이므로 모두 답한 뒤에만 재생
      const locked = () => anyJp && done < parts.length;
      big.classList.add("say"); big.setAttribute("role", "button"); big.tabIndex = 0;
      syncHint = () => { big.classList.toggle("locked", locked()); big.title = locked() ? "답한 뒤 누르면 발음을 들려줍니다" : "누르면 발음을 들려줍니다"; };
      syncHint();
      big.onclick = () => { if (!locked()) speak(q.speakAns); };
      big.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); big.click(); } };
      prompt.appendChild(el("span", "say-note", anyJp ? "🔊 답한 뒤 단어를 누르면 발음" : "🔊 단어를 누르면 발음"));
    }

    const reveal = el("div", "reveal inset"); reveal.hidden = true;
    const next = el("button", "btn pri", o.nextLabel || "다음 ▶"); next.hidden = true; next.onclick = o.onNext;
    function finishAll() {
      if (q.reveal) {
        const it = q.reveal;
        reveal.innerHTML =
          `<div class="rv-head">${allOk ? "😃 정답" : "🤔 오답"} <span class="rv-front jp say" title="누르면 발음을 들려줍니다">${esc(it.front)}</span></div>` +
          (it.meaning ? `<div class="mn-big">${esc(it.meaning)}</div>` : "") +
          (it.reading ? `<div class="rd jp">${esc(it.reading)}</div>` : "") +
          (it.ex ? `<div class="ex jp">${esc(it.ex)}</div>` : "") +
          (!allOk && q.src && q.src.length ? `<div class="rv-src"><span class="lv-label">📍 이 단어가 나오는 단원</span>${srcHtml(q.src)}</div>` : "") +
          (q.hint || "");
        const sp = el("button", "spk", "🔊"); sp.title = "발음 듣기"; sp.onclick = () => speak(it.speak);
        reveal.querySelector(".rv-front").onclick = () => speak(it.speak);
        reveal.appendChild(sp);
        reveal.hidden = false;
      }
      next.hidden = false; next.focus();
      if (o.onAnswer) o.onAnswer(allOk, picks);
    }
    parts.forEach((p, pi) => {
      const block = el("div", "qpart");
      block.appendChild(el("div", "qsub", (parts.length > 1 ? `<span class="pno num">${pi + 1}</span>` : "") + esc(p.sub)));
      const opts = el("div", "opts");
      p.options.forEach(opt => {
        const b = el("button", "opt" + (p.jp ? " jp" : ""), esc(opt));
        b.onclick = () => {
          const ok = opt === p.correct;
          [...opts.children].forEach(x => { x.disabled = true; if (x.textContent === p.correct) x.classList.add("correct"); });
          if (!ok) { b.classList.add("wrong"); allOk = false; }
          // 함정 유형은 읽기·표기 문제(tags 있음)에서만 집계한다
          picks.push({ opt, ok, tag: ok || !p.tags ? null : p.tags[opt] || "other" });
          block.classList.add("answered");
          done++; syncHint();
          if (done === parts.length) finishAll();
        };
        opts.appendChild(b);
      });
      block.appendChild(opts);
      card.appendChild(block);
    });
    const foot = el("div", "qfoot"); foot.appendChild(next);
    card.append(reveal, foot);
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
  // 단계 진척 + 진행 중인 단계의 문항 진척(run)을 합친 0~1 비율
  function tpFrac(day) {
    return Math.max(0, ...["hanja", "word"].map(m => {
      const s = toripa[day + ":" + m]; if (!s) return 0;
      let n = Math.min(s.phase || 0, 5); if (s.rev6At) n = 6; if (s.rev3At) n = 7;
      const r = s.run;
      if (n < 7 && r && r.step === n + 1 && r.ids && r.ids.length) n += Math.min(r.idx / r.ids.length, 1);
      return n / 7;
    }));
  }
  function dayStatus(d) {
    const steps = tpStepsDone(d.day), frac = tpFrac(d.day);
    return { tp: steps >= 7 ? "done" : frac > 0 ? "progress" : "none", steps, frac, quiz: quizBest[d.day] ?? null };
  }
  function renderSidebar() {
    dayNav.innerHTML = "";
    dayNav.appendChild(el("span", "nav-label", "JLPT 실전"));
    [["review", "📝", "오늘의 복습"], ["mock", "⏱", "모의 시험"]].forEach(([v, ic, label]) => {
      const btn = el("button");
      btn.dataset.view = v;
      btn.innerHTML = `<span class="dn">${ic}</span><span class="dc">${label}</span><span class="dm"></span>`;
      btn.onclick = () => go(v);
      dayNav.appendChild(btn);
    });
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
    dayNav.querySelectorAll("button[data-view]").forEach(b => {
      b.classList.toggle("on", b.dataset.view === curView);
      if (b.dataset.view === "review") { const n = srsDue().length; b.querySelector(".dm").innerHTML = n ? `<span class="num due">${n}</span>` : ""; }
    });
    dayNav.querySelectorAll("button[data-day]").forEach(b => {
      const day = +b.dataset.day, s = dayStatus(dayOf(day));
      b.classList.toggle("on", day === curDay);
      b.querySelector(".dm").innerHTML = `<i class="dot ${s.tp}" title="토리파 ${s.steps}/7단계${s.frac > s.steps / 7 ? " (진행 중)" : ""}"></i>` + (s.quiz != null ? `<span class="num">${s.quiz}%</span>` : "");
    });
    const on = dayNav.querySelector("button.on");
    if (on && on.scrollIntoViewIfNeeded) on.scrollIntoViewIfNeeded(false);
  }
  let curView = "home", stopTimer = null;
  function go(view, arg) {
    window.scrollTo(0, 0);
    cancelSpeech();
    if (stopTimer) { stopTimer(); stopTimer = null; }
    curView = view;
    curDay = view === "day" ? arg : null;
    if (view === "day") renderDay(arg);
    else if (view === "review") renderReview();
    else if (view === "mock") renderMock(arg);
    else renderHome();
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

    app.appendChild(planCard());

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
      `<div class="track ${s.tp}"><i style="width:${Math.round(s.frac * 100)}%"></i></div>`;
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
      const mk = el("button", "btn ghost sm mock-btn", `⏱ ${pad2(day)}일차 모의 시험`);
      mk.onclick = () => { LS.set("hz_mock_scope", "d" + day); go("mock", "d" + day); };
      row1.appendChild(mk);
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
    { t: "쭉 보면서 모르는 것 체크", d: "뜻과 일본어 읽기를 4지선다로 풀어 틀린 것에 ✔ 체크." },
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
    const byId = new Map(all.map(it => [it.id, it]));
    // 랜덤 순서가 켜져 있으면 단계 시작 시 항목을 섞는다(이어서 하기는 저장된 순서 유지)
    const ordered = arr => tpRandom() ? shuffle(arr) : arr;
    // 저장된 중간 진행(run)을 현재 레벨 항목으로 되살린다. 항목이 달라졌으면 null.
    function runOf(st, n) {
      const r = st.run;
      if (!r || r.step !== n || !Array.isArray(r.ids) || !r.ids.length) return null;
      const items = r.ids.map(id => byId.get(id));
      if (items.some(x => !x)) return null;
      const idx = Math.min(Math.max(r.idx | 0, 0), items.length);
      if (idx <= 0 || idx >= items.length) return null;
      return { items, idx };
    }

    /* ----- 허브: 단계 목록 ----- */
    function hub() {
      const st = tpState(day, mode);
      host.innerHTML = "";
      const card = el("div", "card");
      card.appendChild(el("h2", null, "토리파 암기법 · 7단계"));
      card.appendChild(el("p", "cap", "안다/모른다는 뜻(한국어)과 일본어 읽기를 각각 4지선다로 풀어 판정합니다. 둘 다 맞아야 \"안다\"이고, 틀릴 때마다 체크가 올라가며 체크된 것만 다음 단계로 넘어갑니다."));

      const c1 = chk(st, 1).length, c2 = chk(st, 2).length, c3 = chk(st, 3).length;
      const sum = el("div", "tp-sum");
      sum.innerHTML =
        `<span>학습 대상 <b class="num">${all.length}</b>개` +
        (all.length !== allUnf.length ? ` <span class="small-note num">(전체 ${allUnf.length}개 중 선택 레벨)</span>` : "") + `</span>` +
        `<span class="badge c1 num">✔ 체크 ${c1}</span><span class="badge c2 num">✔✔ 더블 ${c2}</span><span class="badge c3 num">✔✔✔ 쓰리 ${c3}</span>`;
      card.appendChild(sum);

      const opt = el("div", "tp-opt");
      const rnd = el("button", "chip rnd");
      rnd.type = "button";
      const syncRnd = () => {
        const on = tpRandom();
        rnd.className = "chip rnd" + (on ? " on" : "");
        rnd.setAttribute("aria-pressed", on);
        rnd.innerHTML = `\u{1F500} 랜덤 순서 <span class="num">${on ? "ON" : "OFF"}</span>`;
      };
      syncRnd();
      rnd.onclick = () => { setTpRandom(!tpRandom()); syncRnd(); };
      opt.append(rnd, el("span", "small-note", "켜면 1~5단계를 시작할 때마다 항목 순서를 무작위로 섞어요 (6·7단계 복습은 항상 무작위, '이어서 하기'는 저장된 순서 유지)"));
      card.appendChild(opt);

      const now = Date.now();
      const list = el("div", "steps");
      TP_STEPS.forEach((s, i) => {
        const n = i + 1;
        let status, btn = null, hint = "", rz = runOf(st, n);
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
        if (rz && btn && status !== "done") { btn.className = "btn sm ghost"; btn.textContent = "처음부터"; hint = `${rz.idx}/${rz.items.length}까지 진행 중`; }
        else rz = null;
        const row = el("div", "step " + status);
        row.innerHTML = `<span class="stno num">${status === "done" ? "✓" : n}</span>` +
          `<div class="stx"><div class="t">${esc(s.t)}</div><div class="d">${esc(s.d)}${hint ? ` <em>${esc(hint)}</em>` : ""}</div></div>`;
        if (rz || btn) {
          const bx = el("div", "st-btns");
          if (rz) { const rb = el("button", "btn sm pri", `이어서 ▶ ${rz.idx + 1}/${rz.items.length}`); rb.onclick = () => runStep(n, true); bx.appendChild(rb); }
          if (btn) bx.appendChild(btn);
          row.appendChild(bx);
        }
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
        toripa[day + ":" + mode] = { checks: {}, phase: 0, doneAt: null, rev6At: null, rev3At: null, run: null };
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
      const st0 = tpState(day, mode), ids = cfg.items.map(x => x.id);
      let i = Math.min(cfg.start || 0, cfg.items.length - 1), spoke = 0;
      const persist = () => { st0.run = { step: n, ids, idx: i }; saveTp(); refreshSidebar(); };
      persist();
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
        const big = el("div", "big jp say", esc(it.front)); big.title = "누르면 발음을 들려줍니다";
        prompt.appendChild(big);
        const spk = el("button", "spk big", "🔊"); spk.title = "발음 듣기";
        const cnt = el("div", "tp-cnt num", `듣고 따라 말하기 ${spoke}회 / 4~5회`);
        big.onclick = spk.onclick = () => { speak(it.speak); spoke++; cnt.textContent = `듣고 따라 말하기 ${spoke}회 / 4~5회`; };
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
        nx.onclick = () => { i++; spoke = 0; if (i < cfg.items.length) { persist(); draw(); } else { st0.run = null; cfg.onDone(); } };
        foot.appendChild(nx); card.appendChild(foot);
        wrap.appendChild(card); host.appendChild(wrap);
      }
      draw();
    }

    /* ----- 판정 단계 (1·3·4·6·7): 4지선다 ----- */
    function quizRunner(n, cfg) {
      const st = tpState(day, mode);
      const items = cfg.items;
      const ids = items.map(x => x.id);
      let i = Math.min(cfg.start || 0, items.length - 1);
      const persist = () => { st.run = { step: n, ids, idx: i }; saveTp(); refreshSidebar(); };
      persist();
      function advance() { i++; if (i < items.length) { persist(); draw(); } else { st.run = null; cfg.onDone(); } }
      function draw() {
        const it = items[i];
        const q = makeQuestion(it, mode, pools);
        if (!q) return advance();
        questionCard(host, q, {
          head: `${n}단계 · ${i + 1} / ${items.length}`, onBack: hub, backLabel: "← 단계 목록",
          progress: i / items.length, tag: marks(st, it), guide: cfg.guide,
          onAnswer: (ok, picks) => { trackPicks(picks); if (!ok) { cfg.onWrong(it, st); srsFromItem(it, mode); saveTp(); } },
          nextLabel: i < items.length - 1 ? "다음 ▶" : "완료", onNext: advance
        });
      }
      draw();
    }

    /* ----- 단계별 실행 ----- */
    function runStep(n, resume) {
      const st = tpState(day, mode);
      const rz = resume ? runOf(st, n) : null;
      const start = rz ? rz.idx : 0;
      const done = msg => { st.run = null; saveTp(); refreshSidebar(); stepDone(n, msg); };
      const base = n === 1 ? all : n <= 3 ? chk(st, 1) : n <= 5 ? chk(st, 2) : null;
      const items = rz ? rz.items : base && ordered(base);
      if (n !== 1 && n !== 5 && n <= 5 && !items.length) return emptyStep(n);

      if (n === 1) {
        if (!rz) {
          if (st.phase >= 1 && chk(st, 1).length && !confirm("1단계를 다시 하면 현재 레벨 항목의 체크가 초기화됩니다. 계속할까요?")) return;
          all.forEach(it => { delete st.checks[it.id]; });   // 다른 레벨의 체크는 보존
          st.phase = 0; st.doneAt = null; st.rev6At = null; st.rev3At = null; saveTp();
        }
        quizRunner(1, {
          guide: "뜻과 읽기를 모두 고르세요. 하나라도 틀리면 ✔ 체크됩니다.", items, start,
          onWrong: (it, st) => { st.checks[it.id] = 1; },
          onDone: () => {
            st.phase = 1;
            if (!chk(st, 1).length) { st.phase = 5; st.doneAt = Date.now(); done("모르는 것이 없어요! 🎉 1~5단계를 건너뛰고 복습 일정만 잡았어요."); }
            else done(`체크 ${chk(st, 1).length}개! 이제 입으로 소리 내어 외울 차례예요.`);
          }
        });
      } else if (n === 2) {
        cardRunner(2, {
          title: "2단계 · 입으로 4~5번 암기", guide: "🔊를 누르고 4~5번 소리 내어 따라 읽으세요.", items, start,
          onDone: () => { st.phase = Math.max(st.phase, 2); done("이제 뜻을 가리고 스스로 확인해봐요."); }
        });
      } else if (n === 3) {
        quizRunner(3, {
          guide: "뜻과 읽기를 먼저 떠올린 뒤 보기를 고르세요. 하나라도 틀리면 ✔✔ 더블체크.", items, start,
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
          guide: "종이에 뜻과 읽기를 직접 적은 뒤 보기를 골라 채점하세요. 하나라도 틀리면 ✔✔✔ 쓰리체크.", items, start,
          onWrong: (it, st) => { st.checks[it.id] = 3; },
          onDone: () => { st.phase = Math.max(st.phase, 4); done("1회독 완료! 이제 노트에 정리해요."); }
        });
      } else if (n === 5) {
        noteStep(st);
      } else {
        let rv = rz ? rz.items : chk(st, 2);
        if (!rz) { if (!rv.length) rv = chk(st, 1); if (!rv.length) rv = all; rv = shuffle(rv); }
        quizRunner(n, {
          guide: "뜻과 읽기를 종이에 적어본 뒤 보기를 골라 채점하세요. 하나라도 틀리면 체크가 올라갑니다.", items: rv, start,
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
      const items = ordered(chk(st, 2));
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
        left.innerHTML = `<span class="chk-mark">${marks(st, it)}</span><span class="w jp say" title="누르면 발음을 들려줍니다">${esc(it.front)}</span>` + (it.reading ? ` <span class="fu jp">${esc(it.reading)}</span>` : "");
        left.querySelector(".w").onclick = () => speak(it.speak);
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
        st.phase = 5; st.doneAt = st.doneAt || Date.now(); st.run = null; saveTp(); refreshSidebar();
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
      const qs = shuffle(all.filter(it => st.checks[it.id])).map(it => makeQuestion(it, mode, pools)).filter(Boolean);
      if (!qs.length) { alert("체크된 단어가 없어요. 먼저 1단계를 진행하세요."); return hub(); }
      let cur = 0, score = 0, wrongs = [];
      function draw() {
        const q = qs[cur];
        questionCard(host, q, {
          head: `체크 단어 퀴즈 · ${cur + 1} / ${qs.length} · 점수 ${score}`, onBack: hub, backLabel: "← 단계 목록",
          progress: cur / qs.length, tag: marks(st, q.it),
          onAnswer: (ok, picks) => { trackPicks(picks); if (ok) score++; else { wrongs.push(q); st.checks[q.it.id] = Math.min((st.checks[q.it.id] || 1) + 1, 3); srsFromItem(q.it, mode); saveTp(); } },
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
          wrongs.forEach(q => rev.appendChild(el("div", "r inset", `<span class="jp">${esc(q.promptBig)}</span> → <b>${esc(q.it.meaning)}</b> <span class="jp">${esc(q.it.reading)}</span>`)));
          r.appendChild(rev);
        }
        host.appendChild(r);
      }
      draw();
    }

    hub();
  }

  /* ---------- 퀴즈 ---------- */
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

  // 한자 뜻·음 → 漢字読み → 表記 순서로 번갈아 출제
  function buildQuestions(day, count, levels) {
    const d = dayOf(day);
    const cards = d.cards;
    const lvSet = levels && levels.length ? new Set(levels) : null;
    const words = [], seenW = new Set();
    const addWord = w => { const e = WORDS.get(w); if (e && !seenW.has(w)) { seenW.add(w); words.push(e); } };
    cards.forEach(c => c.readings.forEach(r => { if (r.word) addWord(r.word); }));
    // 관련 기출 단어(JLPT)도 퀴즈 대상에 포함 (선택한 레벨만)
    cards.forEach(c => (c.related || []).forEach(rw => { if (!lvSet || lvSet.has(rw.l)) addWord(rw.w); }));
    const qs = [];
    const cardPool = shuffle(cards);
    const wordPool = shuffle(words);
    let ci = 0, wi = 0;
    const fillPool = words.length >= 8 ? words : ALL_WORDS;
    const glossPool = cards.length >= 4 ? cards : DATA.flatMap(x => x.cards);
    const hanjaItems = new Map(tpItems(day, "hanja", null).map(it => [it.id, it]));
    const cardQ = c => {
      const dis = pickDistinct(glossPool, c, x => x.gloss, 3);
      const it = hanjaItems.get(c.id);
      return { section: "한자", type: "뜻·음 고르기", promptBig: c.char, promptSub: "이 한자의 뜻과 음은?", correct: c.gloss, options: shuffle([c.gloss, ...dis.map(x => x.gloss)]), jp: false, reveal: it, speakAns: it && it.speak, hint: koHint(c.char), src: [{ day, char: c.char }] };
    };
    while (qs.length < count && (ci < cardPool.length || wi < wordPool.length)) {
      const type = qs.length % 3;
      if (type === 0 && ci < cardPool.length) qs.push(cardQ(cardPool[ci++]));
      else if (wi < wordPool.length) { const q = jlptQ(wordPool[wi++], type === 1 ? "yomi" : "hyoki", fillPool); q.src = srcFirst(q.src, [day]); qs.push(q); }
      else if (ci < cardPool.length) qs.push(cardQ(cardPool[ci++]));
      else break;
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
      card.appendChild(el("p", "cap", `한자 뜻·음, 漢字読み(단어 읽기), 表記(한자 표기) 문제가 번갈아 출제됩니다. 읽기 오답은 시험처럼 장음·촉음·탁음·요음을 바꾼 함정이고, 표기 오답은 음이 같은 한자로 바꾼 함정입니다. 틀린 단어는 '오늘의 복습'에 들어갑니다. 선택한 레벨 기준 최대 ${maxAvail}문제까지 낼 수 있어요.`));
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
        onAnswer: (ok, picks) => { trackPicks(picks); if (ok) score++; else { wrongs.push(q); if (q.entry) srsWrong(q.entry.w); } },
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
        wrongs.forEach(q => rev.appendChild(el("div", "r inset", `<span class="jp">${esc(q.promptBig)}</span> → <b>${esc(q.correct)}</b> <span class="small-note">(${esc(q.promptSub)})</span>` + srcHtml(q.src))));
        r.appendChild(rev);
      }
      host.appendChild(r);
    }
    setup();
  }

  /* ---------- JLPT 실전: 학습 계획 카드 ---------- */
  const fmtDate = d => `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
  function trapChips(t) {
    const list = Object.entries(t).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    return list.map(([k, v]) => `<span class="badge c1 num">${esc(TRAP_LABEL[k] || k)} ${v}</span>`).join("");
  }
  function planCard() {
    const tgt = targetLevel(), ex = examDate(), dl = daysUntil(ex);
    const card = el("div", "card plan");
    card.appendChild(el("h2", null, `JLPT 시험 준비 <span class="small-note">목표 레벨과 시험일 기준 학습 계획</span>`));

    const set = el("div", "plan-set");
    const seg = el("div", "seg sub");
    ALL_LEVELS.forEach(l => {
      const b = el("button", l === tgt ? "on" : "", l);
      b.onclick = () => { if (l !== tgt) { setTarget(l); go("home"); } };
      seg.appendChild(b);
    });
    const inp = el("input", "date-in num"); inp.type = "date"; inp.value = ex;
    inp.onchange = () => { if (inp.value) { LS.set("hz_exam", inp.value); go("home"); } };
    set.append(el("span", "lv-label", "목표 레벨"), seg, el("span", "lv-label", "시험일"), inp);
    card.appendChild(set);
    card.appendChild(el("p", "cap", `목표 레벨을 바꾸면 토리파·퀴즈 레벨 필터가 ${tgt === "N5" ? "N5" : "N5~목표 레벨"}로 맞춰집니다. 시험일 기본값은 다음 JLPT 시험일(7월·12월 첫째 일요일)입니다.`));

    const lastDay = TARGET_DAYS[tgt];
    const scope = DATA.filter(d => d.day <= lastDay);
    const doneN = scope.filter(d => tpStepsDone(d.day) >= 5).length;
    const remain = scope.filter(d => tpStepsDone(d.day) < 5)
      .sort((a, b) => ((tpFrac(b.day) > 0) - (tpFrac(a.day) > 0)) || a.day - b.day);
    const buffer = dl > 0 ? Math.min(dl, Math.max(7, Math.round(dl * 0.25))) : 0;
    const studyLeft = dl - buffer;
    let perDay = 0, msg;
    if (dl < 0) msg = "시험일이 지났습니다. 다음 시험일을 입력하세요.";
    else if (!remain.length) msg = "학습 범위의 모든 일차를 5단계까지 마쳤습니다. 오늘의 복습과 모의 시험에 집중하세요.";
    else if (studyLeft > 0) {
      perDay = Math.ceil(remain.length / studyLeft);
      const rs = today0(); rs.setDate(rs.getDate() + Math.ceil(remain.length / perDay));
      msg = `하루 ${perDay}일차씩 학습하면 ${fmtDate(rs)}에 학습 범위를 마칩니다. 그 뒤 시험일까지는 복습과 모의 시험 기간입니다.`;
    } else {
      perDay = Math.ceil(remain.length / Math.max(dl, 1));
      msg = `복습 기간입니다. 남은 ${remain.length}개 일차를 하루 ${perDay}일차씩 끝내면서 복습과 모의 시험을 함께 하세요.`;
    }
    const due = srsDue().length, lastMock = mockHist.filter(h => h.lvl === tgt).slice(-1)[0];
    const tiles = el("div", "tiles");
    const tile = (lb, v, lg) => { const t = el("div", "tile"); t.innerHTML = `<div class="lb">${lb}</div><div class="v num">${v}</div>` + (lg ? `<div class="lg">${lg}</div>` : ""); tiles.appendChild(t); };
    tile("시험까지", dl > 0 ? `D-${dl}` : dl === 0 ? "D-day" : "종료", fmtDate(new Date(ex + "T00:00")));
    tile("학습 범위 완료", `${doneN}<small>/ ${scope.length}일차</small>`, `${tgt}: 01~${pad2(lastDay)}일차 (5단계 기준)`);
    tile("하루 목표", perDay ? `${perDay}<small>일차</small>` : "—", "남은 일차 ÷ 남은 학습일");
    tile("오늘의 복습", `${due}<small>개</small>`, `복습 큐 전체 ${Object.keys(srs).length}개`);
    tile("최근 모의 시험", lastMock ? `${Math.round(lastMock.ok / lastMock.n * 100)}<small>%</small>` : "—", lastMock ? `${esc(mockScope(lastMock.scope).short)} · ${lastMock.ok}/${lastMock.n} · ${fmtTime(lastMock.at)}` : `${tgt} 기록 없음`);
    card.appendChild(tiles);

    const todo = el("div", "plan-today inset");
    todo.appendChild(el("div", "pt-msg", esc(msg)));
    const btns = el("div", "pt-btns");
    remain.slice(0, perDay).forEach(d => {
      const b = el("button", "btn sec sm", `${pad2(d.day)}일차 · ${esc(d.category)} <span class="small-note num">${tpStepsDone(d.day)}/7</span>`);
      b.onclick = () => { lastMode = "toripa"; go("day", d.day); };
      btns.appendChild(b);
    });
    const rv = el("button", "btn pri sm", `📝 오늘의 복습 <span class="num">${due}</span>`); rv.onclick = () => go("review");
    const mk = el("button", "btn ghost sm", `⏱ ${tgt} 모의 시험`); mk.onclick = () => go("mock");
    btns.append(rv, mk);
    todo.appendChild(btns);
    card.appendChild(todo);

    const tc = trapChips(traps);
    if (tc) card.appendChild(el("div", "weak", `<span class="lv-label">자주 걸린 함정</span>${tc}`));
    return card;
  }

  /* ---------- JLPT 실전: 공용 세션 · 결과 ---------- */
  function runSession(host, qs, o) {
    let cur = 0, ended = false;
    const res = [];
    const end = () => { if (ended) return; ended = true; o.onFinish(res, qs.slice(res.length)); };
    function draw() {
      const q = qs[cur];
      questionCard(host, q, {
        head: `${o.label} · ${cur + 1} / ${qs.length}`, onBack: o.onBack, backLabel: o.backLabel,
        progress: cur / qs.length,
        onAnswer: (ok, picks) => { res.push({ q, ok, picks }); trackPicks(picks); if (o.onAnswer) o.onAnswer(q, ok); },
        nextLabel: cur < qs.length - 1 ? "다음 ▶" : "결과 보기",
        onNext: () => { cur++; cur < qs.length ? draw() : end(); }
      });
    }
    draw();
    return { end };
  }
  function sessionResult(host, res, rest, o) {
    const all = res.concat(rest.map(q => ({ q, ok: false, picks: [], skipped: true })));
    const ok = all.filter(x => x.ok).length, n = all.length, pct = n ? Math.round(ok / n * 100) : 0;
    const sec = {}, tg = {};
    all.forEach(x => {
      const s = x.q.section || "기타";
      if (!sec[s]) sec[s] = [0, 0];
      sec[s][1]++; if (x.ok) sec[s][0]++;
      x.picks.forEach(p => { if (!p.ok && p.tag) tg[p.tag] = (tg[p.tag] || 0) + 1; });
    });
    host.innerHTML = "";
    const r = el("div", "card result");
    r.appendChild(el("div", "score num", `${ok}/${n}`));
    r.appendChild(el("div", "pct", `${pct}%` + (rest.length ? ` · 시간이 끝나 ${rest.length}문제를 풀지 못했어요` : "")));
    const st = el("div", "sess-stats");
    st.innerHTML = Object.entries(sec).map(([s, [a, b]]) =>
      `<div class="ss"><span class="jp">${esc(s)}</span><b class="num">${a}/${b} · ${Math.round(a / b * 100)}%</b><div class="track${a === b ? " done" : ""}"><i style="width:${Math.round(a / b * 100)}%"></i></div></div>`).join("") +
      (Object.keys(tg).length ? `<div class="weak"><span class="lv-label">이번에 걸린 함정</span>${trapChips(tg)}</div>` : "");
    r.appendChild(st);
    if (o.note) r.appendChild(el("p", "cap", esc(o.note)));
    const btns = el("div", "result-btns");
    o.buttons.forEach(([label, cls, fn]) => { const b = el("button", "btn " + cls, label); b.onclick = fn; btns.appendChild(b); });
    r.appendChild(btns);
    const wrong = all.filter(x => !x.ok);
    if (wrong.length) {
      const rev = el("div", "review");
      rev.appendChild(el("h3", null, `틀린 문제 ${wrong.length}개 · 복습 큐에 넣었어요`));
      // 단원별 오답 수: 단어가 처음 나오는 일차 기준
      const byDay = {};
      wrong.forEach(x => { const s = x.q.src && x.q.src[0]; if (s) byDay[s.day] = (byDay[s.day] || 0) + 1; });
      const days = Object.entries(byDay).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
      if (days.length) rev.appendChild(el("div", "unit-sum", `<span class="lv-label">단원별 오답</span>` +
        days.map(([d, n]) => `<button type="button" class="src-chip" data-goday="${d}" title="${pad2(+d)}일차로 이동"><b class="num">${pad2(+d)}일차</b> ${esc(dayOf(+d).category)} <span class="badge c3 num">${n}</span></button>`).join("")));
      wrong.forEach(x => rev.appendChild(el("div", "r inset",
        `<span class="jp">${esc(x.q.promptBig)}</span> → <b class="jp">${esc(x.q.correct)}</b> <span class="small-note">${esc(x.q.entry ? x.q.entry.m : "")}${x.skipped ? " · 못 푼 문제" : ""}</span>` + srcHtml(x.q.src))));
      r.appendChild(rev);
    }
    host.appendChild(r);
    return { ok, n, sec };
  }

  /* ---------- JLPT 실전: 오늘의 복습 (SRS) ---------- */
  function renderReview() {
    setTitle("오늘의 복습");
    app.innerHTML = "";
    const host = el("div", "host");
    app.appendChild(host);
    const due = srsDue(), total = Object.keys(srs).length;
    if (!due.length) {
      const c = el("div", "card");
      c.appendChild(el("h2", null, "오늘의 복습"));
      const next = Object.values(srs).map(e => e.due).filter(t => t > Date.now()).sort((a, b) => a - b)[0];
      c.appendChild(el("p", "cap", total
        ? `지금 복습할 단어가 없습니다. 복습 큐에 단어 ${total}개가 있고, 다음 복습은 ${fmtTime(next)}입니다.`
        : "복습 큐가 비어 있습니다. 토리파·퀴즈·모의 시험에서 틀린 단어가 자동으로 들어옵니다."));
      const b = el("button", "btn ghost", "개요"); b.onclick = () => go("home");
      c.appendChild(b); host.appendChild(c);
      return;
    }
    const onlyYomi = targetLevel() === "N1";
    const items = shuffle(due).slice(0, 30);
    const qs = items.map(w => jlptQ(WORDS.get(w), onlyYomi || Math.random() < 0.5 ? "yomi" : "hyoki", ALL_WORDS));
    runSession(host, qs, {
      label: "복습", onBack: () => go("home"), backLabel: "← 개요",
      onAnswer: (q, ok) => { if (ok) srsRight(q.entry.w); else srsWrong(q.entry.w); refreshSidebar(); },
      onFinish: (res, rest) => sessionResult(host, res, rest, {
        note: "맞힌 단어는 다음 복습까지 간격이 늘어납니다(1일 → 3일 → 7일 → 14일 → 30일). 틀린 단어는 10분 뒤에 다시 나옵니다.",
        buttons: [[srsDue().length ? `남은 복습 계속 (${srsDue().length})` : "복습 화면", "pri", () => go("review")], ["개요", "ghost", () => go("home")]]
      })
    });
  }

  /* ---------- JLPT 실전: 모의 시험 (문자 영역) ---------- */
  // 대문별 대략적 문항 수 (N1은 表記 대문이 없음)
  const MOCK_SPEC = { N5: { yomi: 7, hyoki: 5 }, N4: { yomi: 7, hyoki: 5 }, N3: { yomi: 8, hyoki: 6 }, N2: { yomi: 5, hyoki: 5 }, N1: { yomi: 6, hyoki: 0 } };
  const SEC_PER_Q = 40;
  // 출제 범위: "all"(목표 레벨 전체) | "m1"~"m3"(마당) | "d1"~"d30"(일차)
  function mockScope(key) {
    const m = /^m([1-3])$/.exec(key || ""), d = /^d(\d+)$/.exec(key || "");
    if (m) { const [a, b, name] = MANDANG[+m[1] - 1]; return { key, label: `${name} (${pad2(a)}~${pad2(b)}일차)`, short: name, days: DATA.filter(x => x.day >= a && x.day <= b).map(x => x.day) }; }
    if (d && dayOf(+d[1])) return { key, label: `${pad2(+d[1])}일차 · ${dayOf(+d[1]).category}`, short: `${pad2(+d[1])}일차`, days: [+d[1]] };
    return { key: "all", label: "목표 레벨 전체", short: "전체", days: null };
  }
  // 범위 안 단어: 목표 레벨 이하(예시 단어는 레벨 없음 → 포함)를 먼저, 모자라면 범위 안 나머지 단어
  function scopePool(sc, tgt, need) {
    if (!sc.days) {
      const pool = ALL_WORDS.filter(e => e.l === tgt);
      const ti = ALL_LEVELS.indexOf(tgt);
      const lower = ALL_WORDS.filter(e => e.l && ALL_LEVELS.indexOf(e.l) < ti);
      const picked = shuffle(pool).slice(0, need);
      if (picked.length < need) picked.push(...shuffle(lower).slice(0, need - picked.length));
      return { picked, fill: pool.length >= 8 ? pool : ALL_WORDS };
    }
    const lv = new Set(levelsUpTo(tgt));
    const inScope = [...new Set(sc.days.flatMap(d => [...(DAY_WORDS.get(d) || [])]))].map(w => WORDS.get(w));
    const main = inScope.filter(e => !e.l || lv.has(e.l)), rest = inScope.filter(e => e.l && !lv.has(e.l));
    const picked = shuffle(main).slice(0, need);
    if (picked.length < need) picked.push(...shuffle(rest).slice(0, need - picked.length));
    return { picked, fill: inScope.length >= 8 ? inScope : ALL_WORDS };
  }
  function renderMock(arg) {
    const tgt = targetLevel(), spec = MOCK_SPEC[tgt];
    const sc = mockScope(arg || LS.get("hz_mock_scope", "all"));
    const title = `모의 시험 · ${tgt} · ${sc.short}`;
    setTitle(title);
    app.innerHTML = "";
    const host = el("div", "host");
    app.appendChild(host);

    function setup() {
      setTitle(title);
      host.innerHTML = "";
      const c = el("div", "card");
      c.appendChild(el("h2", null, `문자 영역 모의 시험 <span class="small-note">목표 레벨 ${tgt} · 개요에서 변경</span>`));
      const row = el("div", "plan-set");
      const selEl = el("select", "date-in");
      const opt = (v, t) => { const o = el("option", null, esc(t)); o.value = v; if (v === sc.key) o.selected = true; return o; };
      selEl.appendChild(opt("all", `목표 레벨 전체 (${tgt} 기출 단어)`));
      const g1 = el("optgroup"); g1.label = "마당별";
      MANDANG.forEach((m, i) => g1.appendChild(opt("m" + (i + 1), `${m[2]} · ${pad2(m[0])}~${pad2(m[1])}일차 · ${m[3]}`)));
      const g2 = el("optgroup"); g2.label = "일차별";
      DATA.forEach(d => g2.appendChild(opt("d" + d.day, `${pad2(d.day)}일차 · ${d.category}`)));
      selEl.append(g1, g2);
      selEl.onchange = () => { LS.set("hz_mock_scope", selEl.value); renderMock(selEl.value); };
      row.append(el("span", "lv-label", "출제 범위"), selEl);
      c.appendChild(row);
      c.appendChild(el("p", "cap",
        `실제 시험처럼 漢字読み ${spec.yomi}문제${spec.hyoki ? `, 表記 ${spec.hyoki}문제` : ""} 순서로 출제합니다. ` +
        (sc.days ? `선택한 범위의 단어 중 N5~${tgt} 단어를 먼저 쓰고, ` : `${tgt} 기출 단어를 먼저 쓰고, `) +
        `문제당 ${SEC_PER_Q}초로 시간을 잽니다. ` +
        (tgt === "N1" ? "N1은 表記 대문이 없어 漢字読み만 출제합니다. " : "") +
        "틀린 문제에는 그 단어가 나오는 단원을 표시합니다. 문항 수는 대략적인 기준입니다. 文脈規定·言い換え類義·用法 대문은 예문 데이터가 없어 다루지 않습니다."));
      c.appendChild(el("div", "setup-q", "몇 회분을 풀까요?"));
      const pick = el("div", "count-pick");
      [1, 2, 3].forEach(m => {
        const n = (spec.yomi + spec.hyoki) * m;
        const b = el("button", "btn sec", `${m}회분 <span class="small-note num">${n}문제 · ${Math.round(n * SEC_PER_Q / 60)}분</span>`);
        b.onclick = () => start(m);
        pick.appendChild(b);
      });
      c.appendChild(pick);
      const hist = mockHist.filter(h => h.lvl === tgt && (h.scope || "all") === sc.key).slice(-5).reverse();
      if (hist.length) {
        const hl = el("div", "review");
        hl.appendChild(el("h3", null, `최근 기록 · ${esc(sc.label)}`));
        hist.forEach(h => hl.appendChild(el("div", "r inset num",
          `${fmtTime(h.at)} · <b>${h.ok}/${h.n} (${Math.round(h.ok / h.n * 100)}%)</b> <span class="small-note jp">` +
          Object.entries(h.sec || {}).map(([s, [a, b]]) => `${esc(s)} ${a}/${b}`).join(" · ") + "</span>")));
        c.appendChild(hl);
      }
      host.appendChild(c);
    }

    function start(mult) {
      const need = (spec.yomi + spec.hyoki) * mult;
      const { picked, fill } = scopePool(sc, tgt, need);
      // 단어가 모자라면 漢字読み·表記 비율을 유지하며 줄인다
      const ny = Math.round(picked.length * spec.yomi / (spec.yomi + spec.hyoki));
      const qs = picked.map((e, i) => jlptQ(e, i < ny ? "yomi" : "hyoki", fill));
      if (!qs.length) { alert("이 범위에는 출제할 단어가 없습니다."); return; }
      if (sc.days) qs.forEach(q => { q.src = srcFirst(q.src, sc.days); });

      let left = qs.length * SEC_PER_Q, sess = null;
      const badge = el("span", "badge timer num");
      const paint = () => { badge.textContent = `⏱ ${Math.floor(left / 60)}:${pad2(left % 60)}`; badge.classList.toggle("low", left <= 30); };
      paint();
      setTitle(title, badge);
      const tid = setInterval(() => { left--; paint(); if (left <= 0) { stop(); if (sess) sess.end(); } }, 1000);
      const stop = () => { clearInterval(tid); stopTimer = null; };
      stopTimer = stop;
      sess = runSession(host, qs, {
        label: "모의 시험", backLabel: "← 그만두기",
        onBack: () => { if (confirm("시험을 그만두고 설정 화면으로 돌아갈까요? 기록은 남지 않습니다.")) { stop(); setup(); } },
        onAnswer: (q, ok) => { if (!ok) srsWrong(q.entry.w); },
        onFinish: (res, rest) => {
          stop();
          setTitle(title, el("span", "badge timer num", `소요 ${Math.floor((qs.length * SEC_PER_Q - left) / 60)}:${pad2((qs.length * SEC_PER_Q - left) % 60)}`));
          rest.forEach(q => srsWrong(q.entry.w));
          const s = sessionResult(host, res, rest, {
            note: "틀린 단어와 못 푼 단어는 '오늘의 복습'에 들어갔습니다. 정답 뒤에 나오는 한국 한자음 규칙으로 장음·촉음 함정을 확인하세요.",
            buttons: [["다시 응시", "pri", () => start(mult)], ["설정", "sec", setup], ["개요", "ghost", () => go("home")]]
          });
          mockHist.push({ at: Date.now(), lvl: tgt, scope: sc.key, ok: s.ok, n: s.n, sec: s.sec });
          if (mockHist.length > 60) mockHist.splice(0, mockHist.length - 60);
          LS.set("hz_mock", mockHist);
          refreshSidebar();
        }
      });
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
  // 출처 단원 칩: 누르면 그 일차의 토리파 화면으로 이동 (모의 시험 중이면 확인)
  app.addEventListener("click", e => {
    const t = e.target.closest("[data-goday]");
    if (!t) return;
    if (stopTimer && !confirm("모의 시험이 진행 중입니다. 시험을 그만두고 이 단원으로 이동할까요?")) return;
    lastMode = "toripa";
    go("day", +t.dataset.goday);
  });
  renderSidebar();
  go("home");
})();
