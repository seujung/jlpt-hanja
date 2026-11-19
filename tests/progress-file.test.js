"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const PF = require("../progress-file.js");

const DAY = 86400000;

test("fileName uses local date YYYYMMDD", () => {
  assert.equal(PF.fileName(new Date(2026, 10, 5, 23, 59)), "jlpt-hanja-progress-20261105.json");
});

function fakeDoc() {
  const clicks = [];
  const body = { appended: [], appendChild(n) { this.appended.push(n); } };
  return {
    clicks, body,
    createElement(tag) {
      return { tag, href: "", download: "", click() { clicks.push(this); }, remove() {} };
    }
  };
}

test("saveFile shares a JSON File when canShare accepts files", async () => {
  let shared = null;
  const nav = { canShare: d => Array.isArray(d.files), share: async d => { shared = d; } };
  const r = await PF.saveFile({ fileName: "a.json", json: "{\"x\":1}" }, nav, fakeDoc());
  assert.equal(r, "shared");
  assert.equal(shared.files.length, 1);
  assert.equal(shared.files[0].name, "a.json");
  assert.equal(shared.files[0].type, "application/json");
  assert.equal(await shared.files[0].text(), "{\"x\":1}");
});

test("saveFile falls back to download link without file sharing", async () => {
  const doc = fakeDoc();
  const r = await PF.saveFile({ fileName: "b.json", json: "{}" }, {}, doc);
  assert.equal(r, "downloaded");
  assert.equal(doc.clicks.length, 1);
  assert.equal(doc.clicks[0].download, "b.json");
  assert.match(doc.clicks[0].href, /^blob:/);
});

test("saveFile falls back when canShare rejects files", async () => {
  const doc = fakeDoc();
  const nav = { canShare: () => false, share: async () => { throw new Error("no"); } };
  assert.equal(await PF.saveFile({ fileName: "c.json", json: "{}" }, nav, doc), "downloaded");
});

test("saveFile returns cancelled on AbortError", async () => {
  const nav = { canShare: () => true, share: async () => { const e = new Error("x"); e.name = "AbortError"; throw e; } };
  assert.equal(await PF.saveFile({ fileName: "d.json", json: "{}" }, nav, fakeDoc()), "cancelled");
});

test("saveFile rethrows other share errors", async () => {
  const nav = { canShare: () => true, share: async () => { const e = new Error("denied"); e.name = "NotAllowedError"; throw e; } };
  await assert.rejects(PF.saveFile({ fileName: "e.json", json: "{}" }, nav, fakeDoc()), /denied/);
});

test("daysSince counts whole days, null when never saved", () => {
  const now = Date.UTC(2026, 10, 20, 12);
  assert.equal(PF.daysSince(null, now), null);
  assert.equal(PF.daysSince(now - 3 * DAY - 1000, now), 3);
  assert.equal(PF.daysSince(now - 1000, now), 0);
});
