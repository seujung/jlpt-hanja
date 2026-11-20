"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const exists = f => fs.existsSync(path.join(ROOT, f.split("?")[0]));

function pngSize(file) {
  const b = fs.readFileSync(path.join(ROOT, file));
  assert.equal(b.toString("hex", 0, 8), "89504e470d0a1a0a", `${file} is PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test("manifest is standalone with relative scope and existing icons", () => {
  const m = JSON.parse(read("manifest.webmanifest"));
  assert.equal(m.display, "standalone");
  assert.equal(m.start_url, "./");
  assert.equal(m.scope, "./");
  assert.ok(m.name && m.short_name);
  const sizes = m.icons.map(i => i.sizes);
  assert.ok(sizes.includes("192x192") && sizes.includes("512x512"));
  for (const icon of m.icons) {
    assert.ok(!icon.src.startsWith("/"), "icon path is relative");
    const [w, h] = pngSize(icon.src);
    assert.equal(`${w}x${h}`, icon.sizes);
  }
});

test("index.html has home-screen meta tags and links", () => {
  const html = read("index.html");
  for (const re of [
    /<link rel="manifest" href="manifest\.webmanifest">/,
    /<meta name="apple-mobile-web-app-capable" content="yes">/,
    /<meta name="mobile-web-app-capable" content="yes">/,
    /<meta name="apple-mobile-web-app-title" content="[^"]+">/,
    /<meta name="theme-color"/,
    /viewport-fit=cover/,
    /<link rel="apple-touch-icon" sizes="180x180" href="icons\/icon-180\.png">/
  ]) assert.match(html, re);
  assert.deepEqual(pngSize("icons/icon-180.png"), [180, 180]);
  const pf = html.indexOf("progress-file.js"), app = html.indexOf('src="app.js');
  assert.ok(pf > 0 && pf < app, "progress-file.js loads before app.js");
});

test("sw.js is a classic script and precaches files that exist", () => {
  const code = read("sw.js");
  assert.doesNotMatch(code, /^\s*(import|export)\s/m);
  new vm.Script(code, { filename: "sw.js" }); // syntax check
  const listeners = {};
  const sandbox = {
    self: { addEventListener: (t, f) => { listeners[t] = f; }, registration: { scope: "https://x.test/jlpt-hanja/" }, location: { origin: "https://x.test" } },
    caches: {}, fetch() {}, URL, Request: class {}, Promise, setTimeout, clearTimeout
  };
  const list = vm.runInNewContext(code + "\n;PRECACHE", sandbox);
  for (const t of ["install", "activate", "fetch"]) assert.equal(typeof listeners[t], "function", t);
  for (const f of ["./", "index.html", "app.js", "progress-file.js", "srs-core.js", "styles.css", "data/hanja.js", "manifest.webmanifest"]) {
    assert.ok(list.includes(f), `precache has ${f}`);
  }
  for (const f of list) if (f !== "./") assert.ok(exists(f), `${f} exists`);
});

test("index.html script/style versions match sw.js VERSION", () => {
  const html = read("index.html");
  const code = read("sw.js");
  const v = code.match(/const VERSION = "([^"]+)"/)[1];
  const qs = [...html.matchAll(/\?v=(\d+)/g)].map(m => m[1]);
  assert.ok(qs.length >= 4);
  assert.ok(qs.every(q => q === v), `all ?v= equal ${v}`);
});

test("app.js registers the service worker", () => {
  assert.match(read("app.js"), /navigator\.serviceWorker\.register\("sw\.js"/);
});
