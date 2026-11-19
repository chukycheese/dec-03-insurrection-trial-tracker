// ===== core.js =====
// DOM·네트워크와 무관한 순수 로직만 모은 모듈.
// 브라우저: app.js 보다 먼저 로드되는 일반 스크립트(선언이 전역 렉시컬 스코프에 놓인다).
// Node: require('public/core.js') 로 그대로 불러 단위 테스트한다(tests/).
// 여기서는 document·window·fetch·localStorage 를 쓰지 않는다. 날짜·데이터는 인자로 받는다.

const VIEWS=["timeline","cases","people","graph","judges","charts"];
// 상단 스위처가 고르는 기록부(Dataset). 탄핵 표결은 법원 재판 뷰가 아니라 기록부 단위이므로 여기에 둔다.
const DATASET_KEYS=["dec03","impeachment","kim","chae"];
const TARGET_TYPES=["person","case","panel"];

// 해시 스키마: #{dataset}/{view}, #{dataset}/person/{id}, #{dataset}/case/{id}, #{dataset}/panel/{panelId}
// 탄핵 표결 기록부는 최상위 라우트 #impeachment 를 쓴다(하위 재판 탭이 없으므로).
// 하위 호환: #dec03, #kim, #timeline 등 단일 세그먼트 해시와, 예전 탭 딥링크 #dec03/impeachment 도 해석한다. (TARGET_TYPES는 스크립트 상단 선언)
function parseHash(hash){
  let h=(hash||"").replace(/^#/,"");
  if(!h)return null;
  let parts;
  try{parts=h.split("/").map(decodeURIComponent)}catch(e){parts=h.split("/")}
  if(parts[0]==="impeachment")return {dataset:"impeachment",view:null,targetType:null,targetId:null};
  if(DATASET_KEYS.includes(parts[0])){
    // 예전에는 탄핵 표결이 법원 기록부의 하위 탭이었다: #dec03/impeachment → #impeachment 로 정규화한다.
    if(parts[1]==="impeachment")return {dataset:"impeachment",view:null,targetType:null,targetId:null,legacy:true};
    const out={dataset:parts[0],view:null,targetType:null,targetId:null};
    if(TARGET_TYPES.includes(parts[1])){
      out.targetType=parts[1];
      out.targetId=parts.slice(2).join("/");
      if(!out.targetId)return {dataset:parts[0],view:null,targetType:null,targetId:null};
    }else if(VIEWS.includes(parts[1])){out.view=parts[1]}
    return out;
  }
  if(VIEWS.includes(parts[0]))return {dataset:null,view:parts[0],targetType:null,targetId:null};
  return null;
}

// ===== 검색: 한글 초성 매칭 + 대소문자 무시 =====
// 한글 음절(0xAC00~0xD7A3)을 초성 자모로 치환한다. 영문·숫자·공백·이미 초성인 자모는 그대로 둔다.
const CHO=["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
function chosungOf(str){
  return String(str||"").split("").map(ch=>{
    const code=ch.charCodeAt(0);
    return (code>=0xAC00&&code<=0xD7A3)?CHO[Math.floor((code-0xAC00)/588)]:ch;
  }).join("");
}
// 대소문자·앞뒤 공백 무시 포함 검색. 초성 질의(ㄱㅇㅎ)와 완성형·초성 혼합 질의(김ㅇㅎ)도 매칭한다.
function textMatches(target,query){
  const q=String(query||"").trim().toLowerCase();
  if(!q)return true;
  const t=String(target||"").toLowerCase();
  if(t.includes(q))return true;
  return chosungOf(t).includes(chosungOf(q));
}

const isAcq=r=>r.sentences.length>0&&r.sentences.every(s=>s.outcome==="무죄");

function getSentenceWeight(txt){
  if(!txt)return 0;
  if(txt.includes("사형"))return 1000;
  if(txt.includes("무기"))return 500;
  const m=txt.match(/징역\s*(\d+)년/);
  if(m)return parseInt(m[1],10);
  if(txt.includes("집행유예"))return 2;
  if(txt.includes("무죄"))return -1;
  return 1;
}

// 형량 텍스트를 개월 수 가중치로 환산한다. 무죄는 0, 무기징역·사형은 최상위값, 벌금은 징역보다 낮은 값.
// 괄호 안 보충 설명("(1심 무죄 파기)" 등)은 판단에서 제외한다.
function sentenceMonths(txt){
  const t=String(txt||"").replace(/\([^)]*\)/g,"");
  if(!t)return null;
  if(t.includes("사형"))return 2400;
  if(t.includes("무기"))return 1200;
  const m=t.match(/징역\s*(?:(\d+)\s*년)?\s*(?:(\d+)\s*개월)?/);
  if(m&&(m[1]||m[2]))return parseInt(m[1]||"0",10)*12+parseInt(m[2]||"0",10);
  if(t.includes("징역"))return null;
  if(t.includes("벌금")||t.includes("집행유예"))return 1;
  if(t.includes("무죄"))return 0;
  return null;
}
// 사건 하나의 판결 결과를 분류한다. 결과는 심급 판결 id 배열.
// - innocent: 전원 무죄로 선고된 판결
// - aggravated: 1심보다 2심에서 형량이 늘어난 판결 (1심 무죄 → 2심 유죄 포함)
// - mitigated: 1심보다 2심에서 형량이 줄어든 판결 (2심 전원 무죄는 무죄로만 분류)
function caseOutcome(c){
  const res={innocent:[],aggravated:[],mitigated:[]};
  const byLv={};
  c.rulings.forEach(r=>{(byLv[r.level]=byLv[r.level]||[]).push(r)});
  [1,2,3].forEach(lv=>(byLv[lv]||[]).forEach(r=>{if(isAcq(r))res.innocent.push(r.id)}));
  if(!byLv[1]||!byLv[2])return res;
  const s1={};
  byLv[1].forEach(r=>r.sentences.forEach(s=>{s1[s.personId]=sentenceMonths(s.sentence)}));
  byLv[2].forEach(r=>{
    let agr=false,mit=false;
    r.sentences.forEach(s=>{
      const w=sentenceMonths(s.sentence),w1=s1[s.personId];
      if(w==null||w1==null)return;
      if(w>w1)agr=true;
      else if(w<w1&&w>0)mit=true;
    });
    if(agr)res.aggravated.push(r.id);
    else if(mit)res.mitigated.push(r.id);
  });
  return res;
}
// 현재 데이터셋 전체의 인사이트 지표: 건수와 필터 대상 사건·판결 id
function calculateOutcomeStats(cases){
  const out={innocent:{n:0,caseIds:[],rulingIds:[]},aggravated:{n:0,caseIds:[],rulingIds:[]},mitigated:{n:0,caseIds:[],rulingIds:[]}};
  cases.forEach(c=>{
    const m=caseOutcome(c);
    ["innocent","aggravated","mitigated"].forEach(k=>{
      if(m[k].length){out[k].n+=m[k].length;out[k].caseIds.push(c.id);out[k].rulingIds.push(...m[k])}
    });
  });
  return out;
}

// 기준일 문자열(YYYY-MM-DD). 기기 날짜가 데이터 기준일(asOf)보다 앞서면 데이터 기준일을 쓴다.
// 브라우저에서는 app.js 의 todayStr() 이 이 함수에 현재 시각과 meta.info.asOf 를 넣어 부른다.
function todayOf(now,asOf){
  const d=now||new Date();
  const local=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const base=asOf||"";
  return local > base ? local : (base || local);
}

// 예정된 일정(선고·공판) 판정: 오늘 이후(포함)로 예정된 미확정 공판 또는 선고 일정
function isSchedRuling(r,today){
  if(!r.date)return false;
  const t = today;
  const isFuture = r.date > t;
  const isToday = r.date === t;
  const isUpcoming = isFuture || (isToday && String(r.result||"").includes("예정"));
  return isUpcoming && (r.kind==="pending"||String(r.result||"").includes("예정"));
}

// ===== 형량비교 뷰: 특검 구형량 vs 심급별 선고 형량 수평 바 차트 =====
// 스케일 상한: 사형·무기징역은 CHART_SCALE(480개월)로 환산해 바 길이가 무한대로 늘어나지 않게 한다.
const CHART_SCALE=480;
// sentenceMonths는 징역만 개월 환산하므로, 군 재판(금고형)을 위해 금고 파싱을 보강한다.
function chartMonthsOf(txt){
  const t=String(txt||"").replace(/\([^)]*\)/g,"");
  // 사형이 무기징역보다 길게 보이도록 상한(CHART_SCALE) 아래에서 두 값을 구분해 환산한다.
  if(t.includes("사형"))return CHART_SCALE;
  if(t.includes("무기"))return Math.round(CHART_SCALE*0.85);
  // 범위 구형("징역 5~7년")은 하한을 취해 감형 폭이 부풀지 않게 한다.
  const rg=t.match(/(?:징역|금고)?\s*(\d+)\s*[~～\-–]\s*(\d+)\s*년/);
  if(rg)return parseInt(rg[1],10)*12;
  const m=sentenceMonths(txt);
  if(m!=null)return m;
  const g=t.match(/금고\s*(?:(\d+)\s*년)?\s*(?:(\d+)\s*개월)?/);
  if(g&&(g[1]||g[2]))return parseInt(g[1]||"0",10)*12+parseInt(g[2]||"0",10);
  return null;
}
// 피고인×사건 단위 행 구성: 구형(1심 특검 구형)·1심 선고·2심 선고·대법원 확정 형량을 모은다.
function buildChartRows(cases,people){
  const rows=[];
  cases.forEach(c=>{
    const single=(c.defendantIds||[]).length===1;
    (c.defendants||[]).forEach(d=>{
      const pid=d.id,p=(people||{})[pid];if(!p)return;
      const byLv={};
      c.rulings.forEach(r=>{(byLv[r.level]=byLv[r.level]||[]).push(r)});
      const sentOf=r=>r.sentences.find(s=>s.personId===pid);
      const r1=(byLv[1]||[]).find(r=>r.kind==="ruling");
      const r2=(byLv[2]||[]).find(r=>r.kind==="ruling");
      const r3=(byLv[3]||[]).find(r=>r.kind==="ruling");
      const p1=(byLv[1]||[]).find(r=>r.kind==="pending");
      const p2=(byLv[2]||[]).find(r=>r.kind==="pending");
      const s1=r1?sentOf(r1):null,s2=r2?sentOf(r2):null,s3=r3?sentOf(r3):null;
      // 구형: 피고인별 문장(선고 문장)의 requested를 우선하고, 단일 피고인 사건일 때만 판결문 requested로 대체한다.
      //  다중 피고인 사건의 ruling.requested는 특정 피고인만 언급하는 경우("윤석열 사형" 등)가 있어 오배석을 막는다.
      let demandTxt=(s1&&s1.requested)||(single&&r1&&r1.requested)||"";
      // 다중 피고인 사건에서 형량으로 환산되지 않는 구형 문장("박종준·김성훈 7년" 등)은 다른 피고인 구형일 수 있어 표시하지 않는다.
      if(!single&&chartMonthsOf(demandTxt)==null)demandTxt="";
      // 해당 심급 선고 문장: 피고인별 선고가 없으면 단일 피고인 사건에 한해 판결 결과 텍스트를 쓴다.
      const lvTxt=(r,s,pnd)=>s?s.sentence:(single&&r&&r.result?r.result:(pnd&&single&&r?r.result:""));
      const t1Txt=lvTxt(r1,s1,false),t2Txt=lvTxt(r2,s2,false);
      // 확정: 대법원 선고 문장 → 상고 기각이면 2심 형량이 확정
      let finTxt=lvTxt(r3,s3,false),finFinal=false;
      if(r3&&r3.kind==="ruling"&&r3.result&&/기각|확정/.test(r3.result)){finFinal=true;if(!finTxt&&s2)finTxt=s2.sentence+" (상고 기각)";}
      if(!demandTxt&&!s1&&!s2&&!s3)return; // 구형·선고 정보가 전혀 없는 재판 진행 중 행은 제외
      const row={pid,p,caseId:c.id,caseTitle:c.title,
        demandTxt,demandM:chartMonthsOf(demandTxt),
        t1:{txt:t1Txt,m:chartMonthsOf(t1Txt),acq:!!(s1&&s1.outcome==="무죄")},
        t2:{txt:t2Txt,m:chartMonthsOf(t2Txt),acq:!!(s2&&s2.outcome==="무죄")},
        fin:{txt:finTxt,m:chartMonthsOf(finTxt),acq:!!(s3&&s3.outcome==="무죄"),final:finFinal},
        p1Txt:p1?p1.result:"",p2Txt:p2?p2.result:""};
      // 최종 형량: 확정 → 2심 → 1심 순으로 사용 가능한 것
      const last=row.fin.txt?row.fin:row.t2.txt?row.t2:row.t1;
      row.lastM=last.m;row.lastTxt=last.txt;row.lastAcq=last.acq;
      // 분류: 무죄 / 벌금형 / 가중 / 감형
      let cat=null,changePct=null;
      if(row.lastAcq||(row.lastTxt&&row.lastM===0&&/무죄/.test(row.lastTxt)))cat="acq";
      else if(row.lastTxt&&/벌금/.test(row.lastTxt)&&!/징역|금고/.test(row.lastTxt))cat="fine";
      else if(row.lastM!=null&&row.t1.m!=null){
        if(row.t1.acq||row.t1.m===0){cat="agr"}
        else if(row.lastM>row.t1.m){cat="agr";changePct=Math.round((row.lastM-row.t1.m)/row.t1.m*100)}
        else if(row.lastM<row.t1.m){cat="mit";changePct=Math.round((row.t1.m-row.lastM)/row.t1.m*100)}
      }
      row.cat=cat;row.changePct=changePct;
      // 구형 대비 감형률: 무죄는 100% 감형으로 환산
      if(cat==="acq"&&row.demandM>0)row.reductionPct=100;
      else if(row.demandM>0&&row.lastM!=null&&row.lastM<row.demandM)row.reductionPct=Math.round((row.demandM-row.lastM)/row.demandM*100);
      rows.push(row);
    });
  });
  return rows;
}

// ===== 탄핵 표결 기록부 검색 =====
// 초성 규칙은 재판 기록부 검색과 같다. 예전에는 이 뷰가 같은 구현을 따로 들고 있었는데,
// 두 규칙이 어긋나지 않도록 chosungOf 하나를 함께 쓴다.
const impChosung = chosungOf;
function impNorm(s) { return String(s || "").toLowerCase().replace(/\s+/g, ""); }
// 이름·지역구·정당은 공백을 무시한 부분 일치로 찾고, 자음만 입력한 초성 질의(ㅇㅊㅅ)나
// 초성 섞인 질의(김ㅇㅎ)는 이름 필드의 초성과 비교한다. (긴 문자열 전체 초성 비교는 오탐이 많다)
function impMatch(m, q) {
  if (!q) return true;
  const nq = impNorm(q);
  if (!nq) return true;
  const fields = [m.name, m.constituency, m.party, m.role || "", m.term || ""];
  if (fields.some(f => impNorm(f).includes(nq))) return true;
  // '분당갑'처럼 구·시·군을 줄여 쓴 지역구 검색도 받아들인다.
  const loose = (s) => impNorm(s).replace(/[시군구]/g, "");
  if (loose(nq) && fields.some(f => loose(f).includes(loose(nq)))) return true;
  if (/^[ㄱ-ㅎ]+$/.test(nq)) return fields.some(f => impChosung(f).includes(nq));
  if (/[ㄱ-ㅎ]/.test(nq)) return impChosung(m.name).includes(impChosung(nq));
  return false;
}

// ===== Node(단위 테스트)용 export. 브라우저에서는 module 이 없어 그냥 넘어간다. =====
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    VIEWS, DATASET_KEYS, TARGET_TYPES,
    CHO, chosungOf, textMatches,
    isAcq, getSentenceWeight, sentenceMonths, caseOutcome, calculateOutcomeStats,
    parseHash,
    todayOf, isSchedRuling,
    CHART_SCALE, chartMonthsOf, buildChartRows,
    impChosung, impNorm, impMatch,
  };
}
