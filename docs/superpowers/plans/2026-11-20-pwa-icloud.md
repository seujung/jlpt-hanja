# 홈 화면 웹 앱 설치와 iCloud 진도 파일 계획

Spec: 사용자 요청(2026. 11. 20.) — "URL 접속 대신 kid-board처럼 웹 앱으로 설치해서 쓰게 하고, 공부 진행 부분을 설정에서 iCloud 파일로 저장하게 해 줘." 참고 구현: `../kid-board/web` (manifest, `sw.js`, `shareBackup.ts`, `INSTALL.md`).

## Global Constraints

- 빌드 도구 없이 정적 파일만 씁니다. GitHub Pages `https://seujung.github.io/jlpt-hanja/`에 그대로 배포합니다.
- iPadOS·iOS Safari 15 이상에서 동작해야 합니다. 서비스 워커는 import/export 없는 클래식 스크립트입니다.
- 경로는 모두 상대 경로로 씁니다. 로컬 `python3 -m http.server`와 `/jlpt-hanja/` 하위 경로에서 모두 동작해야 합니다.
- 테스트는 `node --test tests/`로 돌립니다(Node 내장 러너, 의존성 없음).

## Task 1: 진도 파일 모듈 (`progress-file.js`)

브라우저(`window.ProgressFile`)와 Node(`module.exports`) 양쪽에서 쓰는 순수 모듈입니다.

- `fileName(date)` → `jlpt-hanja-progress-YYYYMMDD.json` (현지 날짜).
- `saveFile({fileName, json}, nav, doc)` → `"shared" | "downloaded" | "cancelled"`. `nav.canShare({files})`가 참이면 `nav.share`(공유 시트 → "파일에 저장" → iCloud Drive), 아니면 `<a download>`. `AbortError`는 `"cancelled"`, 다른 오류는 던집니다.
- `daysSince(ts, now)` → 마지막 저장 후 지난 날 수(정수, 없으면 `null`).

Tests (`tests/progress-file.test.js`): 파일 이름 형식, share 경로, download 경로(fake doc), AbortError → cancelled, 다른 오류 전파, daysSince.

Expected: 구현 전 실패, 구현 후 통과.

## Task 2: 설정 화면의 iCloud 저장·불러오기

- `app.js`의 `exportProgress`가 `ProgressFile.saveFile`을 부릅니다. `"shared"`·`"downloaded"`이면 `hz_last_backup`에 시각을 저장합니다.
- 사이드바 "설정"의 버튼 이름: `☁ iCloud에 저장`, `☁ iCloud에서 불러오기`. 아래에 "마지막 저장: N일 전 / 아직 저장하지 않음"을 표시하고 7일이 지나면 경고색으로 표시합니다.
- 불러오기는 기존 병합 로직을 유지합니다. 불러온 뒤에도 마지막 저장 시각은 바꾸지 않습니다.
- `hz_last_backup`은 백업 파일에 넣지 않습니다(기기별 상태).

Tests: `tests/progress-file.test.js`에 `backupStatus(ts, now)` 문구·경고 판정 케이스 추가.

## Task 3: 홈 화면 설치(PWA)

- `manifest.webmanifest`(상대 경로 `start_url: "./"`, `scope: "./"`, `display: "standalone"`), 아이콘 `icons/icon-180.png`, `icons/icon-512.png`.
- `index.html`: `apple-mobile-web-app-capable`, `apple-mobile-web-app-title`, `apple-touch-icon`, `theme-color`, `viewport-fit=cover`, manifest 링크.
- `sw.js`: 설치 때 앱 파일을 미리 캐시합니다. 같은 출처 GET은 네트워크 우선(3초 초과·실패 시 캐시, `ignoreSearch`), 받은 응답으로 캐시를 갱신합니다. Google Fonts는 캐시 우선 런타임 캐시입니다. 활성화 때 이전 이름의 캐시를 지웁니다.
- `app.js`가 `sw.js`를 등록하고 `navigator.storage.persist()`를 요청합니다.
- `styles.css`: standalone에서 safe-area 여백.

Tests (`tests/pwa.test.js`): manifest 필드·아이콘 파일 존재·PNG 크기, `index.html` 메타·링크, `sw.js` 문법(vm 컴파일)·import/export 없음·precache 목록의 파일이 모두 존재.

## Task 4: 문서

- `README.md`: 설치 방법(Safari → 공유 → 홈 화면에 추가), iCloud 저장·불러오기, Safari에서 쓰던 진도를 홈 화면 앱으로 옮기는 절차(홈 화면 앱은 Safari와 저장소가 따로임), 새 버전 반영 방식.
- `INSTALL.md`는 만들지 않고 README에 합칩니다.

Test: `node --test tests/` 전체 통과.
