/*
 * JLPT 상용한자 2136 서비스 워커입니다. 홈 화면 앱이 오프라인에서도 열리게 합니다.
 *
 * - 설치: 앱 파일(PRECACHE)을 미리 캐시하고 바로 활성화합니다.
 * - 활성화: 이름이 다른 이전 앱 캐시를 지웁니다. 글꼴 캐시는 남깁니다.
 * - 같은 출처 GET: 아래 sameOrigin()의 규칙을 따릅니다.
 *   배포하면 온라인 상태에서 다음에 열 때 새 HTML과 새 자산이 함께 적용됩니다.
 * - Google Fonts: 캐시 우선입니다.
 *
 * Safari 15에서 동작해야 하므로 import/export 없는 클래식 스크립트로 씁니다.
 * 배포할 때 VERSION과 index.html의 ?v= 값을 함께 바꾸십시오(scripts/bump-version.sh).
 */
const VERSION = "202611201652";
const CACHE_PREFIX = "jlpt-hanja-app-";
const CACHE = CACHE_PREFIX + VERSION;
const FONT_CACHE = "jlpt-hanja-fonts";
const NETWORK_TIMEOUT_MS = 3000;
const PRECACHE = [
  "./",
  "index.html",
  "app.js",
  "progress-file.js",
  "srs-core.js",
  "styles.css",
  "data/hanja.js",
  "manifest.webmanifest",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png"
];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

const SCOPE = self.registration.scope;
const INDEX = new URL("index.html", SCOPE).href;

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      // HTTP 캐시에 남은 이전 파일을 받지 않도록 네트워크에서 다시 받습니다.
      .then(cache => cache.addAll(PRECACHE.map(p => new Request(new URL(p, SCOPE).href, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.indexOf(CACHE_PREFIX) === 0 && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeoutOrNetwork(network, fallback) {
  // 네트워크가 3초 안에 응답하지 않으면 fallback을 씁니다. fallback이 없으면 네트워크를 계속 기다립니다.
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = r => { if (!settled) { settled = true; resolve(r); } };
    const tryCache = () => fallback().then(hit => { if (hit) done(hit); return hit; });
    const timer = setTimeout(tryCache, NETWORK_TIMEOUT_MS);
    network.then(res => { clearTimeout(timer); done(res); }, err => {
      clearTimeout(timer);
      tryCache().then(hit => { if (!hit && !settled) { settled = true; reject(err); } });
    });
  });
}

/*
 * 같은 출처 응답 규칙입니다. 캐시는 설치 때 받은 버전 스냅숏이며 실행 중에는 바꾸지 않습니다.
 * 그래서 index.html과 ?v= 자산이 항상 같은 버전끼리 짝을 이룹니다.
 * - 화면 이동: 네트워크 우선, 3초 초과·실패 시 캐시한 index.html
 * - ?v=VERSION 자산: 캐시 우선(검색어 무시). 이 워커가 받아 둔 같은 버전입니다.
 * - 그 밖의 자산(다른 버전): 네트워크만 기다립니다. 실패(오프라인)할 때만 캐시를 씁니다.
 */
function sameOrigin(request, url) {
  return caches.open(CACHE).then(cache => {
    if (request.mode === "navigate") {
      return timeoutOrNetwork(fetch(request),
        () => cache.match(request, { ignoreSearch: true }).then(hit => hit || cache.match(INDEX)));
    }
    const fallback = () => cache.match(request, { ignoreSearch: true });
    if (url.searchParams.get("v") === VERSION) {
      return fallback().then(hit => hit || fetch(request));
    }
    return fetch(request).catch(err => fallback().then(hit => { if (hit) return hit; throw err; }));
  });
}

function cacheFirst(request) {
  return caches.open(FONT_CACHE).then(cache => cache.match(request).then(hit => hit || fetch(request).then(res => {
    if (res && (res.ok || res.type === "opaque")) cache.put(request, res.clone()).catch(() => {});
    return res;
  })));
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) event.respondWith(sameOrigin(request, url));
  else if (FONT_HOSTS.indexOf(url.hostname) >= 0) event.respondWith(cacheFirst(request));
});
