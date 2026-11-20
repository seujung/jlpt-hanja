/* WebKit 스모크 테스트: node tests/e2e/today.e2e.cjs
 * 저장소 루트를 /jlpt-hanja/ 아래에 띄우고, 시나리오마다 새 브라우저 컨텍스트에서 localStorage를 채워 확인합니다. */
"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { webkit, devices } = require("playwright");

const ROOT = path.join(__dirname, "..", "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json" };

function serve() {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (!u.pathname.startsWith("/jlpt-hanja/")) { res.writeHead(404); return res.end(); }
    let rel = decodeURIComponent(u.pathname.slice("/jlpt-hanja/".length)) || "index.html";
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(ok => server.listen(0, "127.0.0.1", () => ok(server)));
}

const DAY = 86400000;
const ymd = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const tp = checks => ({ checks, phase: 1, doneAt: null, rev6At: null, rev3At: null, run: null });
const ALL = ["N5", "N4", "N3", "N2", "N1"];

function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function main() {
  const server = await serve();
  const BASE = `http://127.0.0.1:${server.address().port}/jlpt-hanja/`;
  const browser = await webkit.launch();
  const failures = [];

  async function open(storage, ctxOpts) {
    const ctx = await browser.newContext({ serviceWorkers: "block", ...(ctxOpts || {}) });
    await ctx.addInitScript(s => {
      if (sessionStorage.getItem("__seeded")) return;
      sessionStorage.setItem("__seeded", "1");
      localStorage.clear();
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v));
    }, storage);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("dialog", d => d.accept());
    await page.goto(BASE);
    await page.waitForSelector("#dayNav button");
    const ls = k => page.evaluate(k => JSON.parse(localStorage.getItem(k)), k);
    return { ctx, page, errors, ls };
  }
  async function scenario(name, fn) {
    try { await fn(); console.log(`${name} ok`); }
    catch (e) { failures.push(name); console.log(`${name} FAIL: ${e.message}`); }
  }

  await scenario("A", async () => {
    const { ctx, page, errors, ls } = await open({ hz_toripa: { "1:hanja": tp({ "0001": 1 }) }, hz_toripa_levels: ALL });
    const srs = await ls("hz_srs");
    assert(srs && srs["h:0001"] && srs["h:0001"].b === 2, "h:0001 should be box 2: " + JSON.stringify(srs && srs["h:0001"]));
    assert(srs["h:0002"] && srs["h:0002"].b === 4, "h:0002 should be box 4");
    assert((await ls("hz_srs_migrated")) === 1, "migrated flag");
    const n = Object.keys(srs).length;
    await page.reload(); await page.waitForSelector("#dayNav button");
    assert(Object.keys(await ls("hz_srs")).length === n, "reload must not change queue size");
    assert(!errors.length, errors.join("; "));
    await ctx.close();
  });

  const bad = { hz_srs: { "없는단어": { b: 1, due: 0, n: 1 }, "h:9999": { b: 1, due: 0, n: 1 }, "h:0001": { b: 3, due: 0, n: 1 } }, hz_srs_migrated: 1 };

  await scenario("B", async () => {
    const { ctx, page, errors } = await open(bad);
    await page.click('[data-view="review"]');
    await page.waitForSelector(".card.q");
    const head = await page.textContent(".qpos");
    assert(/1 \/ 1/.test(head), "header should be 1 / 1: " + head);
    assert(!errors.length, errors.join("; "));
    await ctx.close();
  });

  await scenario("C", async () => {
    const { ctx, page, errors, ls } = await open(bad);
    await page.click('[data-view="review"]');
    await page.click(".opt.idk");
    assert(await page.isVisible(".reveal"), "reveal visible");
    const e = (await ls("hz_srs"))["h:0001"];
    assert(e.b === 1 && e.n === 2, "h:0001 should drop to box 1 with n=2: " + JSON.stringify(e));
    const traps = await ls("hz_traps");
    assert(!traps || !Object.keys(traps).length, "traps must stay empty: " + JSON.stringify(traps));
    assert(!errors.length, errors.join("; "));
    await ctx.close();
  });

  await scenario("D", async () => {
    const { ctx, page, errors, ls } = await open({ hz_toripa: { "1:hanja": tp({ "0001": 1 }) }, hz_toripa_levels: ALL });
    assert((await ls("hz_srs_migrated")) === 1, "migrated first");
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jlpt-e2e-")), "p.json");
    // 옮기기 이후에 저장한 파일(srs에 h: 키가 있음)은 다시 옮기지 않는다
    fs.writeFileSync(f, JSON.stringify({ app: "jlpt-hanja", version: 5, quiz: {}, srs: { "h:0003": { b: 3, due: 0, n: 0 } }, toripa: { "2:hanja": tp({ "0100": 1 }) } }));
    await page.setInputFiles("#impFile", f);
    await page.waitForFunction(() => (JSON.parse(localStorage.getItem("hz_toripa")) || {})["2:hanja"]);
    await page.reload(); await page.waitForSelector("#dayNav button");
    assert(!(await ls("hz_srs"))["h:0100"], "import must not re-run migration");
    assert((await ls("hz_srs_migrated")) === 1, "flag kept");
    assert(!errors.length, errors.join("; "));
    await ctx.close();
  });

  await scenario("I", async () => {
    // 홈 화면 앱 첫 실행(빈 진도로 옮기기 완료) 뒤에 옮기기 이전 진도 파일을 불러오는 경우
    const { ctx, page, errors, ls } = await open({});
    assert((await ls("hz_srs_migrated")) === 1, "migrated on empty state");
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jlpt-e2e-")), "old.json");
    fs.writeFileSync(f, JSON.stringify({ app: "jlpt-hanja", version: 5, quiz: {}, toripaLevels: ALL, srs: { "国際": { b: 3, due: 0, n: 0 } }, toripa: { "2:hanja": tp({ "0100": 1 }) } }));
    await page.setInputFiles("#impFile", f);
    await page.waitForFunction(() => (JSON.parse(localStorage.getItem("hz_toripa")) || {})["2:hanja"]);
    const srs = await ls("hz_srs");
    assert(srs["h:0100"] && srs["h:0100"].b === 2, "checked item from old file migrated: " + JSON.stringify(srs["h:0100"]));
    assert(srs["h:0063"] && srs["h:0063"].b === 4, "tested item from old file → box 4");
    assert(srs["国際"].b === 3, "file srs merged");
    assert(!errors.length, errors.join("; "));
    await ctx.close();
  });

  await scenario("J", async () => {
    // iPhone: 뜻·읽기 두 문항이 좌우로 나란히, 화면 안에 함께 보인다
    const { ctx, page, errors } = await open({ hz_srs_migrated: 1, hz_srs: { "h:0001": { b: 3, due: 0, n: 0 } }, hz_new_today: { day: ymd(Date.now()), n: 999 } }, devices["iPhone 14"]);
    await page.click('[data-view="today"]');
    await page.waitForSelector(".card.q .qpart + .qpart");
    const r = await page.evaluate(() => {
      const [a, b] = [...document.querySelectorAll(".card.q .qpart")].map(x => x.getBoundingClientRect());
      return { aTop: a.top, bTop: b.top, aRight: a.right, bLeft: b.left, bottom: Math.max(a.bottom, b.bottom), vh: innerHeight, sw: document.documentElement.scrollWidth, vw: innerWidth };
    });
    assert(Math.abs(r.aTop - r.bTop) < 2 && r.aRight <= r.bLeft + 1, "parts side by side: " + JSON.stringify(r));
    assert(r.aTop >= 0 && r.bottom <= r.vh, "both parts inside viewport: " + JSON.stringify(r));
    assert(r.sw <= r.vw, "no horizontal scroll");
    assert(!errors.length, errors.join("; "));
    await ctx.close();
  });

  await scenario("K", async () => {
    // iPhone: 설정은 접혀 있고, 문제 카드가 스크롤 없이 화면 위쪽에 보인다
    const { ctx, page, errors, ls } = await open({ hz_srs_migrated: 1, hz_srs: { "h:0001": { b: 3, due: 0, n: 0 } }, hz_new_today: { day: ymd(Date.now()), n: 999 } }, devices["iPhone 14"]);
    assert(await page.isVisible("#setToggle"), "settings toggle visible");
    assert(!(await page.isVisible("#capInput")) && !(await page.isVisible("#expBtn")), "settings collapsed by default");
    assert(await page.evaluate(() => document.getElementById("setToggle").classList.contains("warn")), "toggle warns when never saved");
    await page.click("#setToggle");
    assert(await page.isVisible("#capInput") && await page.isVisible("#expBtn"), "settings open after tap");
    await page.click("#setToggle");
    assert(!(await page.isVisible("#capInput")), "settings close again");
    await page.click('[data-view="today"]');
    await page.waitForSelector(".card.q");
    const top = await page.evaluate(() => document.querySelector(".qwrap").getBoundingClientRect().top + scrollY);
    assert(top < 320, "question starts near page top without scrolling: " + top);
    assert(!errors.length, errors.join("; "));
    await ctx.close();
  });

  await scenario("L", async () => {
    // 넓은 화면(iPad 가로·데스크톱)은 설정을 접지 않는다
    const { ctx, page, errors } = await open({ hz_srs_migrated: 1 }, { viewport: { width: 1180, height: 820 } });
    assert(!(await page.isVisible("#setToggle")), "no toggle on wide screen");
    assert(await page.isVisible("#capInput"), "settings visible on wide screen");
    assert(!errors.length, errors.join("; "));
    await ctx.close();
  });

  await scenario("M", async () => {
    // 읽기 보기는 "훈독 …" / "음독 …" 두 줄로 나뉘고, 정답 판정·표시는 그대로 동작한다
    const { ctx, page, errors, ls } = await open({ hz_srs_migrated: 1, hz_srs: { "h:0001": { b: 3, due: 0, n: 0 } }, hz_new_today: { day: ymd(Date.now()), n: 999 } }, devices["iPhone 14"]);
    await page.click('[data-view="today"]');
    await page.waitForSelector(".card.q .qpart + .qpart");
    const lines = await page.evaluate(() => [...document.querySelectorAll(".qpart + .qpart .opt:not(.idk)")].map(b => b.querySelectorAll(".rl").length));
    assert(lines.some(n => n === 2), "reading options split into two lines: " + JSON.stringify(lines));
    await page.locator('.opt[data-v="한 일"]').click();
    await page.locator('.opt[data-v="훈독 ひと · 음독 いち"]').click();
    assert(await page.evaluate(() => document.querySelector('.opt[data-v="훈독 ひと · 음독 いち"]').classList.contains("correct")), "correct reading highlighted");
    assert((await ls("hz_srs"))["h:0001"].b === 4, "answer judged correct → box 4");
    assert(!errors.length, errors.join("; "));
    await ctx.close();
  });

  const now = Date.now();
  const idkNext = async page => { await page.click(".qpart:not(.answered) .opt.idk"); await page.click(".qfoot .btn.pri"); };

  await scenario("E", async () => {
    const { ctx, page, errors, ls } = await open({ hz_target: "N5", hz_exam: ymd(now + 30 * DAY), hz_srs_migrated: 1 });
    await page.click('[data-view="today"]');
    await page.waitForSelector(".card.q");
    assert(/1 \/ 20/.test(await page.textContent(".qpos")), "header 1 / 20: " + await page.textContent(".qpos"));
    await page.click(".opt.idk");
    assert(await page.isVisible(".reveal .spk"), "learning card with speaker");
    const srs = await ls("hz_srs");
    const keys = Object.keys(srs || {});
    assert(keys.length === 1 && srs[keys[0]].b === 1, "one new key in box 1: " + JSON.stringify(srs));
    assert((await ls("hz_new_today")).n === 1, "new_today n = 1");
    assert(!errors.length, errors.join("; "));
    await ctx.close();
  });

  await scenario("F", async () => {
    const srs = {};
    for (let i = 1; i <= 151; i++) srs["h:" + String(i).padStart(4, "0")] = { b: 2, due: 0, n: 0 };
    const { ctx, page, errors, ls } = await open({ hz_target: "N5", hz_exam: ymd(now + 30 * DAY), hz_srs: srs, hz_srs_migrated: 1 });
    assert(/오늘 새 항목\s*0/.test(await page.textContent("#app")), "home shows 0 new");
    await page.click('[data-view="today"]');
    await page.waitForSelector(".card.q");
    assert(/1 \/ 20/.test(await page.textContent(".qpos")), "header 1 / 20");
    for (let i = 0; i < 20; i++) await idkNext(page);
    assert(Object.keys(await ls("hz_srs")).length === 151, "no new keys added");
    const nt = await ls("hz_new_today");
    assert(!nt || !nt.n, "no new items introduced");
    assert(!errors.length, errors.join("; "));
    await ctx.close();
  });

  await scenario("G", async () => {
    const { ctx, page, errors, ls } = await open({ hz_target: "N2", hz_exam: ymd(now + 20 * DAY), hz_srs_migrated: 1 });
    assert((await page.textContent("#app")).includes("이 속도로는 시험일까지 범위를 다 보지 못합니다"), "over-cap warning");
    await page.fill("#capInput", "100");
    await page.dispatchEvent("#capInput", "change");
    assert((await ls("hz_new_cap")) === 100, "cap saved");
    assert(!errors.length, errors.join("; "));
    await ctx.close();
  });

  await scenario("H", async () => {
    const { ctx, page, errors, ls } = await open({
      hz_target: "N5", hz_exam: ymd(now + 30 * DAY), hz_srs_migrated: 1,
      hz_srs: { "h:0001": { b: 3, due: 0, n: 0 }, "h:0002": { b: 3, due: 0, n: 0 } },
      hz_new_today: { day: ymd(now), n: 999 }
    });
    await page.click('[data-view="today"]');
    await page.waitForSelector(".card.q");
    assert(/1 \/ 2/.test(await page.textContent(".qpos")), "two review questions");
    await idkNext(page); await idkNext(page);
    await page.waitForSelector(".card.q");
    assert(/재출제/.test(await page.textContent(".qpos")), "repeat header");
    const ANS = { "一": ["한 일", "훈독 ひと · 음독 いち"], "二": ["두 이", "훈독 ふた · 음독 に"] };
    for (let i = 0; i < 2; i++) {
      const ch = (await page.textContent(".card.q .big")).trim();
      for (const a of ANS[ch]) await page.locator(`.opt[data-v="${a}"]`).click();
      await page.click(".qfoot .btn.pri");
    }
    const srs = await ls("hz_srs");
    assert(srs["h:0001"].b === 2 && srs["h:0002"].b === 2, "repeat right → box 2: " + JSON.stringify(srs));
    assert(srs["h:0001"].n === 1, "n counted once");
    assert(!errors.length, errors.join("; "));
    await ctx.close();
  });

  await browser.close();
  server.close();
  if (failures.length) { console.log("failed:", failures.join(", ")); process.exit(1); }
  console.log("all ok");
}

module.exports = {};
main().catch(e => { console.error(e); process.exit(1); });
