/* WebKit 스모크 테스트: node tests/e2e/today.e2e.cjs
 * 저장소 루트를 /jlpt-hanja/ 아래에 띄우고, 시나리오마다 새 브라우저 컨텍스트에서 localStorage를 채워 확인합니다. */
"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { webkit } = require("playwright");

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

  async function open(storage) {
    const ctx = await browser.newContext({ serviceWorkers: "block" });
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
    fs.writeFileSync(f, JSON.stringify({ app: "jlpt-hanja", version: 5, quiz: {}, toripa: { "2:hanja": tp({ "0100": 1 }) } }));
    await page.setInputFiles("#impFile", f);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("hz_toripa"))["2:hanja"]);
    await page.reload(); await page.waitForSelector("#dayNav button");
    assert(!(await ls("hz_srs"))["h:0100"], "import must not re-run migration");
    assert((await ls("hz_srs_migrated")) === 1, "flag kept");
    assert(!errors.length, errors.join("; "));
    await ctx.close();
  });

  // 오늘 학습 시나리오(E~H)는 아래 TODAY 블록에 둡니다.
  if (typeof module.exports.today === "function") await module.exports.today({ open, scenario, assert, ymd, DAY });

  await browser.close();
  server.close();
  if (failures.length) { console.log("failed:", failures.join(", ")); process.exit(1); }
  console.log("all ok");
}

module.exports = {};
main().catch(e => { console.error(e); process.exit(1); });
