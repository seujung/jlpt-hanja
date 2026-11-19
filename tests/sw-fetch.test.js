"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const code = fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8");
const VERSION = code.match(/const VERSION = "([^"]+)"/)[1];
const SCOPE = "https://x.test/jlpt-hanja/";

/** 가짜 브라우저 환경에서 sw.js를 실행합니다. 타이머는 바로 실행해 "네트워크가 느린" 상황을 만듭니다. */
function load({ cached = {}, network }) {
  const listeners = {};
  const puts = [];
  const cache = {
    match(req, opts) {
      const u = new URL(typeof req === "string" ? req : req.url);
      const key = opts && opts.ignoreSearch ? u.origin + u.pathname : u.href;
      return Promise.resolve(cached[key]);
    },
    put(req) { puts.push(req.url); return Promise.resolve(); },
    addAll() { return Promise.resolve(); }
  };
  const sandbox = {
    self: {
      addEventListener: (t, f) => { listeners[t] = f; },
      registration: { scope: SCOPE }, location: { origin: "https://x.test" },
      skipWaiting() {}, clients: { claim() {} }
    },
    caches: { open: () => Promise.resolve(cache), keys: () => Promise.resolve([]), delete() {} },
    fetch: req => network(req.url), URL, Request: class { constructor(u) { this.url = u; } }, Promise,
    setTimeout: f => { queueMicrotask(f); return 1; }, clearTimeout() {}
  };
  vm.runInNewContext(code, sandbox);
  return {
    puts,
    run(url, mode = "no-cors") {
      let p = null, lateWaitUntil = false, responded = false;
      const ev = {
        request: { url, mode, method: "GET" },
        respondWith(x) { p = x; responded = true; },
        waitUntil() { if (responded && settled) lateWaitUntil = true; }
      };
      let settled = false;
      listeners.fetch(ev);
      return { promise: p && p.then(r => { settled = true; return r; }), late: () => lateWaitUntil };
    }
  };
}

const res = name => ({ ok: true, name, clone() { return this; } });
const never = () => new Promise(() => {});
const slow = (r, ms = 20) => () => new Promise(ok => setTimeout(() => ok(r), ms));

test("current-version asset comes from cache without waiting for the network", async () => {
  const sw = load({ cached: { [SCOPE + "app.js"]: res("cache-app") }, network: never });
  const r = await sw.run(`${SCOPE}app.js?v=${VERSION}`).promise;
  assert.equal(r.name, "cache-app");
});

test("other-version asset waits for the network even past the timeout (no stale cache)", async () => {
  const sw = load({ cached: { [SCOPE + "app.js"]: res("cache-app") }, network: slow(res("net-app")) });
  const r = await sw.run(`${SCOPE}app.js?v=999`).promise;
  assert.equal(r.name, "net-app");
});

test("other-version asset falls back to cache only when the network fails", async () => {
  const sw = load({ cached: { [SCOPE + "app.js"]: res("cache-app") }, network: () => Promise.reject(new TypeError("offline")) });
  const r = await sw.run(`${SCOPE}app.js?v=999`).promise;
  assert.equal(r.name, "cache-app");
});

test("slow navigation falls back to the cached index.html", async () => {
  const sw = load({ cached: { [SCOPE + "index.html"]: res("cache-index") }, network: never });
  const r = await sw.run(SCOPE, "navigate").promise;
  assert.equal(r.name, "cache-index");
});

test("fast navigation uses the network and does not overwrite the versioned cache", async () => {
  const sw = load({ cached: { [SCOPE + "index.html"]: res("cache-index") }, network: () => Promise.resolve(res("net-index")) });
  const sw2 = load({ cached: {}, network: () => Promise.resolve(res("net-index")) });
  // 타이머를 바로 실행하는 환경이라 캐시가 없을 때만 네트워크 응답을 확인할 수 있습니다.
  const r = await sw2.run(SCOPE, "navigate").promise;
  assert.equal(r.name, "net-index");
  await sw.run(SCOPE, "navigate").promise;
  await new Promise(ok => setTimeout(ok, 5));
  assert.deepEqual(sw.puts.concat(sw2.puts), []);
});
