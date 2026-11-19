// 날짜·'예정' 배지 판정 단위 테스트
//   npm test  (node --test tests/)
const test = require("node:test");
const assert = require("node:assert/strict");
const { todayOf, isSchedRuling } = require("../public/core.js");

test("todayOf: 데이터 기준일(asOf)보다 기기 날짜가 뒤면 기기 날짜", () => {
  assert.equal(todayOf(new Date(2026, 10, 19, 23, 5), "2026-11-18"), "2026-11-19");
});

test("todayOf: asOf 가 더 미래면 asOf 를 쓴다", () => {
  // 데이터가 기기 시계보다 앞서 있을 때는 데이터 기준일이 오늘
  assert.equal(todayOf(new Date(2026, 10, 18, 8, 0), "2026-11-19"), "2026-11-19");
});

test("todayOf: asOf 가 없으면 기기 날짜, 월·일은 두 자리로 채운다", () => {
  assert.equal(todayOf(new Date(2026, 0, 5, 0, 30), ""), "2026-01-05");
  assert.equal(todayOf(new Date(2026, 0, 5, 0, 30), undefined), "2026-01-05");
});

test("todayOf: 자정 직후·자정 직전 모두 로컬 날짜 기준", () => {
  assert.equal(todayOf(new Date(2026, 11, 31, 0, 0), ""), "2026-12-31");
  assert.equal(todayOf(new Date(2026, 11, 31, 23, 59), ""), "2026-12-31");
});

test("isSchedRuling: 날짜가 없으면 예정이 아니다", () => {
  assert.equal(isSchedRuling({ kind: "pending", result: "선고 예정" }, "2026-11-19"), false);
});

const TODAY = "2026-11-19";

test("isSchedRuling: 미래 날짜의 pending 공판은 예정", () => {
  assert.equal(isSchedRuling({ date: "2026-12-01", kind: "pending", result: "1차 공판" }, TODAY), true);
});

test("isSchedRuling: 미래 날짜의 '선고 예정' 판결은 예정", () => {
  assert.equal(isSchedRuling({ date: "2027-01-26", kind: "ruling", result: "선고 예정" }, TODAY), true);
});

test("isSchedRuling: 미래 날짜라도 결과가 확정된 판결은 예정이 아니다", () => {
  assert.equal(isSchedRuling({ date: "2026-12-01", kind: "ruling", result: "징역 2년" }, TODAY), false);
});

test("isSchedRuling: 지난 날짜에 '선고 예정' 문구가 남아 있어도 예정이 아니다 (2026-11-13 회귀)", () => {
  // 예전에는 날짜를 보지 않고 result 문구만 보고 과거 일정에도 '예정' 배지를 붙였다.
  assert.equal(isSchedRuling({ date: "2026-11-13", kind: "pending", result: "선고 예정" }, TODAY), false);
  assert.equal(isSchedRuling({ date: "2026-11-01", kind: "ruling", result: "선고 예정" }, TODAY), false);
});

test("isSchedRuling: 오늘 날짜 + pending + '예정' 문구는 예정", () => {
  assert.equal(isSchedRuling({ date: TODAY, kind: "pending", result: "16:00 선고 예정" }, TODAY), true);
});

test("isSchedRuling: 오늘 날짜라도 '예정' 문구가 없는 pending 은 예정이 아니다", () => {
  assert.equal(isSchedRuling({ date: TODAY, kind: "pending", result: "" }, TODAY), false);
});

test("isSchedRuling: 오늘 날짜의 '선고 예정' 판결은 예정", () => {
  assert.equal(isSchedRuling({ date: TODAY, kind: "ruling", result: "선고 예정" }, TODAY), true);
});

test("isSchedRuling: 오늘 이미 선고된 판결(kind=ruling, 결과 확정)은 예정이 아니다", () => {
  assert.equal(isSchedRuling({ date: TODAY, kind: "ruling", result: "징역 1년" }, TODAY), false);
});

test("isSchedRuling: 날짜 비교는 문자열 사전순(YYYY-MM-DD)으로 이뤄진다", () => {
  assert.equal(isSchedRuling({ date: "2026-11-20", kind: "pending" }, TODAY), true);
  assert.equal(isSchedRuling({ date: "2026-11-18", kind: "pending" }, TODAY), false);
  assert.equal(isSchedRuling({ date: "2027-01-01", kind: "pending" }, "2026-12-31"), true);
});
