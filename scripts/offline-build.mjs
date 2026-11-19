#!/usr/bin/env node
// 오프라인 단일 파일(public/insurrection-trials-offline.html) 빌더.
//
// public/index.html 은 온라인 배포본이라 CSS·JS 를 styles.css · core.js · app.js 로 나눠 링크하고,
// 데이터셋 JSON 도 fetch 로만 읽는다(내장 사본 없음).
// 이 빌더는 그 파일들을 HTML 안에 인라인하고, 사본에만 데이터를 내장한다.
//
//   1. styles.css → <style> 블록으로, core.js · app.js → <script> 블록으로 인라인
//   2. `const EMBEDDED={};` 뒤에 EMBEDDED.dec03 / kim / chae 세 재판 기록부 JSON 을 넣는다.
//   3. 탄핵 표결 뷰 JS 주석 앞에 `const IMP_EMBEDDED = {...};` 를 넣는다.
//   4. `let OFFLINE_ONLY=false;` → true (fetch 를 시도하지 않는다)
//   5. 파비콘 링크(외부 파일 참조)는 SVG data URI 한 줄로 줄인다(단일 파일 유지).
//
// 결과물은 file:// 로 열어도 외부 CSS/JS 요청 없이 스위처의 네 기록부가 모두 동작한다.
// 원본(index.html · styles.css · core.js · app.js · JSON)은 읽기만 하고 수정하지 않는다.
//
// 이 파일이 빌드 로직의 유일한 구현이다. `npm run validate` 는 같은 함수로 사본을 다시 만들어
// 커밋된 파일과 바이트 단위로 비교하므로, 소스를 고치고 사본을 다시 만들지 않으면 CI 가 실패한다.
//
//   npm run build:offline          (python3 scripts/build-offline.py 도 같은 빌더를 호출한다)

import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");
const INDEX = join(PUBLIC, "index.html");
const STYLES = join(PUBLIC, "styles.css");
const CORE = join(PUBLIC, "core.js");
const APP = join(PUBLIC, "app.js");
const FAVICON_SVG = join(PUBLIC, "favicon.svg");
export const OFFLINE_FILE = join(PUBLIC, "insurrection-trials-offline.html");

// index.html 이 링크하는 태그 → 인라인할 파일
const CSS_TAG = '<link rel="stylesheet" href="styles.css">';
const CORE_TAG = '<script src="core.js"></script>';
const APP_TAG = '<script src="app.js"></script>';
// index.html 이 링크하는 아이콘. 사본은 단일 파일이어야 하므로 첫 태그만 SVG data URI 로 남기고 나머지는 지운다.
const ICON_TAGS = [
  '<link rel="icon" href="favicon.svg" type="image/svg+xml">',
  '<link rel="icon" href="favicon.ico" sizes="32x32">',
  '<link rel="apple-touch-icon" href="apple-touch-icon.png">',
];

// 스위처 순서대로. [내장 블록 이름, 원본 JSON]
const DATASETS = [
  ["dec03", "insurrection-trials-data.json"],
  ["kim", "kim-trials-data.json"],
  ["chae", "chae-trials-data.json"],
];
const IMP_DATA = "impeachment-assembly-data.json";
// 내장 데이터를 넣을 지점: app.js 의 빈 EMBEDDED 훅 바로 뒤
const EMBED_ANCHOR = "const EMBEDDED={};";
// 오프라인 사본은 fetch 를 시도하지 않고 내장 데이터만 쓴다(file:// 에서 네트워크 오류 없음)
const OFFLINE_FLAG = "let OFFLINE_ONLY=false;";
const OFFLINE_FLAG_ON = "let OFFLINE_ONLY=true;";
// 탄핵 표결 뷰 JS 블록 시작 주석. CSS 에도 같은 문구가 있으므로 반드시 app.js 안에서 찾는다.
const MARK = "/* ===== 22대 국회 탄핵 표결 뷰 ===== */";

const read = (path) => readFileSync(path, "utf8");
const name = (path) => basename(path);

function count(text, needle) {
  let n = 0;
  let at = text.indexOf(needle);
  while (at !== -1) {
    n += 1;
    at = text.indexOf(needle, at + needle.length);
  }
  return n;
}

// Python str.replace(old, new, 1) 과 같다. replacement 의 `$&` 같은 패턴이 해석되지 않도록 직접 자른다.
function replaceOnce(text, needle, replacement) {
  const at = text.indexOf(needle);
  if (at === -1) return text;
  return text.slice(0, at) + replacement + text.slice(at + needle.length);
}

// Python str.strip("\n") 과 같다(앞뒤 개행만 제거).
const stripNewlines = (text) => text.replace(/^\n+/, "").replace(/\n+$/, "");

const compact = (data) => JSON.stringify(data);

function inline(html, tag, path, wrapper) {
  const found = count(html, tag);
  if (found !== 1) {
    throw new Error(`index.html 에서 ${tag} 를 한 곳에서 찾지 못했습니다 (${found}곳)`);
  }
  const body = stripNewlines(read(path));
  if (wrapper === "style" && body.includes("</style>")) {
    throw new Error(`${name(path)} 에 </style> 문자열이 있어 인라인할 수 없습니다`);
  }
  if (wrapper === "script" && body.includes("</script")) {
    throw new Error(`${name(path)} 에 </script 문자열이 있어 인라인할 수 없습니다`);
  }
  return replaceOnce(html, tag, `<${wrapper}>\n${body}\n</${wrapper}>`);
}

/**
 * 현재 소스로 오프라인 단일 파일의 내용을 만든다. 파일에는 쓰지 않는다.
 * @returns {string} public/insurrection-trials-offline.html 에 들어가야 할 내용
 */
export function buildOfflineHtml() {
  let html = read(INDEX);
  let app = read(APP);

  // 온라인 배포본에 내장 JSON 이 다시 들어가면 오프라인 빌드의 전제가 깨진다.
  for (const [dsName] of DATASETS) {
    if (app.includes(`EMBEDDED.${dsName}=`)) {
      throw new Error(`app.js 에 내장 데이터(EMBEDDED.${dsName})가 남아 있습니다. 온라인 배포본은 fetch 전용입니다.`);
    }
  }

  if (count(app, EMBED_ANCHOR) !== 1) {
    throw new Error(`app.js 에서 내장 지점(${EMBED_ANCHOR})을 한 곳에서 찾지 못했습니다`);
  }
  if (count(app, OFFLINE_FLAG) !== 1) {
    throw new Error(`app.js 에서 오프라인 플래그(${OFFLINE_FLAG})를 한 곳에서 찾지 못했습니다`);
  }
  if (count(app, MARK) !== 1) {
    throw new Error("app.js 에서 탄핵 표결 뷰 주석을 한 곳에서 찾지 못했습니다");
  }

  // 1) app.js 안에 데이터·플래그를 넣는다(인라인 전에 처리해 CSS 쪽 주석과 섞이지 않게 한다).
  const embedded = DATASETS.map(
    ([dsName, file]) => `\nEMBEDDED.${dsName}=${compact(JSON.parse(read(join(PUBLIC, file))))};`,
  ).join("");
  app = replaceOnce(app, EMBED_ANCHOR, EMBED_ANCHOR + embedded);
  app = replaceOnce(app, OFFLINE_FLAG, OFFLINE_FLAG_ON);

  const imp = JSON.parse(read(join(PUBLIC, IMP_DATA)));
  app = replaceOnce(app, MARK, `const IMP_EMBEDDED = ${compact(imp)};\n` + MARK);

  // 2) CSS·JS 를 HTML 에 인라인한다.
  let out = inline(html, CSS_TAG, STYLES, "style");
  out = inline(out, CORE_TAG, CORE, "script");
  // 2-1) 아이콘 링크는 파일 참조 대신 SVG data URI 한 줄로 바꾼다(오프라인 사본은 바깥 파일을 가리키지 않는다).
  const iconUri =
    '<link rel="icon" href="data:image/svg+xml;base64,' + readFileSync(FAVICON_SVG).toString("base64") + '">';
  ICON_TAGS.forEach((tag, index) => {
    const found = count(out, tag);
    if (found !== 1) {
      throw new Error(`index.html 에서 아이콘 태그를 한 곳에서 찾지 못했습니다 (${found}곳): ${tag}`);
    }
    out = replaceOnce(out, tag, index === 0 ? iconUri : "");
  });
  if (count(out, APP_TAG) !== 1) {
    throw new Error(`index.html 에서 ${APP_TAG} 를 한 곳에서 찾지 못했습니다 (${count(out, APP_TAG)}곳)`);
  }
  const body = stripNewlines(app);
  if (body.includes("</script")) {
    throw new Error("app.js 에 </script 문자열이 있어 인라인할 수 없습니다");
  }
  out = replaceOnce(out, APP_TAG, `<script>\n${body}\n</script>`);

  // 3) 인라인 후에도 바깥 파일을 가리키는 참조가 남아 있으면 단일 파일이 아니다.
  for (const leftover of ['href="styles.css"', 'src="core.js"', 'src="app.js"', 'href="app.js"', 'href="core.js"', 'href="favicon', 'apple-touch-icon.png"']) {
    if (out.includes(leftover)) {
      throw new Error(`오프라인 사본에 외부 참조가 남아 있습니다: ${leftover}`);
    }
  }
  return out;
}

// 원본은 읽기만 한다. 결과는 사본(public/insurrection-trials-offline.html)에만 쓴다.
export function write() {
  const out = buildOfflineHtml();
  writeFileSync(OFFLINE_FILE, out);
  const bytes = (text) => Buffer.byteLength(text, "utf8");
  const css = read(STYLES);
  const appBody = stripNewlines(read(APP));
  console.log(
    `  insurrection-trials-offline.html 생성 · CSS ${bytes(css).toLocaleString("en-US")}B · ` +
      `JS ${bytes(appBody).toLocaleString("en-US")}B · 재판 데이터 ${DATASETS.length}종 · ` +
      `탄핵 표결 ${(JSON.parse(read(join(PUBLIC, IMP_DATA))).members || []).length}명 내장 ` +
      `(${bytes(out).toLocaleString("en-US")}바이트) · index.html 은 수정하지 않음`,
  );
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  if (process.argv.includes("--write")) {
    try {
      write();
    } catch (error) {
      console.error(`오프라인 빌드 실패: ${error.message}`);
      process.exit(1);
    }
  } else {
    console.log("사용법: node scripts/offline-build.mjs --write   (또는 npm run build:offline)");
  }
}
