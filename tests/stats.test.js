// 형량 환산·판결 결과 분류·심급 통계 단위 테스트
//   npm test  (node --test tests/)
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isAcq, getSentenceWeight, sentenceMonths, caseOutcome, calculateOutcomeStats,
  chartMonthsOf, CHART_SCALE, buildChartRows,
} = require("../public/core.js");

// ── 형량 문자열 → 개월 수 ────────────────────────────────────────────────────
test("sentenceMonths: 징역 년·개월 환산", () => {
  assert.equal(sentenceMonths("징역 2년"), 24);
  assert.equal(sentenceMonths("징역 6개월"), 6);
  assert.equal(sentenceMonths("징역 1년 6개월"), 18);
  assert.equal(sentenceMonths("징역 30년"), 360);
});

test("sentenceMonths: 사형·무기징역은 최상위 가중치", () => {
  assert.equal(sentenceMonths("사형"), 2400);
  assert.equal(sentenceMonths("무기징역"), 1200);
});

test("sentenceMonths: 무죄 0, 벌금·집행유예 1", () => {
  assert.equal(sentenceMonths("무죄"), 0);
  assert.equal(sentenceMonths("벌금 1,000만원"), 1);
  assert.equal(sentenceMonths("집행유예 2년"), 1);
  // 집행유예가 붙어도 징역 기간이 적혀 있으면 그 기간으로 환산한다
  assert.equal(sentenceMonths("징역 2년 집행유예 4년"), 24);
});

test("sentenceMonths: 괄호 안 보충 설명은 판단에서 제외", () => {
  // "(1심 무죄 파기)" 의 '무죄' 를 읽어 0으로 만들면 안 된다.
  assert.equal(sentenceMonths("징역 2년 (1심 무죄 파기)"), 24);
});

test("sentenceMonths: 빈 값·판단 불가는 null", () => {
  assert.equal(sentenceMonths(""), null);
  assert.equal(sentenceMonths(null), null);
  assert.equal(sentenceMonths("징역"), null);
  assert.equal(sentenceMonths("구형 20년"), null);
});

test("getSentenceWeight: 인물사전 정렬용 가중치", () => {
  assert.equal(getSentenceWeight("사형"), 1000);
  assert.equal(getSentenceWeight("무기징역"), 500);
  assert.equal(getSentenceWeight("징역 7년"), 7);
  assert.equal(getSentenceWeight("징역 2년 집행유예 4년"), 2);
  assert.equal(getSentenceWeight("무죄"), -1);
  assert.equal(getSentenceWeight("벌금 500만원"), 1);
  assert.equal(getSentenceWeight(""), 0);
});

// ── 형량비교 차트용 환산(군 금고·범위 구형 보강) ──────────────────────────────
test("chartMonthsOf: 사형은 스케일 상한, 무기는 그 아래", () => {
  assert.equal(chartMonthsOf("사형"), CHART_SCALE);
  assert.equal(chartMonthsOf("무기징역"), Math.round(CHART_SCALE * 0.85));
  assert.ok(chartMonthsOf("사형") > chartMonthsOf("무기징역"));
});

test("chartMonthsOf: 범위 구형은 하한을 취한다", () => {
  assert.equal(chartMonthsOf("징역 5~7년"), 60);
  assert.equal(chartMonthsOf("징역 5～7년"), 60);
  assert.equal(chartMonthsOf("징역 3-5년"), 36);
});

test("chartMonthsOf: 군 금고형도 개월로 환산", () => {
  assert.equal(chartMonthsOf("금고 1년"), 12);
  assert.equal(chartMonthsOf("금고 1년 6개월"), 18);
});

test("chartMonthsOf: 징역은 sentenceMonths 와 같은 값, 판단 불가는 null", () => {
  assert.equal(chartMonthsOf("징역 10년"), 120);
  assert.equal(chartMonthsOf("무죄"), 0);
  assert.equal(chartMonthsOf(""), null);
  assert.equal(chartMonthsOf("징역 2년(1심 무죄 파기)"), 24);
});

// ── 판결 결과 분류 ───────────────────────────────────────────────────────────
const sent = (personId, sentence, outcome) => ({ personId, sentence, ...(outcome ? { outcome } : {}) });
const ruling = (id, level, sentences, result = "") => ({ id, level, kind: "ruling", result, sentences });

test("isAcq: 전원 무죄인 판결만 무죄", () => {
  assert.equal(isAcq(ruling("r1", 1, [sent("p1", "무죄", "무죄")])), true);
  assert.equal(isAcq(ruling("r2", 1, [sent("p1", "무죄", "무죄"), sent("p2", "징역 1년")])), false);
  assert.equal(isAcq(ruling("r3", 1, [])), false);
});

test("caseOutcome: 1심보다 2심 형량이 늘면 가중", () => {
  const c = {
    id: "c1",
    rulings: [ruling("r1", 1, [sent("p1", "징역 2년")]), ruling("r2", 2, [sent("p1", "징역 3년")])],
  };
  const m = caseOutcome(c);
  assert.deepEqual(m.aggravated, ["r2"]);
  assert.deepEqual(m.mitigated, []);
  assert.deepEqual(m.innocent, []);
});

test("caseOutcome: 1심보다 2심 형량이 줄면 감형", () => {
  const c = {
    id: "c1",
    rulings: [ruling("r1", 1, [sent("p1", "징역 3년")]), ruling("r2", 2, [sent("p1", "징역 2년")])],
  };
  const m = caseOutcome(c);
  assert.deepEqual(m.mitigated, ["r2"]);
  assert.deepEqual(m.aggravated, []);
});

test("caseOutcome: 1심 무죄 → 2심 유죄는 '1심 무죄'와 '가중' 양쪽에 잡힌다", () => {
  const c = {
    id: "c1",
    rulings: [
      ruling("r1", 1, [sent("p1", "무죄", "무죄")]),
      ruling("r2", 2, [sent("p1", "징역 2년")]),
    ],
  };
  const m = caseOutcome(c);
  assert.deepEqual(m.innocent, ["r1"]);
  assert.deepEqual(m.aggravated, ["r2"]);
});

test("caseOutcome: 2심 전원 무죄는 감형이 아니라 무죄로만 분류", () => {
  const c = {
    id: "c1",
    rulings: [
      ruling("r1", 1, [sent("p1", "징역 2년")]),
      ruling("r2", 2, [sent("p1", "무죄", "무죄")]),
    ],
  };
  const m = caseOutcome(c);
  assert.deepEqual(m.innocent, ["r2"]);
  assert.deepEqual(m.mitigated, []);
  assert.deepEqual(m.aggravated, []);
});

test("caseOutcome: 3심 무죄도 무죄로 센다", () => {
  const c = {
    id: "c1",
    rulings: [
      ruling("r1", 1, [sent("p1", "징역 2년")]),
      ruling("r2", 2, [sent("p1", "징역 2년")]),
      ruling("r3", 3, [sent("p1", "무죄", "무죄")]),
    ],
  };
  assert.deepEqual(caseOutcome(c).innocent, ["r3"]);
});

test("caseOutcome: 1심 또는 2심이 없으면 심급 비교를 하지 않는다", () => {
  assert.deepEqual(caseOutcome({ id: "c1", rulings: [ruling("r1", 1, [sent("p1", "징역 2년")])] }),
    { innocent: [], aggravated: [], mitigated: [] });
  assert.deepEqual(caseOutcome({ id: "c1", rulings: [] }), { innocent: [], aggravated: [], mitigated: [] });
});

test("caseOutcome: 형량을 읽을 수 없는 피고인은 비교에서 빠진다", () => {
  const c = {
    id: "c1",
    rulings: [ruling("r1", 1, [sent("p1", "구형 20년")]), ruling("r2", 2, [sent("p1", "징역 3년")])],
  };
  assert.deepEqual(caseOutcome(c).aggravated, []);
});

test("calculateOutcomeStats: 사건별 집계(건수·사건 id·판결 id)", () => {
  const cases = [
    { id: "a", rulings: [ruling("a1", 1, [sent("p", "무죄", "무죄")]), ruling("a2", 2, [sent("p", "징역 2년")])] },
    { id: "b", rulings: [ruling("b1", 1, [sent("p", "징역 3년")]), ruling("b2", 2, [sent("p", "징역 2년")])] },
    { id: "c", rulings: [ruling("c1", 1, [sent("p", "징역 2년")]), ruling("c2", 2, [sent("p", "징역 4년")])] },
  ];
  const st = calculateOutcomeStats(cases);
  assert.equal(st.innocent.n, 1);
  assert.deepEqual(st.innocent.caseIds, ["a"]);
  assert.deepEqual(st.innocent.rulingIds, ["a1"]);
  assert.equal(st.aggravated.n, 2);
  assert.deepEqual(st.aggravated.caseIds, ["a", "c"]);
  assert.equal(st.mitigated.n, 1);
  assert.deepEqual(st.mitigated.caseIds, ["b"]);
});

test("calculateOutcomeStats: 빈 목록은 0건", () => {
  const st = calculateOutcomeStats([]);
  assert.equal(st.innocent.n, 0);
  assert.equal(st.aggravated.n, 0);
  assert.equal(st.mitigated.n, 0);
  assert.deepEqual(st.innocent.caseIds, []);
});

// ── 형량비교 행 구성 ─────────────────────────────────────────────────────────
const PEOPLE = { p1: { id: "p1", name: "김용현", role: "전 국방부 장관" }, p2: { id: "p2", name: "윤석열" } };

function chartCase(over) {
  return {
    id: "c1",
    title: "내란 중요임무 종사",
    defendantIds: ["p1"],
    defendants: [{ id: "p1" }],
    rulings: [
      ruling("r1", 1, [{ personId: "p1", sentence: "징역 10년", requested: "징역 20년" }], "징역 10년"),
      ruling("r2", 2, [{ personId: "p1", sentence: "징역 15년" }], "징역 15년"),
    ],
    ...over,
  };
}

test("buildChartRows: 구형·1심·2심 형량과 가중률·감형률", () => {
  const [row] = buildChartRows([chartCase()], PEOPLE);
  assert.equal(row.pid, "p1");
  assert.equal(row.demandM, 240);
  assert.equal(row.t1.m, 120);
  assert.equal(row.t2.m, 180);
  assert.equal(row.lastM, 180);
  assert.equal(row.cat, "agr");
  assert.equal(row.changePct, 50);       // (180-120)/120
  assert.equal(row.reductionPct, 25);    // (240-180)/240
});

test("buildChartRows: 감형은 lastM 이 1심보다 작다", () => {
  const c = chartCase({
    rulings: [
      ruling("r1", 1, [{ personId: "p1", sentence: "징역 12년", requested: "징역 20년" }], "징역 12년"),
      ruling("r2", 2, [{ personId: "p1", sentence: "징역 6년" }], "징역 6년"),
    ],
  });
  const [row] = buildChartRows([c], PEOPLE);
  assert.equal(row.cat, "mit");
  assert.equal(row.changePct, 50);
  assert.equal(row.reductionPct, 70);    // (240-72)/240
});

test("buildChartRows: 대법원이 상고를 기각하면 확정으로 표시된다", () => {
  const c = chartCase({
    rulings: [
      ruling("r1", 1, [{ personId: "p1", sentence: "징역 10년", requested: "징역 20년" }]),
      ruling("r2", 2, [{ personId: "p1", sentence: "징역 15년" }]),
      ruling("r3", 3, [], "상고 기각"),
    ],
  });
  const [row] = buildChartRows([c], PEOPLE);
  assert.equal(row.fin.final, true);
  assert.equal(row.fin.txt, "상고 기각");
});

test("buildChartRows: 3심 결과 문구가 없으면 2심 형량이 최종 형량", () => {
  const c = chartCase({
    rulings: [
      ruling("r1", 1, [{ personId: "p1", sentence: "징역 10년", requested: "징역 20년" }]),
      ruling("r2", 2, [{ personId: "p1", sentence: "징역 15년" }]),
      ruling("r3", 3, [], ""),
    ],
  });
  const [row] = buildChartRows([c], PEOPLE);
  assert.equal(row.fin.txt, "");
  assert.equal(row.lastM, 180);
  assert.equal(row.lastTxt, "징역 15년");
  assert.equal(row.cat, "agr");
});

test("buildChartRows: 무죄 선고는 acq 로 분류되고 구형이 있으면 감형률 100%", () => {
  const c = chartCase({
    rulings: [
      ruling("r1", 1, [{ personId: "p1", sentence: "무죄", outcome: "무죄", requested: "징역 20년" }], "무죄"),
    ],
  });
  const [row] = buildChartRows([c], PEOPLE);
  assert.equal(row.cat, "acq");
  assert.equal(row.lastAcq, true);
  assert.equal(row.reductionPct, 100);
});

test("buildChartRows: 다중 피고인 사건에서는 판결문의 구형 문장을 쓰지 않는다", () => {
  const c = {
    id: "c2",
    title: "내란",
    defendantIds: ["p1", "p2"],
    defendants: [{ id: "p1" }, { id: "p2" }],
    rulings: [
      { ...ruling("r1", 1, [{ personId: "p1", sentence: "징역 10년" }]), requested: "윤석열 사형" },
      { ...ruling("r2", 2, [{ personId: "p1", sentence: "징역 12년" }]), requested: "윤석열 사형" },
    ],
  };
  const rows = buildChartRows([c], PEOPLE);
  const row = rows.find((r) => r.pid === "p1");
  assert.equal(row.demandTxt, "");
  assert.equal(row.demandM, null);
  assert.equal(row.cat, "agr");
});

test("buildChartRows: 등록되지 않은 인물·정보 없는 재판은 행을 만들지 않는다", () => {
  const c = {
    id: "c3", title: "t", defendantIds: ["ghost"], defendants: [{ id: "ghost" }],
    rulings: [ruling("r1", 1, [{ personId: "ghost", sentence: "징역 1년" }])],
  };
  assert.deepEqual(buildChartRows([c], PEOPLE), []);

  const pending = {
    id: "c4", title: "t", defendantIds: ["p1"], defendants: [{ id: "p1" }],
    rulings: [{ id: "q1", level: 1, kind: "pending", result: "1차 공판", sentences: [] }],
  };
  assert.deepEqual(buildChartRows([pending], PEOPLE), []);
});

test("buildChartRows: people 를 넘기지 않아도 예외 없이 빈 결과", () => {
  assert.deepEqual(buildChartRows([chartCase()]), []);
});
