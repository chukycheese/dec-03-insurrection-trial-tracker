// 한글 초성 검색 단위 테스트 (재판 기록부 검색 + 탄핵 표결 의원 검색)
//   npm test  (node --test tests/)
const test = require("node:test");
const assert = require("node:assert/strict");
const { chosungOf, textMatches, impChosung, impNorm, impMatch } = require("../public/core.js");

test("chosungOf: 한글 음절을 초성으로 바꾼다", () => {
  assert.equal(chosungOf("김용현"), "ㄱㅇㅎ");
  assert.equal(chosungOf("윤석열"), "ㅇㅅㅇ");
  assert.equal(chosungOf("추경호"), "ㅊㄱㅎ");
});

test("chosungOf: 쌍자음·된소리 초성도 구분한다", () => {
  assert.equal(chosungOf("까"), "ㄲ");
  assert.equal(chosungOf("따"), "ㄸ");
  assert.equal(chosungOf("싸"), "ㅆ");
  assert.equal(chosungOf("짜"), "ㅉ");
});

test("chosungOf: 영문·숫자·공백·이미 초성인 자모는 그대로 둔다", () => {
  assert.equal(chosungOf("김용현 ABC 123"), "ㄱㅇㅎ ABC 123");
  assert.equal(chosungOf("ㄱㅇㅎ"), "ㄱㅇㅎ");
});

test("chosungOf: 빈 값·null 안전", () => {
  assert.equal(chosungOf(""), "");
  assert.equal(chosungOf(null), "");
  assert.equal(chosungOf(undefined), "");
});

test("textMatches: 완성형 부분 일치", () => {
  assert.equal(textMatches("김용현 경호처", "김용현"), true);
  assert.equal(textMatches("김용현 경호처", "경호"), true);
  assert.equal(textMatches("김용현 경호처", "박정훈"), false);
});

test("textMatches: 초성 질의", () => {
  assert.equal(textMatches("김용현", "ㄱㅇㅎ"), true);
  assert.equal(textMatches("김용현", "ㅇㅎ"), true);
  assert.equal(textMatches("김용현", "ㄱㅇ"), true);
  assert.equal(textMatches("김용현", "ㅂㅈㅎ"), false);
});

test("textMatches: 완성형·초성 혼합 질의", () => {
  assert.equal(textMatches("김용현", "김ㅇㅎ"), true);
  assert.equal(textMatches("김용현", "ㄱ용현"), true);
});

test("textMatches: 대소문자·앞뒤 공백 무시", () => {
  assert.equal(textMatches("Kim Yong-hyun", "kim"), true);
  assert.equal(textMatches("Kim Yong-hyun", "  YONG  "), true);
});

test("textMatches: 빈 질의는 항상 통과(필터 없음)", () => {
  assert.equal(textMatches("아무거나", ""), true);
  assert.equal(textMatches("아무거나", "   "), true);
  assert.equal(textMatches("아무거나", null), true);
});

test("textMatches: 대상이 비어 있으면 질의가 있을 때 불일치", () => {
  assert.equal(textMatches("", "김"), false);
  assert.equal(textMatches(null, "김"), false);
});

const MEMBER = {
  name: "안철수", constituency: "성남시 분당구 갑", party: "국민의힘", role: "의원", term: "3선",
};

test("impNorm: 소문자화 + 공백 제거", () => {
  assert.equal(impNorm(" Seong Nam "), "seongnam");
  assert.equal(impNorm(null), "");
});

test("impChosung: 페이지 검색과 같은 초성 규칙", () => {
  assert.equal(impChosung("안철수"), "ㅇㅊㅅ");
  assert.equal(impChosung("안철수"), chosungOf("안철수"));
});

test("impMatch: 이름 완성형", () => {
  assert.equal(impMatch(MEMBER, "안철수"), true);
  assert.equal(impMatch(MEMBER, "철수"), true);
});

test("impMatch: 정당·직책", () => {
  assert.equal(impMatch(MEMBER, "국민의힘"), true);
  assert.equal(impMatch(MEMBER, "의원"), true);
});

test("impMatch: 공백 무시 지역구 검색", () => {
  assert.equal(impMatch(MEMBER, "성남시분당구갑"), true);
  assert.equal(impMatch(MEMBER, "분당"), true);
});

test("impMatch: 구·시·군을 줄인 지역구 검색('분당갑')", () => {
  const m = { name: "김병욱", constituency: "성남시 분당구 갑", party: "더불어민주당" };
  assert.equal(impMatch(m, "분당갑"), true);
});

test("impMatch: 자음만 입력한 초성 질의", () => {
  assert.equal(impMatch(MEMBER, "ㅇㅊㅅ"), true);
  assert.equal(impMatch(MEMBER, "ㅇㅊ"), true);
  assert.equal(impMatch(MEMBER, "ㄱㅁㅎ"), false);
});

test("impMatch: 초성이 섞인 질의는 이름 필드로 비교", () => {
  assert.equal(impMatch(MEMBER, "안ㅊㅅ"), true);
  assert.equal(impMatch(MEMBER, "안ㅂ"), false);
});

test("impMatch: 빈 질의는 통과, 없는 이름은 불일치", () => {
  assert.equal(impMatch(MEMBER, ""), true);
  assert.equal(impMatch(MEMBER, "없는사람"), false);
});
