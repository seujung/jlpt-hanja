/* 진도 파일 저장 도우미 — 브라우저(window.ProgressFile)와 Node 테스트(module.exports)에서 함께 씁니다. */
(function (root) {
  "use strict";
  const DAY = 86400000;

  function pad(n) { return String(n).padStart(2, "0"); }

  /** 현지 날짜로 파일 이름을 만듭니다. 예: jlpt-hanja-progress-20261120.json */
  function fileName(date) {
    const d = date || new Date();
    return `jlpt-hanja-progress-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
  }

  function isAbort(err) {
    return !!err && typeof err === "object" && err.name === "AbortError";
  }

  /**
   * 진도 파일을 저장합니다.
   * 파일 공유를 지원하면 공유 시트를 엽니다. 사용자가 "파일에 저장" → iCloud Drive를 고릅니다.
   * 지원하지 않으면 <a download>로 내려받습니다.
   * 사용자 동작 안에서 share를 불러야 하므로, 이 함수를 부르기 전에 await 하지 마십시오.
   * @returns {Promise<"shared"|"downloaded"|"cancelled">}
   */
  async function saveFile(file, nav, doc) {
    const blob = new Blob([file.json], { type: "application/json" });
    const shareFile = new File([blob], file.fileName, { type: "application/json" });
    const data = { files: [shareFile] };
    if (nav && typeof nav.canShare === "function" && typeof nav.share === "function" && nav.canShare(data)) {
      try {
        await nav.share(data);
        return "shared";
      } catch (err) {
        if (isAbort(err)) return "cancelled";
        throw err;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = doc.createElement("a");
    a.href = url;
    a.download = file.fileName;
    doc.body.appendChild(a);
    a.click();
    a.remove();
    // 내려받기가 시작될 때까지 주소를 남겨 둡니다.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return "downloaded";
  }

  /** 마지막 저장 후 지난 날 수입니다. 저장한 적이 없으면 null입니다. */
  function daysSince(ts, now) {
    if (typeof ts !== "number" || !isFinite(ts)) return null;
    return Math.max(0, Math.floor(((now == null ? Date.now() : now) - ts) / DAY));
  }

  const api = { fileName, saveFile, daysSince };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ProgressFile = api;
})(typeof window !== "undefined" ? window : globalThis);
