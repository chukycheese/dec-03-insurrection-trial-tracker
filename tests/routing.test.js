// 해시 라우팅(딥링크) 단위 테스트
//   npm test  (node --test tests/)
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseHash, targetViewOf, targetCardIdOf, VIEWS, DATASET_KEYS, TARGET_TYPES } = require("../public/core.js");

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

// ===== 딥링크 타깃 → 탭 전환 (이미 열린 화면의 해시 변경 버그의 회귀 가드) =====
test("targetViewOf: 재판부는 재판부 탭, 사건은 사건별 탭, 인물은 탭 없음(모달)", () => {
  assert.equal(targetViewOf("panel"), "judges");
  assert.equal(targetViewOf("case"), "cases");
  assert.equal(targetViewOf("person"), null);
  assert.equal(targetViewOf(null), null);
  assert.equal(targetViewOf(undefined), null);
  assert.equal(targetViewOf("nope"), null);
});

test("targetCardIdOf: 재판부 panel- 접두사 정규화·사건 case- 접두사", () => {
  assert.equal(targetCardIdOf("panel", "서울고법-형사1부"), "panel-서울고법-형사1부");
  assert.equal(targetCardIdOf("panel", "panel-대법원-전원합의체"), "panel-대법원-전원합의체");
  assert.equal(targetCardIdOf("case", "yoon-main"), "case-yoon-main");
  assert.equal(targetCardIdOf("person", "yoon"), null);
  assert.equal(targetCardIdOf("panel", ""), null);
  assert.equal(targetCardIdOf("case", null), null);
});

test("해시 → 탭: 세 재판 기록부의 재판부·사건 딥링크가 올바른 탭을 연다", () => {
  for (const ds of DATASET_KEYS) {
    if (ds === "impeachment") continue; // 탄핵 표결은 최상위 기록부
    const panel = parseHash(`#${ds}/panel/서울고법-형사1부`);
    assert.equal(panel.dataset, ds);
    assert.equal(targetViewOf(panel.targetType), "judges");
    assert.equal(targetCardIdOf(panel.targetType, panel.targetId), "panel-서울고법-형사1부");
    const kase = parseHash(`#${ds}/case/yoon-main`);
    assert.equal(targetViewOf(kase.targetType), "cases");
    assert.equal(targetCardIdOf(kase.targetType, kase.targetId), "case-yoon-main");
  }
});

test("해시 → 탭: 탭 해시·인물 딥링크는 탭을 바꾸지 않는다", () => {
  for (const hash of ["#dec03/cases", "#kim", "#judges", "#impeachment", "#dec03/person/yoon"]) {
    const r = parseHash(hash);
    assert.equal(targetViewOf(r && r.targetType), null, hash);
  }
});
