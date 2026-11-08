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
const IMP_VOTE0 = ["참석", "불참", "미재임"];
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
  // 오프라인 사본은 index.html 과 같은 앱이며, 재판 데이터는 EMBEDDED.* 로 내장되어 있다.
  const match = html.match(/^EMBEDDED\.dec03=(\{.*\});$/m);
  if (!match) {
    warn(file, "내장 데이터 블록(EMBEDDED.dec03)을 찾지 못했습니다 (scripts/build-offline.py 로 다시 생성하세요)");
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
  const vote0 = {};
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
    if (!IMP_VOTE0.includes(m.vote0)) fail(IMP_FILE, `${m.name}: 12.4 계엄해제 표결 값이 올바르지 않습니다: ${m.vote0}`);
    if (!IMP_STANCE.includes(m.stance2)) fail(IMP_FILE, `${m.name}: 2차 입장 값이 올바르지 않습니다: ${m.stance2}`);
    // 공개 반대는 근거 발언이 있어야 하고, 출처가 있으면 링크 형식이어야 한다.
    if (m.stance2 === "oppose" && !m.publicStance) fail(IMP_FILE, `${m.name}: 공개 반대인데 publicStance 가 없습니다`);
    if (m.stanceSource !== undefined) {
      if (!Array.isArray(m.stanceSource) || m.stanceSource.length < 2 || !/^https?:\/\//.test(String(m.stanceSource[1] || ""))) {
        fail(IMP_FILE, `${m.name}: stanceSource 형식이 올바르지 않습니다`);
      }
    }
    if (!m.district || !["지역구", "비례"].includes(m.district)) fail(IMP_FILE, `${m.name}: district 값 오류`);
    party[m.party] = (party[m.party] || 0) + 1;
    vote0[m.vote0] = (vote0[m.vote0] || 0) + 1;
    vote1[m.vote1] = (vote1[m.vote1] || 0) + 1;
    stance[m.stance2] = (stance[m.stance2] || 0) + 1;
  }

  // 프로필 사진 파일: 경로 형식과 실제 파일 존재를 확인하고, 빠진 의원은 이니셜 폴백으로 알린다.
  let photoCount = 0;
  for (const m of members) {
    if (m.photo === undefined) continue;
    if (!/^assets\/members\/[a-z0-9-]+\.webp$/.test(m.photo)) {
      fail(IMP_FILE, `${m.name}: photo 경로 형식이 올바르지 않습니다: ${m.photo}`);
      continue;
    }
    if (!existsSync(join(publicDir, m.photo))) {
      fail(IMP_FILE, `${m.name}: 사진 파일이 없습니다: public/${m.photo}`);
      continue;
    }
    photoCount += 1;
  }
  if (photoCount < members.length) {
    warn(IMP_FILE, `프로필 사진이 없는 의원 ${members.length - photoCount}명은 이니셜 아바타로 표시됩니다`);
  }

  // 표결 집계와 명부가 맞아야 한다: 1차 195 참석·105 불참, 2차 300명(S=199 포함)
  if (vote0["참석"] !== 190) fail(IMP_FILE, `12.4 계엄해제 찬성은 190명이어야 합니다(현재 ${vote0["참석"]})`);
  if (vote0["불참"] !== 110) fail(IMP_FILE, `12.4 계엄해제 불참은 110명이어야 합니다(현재 ${vote0["불참"]})`);
  if (vote0["미재임"] !== 1) fail(IMP_FILE, `12.4 미재임은 1명이어야 합니다(현재 ${vote0["미재임"]})`);
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
  const pre = votes.preliminary || {};
  if (pre.present !== 190 || pre.yes !== 190 || pre.date !== "2024-12-04") {
    fail(IMP_FILE, `12.4 계엄해제 표결 수치가 올바르지 않습니다: ${JSON.stringify(pre)}`);
  }
  const countsMeta = meta.counts || {};
  if (!isObject(countsMeta.vote0) || countsMeta.vote0["참석"] !== vote0["참석"]) {
    fail(IMP_FILE, "meta.counts.vote0 가 명부 집계와 다릅니다");
  }
  if (!isObject(countsMeta.stance2) || countsMeta.stance2.oppose !== stance.oppose) {
    fail(IMP_FILE, "meta.counts.stance2.oppose 가 명부 집계와 다릅니다");
  }
  // 반대 85표·1차 불참 105명 해설(meta.analysis): 그룹의 memberIds 는 실존 의원이어야 한다.
  const analysis = meta.analysis;
  if (!isObject(analysis)) {
    fail(IMP_FILE, "meta.analysis 가 없습니다");
  } else {
    if (!Array.isArray(analysis.groups) || analysis.groups.length < 3) fail(IMP_FILE, "meta.analysis.groups 가 부족합니다");
    else {
      for (const g of analysis.groups) {
        if (!g.id || !g.label || !Array.isArray(g.memberIds) || !g.memberIds.length) {
          fail(IMP_FILE, `meta.analysis.groups 항목이 올바르지 않습니다: ${JSON.stringify(g).slice(0, 60)}`);
          continue;
        }
        for (const id of g.memberIds) {
          if (!ids.has(id)) fail(IMP_FILE, `meta.analysis.groups.${g.id} 가 없는 의원을 참조합니다: ${id}`);
        }
      }
    }
    if (!Array.isArray(analysis.points) || analysis.points.length < 3) fail(IMP_FILE, "meta.analysis.points 가 부족합니다");
    if (!Array.isArray(analysis.readings) || analysis.readings.length < 1) fail(IMP_FILE, "meta.analysis.readings 가 없습니다");
  }
  // 2026년 현재 근황(meta.current): 통계·묶음·의원별 current* 필드가 서로 맞아야 한다.
  const cur = meta.current;
  if (!isObject(cur)) {
    fail(IMP_FILE, "meta.current(2026년 현재 근황)이 없습니다");
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(cur.asOf || ""))) fail(IMP_FILE, "meta.current.asOf 날짜 형식이 올바르지 않습니다");
    if (!Array.isArray(cur.stats) || cur.stats.length < 2) fail(IMP_FILE, "meta.current.stats 가 부족합니다");
    else cur.stats.forEach((s, i) => { if (!s.label || !s.value) fail(IMP_FILE, `meta.current.stats[${i}] 에 label/value 가 없습니다`); });
    if (!Array.isArray(cur.groups) || cur.groups.length < 2) {
      fail(IMP_FILE, "meta.current.groups 가 부족합니다");
    } else {
      const seen = new Set();
      for (const g of cur.groups) {
        if (!g.id || !g.label || !Array.isArray(g.memberIds) || !g.memberIds.length) {
          fail(IMP_FILE, `meta.current.groups 항목이 올바르지 않습니다: ${JSON.stringify(g).slice(0, 60)}`);
          continue;
        }
        if (seen.has(g.id)) fail(IMP_FILE, `meta.current.groups id 중복: ${g.id}`);
        seen.add(g.id);
        for (const id of g.memberIds) {
          if (!ids.has(id)) fail(IMP_FILE, `meta.current.groups.${g.id} 가 없는 의원을 참조합니다: ${id}`);
        }
      }
    }
    if (!Array.isArray(cur.sources) || cur.sources.length < 5) {
      warn(IMP_FILE, "meta.current.sources 가 부족합니다");
    } else {
      cur.sources.forEach((s, i) => {
        if (!Array.isArray(s) || s.length < 2 || !/^https?:\/\//.test(String(s[1] || ""))) {
          fail(IMP_FILE, `meta.current.sources[${i}] 링크 형식이 올바르지 않습니다`);
        }
      });
    }
  }
  const CURRENT_KINDS = ["mayor", "party", "leader", "vacant", "warn", "note"];
  let currentCount = 0;
  for (const m of members) {
    if (m.currentNote === undefined) continue;
    currentCount += 1;
    if (typeof m.currentNote !== "string" || m.currentNote.length < 20) fail(IMP_FILE, `${m.name}: currentNote 가 너무 짧습니다`);
    if (!m.currentTitle) fail(IMP_FILE, `${m.name}: currentTitle 이 없습니다`);
    if (m.currentStatusBadge && !m.currentBadgeKind) warn(IMP_FILE, `${m.name}: currentBadgeKind 가 없습니다`);
    if (m.currentBadgeKind && !CURRENT_KINDS.includes(m.currentBadgeKind)) fail(IMP_FILE, `${m.name}: currentBadgeKind 값 오류: ${m.currentBadgeKind}`);
    if (m.currentParty && !IMP_PARTIES.includes(String(m.currentParty).split(" ")[0])) {
      fail(IMP_FILE, `${m.name}: currentParty 가 알 수 없는 정당으로 시작합니다: ${m.currentParty}`);
    }
  }
  if (currentCount < 20) fail(IMP_FILE, `2026년 현재 근황이 채워진 의원이 너무 적습니다(현재 ${currentCount}명)`);

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
  if (!html.includes('data-ds="impeachment"')) fail(file, "상단 스위처에 탄핵 표결 기록부가 없습니다");
  if (html.includes('data-view="impeachment"')) fail(file, "하단 탭에 탄핵 표결이 남아 있습니다");
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

process.stdout.write("- index.html 탄핵 표결 스위처 ... ");
const idxBefore = errors;
const indexHtml = readFileSync(join(publicDir, "index.html"), "utf8");
if (!indexHtml.includes('data-ds="impeachment"')) fail("index.html", "상단 스위처에 탄핵 표결 기록부가 없습니다");
if (indexHtml.includes('data-view="impeachment"')) fail("index.html", "하단 탭에 탄핵 표결이 남아 있습니다");
if (!indexHtml.includes('"impeachment-assembly-data.json"')) fail("index.html", "탄핵 표결 데이터 fetch 가 없습니다");
if (!indexHtml.includes("function renderImpeachment")) fail("index.html", "renderImpeachment 함수가 없습니다");
console.log(errors === idxBefore ? "통과" : "실패");

console.log(`\n결과: 오류 ${errors}건, 경고 ${warnings}건`);
if (errors > 0) process.exit(1);
console.log("모든 검증을 통과했습니다.");
