#!/usr/bin/env node
// 데이터 무결성 검증: public/*.json 의 구조와 참조 관계, 프로필 사진 파일 존재 여부를 확인한다.
// 외부 의존성 없이 Node 20 이상에서 동작한다. (npm run validate)

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOfflineHtml } from "./offline-build.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");
const datasets = [
  "insurrection-trials-data.json",
  "kim-trials-data.json",
  "chae-trials-data.json",
];
const requiredSections = ["cases", "rulings", "sentences", "people", "judges", "meta"];
const IMP_FILE = "impeachment-assembly-data.json";
// 오프라인 사본이 내장하는 재판 데이터: [EMBEDDED.<이름>, 원본 JSON]
const OFFLINE_EMBEDDED = [
  ["dec03", "insurrection-trials-data.json"],
  ["kim", "kim-trials-data.json"],
  ["chae", "chae-trials-data.json"],
];
const IMP_PARTIES = ["더불어민주당", "국민의힘", "조국혁신당", "개혁신당", "진보당", "기본소득당", "사회민주당", "무소속"];
const IMP_VOTE1 = ["참석", "불참", "미재임"];
const IMP_VOTE0 = ["참석", "불참", "미재임"];
const IMP_STANCE = ["support", "oppose", "undisclosed", "none"];
// 인용 금지 언론사: 표기(이름)와 도메인을 모두 검사한다.
// 판결의 sources 항목과 함께 인물 사진의 출처·저작자 표시 필드(PHOTO_CREDIT_FIELDS)도 검사한다 —
// 사진은 저작자 표시가 필요하므로, 인용 금지 언론사 사진을 쓰려면 다른 매체 사진으로 교체해야 한다.
const EXCLUDED_OUTLETS = [
  ["위키트리", "wikitree.co.kr"],
  ["허프포스트", "huffingtonpost.kr"],
  ["인사이트", "insight.co.kr"],
  ["뉴데일리", "newdaily.co.kr"],
  ["데일리안", "dailian.co.kr"],
  ["시사타파뉴스", "sstpnews.com"],
  ["민들레", "mindlenews.com"],
];

// 인물 사진의 출처·저작자 표시 필드: 여기 적힌 매체가 하나라도 남아 있으면 검증 실패.
const PHOTO_CREDIT_FIELDS = ["photoCredit", "photoLicense", "photoLicenseUrl", "photoSource"];

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

// 두 문자열이 처음으로 달라지는 위치(0부터). 같으면 -1
function firstDifference(a, b) {
  const limit = Math.min(a.length, b.length);
  for (let i = 0; i < limit; i += 1) {
    if (a[i] !== b[i]) return i;
  }
  return a.length === b.length ? -1 : limit;
}

function checkDate(file, label, value) {
  if (value === "" || value === undefined || value === null) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    fail(file, `${label} 날짜 형식이 올바르지 않습니다: ${JSON.stringify(value)}`);
  }
}

// 문자열 하나(저작자 표시·출처 URL 등)에 인용 금지 언론사가 들어 있는지 판별한다. 아니면 빈 문자열.
function findExcludedOutletText(text) {
  const value = String(text ?? "");
  if (!value) return "";
  const lower = value.toLowerCase();
  for (const [outlet, domain] of EXCLUDED_OUTLETS) {
    if (value.includes(outlet)) return `${outlet} (표기 “${value}”)`;
    if (lower.includes(domain)) return `${outlet} (도메인 ${domain})`;
  }
  return "";
}

// sources 한 항목이 인용 금지 언론사인지 판별한다. 아니면 빈 문자열.
function findExcludedOutlet(source) {
  if (!Array.isArray(source)) return "";
  const label = String(source[0] ?? "");
  const link = String(source[1] ?? "").toLowerCase();
  for (const [outlet, domain] of EXCLUDED_OUTLETS) {
    if (label.includes(outlet)) return `${outlet} (표기 “${label}”)`;
    if (link.includes(domain)) return `${outlet} (도메인 ${domain})`;
  }
  return "";
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
          continue;
        }
        const excluded = findExcludedOutlet(source);
        if (excluded) {
          fail(
            file,
            `rulings.${rulingId}.sources 에 인용 금지 언론사가 있습니다: ${excluded} — ${JSON.stringify(source)} (연합뉴스·한겨레·경향신문·KBS·MBC·SBS·법률신문 등으로 교체하세요)`,
          );
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
    for (const field of PHOTO_CREDIT_FIELDS) {
      const excluded = findExcludedOutletText(person[field]);
      if (excluded) {
        fail(
          file,
          `people.${personId}.${field} 에 인용 금지 언론사가 있습니다: ${excluded} — 연합뉴스·뉴스1·뉴스핌·더팩트 등 다른 매체 사진으로 교체하세요`,
        );
      }
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
  for (const [name, source] of OFFLINE_EMBEDDED) {
    const match = html.match(new RegExp(`^EMBEDDED\\.${name}=(\\{.*\\});$`, "m"));
    if (!match) {
      warn(file, `내장 데이터 블록(EMBEDDED.${name})을 찾지 못했습니다 (scripts/build-offline.py 로 다시 생성하세요)`);
      continue;
    }
    let embedded;
    try {
      embedded = JSON.parse(match[1]);
    } catch (error) {
      fail(file, `EMBEDDED.${name} 내장 데이터 JSON 파싱 실패: ${error.message}`);
      continue;
    }
    for (const section of requiredSections) {
      if (!isObject(embedded[section])) {
        fail(file, `EMBEDDED.${name} 내장 데이터에 "${section}" 섹션이 없습니다`);
      }
    }
    const current = JSON.parse(readFileSync(join(publicDir, source), "utf8"));
    for (const section of ["cases", "rulings", "people", "judges"]) {
      const embeddedIds = new Set(Object.keys(embedded[section] || {}));
      const currentIds = new Set(Object.keys(current[section] || {}));
      const missing = [...currentIds].filter((id) => !embeddedIds.has(id));
      const extra = [...embeddedIds].filter((id) => !currentIds.has(id));
      if (missing.length) {
        warn(file, `${name} 내장 ${section} 에 현재 데이터의 항목이 없습니다: ${missing.slice(0, 5).join(", ")}`);
      }
      if (extra.length) {
        warn(file, `${name} 내장 ${section} 에 현재 데이터에 없는 항목이 있습니다: ${extra.slice(0, 5).join(", ")}`);
      }
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
      } else {
        const excluded = findExcludedOutlet(m.stanceSource);
        if (excluded) fail(IMP_FILE, `${m.name}.stanceSource 에 인용 금지 언론사가 있습니다: ${excluded}`);
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
          return;
        }
        const excluded = findExcludedOutlet(s);
        if (excluded) fail(IMP_FILE, `meta.current.sources[${i}] 에 인용 금지 언론사가 있습니다: ${excluded}`);
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

// ── CSS/JS 분리 구조: index.html 은 마크업, styles.css · core.js · app.js 는 바깥 파일 ──────
process.stdout.write("- index.html CSS/JS 분리 링크 ... ");
const splitBefore = errors;
const indexHtml = readFileSync(join(publicDir, "index.html"), "utf8");
const appJs = readFileSync(join(publicDir, "app.js"), "utf8");
const coreJs = readFileSync(join(publicDir, "core.js"), "utf8");
readFileSync(join(publicDir, "styles.css"), "utf8");   // 존재 확인
if (!indexHtml.includes('<link rel="stylesheet" href="styles.css">')) {
  fail("index.html", "styles.css 스타일시트 링크가 없습니다");
}
if (!indexHtml.includes('<script src="core.js"></script>')) {
  fail("index.html", "core.js 스크립트가 없습니다 (app.js 보다 먼저 로드해야 합니다)");
}
if (!indexHtml.includes('<script src="app.js"></script>')) {
  fail("index.html", "app.js 스크립트가 없습니다");
}
const coreAt = indexHtml.indexOf('<script src="core.js">');
const appAt = indexHtml.indexOf('<script src="app.js">');
if (coreAt >= 0 && appAt >= 0 && coreAt > appAt) {
  fail("index.html", "core.js 가 app.js 뒤에 로드됩니다 (core.js 가 먼저여야 합니다)");
}
if (indexHtml.includes("<style>")) fail("index.html", "인라인 <style> 블록이 남아 있습니다");
const inlineScript = indexHtml.match(/<script>(?!\s*<\/script>)([\s\S]*?)<\/script>/);
if (inlineScript && inlineScript[1].trim()) fail("index.html", "인라인 <script> 블록이 남아 있습니다");
for (const tag of ['href="styles.css"', 'src="core.js"', 'src="app.js"']) {
  if (coreJs.includes(tag)) fail("core.js", `다른 파일 참조가 남아 있습니다: ${tag}`);
}
console.log(errors === splitBefore ? "통과" : "실패");

// ── 파비콘: index.html 이 벡터·ICO 아이콘을 링크하고 파일이 실제로 있는지 ────────────
process.stdout.write("- 파비콘·터치 아이콘 ... ");
const iconBefore = errors;
for (const name of ["favicon.svg", "favicon.ico", "apple-touch-icon.png"]) {
  if (!existsSync(join(publicDir, name))) fail(name, "파일이 없습니다 (브라우저가 404 를 받습니다)");
}
for (const tag of [
  '<link rel="icon" href="favicon.svg" type="image/svg+xml">',
  '<link rel="icon" href="favicon.ico" sizes="32x32">',
  '<link rel="apple-touch-icon" href="apple-touch-icon.png">',
]) {
  if (!indexHtml.includes(tag)) fail("index.html", `아이콘 링크가 없습니다: ${tag}`);
}
if (existsSync(join(publicDir, "favicon.ico"))) {
  const ico = readFileSync(join(publicDir, "favicon.ico"));
  if (ico.length < 22 || ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1) {
    fail("favicon.ico", "ICO 헤더가 올바르지 않습니다 (예약 0 · type 1 로 시작해야 합니다)");
  } else {
    const count = ico.readUInt16LE(4);
    const sizes = [];
    for (let i = 0; i < count; i += 1) sizes.push(ico[6 + i * 16] || 256);   // 0 은 256px 표기
    if (!sizes.includes(16) || !sizes.includes(32)) fail("favicon.ico", `16px·32px 항목이 없습니다 (${sizes.join("/")})`);
  }
}
if (existsSync(join(publicDir, "apple-touch-icon.png"))) {
  const png = readFileSync(join(publicDir, "apple-touch-icon.png"));
  if (!(png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47)) fail("apple-touch-icon.png", "PNG 파일이 아닙니다");
}
if (existsSync(join(publicDir, "favicon.svg"))) {
  const svg = readFileSync(join(publicDir, "favicon.svg"), "utf8");
  if (!svg.includes("<svg") || !svg.includes('viewBox="0 0 32 32"')) fail("favicon.svg", "32×32 viewBox 를 가진 SVG 가 아닙니다");
}
console.log(errors === iconBefore ? "통과" : "실패");

process.stdout.write("- app.js 문법·모듈 경계 ... ");
const appBefore = errors;
try {
  new Function(appJs);   // 실행하지 않고 문법만 검사한다
} catch (error) {
  fail("app.js", `문법 오류: ${error.message}`);
}
for (const pattern of ["document.getElementById", "localStorage.", "window.", "fetch("]) {
  if (coreJs.includes(pattern)) fail("core.js", `순수 모듈에 브라우저 API(${pattern})가 들어 있습니다 (app.js 로 옮기세요)`);
}
if (!coreJs.includes("module.exports")) fail("core.js", "Node 단위 테스트용 module.exports 가 없습니다");
console.log(errors === appBefore ? "통과" : "실패");

process.stdout.write("- app.js 탄핵 표결 스위처 ... ");
const idxBefore = errors;
if (!indexHtml.includes('data-ds="impeachment"')) fail("index.html", "상단 스위처에 탄핵 표결 기록부가 없습니다");
if (indexHtml.includes('data-view="impeachment"')) fail("index.html", "하단 탭에 탄핵 표결이 남아 있습니다");
if (!appJs.includes('"impeachment-assembly-data.json"')) fail("app.js", "탄핵 표결 데이터 fetch 가 없습니다");
if (!appJs.includes("function renderImpeachment")) fail("app.js", "renderImpeachment 함수가 없습니다");
console.log(errors === idxBefore ? "통과" : "실패");

process.stdout.write("- app.js fetch 전용(내장 JSON 없음) ... ");
const liteBefore = errors;
for (const [name, source] of OFFLINE_EMBEDDED) {
  if (appJs.includes(`EMBEDDED.${name}=`)) {
    fail("app.js", `내장 데이터(EMBEDDED.${name})가 남아 있습니다. 온라인 배포본은 fetch 로만 데이터를 읽습니다`);
  }
  if (!appJs.includes(`"${source}"`)) {
    fail("app.js", `데이터셋 fetch 경로가 없습니다: ${source}`);
  }
}
if (!appJs.includes("const EMBEDDED={};")) {
  fail("app.js", "오프라인 내장 지점(const EMBEDDED={};)이 없습니다 (scripts/build-offline.py 가 여기에 주입합니다)");
}
console.log(errors === liteBefore ? "통과" : "실패");

process.stdout.write("- 오프라인 사본 단일 파일(외부 CSS/JS 없음) ... ");
const singleBefore = errors;
const offlineHtml = readFileSync(join(publicDir, "insurrection-trials-offline.html"), "utf8");
for (const tag of ['href="styles.css"', 'src="core.js"', 'src="app.js"', 'href="favicon', 'apple-touch-icon.png"']) {
  if (offlineHtml.includes(tag)) fail("insurrection-trials-offline.html", `외부 참조가 남아 있습니다: ${tag} (scripts/build-offline.py 로 다시 생성하세요)`);
}
if (!offlineHtml.includes("let OFFLINE_ONLY=true;")) {
  fail("insurrection-trials-offline.html", "OFFLINE_ONLY 플래그가 켜져 있지 않습니다 (scripts/build-offline.py 로 다시 생성하세요)");
}
if (!offlineHtml.includes("const IMP_EMBEDDED =")) {
  fail("insurrection-trials-offline.html", "IMP_EMBEDDED 내장 탄핵 데이터가 없습니다");
}
if (!offlineHtml.includes("// ===== core.js =====")) {
  warn("insurrection-trials-offline.html", "core.js 인라인 표식을 찾지 못했습니다 (주석이 바뀌었는지 확인하세요)");
}
console.log(errors === singleBefore ? "통과" : "실패");

// ── 오프라인 사본 동기화: 현재 소스로 다시 만들어 커밋된 사본과 바이트 단위로 비교한다 ────────
// index.html · styles.css · core.js · app.js · JSON 4종 중 하나라도 바뀌고 사본을 다시 만들지 않으면 실패한다.
process.stdout.write("- 오프라인 사본 동기화(HTML·CSS·JS·JSON) ... ");
const syncBefore = errors;
try {
  const regenerated = buildOfflineHtml();
  if (regenerated !== offlineHtml) {
    const at = firstDifference(regenerated, offlineHtml);
    fail(
      "insurrection-trials-offline.html",
      `현재 소스로 다시 만든 사본과 다릅니다 (첫 차이 ${at.toLocaleString("en-US")}번째 글자 · 커밋된 사본 ` +
        `${offlineHtml.length.toLocaleString("en-US")}자 · 생성본 ${regenerated.length.toLocaleString("en-US")}자) ` +
        "— npm run build:offline 으로 다시 생성하세요",
    );
  }
} catch (error) {
  fail("insurrection-trials-offline.html", `현재 소스로 다시 만들지 못했습니다: ${error.message}`);
}
console.log(errors === syncBefore ? "통과" : "실패");

// ── d3 지연 로딩: d3@7 은 관계도 뷰를 처음 열 때 app.js 가 한 번만 주입한다 ────────────────
process.stdout.write("- d3 지연 로딩(관계도 진입 시 1회) ... ");
const d3Before = errors;
if (/<script[^>]+d3[^>]*\.js/i.test(indexHtml)) {
  fail("index.html", "d3 스크립트를 즉시 불러오고 있습니다 (관계도 뷰에서만 지연 로딩해야 합니다)");
}
if (!/function ensureD3\(/.test(appJs)) {
  fail("app.js", "ensureD3 지연 로더가 없습니다");
}
if (!appJs.includes("await ensureD3()")) {
  fail("app.js", "renderGraph 가 d3 로딩을 기다리지 않습니다");
}
if (indexHtml.includes("d3@7") || offlineHtml.includes('src="https://cdn.jsdelivr.net/npm/d3@7')) {
  fail("index.html", "d3 CDN 주소가 HTML 에 남아 있습니다 (app.js 의 D3_CDN 하나로 관리하세요)");
}
console.log(errors === d3Before ? "통과" : "실패");

console.log(`\n결과: 오류 ${errors}건, 경고 ${warnings}건`);
if (errors > 0) process.exit(1);
console.log("모든 검증을 통과했습니다.");
