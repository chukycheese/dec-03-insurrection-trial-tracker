#!/usr/bin/env node
// 데이터 무결성 검증: public/*.json 의 구조와 참조 관계, 프로필 사진 파일 존재 여부를 확인한다.
// 외부 의존성 없이 Node 20 이상에서 동작한다. (npm run validate)

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");
const datasets = [
  "insurrection-trials-data.json",
  "kim-trials-data.json",
  "chae-trials-data.json",
];
const requiredSections = ["cases", "rulings", "sentences", "people", "judges", "meta"];
const IMP_FILE = "impeachment-assembly-data.json";
const IMP_PARTIES = ["더불어민주당", "국민의힘", "조국혁신당", "개혁신당", "진보당", "기본소득당", "사회민주당", "무소속"];
const IMP_VOTE1 = ["참석", "불참", "미재임"];
const IMP_STANCE = ["support", "oppose", "undisclosed", "none"];

let errors = 0;
let warnings = 0;

function fail(file, message) {
  errors++;
  console.error(`  ✗ ${file}: ${message}`);
}

function warn(file, message) {
  warnings++;
  console.warn(`  ! ${file}: ${message}`);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function checkDate(file, label, value) {
  if (value === "" || value === undefined || value === null) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    fail(file, `${label} 날짜 형식이 올바르지 않습니다: ${JSON.stringify(value)}`);
  }
}

function validateDataset(file, data) {
  for (const section of requiredSections) {
    if (!isObject(data[section])) {
      fail(file, `최상위 "${section}" 섹션이 없거나 객체가 아닙니다`);
    }
  }
  if (errors > 0 && requiredSections.some((s) => !isObject(data[s]))) return;

  const { cases, rulings, sentences, people, judges } = data;

  for (const [caseId, item] of Object.entries(cases)) {
    if (!isObject(item)) {
      fail(file, `cases.${caseId} 가 객체가 아닙니다`);
      continue;
    }
    for (const field of ["order", "title", "charge", "status"]) {
      if (item[field] === undefined || item[field] === "") {
        fail(file, `cases.${caseId}.${field} 가 비어 있습니다`);
      }
    }
    if (!Array.isArray(item.defendantIds)) {
      fail(file, `cases.${caseId}.defendantIds 가 배열이 아닙니다`);
    } else {
      for (const personId of item.defendantIds) {
        if (!people[personId]) fail(file, `cases.${caseId} 가 없는 인물을 참조합니다: ${personId}`);
      }
    }
  }

  for (const [rulingId, ruling] of Object.entries(rulings)) {
    if (!isObject(ruling)) {
      fail(file, `rulings.${rulingId} 가 객체가 아닙니다`);
      continue;
    }
    if (!cases[ruling.caseId]) {
      fail(file, `rulings.${rulingId}.caseId 가 없는 사건을 참조합니다: ${ruling.caseId}`);
    }
    checkDate(file, `rulings.${rulingId}.date`, ruling.date);
    if (![1, 2, 3].includes(ruling.level)) {
      fail(file, `rulings.${rulingId}.level 은 1~3 이어야 합니다: ${ruling.level}`);
    }
    if (Array.isArray(ruling.judgeIds)) {
      for (const judgeId of ruling.judgeIds) {
        if (!judges[judgeId]) fail(file, `rulings.${rulingId} 가 없는 판사를 참조합니다: ${judgeId}`);
      }
    }
    if (Array.isArray(ruling.sources)) {
      for (const source of ruling.sources) {
        if (!Array.isArray(source) || source.length < 2 || !source[1]) {
          fail(file, `rulings.${rulingId}.sources 형식이 올바르지 않습니다: ${JSON.stringify(source)}`);
        }
      }
    }
  }

  for (const [sentenceId, sentence] of Object.entries(sentences)) {
    if (!isObject(sentence)) {
      fail(file, `sentences.${sentenceId} 가 객체가 아닙니다`);
      continue;
    }
    const ruling = rulings[sentence.rulingId];
    if (!ruling) {
      fail(file, `sentences.${sentenceId}.rulingId 가 없는 판결을 참조합니다: ${sentence.rulingId}`);
    } else if (sentence.caseId && ruling.caseId !== sentence.caseId) {
      fail(
        file,
        `sentences.${sentenceId}.caseId(${sentence.caseId})가 판결의 사건(${ruling.caseId})과 다릅니다`,
      );
    }
    if (!cases[sentence.caseId]) {
      fail(file, `sentences.${sentenceId}.caseId 가 없는 사건을 참조합니다: ${sentence.caseId}`);
    }
    if (!people[sentence.personId]) {
      fail(file, `sentences.${sentenceId}.personId 가 없는 인물을 참조합니다: ${sentence.personId}`);
    }
    for (const field of ["outcome", "sentence"]) {
      if (!sentence[field]) fail(file, `sentences.${sentenceId}.${field} 가 비어 있습니다`);
    }
  }

  for (const [personId, person] of Object.entries(people)) {
    if (!isObject(person) || !person.name) {
      fail(file, `people.${personId} 에 name 이 없습니다`);
      continue;
    }
    if (!person.photo) continue;
    for (const size of ["160", "320"]) {
      const photoPath = join(publicDir, `${person.photo}-${size}.webp`);
      if (!existsSync(photoPath)) {
        fail(file, `people.${personId} 사진 파일이 없습니다: public/${person.photo}-${size}.webp`);
      }
    }
  }

  for (const [judgeId, judge] of Object.entries(judges)) {
    if (!isObject(judge) || !judge.name) fail(file, `judges.${judgeId} 에 name 이 없습니다`);
  }
}

function validateOfflineHtml(file) {
  const html = readFileSync(file, "utf8");
  const match = html.match(/Object\.assign\(store, (\{.*?\})\);\nCOLLS/s);
  if (!match) {
    warn(file, "내장 데이터 블록을 찾지 못했습니다 (형식이 바뀌었다면 스크립트를 갱신하세요)");
    return;
  }
  let embedded;
  try {
    embedded = JSON.parse(match[1]);
  } catch (error) {
    fail(file, `내장 데이터 JSON 파싱 실패: ${error.message}`);
    return;
  }
  for (const section of requiredSections) {
    if (!isObject(embedded[section])) {
      fail(file, `내장 데이터에 "${section}" 섹션이 없습니다`);
    }
  }
  const current = JSON.parse(readFileSync(join(publicDir, "insurrection-trials-data.json"), "utf8"));
  for (const section of ["cases", "rulings", "people", "judges"]) {
    const embeddedIds = new Set(Object.keys(embedded[section] || {}));
    const currentIds = new Set(Object.keys(current[section] || {}));
    const missing = [...currentIds].filter((id) => !embeddedIds.has(id));
    const extra = [...embeddedIds].filter((id) => !currentIds.has(id));
    if (missing.length) {
      warn(file, `내장 ${section} 에 현재 데이터의 항목이 없습니다: ${missing.slice(0, 5).join(", ")}`);
    }
    if (extra.length) {
      warn(file, `내장 ${section} 에 현재 데이터에 없는 항목이 있습니다: ${extra.slice(0, 5).join(", ")}`);
    }
  }
}

// 22대 국회 탄핵 표결 데이터: 300석 명부(승계 1명 포함 301명)와 1·2차 표결 집계가 서로 맞는지 확인한다.
function validateImpeachment(file) {
  let data;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    fail(IMP_FILE, `JSON 파싱 실패: ${error.message}`);
    return null;
  }
  if (!isObject(data.meta)) fail(IMP_FILE, "meta 섹션이 없습니다");
  if (!Array.isArray(data.members)) {
    fail(IMP_FILE, "members 배열이 없습니다");
    return data;
  }
  const members = data.members;
  if (members.length !== 301) fail(IMP_FILE, `members 는 301명이어야 합니다(현재 ${members.length})`);

  const ids = new Set();
  const names = new Set();
  const party = {};
  const vote1 = {};
  const stance = {};
  for (const m of members) {
    if (!isObject(m) || !m.name || !m.constituency) {
      fail(IMP_FILE, `의원 항목에 name/constituency 가 없습니다: ${JSON.stringify(m).slice(0, 80)}`);
      continue;
    }
    if (!m.id) fail(IMP_FILE, `${m.name}: id 가 없습니다`);
    else if (ids.has(m.id)) fail(IMP_FILE, `중복 id: ${m.id}`);
    ids.add(m.id);
    if (names.has(m.name)) warn(IMP_FILE, `동명이인 또는 중복 이름: ${m.name}`);
    names.add(m.name);
    if (!IMP_PARTIES.includes(m.party)) fail(IMP_FILE, `${m.name}: 알 수 없는 정당 ${m.party}`);
    if (!IMP_VOTE1.includes(m.vote1)) fail(IMP_FILE, `${m.name}: 1차 표결 값이 올바르지 않습니다: ${m.vote1}`);
    if (!IMP_STANCE.includes(m.stance2)) fail(IMP_FILE, `${m.name}: 2차 입장 값이 올바르지 않습니다: ${m.stance2}`);
    if (!m.district || !["지역구", "비례"].includes(m.district)) fail(IMP_FILE, `${m.name}: district 값 오류`);
    party[m.party] = (party[m.party] || 0) + 1;
    vote1[m.vote1] = (vote1[m.vote1] || 0) + 1;
    stance[m.stance2] = (stance[m.stance2] || 0) + 1;
  }

  // 표결 집계와 명부가 맞아야 한다: 1차 195 참석·105 불참, 2차 300명(S=199 포함)
  if (vote1["참석"] !== 195) fail(IMP_FILE, `1차 참석은 195명이어야 합니다(현재 ${vote1["참석"]})`);
  if (vote1["불참"] !== 105) fail(IMP_FILE, `1차 불참은 105명이어야 합니다(현재 ${vote1["불참"]})`);
  if (vote1["미재임"] !== 1) fail(IMP_FILE, `1차 미재임은 1명이어야 합니다(현재 ${vote1["미재임"]})`);
  if (stance.support !== 199) fail(IMP_FILE, `2차 공개 찬성은 199명이어야 합니다(현재 ${stance.support})`);
  if (stance.none !== 1) fail(IMP_FILE, `2차 불참(원외)은 1명이어야 합니다(현재 ${stance.none})`);

  const meta = data.meta || {};
  const votes = meta.votes || {};
  const first = votes.first || {};
  const second = votes.second || {};
  if (first.present !== 195 || first.absent !== 105 || first.quorum !== 200) {
    fail(IMP_FILE, `1차 표결 수치가 올바르지 않습니다: ${JSON.stringify(first)}`);
  }
  if (second.present !== 300 || second.yes !== 204 || second.no !== 85 || second.abstain !== 3 || second.invalid !== 8) {
    fail(IMP_FILE, `2차 표결 수치가 올바르지 않습니다: ${JSON.stringify(second)}`);
  }
  if (second.yes + second.no + second.abstain + second.invalid !== 300) {
    fail(IMP_FILE, `2차 표의 합이 300이 아닙니다: ${second.yes + second.no + second.abstain + second.invalid}`);
  }
  if (second.yes - 192 !== second.estimatedPeoplePowerYes) {
    // 범야권 192명 전원 찬성 전제로 계산한 국민의힘 찬성 추정치와 어긋나면 데이터가 깨진 것
    warn(IMP_FILE, "2차 찬성표에서 계산한 국민의힘 찬성 추정치가 meta 와 다릅니다");
  }
  const seatSum = Object.values(meta.partySeats || {}).reduce((a, b) => a + b, 0);
  if (seatSum !== 300) fail(IMP_FILE, `정당별 의석 합이 300이 아닙니다(현재 ${seatSum})`);
  if (meta.partySeatsBasis === undefined) warn(IMP_FILE, "partySeats 기준 설명이 없습니다");
  if (!Array.isArray(meta.sources) || meta.sources.length < 5) warn(IMP_FILE, "출처 목록이 부족합니다");

  return data;
}

// 객체 키 순서에 상관없이 비교하기 위한 정규화
function stableJSON(value) {
  if (Array.isArray(value)) return "[" + value.map(stableJSON).join(",") + "]";
  if (isObject(value)) {
    return "{" + Object.keys(value).sort().map((k) => JSON.stringify(k) + ":" + stableJSON(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

// 오프라인 HTML에 내장한 탄핵 표결 데이터가 원본 JSON과 같은지 확인한다.
function validateOfflineImpeachment(file, source) {
  const html = readFileSync(file, "utf8");
  const match = html.match(/const IMP_EMBEDDED = (\{.*?\});\n/);
  if (!match) {
    fail(file, "IMP_EMBEDDED 내장 블록을 찾지 못했습니다");
    return;
  }
  let embedded;
  try {
    embedded = JSON.parse(match[1]);
  } catch (error) {
    fail(file, `IMP_EMBEDDED 파싱 실패: ${error.message}`);
    return;
  }
  if (stableJSON(embedded) !== stableJSON(source)) {
    warn(file, "내장 탄핵 표결 데이터가 impeachment-assembly-data.json 과 다릅니다 (동기화 필요)");
  }
  if (!html.includes('data-view="impeachment"')) fail(file, "탄핵 표결 탭이 없습니다");
}

console.log("데이터 무결성 검증을 시작합니다.\n");

for (const name of datasets) {
  const file = join(publicDir, name);
  process.stdout.write(`- ${name} ... `);
  let data;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    console.log("실패");
    fail(name, `JSON 파싱 실패: ${error.message}`);
    continue;
  }
  const before = errors;
  validateDataset(name, data);
  console.log(errors === before ? "통과" : "실패");
}

process.stdout.write(`- ${IMP_FILE} ... `);
const impBefore = errors;
const impData = validateImpeachment(join(publicDir, IMP_FILE));
console.log(errors === impBefore ? "통과" : "실패");

process.stdout.write("- insurrection-trials-offline.html ... ");
const before = errors;
validateOfflineHtml(join(publicDir, "insurrection-trials-offline.html"));
console.log(errors === before ? "통과" : "실패");

if (impData) validateOfflineImpeachment(join(publicDir, "insurrection-trials-offline.html"), impData);

process.stdout.write("- index.html 탄핵 표결 뷰 ... ");
const idxBefore = errors;
const indexHtml = readFileSync(join(publicDir, "index.html"), "utf8");
if (!indexHtml.includes('data-view="impeachment"')) fail("index.html", "탄핵 표결 탭이 없습니다");
if (!indexHtml.includes('"impeachment-assembly-data.json"')) fail("index.html", "탄핵 표결 데이터 fetch 가 없습니다");
if (!indexHtml.includes("function renderImpeachment")) fail("index.html", "renderImpeachment 함수가 없습니다");
console.log(errors === idxBefore ? "통과" : "실패");

console.log(`\n결과: 오류 ${errors}건, 경고 ${warnings}건`);
if (errors > 0) process.exit(1);
console.log("모든 검증을 통과했습니다.");
