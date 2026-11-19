// 해시 라우팅(딥링크) 단위 테스트
//   npm test  (node --test tests/)
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseHash, VIEWS, DATASET_KEYS, TARGET_TYPES } = require("../public/core.js");

const empty = { dataset: null, view: null, targetType: null, targetId: null };

test("parseHash: 빈 해시·'#' 은 라우트가 아니다", () => {
  assert.equal(parseHash(""), null);
  assert.equal(parseHash("#"), null);
  assert.equal(parseHash(null), null);
  assert.equal(parseHash(undefined), null);
});

test("parseHash: 네 기록부 × 여섯 탭 조합", () => {
  for (const ds of DATASET_KEYS) {
    if (ds === "impeachment") continue; // 탄핵 표결은 최상위 라우트
    for (const view of VIEWS) {
      assert.deepEqual(parseHash(`#${ds}/${view}`), { ...empty, dataset: ds, view });
    }
  }
});

test("parseHash: 탄핵 표결 기록부는 최상위 라우트 #impeachment", () => {
  assert.deepEqual(parseHash("#impeachment"), { ...empty, dataset: "impeachment" });
});

test("parseHash: 예전 하위 탭 해시 #dec03/impeachment 는 정규화 대상으로 표시", () => {
  const r = parseHash("#dec03/impeachment");
  assert.equal(r.dataset, "impeachment");
  assert.equal(r.legacy, true);
});

test("parseHash: 인물 딥링크", () => {
  assert.deepEqual(parseHash("#dec03/person/anms"), {
    ...empty, dataset: "dec03", targetType: "person", targetId: "anms",
  });
  assert.deepEqual(parseHash("#kim/person/kimkh"), {
    ...empty, dataset: "kim", targetType: "person", targetId: "kimkh",
  });
});

test("parseHash: 사건 딥링크", () => {
  assert.deepEqual(parseHash("#chae/case/leejsh"), {
    ...empty, dataset: "chae", targetType: "case", targetId: "leejsh",
  });
});

test("parseHash: 재판부 딥링크(대시로 이은 재판부 이름)", () => {
  assert.deepEqual(parseHash("#dec03/panel/panel-대법원-전원합의체"), {
    ...empty, dataset: "dec03", targetType: "panel", targetId: "panel-대법원-전원합의체",
  });
});

test("parseHash: 인코딩된 한글 딥링크는 디코드한다", () => {
  const r = parseHash("#dec03/person/" + encodeURIComponent("김용현"));
  assert.equal(r.targetType, "person");
  assert.equal(r.targetId, "김용현");
});

test("parseHash: id 에 '/' 가 들어가도 나머지를 이어 붙인다", () => {
  assert.equal(parseHash("#dec03/case/a/b/c").targetId, "a/b/c");
});

test("parseHash: 타깃 종류만 있고 id 가 없으면 타깃 없는 라우트", () => {
  assert.deepEqual(parseHash("#dec03/person"), { ...empty, dataset: "dec03" });
  assert.deepEqual(parseHash("#dec03/person/"), { ...empty, dataset: "dec03" });
});

test("parseHash: 기록부 없이 탭만 있는 해시는 뷰만 바꾼다", () => {
  for (const view of VIEWS) {
    assert.deepEqual(parseHash(`#${view}`), { ...empty, view });
  }
});

test("parseHash: 알 수 없는 기록부·탭만 있는 해시는 null", () => {
  assert.equal(parseHash("#unknown"), null);
  assert.equal(parseHash("#Person/anms"), null);
  // 기록부는 알지만 탭 이름이 틀리면 기록부만 적용한다
  assert.deepEqual(parseHash("#dec03/unknown"), { ...empty, dataset: "dec03" });
});

test("parseHash: 알 수 없는 탭 이름은 dataset 만 남기고 view 는 null", () => {
  assert.deepEqual(parseHash("#dec03/nope"), { ...empty, dataset: "dec03" });
});

test("parseHash: 모든 탭·타깃 이름이 core.js 선언과 일치", () => {
  assert.deepEqual(VIEWS, ["timeline", "cases", "people", "graph", "judges", "charts"]);
  assert.deepEqual(DATASET_KEYS, ["dec03", "impeachment", "kim", "chae"]);
  assert.deepEqual(TARGET_TYPES, ["person", "case", "panel"]);
});
