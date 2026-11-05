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

process.stdout.write("- insurrection-trials-offline.html ... ");
const before = errors;
validateOfflineHtml(join(publicDir, "insurrection-trials-offline.html"));
console.log(errors === before ? "통과" : "실패");

console.log(`\n결과: 오류 ${errors}건, 경고 ${warnings}건`);
if (errors > 0) process.exit(1);
console.log("모든 검증을 통과했습니다.");
