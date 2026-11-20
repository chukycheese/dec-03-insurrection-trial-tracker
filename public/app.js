const STATUS={final:{label:"확정",cls:"st-final"},sup:{label:"상고심 계류",cls:"st-sup"},app:{label:"항소심 진행",cls:"st-app"},trial:{label:"1심 선고",cls:"st-trial"},sched:{label:"1심 선고 예정",cls:"st-sched"}};
const LV={1:"1심",2:"항소심",3:"상고심"};
const PORTAL="https://portal.scourt.go.kr";
const COLLS=["cases","rulings","sentences","people","judges","meta"];
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const fmt=d=>d?d.replace(/^(\d{4})-(\d{2})-(\d{2})$/,"$1.$2.$3"):"미정";
const store={}; const loaded=new Set();
// ===== Umami 사용자 행동 분석 =====
// 커스텀 이벤트 전송 헬퍼. 트래커 스크립트가 차단·실패해 window.umami가 없어도 페이지 동작에는 영향이 없다.
function trackEvent(name,data){
  try{
    if(typeof window!=="undefined"&&window.umami&&typeof window.umami.track==="function")window.umami.track(name,data);
  }catch(e){}
}
let state={view:"timeline",status:null,q:"",personCat:"all",personSort:"cases",judgeCat:"all",err:null,stale:false,dataset:"dec03",modalPerson:null,outcomeFilter:null,tlSched:false,chartSort:"reduction",chartFilter:"all"};
let initRoute=null;
try{const v=localStorage.getItem("ins-view");if(v&&VIEWS.includes(v))state.view=v}catch(e){}
try{
  const d=localStorage.getItem("trials-dataset");if(d&&DATASET_KEYS.includes(d))state.dataset=d;
  const route=parseHash(location.hash);
  if(route){
    if(route.dataset)state.dataset=route.dataset;
    if(route.view)state.view=route.view;
    initRoute=route;
  }
}catch(e){}

// 데이터셋(특검 기록부) 설정: 전환 스위처와 각 뷰의 동적 텍스트가 이 설정을 따른다
const DATASETS={
  dec03:{
    file:"insurrection-trials-data.json",
    title:"12·3 내란 재판 기록부",
    lede:"12·3 비상계엄 관련 형사재판의 선고를 심급별로 정리했습니다. 사건번호·재판부·형량은 언론 보도를 대조해 적었고, 보도로 확인되지 않은 항목은 비워 두었습니다.",
    searchPh:"인물·직책·재판장 이름으로 찾기 (예: 김용현, 경호처)",
    graphAria:"12·3 내란 인물 관계도",
    cmdLabel:"지휘 계통",
    noteCourt:"<strong>판결문 열람.</strong> 법원은 내란 사건 판결문을 피고인 실명을 가린 비실명 사본으로만 제공합니다. 사건번호로 <a href=\"https://portal.scourt.go.kr\" target=\"_blank\" rel=\"noopener\">사법정보공개포털</a>의 ‘판결서 사본 제공 신청’에서 받을 수 있습니다. 사건번호가 확인되지 않은 사건은 선고 보도 링크로 대신했습니다."
  },
  impeachment:{
    // 국회 표결 기록부: 재판 데이터 대신 impeachment-assembly-data.json 을 쓴다(file 없음).
    file:null,
    title:"22대 국회 윤석열 탄핵 표결 기록부",
    lede:"2024년 12월 비상계엄 선포 직후 국회에서 진행된 1·2차 윤석열 대통령 탄핵소추안 및 12·4 비상계엄해제 요구안 표결 기록입니다. 제22대 국회의원 301명의 찬반·퇴장·공개 발언을 전수 정리했습니다.",
    searchPh:"의원 이름·정당·지역구로 찾기 (예: 조국, 용인, 비례)"
  },
  kim:{
    file:"kim-trials-data.json",
    title:"김건희·명태균 특검 재판 기록부",
    lede:"민중기 특별검사팀 기소 사건 종합 · 도이치모터스 주가조작 · 명태균 여론조사 및 공천개입 · 건진법사 및 통일교 청탁 등 관련 형사재판의 선고를 심급별로 정리했습니다.",
    searchPh:"인물·직책·재판장 이름으로 찾기 (예: 김건희, 명태균)",
    graphAria:"김건희·명태균 특검 사건 인물 관계도",
    cmdLabel:"청탁·금품 제공 계통",
    noteCourt:"<strong>판결문 열람.</strong> 확정 판결문 일부(권성동 2026도7033, 건진법사 2026도8525 등)는 <a href=\"https://portal.scourt.go.kr\" target=\"_blank\" rel=\"noopener\">사법정보공개포털</a>과 대법원 보도자료로 확인할 수 있습니다. 사건번호가 확인되지 않은 사건은 선고 보도 링크로 대신했습니다."
  },
  chae:{
    file:"chae-trials-data.json",
    title:"채상병 순직 및 수사외압 특검 재판 기록부",
    lede:"이명현 특별검사팀 기소 사건 종합 · 박정훈 대령 항명 재판 · 임성근 사단장 업무상과실치사 및 구명 로비 · 이종섭 호주대사 도피 및 국방부·대통령실 수사외압 의혹 형사재판의 선고를 심급별로 정리했습니다.",
    searchPh:"인물·직책·재판장 이름으로 찾기 (예: 박정훈, 임성근, 이종섭)",
    graphAria:"채상병 특검 사건 인물 관계도",
    cmdLabel:"수사외압·지휘 계통",
    noteCourt:"<strong>판결문 열람.</strong> 군사법원 및 일반법원 판결문은 <a href=\"https://portal.scourt.go.kr\" target=\"_blank\" rel=\"noopener\">사법정보공개포털</a>과 국방부 사법포털에서 확인할 수 있습니다. 사건번호가 확인되지 않은 사건은 선고 보도 링크로 대신했습니다."
  }
};

function model(){
  const P=store.people||{},J=store.judges||{};
  const sentByRuling={};
  Object.entries(store.sentences||{}).forEach(([id,s])=>{(sentByRuling[s.rulingId]=sentByRuling[s.rulingId]||[]).push({id,...s,person:P[s.personId]})});
  const rulByCase={};
  Object.entries(store.rulings||{}).forEach(([id,r])=>{
    const judgeNames=(r.judgeIds||[]).map(j=>J[j]?.name).filter(Boolean);
    (rulByCase[r.caseId]=rulByCase[r.caseId]||[]).push({id,...r,judgeNames,sentences:sentByRuling[id]||[]});
  });
  const cases=Object.entries(store.cases||{}).map(([id,c])=>({id,...c,
    defendants:(c.defendantIds||[]).map(p=>({id:p,...(P[p]||{name:p})})),
    rulings:(rulByCase[id]||[]).sort((a,b)=>a.level-b.level)})).sort((a,b)=>(a.order??99)-(b.order??99));
  return {cases,P};
}
function hay(c){return [c.title,c.charge,...c.defendants.map(d=>d.name+" "+(d.role||"")+" "+(d.category||"")+" "+(d.keyRole||"")),...c.rulings.flatMap(r=>[r.court,r.judgeNote,r.caseNo,r.result,r.summary,...r.judgeNames])].join(" ")}

function personHay(p,items){return [p.name,p.role,p.category,p.keyRole,p.statusNote,...(items||[]).map(hay)].join(" ")}

function filterCases(cases){return cases.filter(c=>(!state.status||c.status===state.status)&&(!state.q||textMatches(hay(c),state.q))&&(!state.outcomeFilter||caseOutcome(c)[state.outcomeFilter].length>0))}

// 검색창 UI 갱신: 클리어 버튼 표시/숨김 + 검색 결과 피드백(사건·인물 건수)
function clearSearch(){
  state.q="";
  const inp=document.getElementById("q");
  if(inp){inp.value="";inp.focus()}
  render();
}
function updateSearchUI(cases){
  const btn=document.getElementById("q-clear");
  if(btn)btn.hidden=!state.q;
  const fb=document.getElementById("search-feedback");
  if(!fb)return;
  if(!state.q){fb.hidden=true;fb.innerHTML="";return}
  const nc=filterCases(cases).length;
  const pmap={};
  cases.forEach(c=>{
    if(state.status&&c.status!==state.status)return;
    c.defendants.forEach(d=>{(pmap[d.id]=pmap[d.id]||{person:d,items:[]}).items.push(c)});
  });
  const np=Object.values(pmap).filter(x=>textMatches(personHay(x.person,x.items),state.q)).length;
  fb.innerHTML=`‘${esc(state.q)}’ 검색 결과: 사건 ${nc}건, 인물 ${np}명`;
  fb.hidden=false;
}

// ===== 재판부(법원·부서 단위) 집계 =====
// 같은 court 문자열을 가진 판결을 한 재판부로 묶고, 판사진·담당 사건·선고 통계를 붙인다.
function panelIdOf(court){return "panel-"+(court||"").replace(/\s+/g,"-")}
function courtGroup(court){
  if(court.includes("대법원"))return "대법원";
  if(court.includes("서울고법"))return "서울고법";
  if(court.includes("서울중앙지법"))return "서울중앙지법";
  return court.replace(/\s.*/,"")||"기타";
}
function courtBadge(court){
  if(court.includes("대법원"))return "대법원";
  if(court.includes("고법"))return "고법";
  if(court.includes("지법"))return "지법";
  return "법원";
}
function courtBadgeCls(b){return b==="대법원"?"st-final":b==="고법"?"st-app":b==="지법"?"st-trial":"st-sched"}
function shortPos(pos){const p=pos||"";if(p==="대법관"||p==="대법원장")return p;return p.includes(" ")?p.split(" ").slice(1).join(" "):p}
function buildPanels(cases){
  const J=store.judges||{};
  const map={};
  cases.forEach(c=>c.rulings.forEach(r=>{
    const k=r.court||"재판부 미확인";
    (map[k]=map[k]||{court:k,rulings:[]}).rulings.push({...r,caseTitle:c.title});
  }));
  const order=["대법원","서울고법","서울중앙지법"];
  return Object.values(map).map(p=>{
    // 재판부 내 역할(재판장·주심)은 judgeNote에서, 판사 신원은 judgeIds→store.judges에서 수집
    const roles={};
    p.rulings.forEach(r=>{const m=(r.judgeNote||"").match(/(재판장|주심)\s+([가-힣]{2,5})/);if(m)roles[m[2]]=m[1]});
    const members=[],seen={};
    p.rulings.forEach(r=>(r.judgeIds||[]).forEach(j=>{if(J[j]&&!seen[j]){seen[j]=1;members.push({id:j,...J[j]})}}));
    members.sort((a,b)=>(roles[b.name]?1:0)-(roles[a.name]?1:0)||a.name.localeCompare(b.name,"ko"));
    const rul=[...p.rulings].sort((a,b)=>(b.date||"9999").localeCompare(a.date||"9999"));
    const finals=rul.filter(r=>r.kind==="ruling"&&r.date).length;
    const acq=rul.filter(isAcq).length;
    let prison=0,probation=0;
    rul.forEach(r=>r.sentences.forEach(s=>{const t=s.sentence||"";
      if(!t||t.includes("무죄"))return;
      if(t.includes("집행유예"))probation++;
      else if(t.includes("징역")||t.includes("무기")||t.includes("벌금"))prison++;
    }));
    const heavy=rul.filter(r=>(r.summary||"").includes("가중")).length;
    const light=rul.filter(r=>(r.summary||"").includes("감형")).length;
    const group=courtGroup(p.court);
    return {...p,rulings:rul,members,roles,group,badge:courtBadge(p.court),
      stats:{total:rul.length,finals,acq,prison,probation,heavy,light}};
  }).sort((a,b)=>(order.indexOf(a.group)<0?9:order.indexOf(a.group))-(order.indexOf(b.group)<0?9:order.indexOf(b.group))||a.court.localeCompare(b.court,"ko"));
}
// 판사 프로필(임명 정보·이전 판결)까지 검색 대상에 넣는다: '조국'으로 검색하면 그 사건을 맡았던 엄상필 대법관의 재판부가 걸린다.
function judgeHay(m){
  return [m.name,m.position||"",m.appointed||"",m.note||"",m.stance||"",m.opinion||"",
    ...(Array.isArray(m.history)?m.history.map(h=>(h.case||"")+" "+(h.year||"")+" "+(h.conclusion||"")):[])].join(" ");
}
function panelHay(p){
  return [p.court,p.group,p.badge,...p.members.map(judgeHay),...Object.entries(p.roles).map(([n,r])=>r+" "+n),
    ...p.rulings.map(r=>(r.caseTitle||"")+" "+(r.result||"")+" "+(r.summary||"")+" "+(r.judgeNote||"")+" "+(r.caseNo||""))].join(" ");
}

// 판사·대법관 프로필 블록: 임명 정보(제청·임명권자)와 주요 이전 판결을 접기/펼치기로 붙인다.
// 항목마다 출처 링크를 함께 두고, 성향 점수화·단정은 하지 않는다(사실·의견 구도만).
function justiceProfilesHTML(p){
  const list=(p.members||[]).filter(m=>m.appointed||m.stance||m.opinion||(Array.isArray(m.history)&&m.history.length));
  if(!list.length)return "";
  list.sort((a,b)=>(a.order??99)-(b.order??99)||a.name.localeCompare(b.name,"ko"));
  const rows=list.map(m=>{
    const stance=m.stance?`<span class="stance-pill ${m.stance==="반대의견"?"stance-dissent":"stance-major"}">${esc(m.stance)}</span>`:"";
    const hist=(Array.isArray(m.history)?m.history:[]).map(h=>{
      const srcs=(h.sources||[]).filter(s=>Array.isArray(s)&&s[1])
        .map(s=>`<a href="${esc(s[1])}" target="_blank" rel="noopener">${esc(s[0]||"출처")} ↗</a>`).join("");
      return `<li>${h.year?`<span class="y">${esc(h.year)}</span>`:""}<span class="c">${esc(h.case||"")}</span>${h.conclusion?`<span class="d"> · ${esc(h.conclusion)}</span>`:""}${srcs?`<span class="src">${srcs}</span>`:""}</li>`;
    }).join("");
    return `<article class="justice">
      <div class="justice-head"><strong>${esc(m.name)}</strong>${stance}<span class="pos">${esc(m.position||"")}</span></div>
      ${m.appointed?`<div class="justice-meta">임명 · ${esc(m.appointed)}</div>`:""}
      ${m.note?`<div class="justice-meta">${esc(m.note)}</div>`:""}
      ${m.opinion?`<div class="justice-op">2026-11-19 한덕수 사건 · ${esc(m.opinion)}</div>`:""}
      ${hist?`<ul class="justice-hist">${hist}</ul>`:""}
    </article>`;
  }).join("");
  return `<details class="justice-profiles">
    <summary>대법관 ${list.length}명 임명 정보·주요 이전 판결</summary>
    <div class="justice-list">${rows}</div>
  </details>`;
}

function renderSummary(cases){
  const el=document.getElementById("summary");
  el.innerHTML=["final","sup","app","trial","sched"].map(k=>`<button type="button" id="sum-${k}" data-s="${k}" aria-pressed="${state.status===k}"><span class="n">${cases.filter(c=>c.status===k).length}</span><span class="l"><span class="dot" style="background:var(--s-${k})"></span>${STATUS[k].label}</span></button>`).join("");
  el.querySelectorAll("button").forEach(b=>b.onclick=()=>{state.status=state.status===b.dataset.s?null:b.dataset.s;render()});
}
const judgeLine=r=>r.judgeNote||r.judgeNames.join(" · ");
function links(r){
  const out=[];
  if(r.caseNo)out.push(`<a href="${PORTAL}" target="_blank" rel="noopener">판결서 신청 ↗</a>`);
  (r.sources||[]).forEach(([l,u])=>out.push(`<a href="${esc(u)}" target="_blank" rel="noopener">${esc(l)} ↗</a>`));
  return out.join(" ");
}

// 피고인별 선고 리스트: 피고인명 배지와 형량 텍스트 시각적 분리
function sentList(r){
  if(!r.sentences.length)return "";
  const s=[...r.sentences].sort((a,b)=>(a.outcome==="무죄")-(b.outcome==="무죄"));
  return `<ul class="sents">${s.map(x=>`
    <li class="sent-item">
      <span class="sent-person">${esc(x.person?.name||x.personId)}</span>
      <span class="sent-result ${x.outcome==='무죄'?'acq':''}">${esc(x.sentence)}</span>
      ${x.requested?`<span class="sent-rq">(구형 ${esc(x.requested)})</span>`:""}
    </li>`).join("")}</ul>`;
}


// ===== 판결 요지·양형 이유 인용구 카드 =====
// 판결(r)에 quote{text,speaker,context}가 있을 때만 인용구 카드를 만든다.
// 복사 버튼은 같은 심급·재판부·선고일을 함께 붙여 인용 가능한 문장으로 클립보드에 넣는다.
function quoteCopyText(r){
  const q=r&&r.quote;
  if(!q||!q.text)return "";
  const date=r.date?", "+fmt(r.date):"";
  return "“"+q.text+"” — "+(q.speaker||"재판부")+" ("+(r.court||"재판부 미확인")+date+")";
}
function quoteHTML(r,opts){
  const q=r&&r.quote;
  if(!q||!q.text)return "";
  const compact=!!(opts&&opts.compact);
  const speaker=q.speaker||"재판부";
  return `<figure class="ruling-quote${compact?" compact":""}" data-quote-id="${esc(r.id||"")}">
    <div class="rq-head"><span>판결 요지 &amp; 양형 이유</span><span>${r.date?fmt(r.date):""}</span></div>
    <blockquote class="rq-text">${esc(q.text)}</blockquote>
    <figcaption class="rq-src">— <strong>${esc(speaker)}</strong>${q.context?` · ${esc(q.context)}`:""}${r.court?` <span class="rq-court">(${esc(r.court)})</span>`:""}</figcaption>
    <button type="button" class="quote-copy-btn" onclick="copyRulingQuote(this,'${esc(r.id||"")}')" title="인용구를 클립보드에 복사합니다" aria-label="${esc(speaker)} 판결 요지 복사">📋 판결 요지 복사</button>
  </figure>`;
}
function copyRulingQuote(btn,id){
  const r=(store.rulings||{})[id];
  if(!r||!r.quote)return;
  trackEvent('quote_copy',{rulingId:id,dataset:state.dataset});
  const text=quoteCopyText(r);
  const done=()=>{
    if(!btn)return;
    if(!btn.getAttribute||!btn.setAttribute)return;
    const label=btn.getAttribute("data-label")||btn.textContent;
    if(!btn.getAttribute("data-label"))btn.setAttribute("data-label",label);
    btn.textContent="복사됨!";
    btn.classList&&btn.classList.add("copied");
    setTimeout(()=>{btn.textContent=label;btn.classList&&btn.classList.remove("copied")},1500);
  };
  try{
    if(typeof navigator!=="undefined"&&navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(done,()=>{legacyCopy(text,()=>{});done()});return}
  }catch(e){}
  legacyCopy(text,()=>{});done();
}

// ===== 판결 결과 인사이트: 무죄·항소심 가중·항소심 감형 =====
// 인사이트 필터 칩: 클릭 시 해당 결과 토글
function toggleOutcomeFilter(k){
  state.outcomeFilter=state.outcomeFilter===k?null:k;
  render();
}
function renderInsights(cases){
  const el=document.getElementById("outcome-insights");
  if(!el)return;
  const st=calculateOutcomeStats(cases);
  const items=[
    ["innocent","o-inn","⚖️ 무죄",st.innocent.n,"전원 무죄가 선고된 판결 수 — 클릭하면 해당 사건만 모아봅니다"],
    ["aggravated","o-agr","▲ 항소심 가중",st.aggravated.n,"1심보다 2심에서 형량이 늘어난 사건 수 — 클릭하면 해당 사건만 모아봅니다"],
    ["mitigated","o-mit","▼ 항소심 감형",st.mitigated.n,"1심보다 2심에서 형량이 줄어든 사건 수 — 클릭하면 해당 사건만 모아봅니다"]
  ];
  el.innerHTML=items.map(([k,cls,label,n,tip])=>`<button type="button" class="o-ins-btn ${cls}" data-outcome="${k}" aria-pressed="${state.outcomeFilter===k}" title="${tip}">${label} <span class="mono">${n}건</span></button>`).join("")+`<span class="o-ins-hint">판결 결과 경향 한눈에 보기 · 다시 누르면 필터 해제</span>`;
  el.querySelectorAll("[data-outcome]").forEach(b=>b.onclick=()=>toggleOutcomeFilter(b.dataset.outcome));
}

// ===== URL 라우팅·딥링크 =====
// 현재 state(데이터셋·뷰·열린 모달)에 맞는 해시
function currentHash(){
  if(state.dataset==="impeachment")return "#impeachment";
  if(state.modalPerson)return "#"+state.dataset+"/person/"+state.modalPerson;
  return "#"+state.dataset+"/"+state.view;
}
// 현재 state 에 맞는 해시로 URL을 갱신한다.
function updateURL(push){
  const h=currentHash();
  try{
    if(push&&history.pushState)history.pushState({modal:state.modalPerson?"person":null,id:state.modalPerson||null,dataset:state.dataset},"",h);
    else if(history.replaceState)history.replaceState(null,"",h);
  }catch(e){}
}
function replaceHash(){updateURL(false)}
// 사건·재판부 딥링크: 대상 탭을 열고, 카드를 가릴 수 있는 필터·검색을 푼 뒤 스크롤·강조한다.
// 최초 진입(applyInitRoute)과 이미 열린 화면의 해시 변경(applyRoute)이 이 한 곳을 함께 쓴다.
// (예전에는 최초 진입만 탭을 바꿔서, 이미 열린 화면에서 해시만 바뀌면 숨은 뷰에서 카드를 찾다 실패했다)
function followTarget(t){
  const view=targetViewOf(t.targetType);
  const cardId=targetCardIdOf(t.targetType,t.targetId);
  if(!view||!cardId)return;
  // 대상 카드가 화면에 있어야 딥링크가 목적을 이룬다: 다른 법원 칩·상태 필터·검색어가 가리고 있으면 푼다.
  // 재판부 뷰도 상태 필터를 거친 사건으로 패널을 만들기 때문에 상태 필터를 함께 푼다.
  if(state.q){state.q="";const q=document.getElementById("q");if(q)q.value=""}
  state.status=null;
  if(t.targetType==="panel")state.judgeCat="all";
  else state.outcomeFilter=null;
  state.view=view;
  try{localStorage.setItem("ins-view",view)}catch(e){}
  render();
  focusCard(cardId);
  if(t.targetType==="case")syncCaseMetaTitle(t.targetId);
}
// 해시 라우트의 사건·재판부 타깃을 따른다. 데이터를 기다리는 사이 다른 해시로 이동했으면 그 타깃은 버린다.
function followHashTarget(r){
  whenDataReady(()=>{
    const now=parseHash(location.hash);
    if(!now||now.dataset!==r.dataset||now.targetType!==r.targetType||now.targetId!==r.targetId)return;
    followTarget(now);
  });
}
// popstate(브라우저 뒤로/앞으로 가기): 해시를 해석해 모달·데이터셋·뷰·타깃을 동기화한다.
function applyRoute(){
  const r=parseHash(location.hash);
  const modal=document.getElementById("person-dialog");
  const isPersonRoute=!!(r&&r.targetType==="person");
  if(r&&r.dataset&&r.dataset!==state.dataset){applyDataset(r.dataset,false,true);fetchRemote(r.dataset)}
  if(isPersonRoute){
    // 기록부를 바꿔 들어온 딥링크는 데이터가 도착한 뒤에 연다.
    if(!(modal&&modal.open))whenDataReady(()=>{const m=document.getElementById("person-dialog");if(!(m&&m.open))openPersonModal(r.targetId,{fromHistory:true})});
  }else if(modal&&modal.open){
    closePersonModal(true);
  }
  if(r&&r.view&&r.view!==state.view){state.view=r.view;try{localStorage.setItem("ins-view",r.view)}catch(e){}}
  if(r&&r.legacy)replaceHash();
  render();
  // 사건·재판부 딥링크는 대상 탭 전환까지 함께 해야 하므로 followTarget 이 담당한다(사람은 위에서 모달로 처리).
  if(r&&r.targetType&&r.targetType!=="person")followHashTarget(r);
}
window.addEventListener("popstate",applyRoute);
// 주소창에서 해시를 직접 고친 경우(popstate와 함께/단독으로 발화) — applyRoute는 멱등하므로 중복 실행 무해
window.addEventListener("hashchange",applyRoute);

// 판결 헤드라인에서 피고인명과 형량 분리 렌더링
function resultHTML(r){
  if(!r.result) return "";
  const acqClass = isAcq(r) ? " acq" : "";
  const m = r.result.match(/^([가-힣]{2,4})\s+(징역.*|무기징역|무죄.*)/);
  if(m){
    return `<span class="person-tag">${esc(m[1])}</span><span class="sentence-tag${acqClass}">${esc(m[2])}</span>`;
  }
  return `<span class="sentence-tag${acqClass}">${esc(r.result)}</span>`;
}

// 기준일·예정 판정: 순수 로직은 core.js, 현재 시각·데이터 기준일(asOf)은 여기서 넣는다.
function todayStr(){
  const asOf=(store.meta&&store.meta.info&&store.meta.info.asOf)||"";
  return todayOf(new Date(),asOf);
}
function isSchedRulingNow(r){return isSchedRuling(r,todayStr())}
function renderTimeline(cases){
  let evs=cases.flatMap(c=>{
    // 인사이트 필터 중이면 해당 결과에 해당하는 판결만 이벤트로 남긴다
    const keep=state.outcomeFilter?caseOutcome(c)[state.outcomeFilter]:null;
    return c.rulings.filter(r=>r.date&&(!keep||keep.includes(r.id))&&(!state.tlSched||isSchedRulingNow(r))).map(r=>({c,r}));
  }).sort((a,b)=>b.r.date.localeCompare(a.r.date));
  if(!evs.length)return empty();
  const tf=`<div class="timeline-filters" role="group" aria-label="타임라인 일정 필터">
    <button type="button" class="tf-chip" data-tf="all" aria-pressed="${!state.tlSched}">전체 일정</button>
    <button type="button" class="tf-chip" data-tf="sched" aria-pressed="${state.tlSched}" title="앞으로 다가오는 선고·공판 일정만 모아봅니다">선고·공판 예정</button>
  </div>`;
  const groups={};evs.forEach(e=>{const m=e.r.date.slice(0,7);(groups[m]=groups[m]||[]).push(e)});
  return tf+`<div class="tl">${Object.entries(groups).map(([m,arr])=>{const [y,mo]=m.split("-");
    return `<section class="month"><h2>${y}년 ${+mo}월 <span>${arr.length}건</span></h2><div class="ev-list">${arr.map(({c,r})=>{
      const pend=r.kind==="pending";
      const t = todayStr();
      const isFuture = r.date && r.date > t;
      const isToday = r.date && r.date === t;
      const isUpcoming = isFuture || (isToday && String(r.result||"").includes("예정"));
      const k = isUpcoming ? "sched" : (r.level===3?"final":r.level===2?"app":"trial");
      const tag = pend ? `<span class="pill st-sched">${LV[r.level]} · ${isUpcoming ? "예정" : "진행 중"}</span>` : `<span class="pill st-${k}">${LV[r.level]}</span>`;
      const upTxt = isUpcoming ? (String(r.result||"").includes("선고 예정") ? "선고 예정" : "공판 예정") : "";
      const upBadge = upTxt ? ` <span class="badge-upcoming">${upTxt}</span>` : "";
      return `<article class="ev k-${k}"><div class="d">${fmt(r.date).slice(5)}</div><div class="b">
        <div class="t">${tag} <strong>${esc(c.title)}</strong>${upBadge}</div>
        <div class="r">${resultHTML(r)}${r.requested&&!r.sentences.length?` <span class="m">(구형 ${esc(r.requested)})</span>`:""}</div>
        ${r.sentences.length>1?sentList(r):""}
        ${r.summary?`<div class="m">${esc(r.summary)}</div>`:""}
        ${quoteHTML(r)}
        <div class="m"><button type="button" class="judge-link" onclick="goToPanel('${esc(r.court)}')" title="[재판부] 탭에서 이 재판부 카드 열기">${esc(r.court)}</button>${judgeLine(r)?` · <button type="button" class="judge-link" onclick="goToPanel('${esc(r.court)}')" title="[재판부] 탭에서 이 재판부 카드 열기">${esc(judgeLine(r))}</button>`:""}${r.caseNo?` · <span class="mono">${esc(r.caseNo)}</span>`:""}</div>
        <div class="m">${links(r)}</div></div></article>`}).join("")}</div></section>`}).join("")}</div>`;
}
function renderCases(cases){
  if(!cases.length)return empty();
  return `<div class="cases">${cases.map(c=>{const st=STATUS[c.status]||STATUS.sched;
    const stages=[1,2,3].map(lv=>{const r=c.rulings.find(x=>x.level===lv);
      if(!r)return `<div class="stage empty"><div class="lbl"><span>${LV[lv]}</span></div>아직 해당 없음</div>`;
      return `<div class="stage"><div class="lbl"><span>${LV[lv]}${r.kind==="pending"?" · 진행":""}</span><span class="mono">${fmt(r.date)}</span></div>
        <div class="res">${resultHTML(r)}${r.summary?`<small>${esc(r.summary)}</small>`:""}</div>
        ${r.sentences.length>1?sentList(r):""}
        ${quoteHTML(r,{compact:true})}
        <dl><dt>재판부</dt><dd><button type="button" class="judge-link" onclick="goToPanel('${esc(r.court)}')" title="[재판부] 탭에서 이 재판부 카드 열기">${esc(r.court)}</button></dd>${judgeLine(r)?`<dt>판사</dt><dd><button type="button" class="judge-link" onclick="goToPanel('${esc(r.court)}')" title="[재판부] 탭에서 이 재판부 카드 열기">${esc(judgeLine(r))}</button></dd>`:""}
        <dt>사건번호</dt><dd class="mono">${r.caseNo?esc(r.caseNo):"보도 미확인"}</dd>${r.requested?`<dt>구형</dt><dd>${esc(r.requested)}</dd>`:""}</dl>
        <div class="links">${links(r)}</div></div>`}).join("");
    return `<article class="case" id="case-${esc(c.id)}"><div class="case-h"><div class="top"><h3>${esc(c.title)}</h3><div class="top-right"><span class="pill ${st.cls}">${st.label}</span><button type="button" class="share-btn" onclick="copyDeepLink('case','${esc(c.id)}')" title="사건 링크 복사" aria-label="${esc(c.title)} 사건 링크 복사">🔗</button></div></div>
      <div class="who">피고인 ${esc(c.defendants.map(d=>d.name).join(", "))}</div><div class="who">혐의 ${esc(c.charge)}</div></div>
      <div class="rail">${stages}</div>${c.note?`<div class="case-n">${esc(c.note)}</div>`:""}</article>`}).join("")}</div>`;
}

// 인물사전 렌더링 (카테고리는 데이터셋별 정의)
const CATS_BY_DS={
  dec03:{list:["all","대통령실","정부·국무위원","군 지휘부","계엄군 현장 지휘관","경찰","국회·정계"],
    labels:{"all":"전체","대통령실":"대통령·경호처","정부·국무위원":"정부·국무위원","군 지휘부":"군 지휘부","계엄군 현장 지휘관":"현장 지휘관","경찰":"경찰","국회·정계":"국회·정계"}},
  kim:{list:["all","전직 대통령 부부","정계·선거","통일교·청탁","도이치모터스","인사·금품청탁"],
    labels:{"all":"전체","전직 대통령 부부":"전직 대통령 부부","정계·선거":"정계·선거","통일교·청탁":"통일교·청탁","도이치모터스":"도이치모터스","인사·금품청탁":"인사·금품청탁"}},
  chae:{list:["all","대통령실","국방부·군 수뇌부","해병대 지휘부","군검찰·수사기구","정부·법무·민간"],
    labels:{"all":"전체","대통령실":"대통령실","국방부·군 수뇌부":"국방부·군 수뇌부","해병대 지휘부":"해병대 지휘부","군검찰·수사기구":"군검찰·수사기구","정부·법무·민간":"정부·법무·민간"}}
};
const CATEGORIES=()=>CATS_BY_DS[state.dataset].list;
const CAT_LABELS=()=>CATS_BY_DS[state.dataset].labels;


function monogram(name){
  return (name||"?").trim().slice(0,1)||"?";
}

function avatarHTML(person,size){
  const lg=size==="lg";
  const dim=lg?96:68;
  const mono=`<span class="avatar-mono" aria-hidden="true">${esc(monogram(person.name))}</span>`;
  const img=person.photo?`<img class="avatar-img" src="${esc(person.photo)}-320.webp" srcset="${esc(person.photo)}-160.webp 160w, ${esc(person.photo)}-320.webp 320w" sizes="${dim}px" width="${dim}" height="${dim}" alt="" loading="${lg?"eager":"lazy"}" decoding="async" onerror="this.remove()">`:"";
  return `<span class="avatar${lg?" lg":""}" data-cat="${esc(person.category||"기타")}"${person.photoAlt?` title="${esc(person.photoAlt)}"`:""} aria-hidden="true">${mono}${img}</span>`;
}

function photoCreditHTML(person,inline){
  if(!person.photo)return "";
  const license=person.photoLicense
    ? (person.photoLicenseUrl?`<a href="${esc(person.photoLicenseUrl)}" target="_blank" rel="noopener">${esc(person.photoLicense)}</a>`:esc(person.photoLicense))
    : "";
  const attribution=[person.photoCredit?esc(person.photoCredit):"",license].filter(Boolean).join(" · ");
  const source=person.photoSource?` · <a href="${esc(person.photoSource)}" target="_blank" rel="noopener">원본 출처</a>`:"";
  return `<p class="photo-credit${inline?" inline":""}">사진: ${attribution||"출처 미상"}${source}</p>`;
}

function renderPeople(cases,P){
  const map={};
  cases.forEach(c=>c.defendants.forEach(d=>{(map[d.id]=map[d.id]||{person:d,items:[]}).items.push(c)}));
  let list=Object.values(map);

  // 역할군 카테고리 필터
  if(state.personCat && state.personCat!=="all"){
    list=list.filter(x=>(x.person.category||"기타")===state.personCat);
  }

  // 검색어 필터
  if(state.q){
    list=list.filter(x=>textMatches(personHay(x.person,x.items),state.q));
  }

  // 정렬
  if(state.personSort==="cases"){
    list.sort((a,b)=>b.items.length-a.items.length||a.person.name.localeCompare(b.person.name,"ko"));
  }else if(state.personSort==="name"){
    list.sort((a,b)=>a.person.name.localeCompare(b.person.name,"ko"));
  }else if(state.personSort==="severity"){
    list.sort((a,b)=>{
      const maxA=Math.max(0,...a.items.flatMap(c=>c.rulings.map(r=>getSentenceWeight(r.sentences.find(s=>s.personId===a.person.id)?.sentence))));
      const maxB=Math.max(0,...b.items.flatMap(c=>c.rulings.map(r=>getSentenceWeight(r.sentences.find(s=>s.personId===b.person.id)?.sentence))));
      return maxB-maxA||b.items.length-a.items.length||a.person.name.localeCompare(b.person.name,"ko");
    });
  }

    const categoryChips=CATEGORIES().map(c=>`<button type="button" class="cat-btn" data-cat="${esc(c)}" aria-pressed="${state.personCat===c}">${esc(CAT_LABELS()[c]||c)}</button>`).join("");

  const headerHTML=`
    <div class="dict-nav">
      <div class="cat-chips">${categoryChips}</div>
      <div class="dict-sort">
        <label for="sort-sel">정렬</label>
        <select id="sort-sel">
          <option value="cases"${state.personSort==="cases"?" selected":""}>사건 많은 순</option>
          <option value="severity"${state.personSort==="severity"?" selected":""}>최고 선고형 순</option>
          <option value="name"${state.personSort==="name"?" selected":""}>가나다 순</option>
        </select>
      </div>
    </div>
    <div class="dict-stats">기록된 인물 총 ${Object.keys(P).length}명 중 ${list.length}명 표시</div>`;

  if(!list.length)return headerHTML + empty();

  const cardsHTML=list.map(({person,items})=>{
    const cat=person.category||"기타";
    const statusNote=person.statusNote||"";
    const keyRole=person.keyRole||"";

    // 개별 선고 칩 렌더링
    const statusChips = statusNote ? statusNote.split(" / ").map(sn=>{
      const isAcq = sn.includes("무죄");
      const isFinal = sn.includes("확정");
      const isHeavy = sn.includes("무기") || sn.includes("30년") || sn.includes("25년");
      let cls = "status-pill";
      if(isAcq) cls += " acq";
      else if(isFinal) cls += " st-final";
      else if(isHeavy) cls += " st-heavy";
      return `<span class="${cls}">${esc(sn)}</span>`;
    }).join("") : "";

    return `<article class="person" id="person-${esc(person.id)}">
      <div class="person-header">
        <div class="person-head">
          ${avatarHTML(person)}
          <div class="person-head-main">
            <div class="top-row">
              <h3>${esc(person.name)} <small>${esc(person.role||"")}</small></h3>
              <span class="cat-pill">${esc(cat)}</span>
            </div>
            ${statusChips?`<div class="person-badges">${statusChips}</div>`:""}
          </div>
        </div>
      </div>

      ${keyRole?`<div class="role-box"><strong>행적·혐의:</strong> ${esc(keyRole)}</div>`:""}

      <div class="pcase-list">
        <div style="font-size:12px;color:var(--muted);font-weight:600">관련 재판 (${items.length}건)</div>
        ${items.map(c=>{
          const st=STATUS[c.status]||STATUS.sched;
          const steps=c.rulings.map(r=>{const s=r.sentences.find(x=>x.personId===person.id);
            const txt=s?s.sentence:(r.kind==="pending"?r.result:"");
            if(!txt)return "";
            const isAcq = s && s.outcome==="무죄";
            return `<span class="step"><span class="lv">${LV[r.level]}</span> <span class="step-sent ${isAcq?"acq":""}">${esc(txt)}</span></span>`;
          }).filter(Boolean);
          return `<div class="pcase-item">
            <div class="ct">
              <a href="#case-${esc(c.id)}" onclick="goToCase('${esc(c.id)}');return false;">${esc(c.title)}</a>
              <span class="pill ${st.cls}">${st.label}</span>
            </div>
            <div class="chain">${steps.length?steps.join(' <span class="arr">→</span> '):'<span class="m">선고 전</span>'}</div>
          </div>`}).join("")}
      </div>

      <div class="person-footer">
        <button type="button" class="btn-open-modal" onclick="openPersonModal('${esc(person.id)}')">상세 프로필 보기 ↗</button>
      </div>
    </article>`;
  }).join("");

  const hasPhotos=list.some(({person})=>Boolean(person.photo));
  return headerHTML + `<div class="people">${cardsHTML}</div>` + (hasPhotos?`<p class="photo-note">프로필 사진은 위키미디어 공용·정부 기관 공개 이미지와 언론사 보도 사진(출처 표시)을 사용했습니다. 사진마다 두 출처 교차 확인 또는 군복·정복 명찰과 직책으로 본인을 확인했고, 개별 사진의 출처·라이선스·검증 근거는 각 인물의 상세 프로필과 public/assets/photos/CREDITS.md에서 확인할 수 있습니다.</p>`:"");
}

// 카드 찾아 스크롤·하이라이트 (딥링크 진입·뷰 전환 공통)
function focusCard(id){
  setTimeout(()=>{
    const target=document.getElementById(id);
    if(target){
      target.scrollIntoView({behavior:"smooth",block:"center"});
      target.style.outline="3px solid var(--accent)";
      target.style.outlineOffset="4px";
      setTimeout(()=>{target.style.outline="";target.style.outlineOffset=""},2500);
      // 사건 딥링크로 들어올 때는 카드 안의 판결 요지도 함께 강조해 바로 보이게 한다.
      const quotes=target.querySelectorAll?target.querySelectorAll(".ruling-quote"):[];
      Array.prototype.forEach.call(quotes,q=>{q.classList&&q.classList.add("rq-highlight");setTimeout(()=>{q.classList&&q.classList.remove("rq-highlight")},2500)});
    }
  },80);
}

function goToCase(caseId){
  state.view="cases";
  try{localStorage.setItem("ins-view","cases")}catch(e){}
  render();
  if(history.replaceState)history.replaceState(null,"","#"+state.dataset+"/case/"+caseId);
  focusCard("case-"+caseId);
  syncCaseMetaTitle(caseId);
}

function openPersonModal(personId,opts){
  opts=opts||{};
  const P=store.people||{};
  const person=P[personId];
  if(!person)return;
  trackEvent('person_view',{personId:personId,name:person.name,dataset:state.dataset});
  const {cases}=model();
  const relCases=cases.filter(c=>c.defendantIds&&c.defendantIds.includes(personId));

  const modal=document.getElementById("person-dialog");
  const content=document.getElementById("modal-content");

  const statusChips = person.statusNote ? person.statusNote.split(" / ").map(sn=>{
    const isAcq = sn.includes("무죄");
    const isFinal = sn.includes("확정");
    const isHeavy = sn.includes("무기") || sn.includes("30년") || sn.includes("25년");
    let cls = "status-pill";
    if(isAcq) cls += " acq";
    else if(isFinal) cls += " st-final";
    else if(isHeavy) cls += " st-heavy";
    return `<span class="${cls}">${esc(sn)}</span>`;
  }).join("") : "";

  content.innerHTML=`
    <div class="modal-header">
      <div class="modal-person">
        ${avatarHTML(person,"lg")}
        <div class="modal-person-text">
          <h2 id="modal-person-name">${esc(person.name)} <small style="font-size:15px;color:var(--muted);font-weight:400">${esc(person.role||"")}</small></h2>
          <div class="sub">
            <span class="cat-pill">${esc(person.category||"기타")}</span>
            ${statusChips}
          </div>
          ${photoCreditHTML(person,true)}
        </div>
      </div>
      <div style="display:grid;gap:8px;justify-items:end">
        <button type="button" class="modal-close" onclick="closePersonModal()" aria-label="닫기">✕</button>
        <button type="button" class="copy-link-btn" onclick="copyDeepLink('person','${esc(personId)}')" title="이 인물의 딥링크 복사" aria-label="이 인물의 링크 복사">🔗 인물 링크 복사</button>
      </div>
    </div>
    <div class="modal-body">
      ${person.keyRole?`
      <div class="modal-section">
        <h4>핵심 행적 및 혐의</h4>
        <div class="role-box" style="font-size:14px;padding:12px 14px"><strong>행적·혐의:</strong> ${esc(person.keyRole)}</div>
      </div>`:""}

      <div class="modal-section">
        <h4>관련 기소 및 재판 현황 (${relCases.length}건)</h4>
        <div style="display:grid;gap:12px">
          ${relCases.map(c=>{
            const st=STATUS[c.status]||STATUS.sched;
            return `<div class="modal-case">
              <div class="modal-case-title">
                <span>${esc(c.title)}</span>
                <span class="pill ${st.cls}">${st.label}</span>
              </div>
              <div style="font-size:13px;color:var(--muted)">혐의: ${esc(c.charge)}</div>
              <div style="display:grid;gap:6px;margin-top:6px;border-top:1px dashed var(--line);padding-top:6px">
                ${c.rulings.map(r=>{
                  const s=r.sentences.find(x=>x.personId===personId);
                  const txt=s?s.sentence:(r.kind==="pending"?r.result:"");
                  const isAcq = s && s.outcome==="무죄";
                  return `<div class="modal-ruling-row">
                    <div class="ruling-court"><span class="lv-badge">${LV[r.level]}</span> <span>${esc(r.court)}</span></div>
                    <div class="ruling-sent">
                      ${txt?`<span class="sent-badge ${isAcq?'acq':''}">${esc(txt)}</span>`:'<span class="m">-</span>'}
                      ${s&&s.requested?`<span class="sent-rq">(구형 ${esc(s.requested)})</span>`:''}
                    </div>
                  </div>`;
                }).join("")}
              </div>
              ${c.rulings.filter(r=>r.quote&&r.sentences.some(s=>s.personId===personId)).map(r=>quoteHTML(r,{compact:true})).join("")}
            </div>`;
          }).join("")}
        </div>
      </div>
    </div>`;

  modal.showModal();
  // 모달 열림을 히스토리 엔트리로 기록: 브라우저 뒤로 가기 시 모달만 닫힌다.
  state.modalPerson=personId;
  updateMetaTitle(person.name+" — "+(DATASETS[state.dataset]||{}).title);
  if(!opts.fromHistory)updateURL(true);
}

function closePersonModal(fromPop){
  const wasId=state.modalPerson;
  state.modalPerson=null;
  updateMetaTitle((DATASETS[state.dataset]||{}).title);
  const modal=document.getElementById("person-dialog");
  if(modal.open)modal.close();
  // 닫기 경로(Esc·배경 클릭·✕)에서 현재 URL이 인물 딥링크면 뷰 해시로 되돌린다.
  if(!fromPop&&wasId){
    const r=parseHash(location.hash);
    if((history.state&&history.state.modal==="person")||(r&&r.targetType==="person"))replaceHash();
  }
}
// Esc 등 dialog 기본 닫힘도 같은 경로로 처리
document.getElementById("person-dialog").addEventListener("close",()=>{
  if(!state.modalPerson)return;
  state.modalPerson=null;
  updateMetaTitle((DATASETS[state.dataset]||{}).title);
  if(history.state&&history.state.modal==="person")replaceHash();
});

document.getElementById("person-dialog").addEventListener("click",e=>{
  if(e.target===document.getElementById("person-dialog"))closePersonModal();
});

function empty(){
  if(state.q)return `<div class="empty-state"><p>‘${esc(state.q)}’에 대한 검색 결과가 없습니다.</p><button type="button" class="lk-btn" data-q-clear>검색어 초기화</button></div>`;
  if(state.outcomeFilter||state.tlSched)return `<div class="empty-state"><p>조건에 맞는 항목이 없습니다. 인사이트·일정 필터를 해제해 보세요.</p><button type="button" class="lk-btn" data-f-clear>필터 해제</button></div>`;
  return `<div class="empty-state">${loaded.size<COLLS.length?"재판 기록을 불러오는 중입니다.":Object.keys(store.cases||{}).length?"조건에 맞는 항목이 없습니다. 검색어나 필터를 지워 보세요.":"아직 등록된 기록이 없습니다."}</div>`}

function render(){
  const DS=DATASETS[state.dataset]||DATASETS.dec03;
  updateMetaTitle(DS.title);
  document.querySelectorAll(".switcher button").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.ds===state.dataset)));
  if(lastSwitcherDs!==state.dataset){lastSwitcherDs=state.dataset;scrollActiveSwitcherIntoView()}
  // 탄핵 표결은 하위 탭이 아니라 상단 스위처가 고르는 별도 기록부다.
  const impOn=state.dataset==="impeachment";
  document.getElementById("site-title").textContent=DS.title;
  document.getElementById("site-lede").textContent=DS.lede;
  document.getElementById("q").placeholder=DS.searchPh;
  const qClear=document.getElementById("q-clear");
  if(qClear)qClear.hidden=!state.q;
  // 데이터가 아직 없으면(온라인 첫 로딩) 요약·인사이트 자리를 비워 두고 로딩 문구만 보여 준다.
  const notReady=!impOn&&!dataReady();
  ["summary","outcome-insights","search-feedback"].forEach(id=>{const n=document.getElementById(id);if(n)n.hidden=impOn||notReady});
  // 법원 재판 전용 컨트롤(탭 바·데이터 내보내기)은 탄핵 표결 기록부에서 감춘다.
  const tabsEl=document.querySelector(".tabs");
  if(tabsEl)tabsEl.hidden=impOn;
  const exportEl=document.getElementById("export-dropdown");
  if(exportEl)exportEl.hidden=impOn;
  if(impOn)closeExportMenu();
  const noteEl=document.querySelector(".note");
  if(noteEl)noteEl.hidden=impOn;
  const noteCourt=document.getElementById("note-court");
  if(noteCourt&&DS.noteCourt)noteCourt.innerHTML=DS.noteCourt;
  document.querySelectorAll(".tabs button").forEach(b=>b.setAttribute("aria-selected",b.dataset.view===state.view));
  if(lastTabScrollView!==state.view){lastTabScrollView=state.view;scrollActiveTabIntoView()}
  const view=document.getElementById("view");
  const gview=document.getElementById("view-graph");
  const jview=document.getElementById("view-judges");
  const isImp=impOn;
  const isGraph=!isImp&&state.view==="graph";
  const isJudges=!isImp&&state.view==="judges";
  const iview=document.getElementById("view-impeachment");
  if(!isGraph&&graphState.fullscreen)graphSetFullscreen(false);
  view.hidden=isGraph||isJudges||isImp;
  gview.hidden=!isGraph;
  jview.hidden=!isJudges;
  if(iview)iview.hidden=!isImp;
  if(isImp){
    if(iview){iview.innerHTML=renderImpeachment();impBind(iview)}
    const impAsOf=IMP.data&&IMP.data.meta&&IMP.data.meta.asOf;
    document.getElementById("asof").textContent=impAsOf?fmt(impAsOf)+" 기준 · 국회 회의록·언론 보도 종합":"국회 회의록·언론 보도 종합";
    return;
  }
  if(state.err){gview.innerHTML="";jview.innerHTML="";view.innerHTML=`<div class="empty-state">${esc(state.err)}</div>`;return}
  if(notReady){
    const waitHtml=`<div class="empty-state">${REMOTE.error?"재판 기록을 불러오지 못했습니다. 위의 [다시 불러오기]를 눌러 주세요.":"재판 기록을 불러오는 중입니다."}</div>`;
    view.innerHTML=waitHtml;gview.innerHTML=waitHtml;jview.innerHTML=waitHtml;
    document.getElementById("asof").textContent=REMOTE.error?"재판 기록을 불러오지 못했습니다":"재판 기록을 불러오는 중";
    return;
  }
  const {cases,P}=model();
  renderSummary(cases);
  renderInsights(cases);
  updateSearchUI(cases);
  const asof=store.meta?.info?.asOf;
  document.getElementById("asof").textContent=(asof?fmt(asof)+" 기준 · ":"")+"언론 보도 종합"+(state.stale?" · 최신 데이터를 확인하지 못했습니다":"");
  if(isGraph){
    gview.innerHTML=graphShellHTML();
    bindGraphCtrls();
    renderGraph();
    return;
  }
  if(isJudges){
    jview.innerHTML=renderJudges(cases.filter(c=>!state.status||c.status===state.status));
    jview.querySelectorAll("[data-jcat]").forEach(btn=>btn.onclick=()=>{state.judgeCat=btn.dataset.jcat;render()});
    return;
  }
  const list=filterCases(cases);
  view.innerHTML=state.view==="timeline"?renderTimeline(list):state.view==="cases"?renderCases(list):state.view==="charts"?renderCharts(cases.filter(c=>!state.status||c.status===state.status)):renderPeople(cases.filter(c=>!state.status||c.status===state.status),P);

  if(state.view==="charts"){
    document.querySelectorAll("[data-csort]").forEach(b=>b.onclick=()=>{state.chartSort=b.dataset.csort;render()});
    document.querySelectorAll("[data-cfilter]").forEach(b=>b.onclick=()=>{state.chartFilter=state.chartFilter===b.dataset.cfilter?"all":b.dataset.cfilter;render()});
  }

  // 이벤트 바인딩
  if(state.view==="timeline"){
    document.querySelectorAll(".tf-chip").forEach(b=>b.onclick=()=>{state.tlSched=b.dataset.tf==="sched";render()});
  }
  if(state.view==="people"){
    document.querySelectorAll(".cat-btn").forEach(btn=>{
      btn.onclick=()=>{
        state.personCat=btn.dataset.cat;
        render();
      };
    });
    const sel=document.getElementById("sort-sel");
    if(sel){
      sel.onchange=e=>{
        state.personSort=e.target.value;
        render();
      };
    }
  }
}

document.querySelectorAll(".tabs button").forEach(b=>b.onclick=()=>{
  const prevView=state.view;
  state.view=b.dataset.view;try{localStorage.setItem("ins-view",state.view)}catch(e){}replaceHash();render();
  if(prevView!==state.view)trackEvent('view_change',{view:state.view,dataset:state.dataset});
});
// 검색 이벤트는 500ms 디바운스 후 2자 이상일 때만 보낸다 (타이핑 중 과다 전송 방지)
let searchTrackTimer=null;
function trackSearchDebounced(){
  try{
    if(searchTrackTimer)clearTimeout(searchTrackTimer);
    searchTrackTimer=setTimeout(()=>{
      const q=state.q;
      if(q&&q.length>=2)trackEvent('search',{query:q,dataset:state.dataset});
    },500);
  }catch(e){}
}
document.getElementById("q").addEventListener("input",e=>{state.q=e.target.value.trim();render();trackSearchDebounced()});
document.getElementById("q").addEventListener("keydown",e=>{if(e.key==="Escape"&&state.q)clearSearch()});
document.getElementById("q-clear").onclick=clearSearch;
// 0건 empty state의 [검색어 초기화]·[필터 해제] 등 동적으로 렌더되는 버튼 위임 처리
if(document.addEventListener)document.addEventListener("click",e=>{
  const t=e.target&&e.target.closest?e.target.closest("[data-q-clear]"):null;
  if(t)clearSearch();
  const f=e.target&&e.target.closest?e.target.closest("[data-f-clear]"):null;
  if(f){state.outcomeFilter=null;state.tlSched=false;render()}
  // 데이터 로딩 실패 배너의 [다시 불러오기]
  const r=e.target&&e.target.closest?e.target.closest("[data-retry-load]"):null;
  if(r){setLoadError(null);fetchRemote(state.dataset)}
});

// ===== 관계도 그래프 뷰 (D3.js Force-Directed Graph) =====
// 지휘 계통(상하 관계) 링크: [상급자, 하급자]. 사건 연루 링크는 각 case의 defendantIds로부터 자동 생성.
const COMMAND_LINKS=[
  ["yoon","kimyh"],["yoon","parkjj"],["yoon","kimsh"],
  ["kimyh","parkas"],["kimyh","yeoih"],["kimyh","kwakjg"],["kimyh","leejw"],
  ["kwakjg","anms"],["kwakjg","bangjh"],["kwakjg","kimjg"],["kwakjg","kimch"],["kwakjg","kimsw"],["kwakjg","kimht"],["kwakjg","leesangh"],
  ["leejw","gush"],["leejw","chosh"],
  ["yeoih","jungsw"],["yeoih","kimdw"],
  ["yoon","chojh"],["kimyh","chojh"],
  ["chojh","kimbs"],["kimbs","mokht"],["kimbs","kimyg"],
  ["kimyh","kimyd"],["kimyh","munsh"],["kimyh","nohsw"],
  ["kimyh","kimms"],["kimms","kanghp"],["kimms","sonsj"],["kimyh","leekg"],
  ["parkjj","kimsh"],["parkjj","leekw"],["parkjj","kimshin"],
  // 대통령 직속: 국무총리(헌법 제86조), 국무위원, 국정원장, 대통령실 참모
  ["yoon","handc"],["yoon","leesm"],["yoon","parksj"],["yoon","choty"],["yoon","kangeg"],["yoon","choism"]
];
// 정당·정치 관계: 지휘 계통도, 같은 사건의 공동 피고인도 아니지만 정치적으로 맞물린 경우만 별도 표기.
const POLITICAL_LINKS=[
  ["yoon","choogh"], // 여당 원내대표로서 계엄 해제 표결에 관여
  ["handc","choism"] // 한덕수 1심 재판에서 최상목이 증인 출석 후 허위 증언 혐의로 기소
];
const CAT_CLASS_BY_DS={
  dec03:{"대통령실":"cat-pres","정부·국무위원":"cat-gov","군 지휘부":"cat-mil","계엄군 현장 지휘관":"cat-fld","경찰":"cat-pol","국회·정계":"cat-nat"},
  kim:{"전직 대통령 부부":"cat-pres","정계·선거":"cat-nat","통일교·청탁":"cat-fld","도이치모터스":"cat-mil","인사·금품청탁":"cat-gov"},
  chae:{"대통령실":"cat-pres","국방부·군 수뇌부":"cat-gov","해병대 지휘부":"cat-mil","군검찰·수사기구":"cat-pol","정부·법무·민간":"cat-nat"}
};
const graphState={hiddenCats:new Set(),showCmd:true,showCase:true,showPol:true,selected:null,graph:null};

// 데이터셋별 지휘·외압 링크: 데이터가 meta.graphLinks(계통 라벨·links)를 제공하면 그것을 사용하고, 없으면 공통 COMMAND_LINKS로 폴백
function cmdLinks(){
  const gl=(store.meta&&store.meta.graphLinks&&store.meta.graphLinks.links)||[];
  if(gl.length)return gl.map(l=>[l.source,l.target]);
  return COMMAND_LINKS;
}

function buildGraphData(){
  const P=store.people||{};
  const {cases}=model();
  const nodes=[],nodeById={};
  const ensureNode=id=>{if(!nodeById[id]&&P[id]){const p=Object.assign({id},P[id]);nodeById[id]=p;nodes.push(p)}};
  cases.forEach(c=>(c.defendantIds||[]).forEach(ensureNode));
  cmdLinks().forEach(([a,b])=>{ensureNode(a);ensureNode(b)});
  POLITICAL_LINKS.forEach(([a,b])=>{ensureNode(a);ensureNode(b)});
  const links=[];
  cmdLinks().forEach(([s,t])=>{if(nodeById[s]&&nodeById[t])links.push({source:s,target:t,type:"cmd"})});
  POLITICAL_LINKS.forEach(([s,t])=>{if(nodeById[s]&&nodeById[t])links.push({source:s,target:t,type:"pol"})});
  const pairMap={};
  cases.forEach(c=>{const ids=(c.defendantIds||[]).filter(id=>nodeById[id]);
    ids.forEach((a,i)=>ids.slice(i+1).forEach(b=>{const k=[a,b].sort().join("|");(pairMap[k]=pairMap[k]||[]).push(c)}))});
  Object.entries(pairMap).forEach(([k,cs])=>{const [a,b]=k.split("|");links.push({source:a,target:b,type:"case",cases:cs})});
  return {nodes,links};
}

function graphShellHTML(){
  return `<div class="graph-filters" id="graph-filters"></div>
    <div class="graph-canvas" id="graph-canvas-outer">
      <svg id="graph-svg" role="img" aria-label="인물 관계도"></svg>
      <div class="graph-ctrls" role="toolbar" aria-label="관계도 조작">
        <button type="button" id="graph-zin" aria-label="확대" title="확대">+</button>
        <button type="button" id="graph-zout" aria-label="축소" title="축소">−</button>
        <button type="button" id="graph-zreset" aria-label="화면 초기화" title="기본 배치로 초기화">↺</button>
        <button type="button" id="graph-fs" aria-label="전체화면" title="전체화면">⛶</button>
      </div>
      <div id="graph-card" hidden></div>
    </div>
    <p class="graph-note">실선 화살표는 ${esc(DATASETS[state.dataset].cmdLabel)}, 파란 점선은 같은 사건의 공동 피고인 연루, 회색 일점쇄선은 지휘 계통이 아닌 정당·정치 관계를 나타냅니다. 노드를 드래그해 배치를 조정하고, 캔버스를 드래그하거나 스크롤해 이동·확대할 수 있습니다. 노드에 마우스를 올리면 연결된 관계망이, 클릭하면 인물 요약 카드가 표시됩니다.</p>`;
}

function statusChipsHTML(note){
  if(!note)return "";
  return note.split(" / ").map(sn=>{
    const isAcq=sn.includes("무죄"),isFinal=sn.includes("확정"),isHeavy=sn.includes("무기")||sn.includes("30년")||sn.includes("25년");
    let cls="status-pill";
    if(isAcq)cls+=" acq";else if(isFinal)cls+=" st-final";else if(isHeavy)cls+=" st-heavy";
    return `<span class="${cls}">${esc(sn)}</span>`;
  }).join("");
}

function renderGraphFilters(total){
  const el=document.getElementById("graph-filters");
  if(!el)return;
  const P=store.people||{};
  const counts={};
  Object.values(P).forEach(p=>{const c=p.category||"기타";counts[c]=(counts[c]||0)+1});
  const chips=CATEGORIES().filter(c=>c!=="all").map(c=>
    `<button type="button" class="cat-btn" data-gcat="${esc(c)}" aria-pressed="${!graphState.hiddenCats.has(c)}">${esc(CAT_LABELS()[c]||c)} <span class="mono">${counts[c]||0}</span></button>`).join("");
  el.innerHTML=`<div class="cat-chips">${chips}<span class="dict-stats" style="margin:0">인물 ${total}명</span></div>
    <div class="graph-link-toggles">
      <button type="button" class="lk-btn" data-glk="cmd" aria-pressed="${graphState.showCmd}" title="지휘 계통 표시">— 지휘선</button>
      <button type="button" class="lk-btn" data-glk="case" aria-pressed="${graphState.showCase}" title="사건 연루 표시">┄ 사건선</button>
      <button type="button" class="lk-btn" data-glk="pol" aria-pressed="${graphState.showPol}" title="정당·정치 관계 표시">┈ 정치선</button>
    </div>`;
  el.querySelectorAll("[data-gcat]").forEach(b=>b.onclick=()=>{
    const c=b.dataset.gcat;
    graphState.hiddenCats.has(c)?graphState.hiddenCats.delete(c):graphState.hiddenCats.add(c);
    b.setAttribute("aria-pressed",String(!graphState.hiddenCats.has(c)));
    applyGraphFilter();
  });
  el.querySelectorAll("[data-glk]").forEach(b=>b.onclick=()=>{
    const k=b.dataset.glk;
    if(k==="cmd")graphState.showCmd=!graphState.showCmd;
    else if(k==="case")graphState.showCase=!graphState.showCase;
    else graphState.showPol=!graphState.showPol;
    b.setAttribute("aria-pressed",String(k==="cmd"?graphState.showCmd:k==="case"?graphState.showCase:graphState.showPol));
    applyGraphFilter();
  });
}

const linkEnds=d=>{const s=d.source,t=d.target;if(typeof s==="string"||typeof t==="string")return null;
  const dx=t.x-s.x,dy=t.y-s.y,dist=Math.sqrt(dx*dx+dy*dy)||1,o=27;
  return {x1:s.x+dx/dist*o,y1:s.y+dy/dist*o,x2:t.x-dx/dist*o,y2:t.y-dy/dist*o}};
const endpointId=n=>typeof n==="string"?n:n.id;
function linkTypeVisible(type){
  return type==="cmd"?graphState.showCmd:type==="pol"?graphState.showPol:graphState.showCase;
}

// 탭 자동 스크롤: 활성 탭이 가로 스크롤 영역 밖에 있으면 뷰포트 안으로 부드럽게 이동
let lastTabScrollView=null;
let lastSwitcherDs=null;
function scrollActiveTabIntoView(){
  if(typeof document.querySelector!=="function")return;
  const btn=document.querySelector('.tabs button[aria-selected="true"]');
  if(!btn||typeof btn.scrollIntoView!=="function")return;
  try{btn.scrollIntoView({behavior:"smooth",inline:"nearest",block:"nearest"})}catch(e){btn.scrollIntoView()}
}
// 스위처도 모바일에서 가로 스크롤이 되므로, 선택된 기록부가 화면 밖에 있으면 끌어온다.
function scrollActiveSwitcherIntoView(){
  if(typeof document.querySelector!=="function")return;
  const btn=document.querySelector('.switcher button[aria-selected="true"]');
  if(!btn||typeof btn.scrollIntoView!=="function")return;
  try{btn.scrollIntoView({behavior:"smooth",inline:"nearest",block:"nearest"})}catch(e){btn.scrollIntoView()}
}

// 관계도 컨트롤: 확대/축소/초기화/전체화면
function graphZoomBy(k){
  const g=graphState;
  if(!g.zoom||!g.svgSel)return;
  g.svgSel.transition().duration(250).call(g.zoom.scaleBy,k);
}
function graphZoomReset(){
  const g=graphState;
  if(!g.zoom||!g.svgSel)return;
  g.svgSel.transition().duration(350).call(g.zoom.transform,d3.zoomIdentity);
}
function bindGraphCtrls(){
  const zin=document.getElementById("graph-zin"),zout=document.getElementById("graph-zout"),
        zreset=document.getElementById("graph-zreset"),fs=document.getElementById("graph-fs");
  if(zin)zin.onclick=()=>graphZoomBy(1.3);
  if(zout)zout.onclick=()=>graphZoomBy(0.7);
  if(zreset)zreset.onclick=()=>graphZoomReset();
  if(fs)fs.onclick=()=>graphToggleFullscreen();
}
function graphSetFullscreen(on){
  on=!!on;
  if(graphState.fullscreen===on)return;
  graphState.fullscreen=on;
  const outer=document.getElementById("graph-canvas-outer");
  if(outer){on?outer.classList.add("graph-fullscreen"):outer.classList.remove("graph-fullscreen")}
  if(document.body&&document.body.classList){on?document.body.classList.add("graph-fs-open"):document.body.classList.remove("graph-fs-open")}
  const btn=document.getElementById("graph-fs");
  if(btn){btn.textContent=on?"✕":"⛶";btn.setAttribute("aria-label",on?"전체화면 종료":"전체화면");btn.setAttribute("title",on?"전체화면 종료":"전체화면")}
  if(on&&state.view==="graph")renderGraph(); // 새 뷰포트 크기에 맞춰 viewBox·중앙 좌표 갱신
}
function graphToggleFullscreen(){graphSetFullscreen(!graphState.fullscreen)}
window.addEventListener("keydown",e=>{if(e.key==="Escape"&&graphState.fullscreen)graphSetFullscreen(false)});

// d3 는 관계도 뷰에서만 쓰므로 <head> 에서 미리 받지 않고, 관계도를 처음 열 때 한 번만 주입한다.
// 같은 스크립트를 동시에 여러 번 요청하지 않도록 진행 중인 로딩 Promise 를 공유하고(ensureD3),
// 실패하면 캐시를 비워 다음 시도(탭 재진입·새로고침)에서 다시 불러올 수 있게 한다.
const D3_CDN="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js";
let d3Loading=null;
function ensureD3(){
  if(window.d3)return Promise.resolve(window.d3);
  if(d3Loading)return d3Loading;
  d3Loading=new Promise((resolve,reject)=>{
    const s=document.createElement("script");
    s.src=D3_CDN;
    s.async=true;
    s.onload=()=>{window.d3?resolve(window.d3):reject(new Error("d3 스크립트를 불러왔지만 전역 d3 가 없습니다"))};
    s.onerror=()=>{s.remove();reject(new Error("d3 스크립트를 불러오지 못했습니다"))};
    document.head.appendChild(s);
  }).catch(err=>{d3Loading=null;throw err});
  return d3Loading;
}

// 관계도 렌더 순서: d3 로딩을 기다리는 사이 다시 렌더가 걸리면(탭 이동·리사이즈) 마지막 렌더만 반영한다.
let graphRenderSeq=0;
function graphLoadingHTML(){
  return `<div class="graph-loading" role="status">관계도 그래프(d3.js)를 불러오는 중입니다…</div>`;
}
async function renderGraph(){
  const outer=document.getElementById("graph-canvas-outer");
  if(!outer)return;
  const seq=++graphRenderSeq;
  if(!window.d3){
    renderGraphFilters(0);
    if(!outer.querySelector(".graph-loading"))outer.insertAdjacentHTML("beforeend",graphLoadingHTML());
    try{
      await ensureD3();
    }catch(err){
      if(seq!==graphRenderSeq)return;
      outer.querySelectorAll(".graph-loading").forEach(msg=>{
        msg.className="graph-loading graph-loading-error";
        msg.textContent="관계도 라이브러리(D3.js)를 불러오지 못했습니다. 네트워크 연결 상태를 확인한 뒤 [관계도] 탭을 다시 눌러 주세요.";
      });
      return;
    }
    if(seq!==graphRenderSeq)return;
    // 불러오는 동안 다른 기록부·탭으로 이동했으면 그리지 않는다(이미 감춰진 뷰를 건드리지 않기 위해).
    if(state.view!=="graph"||state.dataset==="impeachment"||document.getElementById("graph-canvas-outer")!==outer)return;
    outer.querySelectorAll(".graph-loading").forEach(msg=>msg.remove());
  }
  const {nodes,links}=buildGraphData();
  renderGraphFilters(nodes.length);
  hideGraphCard();

  const svg=d3.select("#graph-svg");
  svg.selectAll("*").remove();
  const W=Math.max(outer.clientWidth,320),H=Math.max(outer.clientHeight,280);
  svg.attr("viewBox",`0 0 ${W} ${H}`);

  const defs=svg.append("defs");
  defs.append("clipPath").attr("id","node-clip").append("circle").attr("r",22);
  const mk=defs.append("marker").attr("id","arrow-cmd").attr("viewBox","0 -4 9 8").attr("refX",9).attr("refY",0)
    .attr("markerWidth",9).attr("markerHeight",8).attr("orient","auto").attr("markerUnits","userSpaceOnUse");
  mk.append("path").attr("d","M0,-4L9,0L0,4").attr("class","arrow-fill");

  const zoom=d3.zoom().scaleExtent([0.35,4]).on("zoom",e=>root.attr("transform",e.transform));
  svg.call(zoom).on("dblclick.zoom",null);
  graphState.zoom=zoom;graphState.svgSel=svg;
  const root=svg.append("g");
  const gLinks=root.append("g"),gNodes=root.append("g");

  const linkSel=gLinks.selectAll("g").data(links).join("g")
    .attr("class",d=>"g-link "+d.type)
    .each(function(d){
      d3.select(this).append("line");
      d3.select(this).append("title").text(d.type==="cmd"
        ?DATASETS[state.dataset].cmdLabel
        :d.type==="pol"
        ?"정당·정치 관계"
        :"사건 연루: "+d.cases.map(c=>c.title).join(" / "));
    });
  linkSel.style("display",d=>linkTypeVisible(d.type)?null:"none");

  const nodeSel=gNodes.selectAll("g").data(nodes,d=>d.id).join("g")
    .attr("class",d=>"g-node "+((CAT_CLASS_BY_DS[state.dataset]||{})[d.category]||"cat-etc"))
    .attr("tabindex",0).attr("role","button").attr("aria-label",d=>d.name+" "+(d.role||""))
    .each(function(d){
      const n=d3.select(this);
      n.append("circle").attr("class","halo").attr("r",27);
      n.append("circle").attr("class","nbg").attr("r",24);
      n.append("text").attr("class","g-mono").attr("dy","0.35em").text(d.name.slice(0,1));
      if(d.photo){
        n.append("image").attr("href",d.photo+"-160.webp").attr("x",-22).attr("y",-22).attr("width",44).attr("height",44)
          .attr("clip-path","url(#node-clip)").attr("preserveAspectRatio","xMidYMin slice")
          .on("error",function(){d3.select(this).remove()});
      }
      n.append("circle").attr("class","ring").attr("r",23.5).attr("fill","none").attr("stroke-width",2).attr("pointer-events","none");
      n.append("text").attr("class","nname").attr("y",42).text(d.name);
      if(d.role){const max=W<640?10:16;n.append("text").attr("class","nrole").attr("y",57).text(d.role.length>max?d.role.slice(0,max-1)+"…":d.role)}
    });
  // 이름표가 캔버스 밖으로 잘리지 않도록 노드별 실제 폭의 절반을 저장한다.
  nodeSel.each(function(d){
    let w=48;
    try{w=Math.max(w,this.getBBox().width)}catch(e){}
    d.halfW=w/2+3;
  });

  const sim=d3.forceSimulation(nodes)
    .force("link",d3.forceLink(links).id(d=>d.id).distance(l=>l.type==="cmd"?100:l.type==="pol"?150:58).strength(l=>l.type==="cmd"?0.5:l.type==="pol"?0.2:0.25))
    .force("charge",d3.forceManyBody().strength(-420))
    .force("center",d3.forceCenter(W/2,H/2))
    .force("collide",d3.forceCollide().radius(W>640?50:42))
    .force("x",d3.forceX(W/2).strength(0.03))
    .force("y",d3.forceY(H/2).strength(0.05))
    .on("tick",()=>{
      // 노드가 캔버스 밖으로 밀려나 이름표까지 사라지지 않도록 경계 안에 붙여 둔다.
      nodes.forEach(d=>{
        const hw=Math.min(d.halfW||26,W/2-8);
        d.x=Math.max(hw,Math.min(W-hw,d.x));
        d.y=Math.max(28,Math.min(H-72,d.y));
      });
      linkSel.select("line").each(function(d){const e=linkEnds(d);if(e)d3.select(this).attr("x1",e.x1).attr("y1",e.y1).attr("x2",e.x2).attr("y2",e.y2)});
      nodeSel.attr("transform",d=>`translate(${d.x},${d.y})`);
    });

  nodeSel.on("mouseenter",(e,d)=>highlightGraph(d.id))
    .on("mouseleave",()=>highlightGraph(null))
    .on("click",(e,d)=>{e.stopPropagation();showGraphCard(d.id)})
    .on("keydown",(e,d)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();showGraphCard(d.id)}})
    .call(d3.drag()
      .on("start",(e,d)=>{e.sourceEvent.stopPropagation();if(!e.active)sim.alphaTarget(0.25).restart();d.fx=d.x;d.fy=d.y})
      .on("drag",(e,d)=>{d.fx=e.x;d.fy=e.y})
      .on("end",(e,d)=>{if(!e.active)sim.alphaTarget(0);d.fx=null;d.fy=null}));
  svg.on("click",()=>hideGraphCard());

  graphState.graph={nodes,links,nodeSel,linkSel};
  applyGraphFilter();
}

function applyGraphFilter(){
  const g=graphState.graph;
  if(!g)return;
  const catOf={};g.nodes.forEach(n=>catOf[n.id]=n.category||"기타");
  const visible=id=>!graphState.hiddenCats.has(catOf[id]);
  g.nodeSel.style("display",d=>visible(d.id)?null:"none");
  g.linkSel.style("display",d=>{
    const t=linkTypeVisible(d.type);
    return (t&&visible(endpointId(d.source))&&visible(endpointId(d.target)))?null:"none";
  });
  if(graphState.selected&&!visible(graphState.selected))hideGraphCard();
  applyGraphSearch();
}

// 검색어가 있을 때 관계도에서 매칭 노드를 강조하고 나머지를 흐리게 한다.
function applyGraphSearch(){
  const g=graphState.graph;
  if(!g)return;
  const hit=d=>!!state.q&&textMatches([d.name,d.role,d.keyRole,d.category].join(" "),state.q);
  g.nodeSel.classed("hit",d=>hit(d)).classed("dim",d=>!hit(d));
  g.linkSel.classed("dim",d=>{
    if(!state.q)return false;
    const s=g.nodes.find(n=>n.id===endpointId(d.source)),t=g.nodes.find(n=>n.id===endpointId(d.target));
    return !(s&&hit(s))&&!(t&&hit(t));
  });
}

function highlightGraph(id){
  const g=graphState.graph;
  if(!g)return;
  if(!id){g.nodeSel.classed("dim",false);g.linkSel.classed("dim",false);applyGraphSearch();return}
  const nbr=new Set([id]);
  g.links.forEach(l=>{const s=endpointId(l.source),t=endpointId(l.target);if(s===id)nbr.add(t);if(t===id)nbr.add(s)});
  g.nodeSel.classed("dim",d=>!nbr.has(d.id));
  g.linkSel.classed("dim",d=>endpointId(d.source)!==id&&endpointId(d.target)!==id);
}

function showGraphCard(id){
  const P=store.people||{};
  const p=P[id];
  if(!p)return;
  graphState.selected=id;
  const {cases}=model();
  const rel=cases.filter(c=>(c.defendantIds||[]).includes(id)).map(c=>{
    const txts=c.rulings.map(r=>{const s=r.sentences.find(x=>x.personId===id);return s?s.sentence:(r.kind==="pending"?r.result:"")}).filter(Boolean);
    return {c,txt:txts[txts.length-1]||"선고 전"};
  });
  const card=document.getElementById("graph-card");
  card.innerHTML=`
    <button type="button" class="modal-close" onclick="hideGraphCard()" aria-label="닫기">✕</button>
    <div class="modal-person">
      ${avatarHTML(p,"lg")}
      <div class="modal-person-text">
        <h2>${esc(p.name)}</h2>
        <div style="font-size:12.5px;color:var(--muted)">${esc(p.role||"")}</div>
        <div class="sub" style="margin-top:4px"><span class="cat-pill">${esc(p.category||"기타")}</span></div>
      </div>
    </div>
    ${p.statusNote?`<div class="person-badges">${statusChipsHTML(p.statusNote)}</div>`:""}
    ${p.keyRole?`<div class="role-box" style="font-size:12.5px;padding:8px 10px"><strong>행적·혐의:</strong> ${esc(p.keyRole)}</div>`:""}
    <div style="display:grid;gap:6px;border-top:1px dashed var(--line);padding-top:8px">
      <div style="font-size:12px;color:var(--muted);font-weight:600">관련 재판 (${rel.length}건)</div>
      ${rel.map(({c,txt})=>`<div style="font-size:12.5px;display:flex;justify-content:space-between;gap:8px"><span>${esc(c.title)}</span><span style="font-weight:600;white-space:nowrap">${esc(txt)}</span></div>`).join("")}
    </div>
    <button type="button" class="lk-btn" style="justify-self:start;color:var(--accent);border-color:var(--accent)" onclick="goToPerson('${esc(id)}')">인물사전에서 보기 →</button>`;
  card.hidden=false;
  if(graphState.graph)graphState.graph.nodeSel.classed("sel",d=>d.id===id);
}

function hideGraphCard(){
  graphState.selected=null;
  const card=document.getElementById("graph-card");
  if(card){card.hidden=true;card.innerHTML=""}
  if(graphState.graph)graphState.graph.nodeSel.classed("sel",false);
}

function goToPerson(personId){
  state.view="people";
  try{localStorage.setItem("ins-view","people")}catch(e){}
  render();
  replaceHash();
  focusCard("person-"+personId);
}

window.addEventListener("resize",()=>{if(state.view==="graph")renderGraph()});

// ===== 형량비교 뷰(렌더링) — 형량 환산·행 구성은 core.js 의 chartMonthsOf · buildChartRows =====
function renderCharts(cases){
  let rows=buildChartRows(cases,store.people||{});
  // 상단 검색어는 다른 뷰와 동일하게 형량비교에서도 피고인명·직책·사건명에 적용한다.
  if(state.q)rows=rows.filter(r=>textMatches([r.p.name,r.p.role,r.p.category||"",r.caseTitle,r.demandTxt||"",r.lastTxt||""].join(" "),state.q));
  const FLABELS={all:"전체",agr:"▲ 가중",mit:"▼ 감형",acq:"⚖️ 무죄"};
  const counts={all:rows.length,agr:0,mit:0,acq:0};
  rows.forEach(r=>{if(counts[r.cat]!=null)counts[r.cat]++});
  if(state.chartFilter&&state.chartFilter!=="all")rows=rows.filter(r=>r.cat===state.chartFilter);
  if(state.chartSort==="severity")rows.sort((a,b)=>(b.lastM??-1)-(a.lastM??-1)||a.p.name.localeCompare(b.p.name,"ko"));
  else if(state.chartSort==="name")rows.sort((a,b)=>a.p.name.localeCompare(b.p.name,"ko"));
  else rows.sort((a,b)=>(b.reductionPct??-1)-(a.reductionPct??-1)||a.p.name.localeCompare(b.p.name,"ko"));

  const sortBtns=[["reduction","감형 폭 큰 순"],["severity","형량 높은 순"],["name","이름 순"]].map(([k,l])=>
    `<button type="button" class="cat-btn" data-csort="${k}" aria-pressed="${state.chartSort===k}">${l}</button>`).join("");
  const filterChips=Object.entries(FLABELS).map(([k,l])=>
    `<button type="button" class="cat-btn" data-cfilter="${k}" aria-pressed="${state.chartFilter===k}">${l} <span class="mono">${counts[k]}</span></button>`).join("");
  const headerHTML=`<div class="dict-nav"><div class="cat-chips">${filterChips}</div><div class="cat-chips">${sortBtns}</div></div>
    <div class="dict-stats">피고인·사건 ${rows.length}건 표시 · 바 길이는 형량을 개월 수로 환산한 사건 내 상대값입니다 (사형·무기징역은 ${CHART_SCALE}개월 환산 상한)</div>`;
  if(!rows.length){
    return headerHTML+(state.q||state.chartFilter!=="all"
      ?`<div class="empty-state"><p>조건에 맞는 형량 비교 항목이 없습니다.</p><button type="button" class="lk-btn" onclick="state.chartFilter='all';clearSearch()">필터 해제</button></div>`
      :empty());
  }

  const cap=m=>m==null?null:Math.min(m,CHART_SCALE);
  const cards=rows.map(r=>{
    const cands=[cap(r.demandM),cap(r.t1.m),cap(r.t2.m),cap(r.fin.m)].filter(v=>v!=null);
    const maxC=Math.max(0,...cands);
    const bar=(label,txt,m,cls,pndTxt)=>{
      if(!txt&&!pndTxt)return "";
      const cm=cap(m);
      const acqNow=cm===0&&/무죄/.test(txt||"");
      const w=cm==null?0:acqNow?2:Math.max(3,Math.round(cm/maxC*100));
      const inner=cm==null
        ?`<span class="bar-none">${esc(pndTxt||txt||"선고 전")}</span>`
        :`<span class="bar-fill ${cls}${acqNow?" acq":""}" style="width:${w}%"></span><span class="bar-txt">${esc(txt)}</span>`;
      return `<div class="bar-line" role="img" aria-label="${esc(label)} ${esc(txt||pndTxt||"")}"><span class="bar-label">${label}</span><span class="bar-track">${inner}</span></div>`;
    };
    const badges=[];
    if(r.cat==="acq")badges.push(`<span class="badge-outcome acquitted">⚖️ 무죄</span>`);
    else if(r.cat==="fine")badges.push(`<span class="badge-outcome mitigated">💰 벌금형</span>`);
    else if(r.cat==="agr")badges.push(`<span class="badge-outcome aggravated" title="1심보다 형량이 늘어났거나 무죄가 뒤집혔습니다">▲ ${r.changePct!=null?r.changePct+"% ":""}가중</span>`);
    else if(r.cat==="mit")badges.push(`<span class="badge-outcome mitigated" title="1심보다 형량이 줄었습니다">▼ ${r.changePct!=null?r.changePct+"% ":""}감형</span>`);
    if(!r.cat&&r.t2.m!=null&&r.t1.m!=null&&r.t2.m===r.t1.m&&!r.t2.acq)badges.push(`<span class="cat-pill" title="2심이 1심 형량을 그대로 유지했습니다">2심 유지</span>`);
    if(r.reductionPct!=null&&r.cat!=="acq")badges.push(`<span class="badge-outcome mitigated" title="특검 구형량 대비 감형률">구형 대비 ▼ ${r.reductionPct}%</span>`);
    else if(r.cat!=="acq"&&r.demandM>0&&r.lastM===r.demandM)badges.push(`<span class="cat-pill" title="법원이 특검 구형량을 그대로 선고했습니다">구형 전량</span>`);
    if(r.fin.final)badges.push(`<span class="pill st-final">확정</span>`);
    return `<article class="person chart-row" id="chart-${esc(r.caseId)}-${esc(r.pid)}">
      <div class="person-header">
        <div class="person-head">
          <div class="person-head-main">
            <div class="top-row">
              <h3><button type="button" class="chart-person-btn" onclick="openPersonModal('${esc(r.pid)}')" title="인물 상세 프로필 열기">${esc(r.p.name)}</button> <small>${esc(r.p.role||"")}</small></h3>
              <span class="cat-pill">${esc(r.p.category||"")}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="chart-case"><a href="#case-${esc(r.caseId)}" onclick="goToCase('${esc(r.caseId)}');return false;" title="사건별 뷰에서 해당 사건 열기">${esc(r.caseTitle)}</a></div>
      <div class="chart-bars">
        ${bar("구형",r.demandTxt,r.demandM,"demand")}
        ${bar("1심",r.t1.txt,r.t1.m,"lv1",r.p1Txt)}
        ${bar("2심",r.t2.txt,r.t2.m,"lv2",r.p2Txt)}
        ${bar(r.fin.final||!/파기|환송/.test(r.fin.txt||"")?"확정":"대법원",r.fin.txt,r.fin.m,"final")}
      </div>
      ${badges.length?`<div class="chart-badges">${badges.join("")}</div>`:""}
    </article>`;
  }).join("");
  return headerHTML+`<div class="charts">${cards}</div>`;
}

// ===== 재판부 탭 =====
function renderJudges(cases){
  const panels=buildPanels(cases);
  let list=panels;
  if(state.judgeCat&&state.judgeCat!=="all")list=list.filter(p=>p.group===state.judgeCat);
  if(state.q)list=list.filter(p=>textMatches(panelHay(p),state.q))

  // 법원 분류 칩: [전체] [대법원] [서울고법] [서울중앙지법] [그 외 법원]
  const groups=[...new Set(panels.map(p=>p.group))];
  const fixed=["대법원","서울고법","서울중앙지법"].filter(g=>groups.includes(g));
  const chipOrder=["all",...fixed,...groups.filter(g=>!fixed.includes(g))];
  const counts={};panels.forEach(p=>counts[p.group]=(counts[p.group]||0)+1);
  const chips=chipOrder.map(g=>{
    const label=g==="all"?"전체":esc(g);
    const n=g==="all"?panels.length:counts[g]||0;
    return `<button type="button" class="cat-btn" data-jcat="${esc(g)}" aria-pressed="${state.judgeCat===g}">${label} <span class="mono">${n}</span></button>`;
  }).join("");
  const headerHTML=`<div class="dict-nav"><div class="cat-chips">${chips}</div><div class="dict-stats">재판부 총 ${panels.length}곳 중 ${list.length}곳 표시</div></div>`;
  if(!list.length)return headerHTML+empty();

  const cards=list.map(p=>{
    const roleOf=n=>p.roles[n]||"";
    const membersHTML=p.members.length
      ?p.members.map(m=>`${roleOf(m.name)?`<strong>${esc(roleOf(m.name))}</strong>`:""}${esc(m.name)} ${esc(shortPos(m.position))}`).join(" · ")
      :(p.rulings.map(r=>r.judgeNote).filter(Boolean)[0]||`<span class="m-none">판사 정보 미확인</span>`);
    const stats=[`담당 판결 ${p.stats.total}건`];
    if(p.stats.finals)stats.push(`선고 ${p.stats.finals}건`);
    if(p.stats.prison)stats.push(`실형 등 ${p.stats.prison}명`);
    if(p.stats.probation)stats.push(`집행유예 ${p.stats.probation}명`);
    if(p.stats.acq)stats.push(`<span class="acq">무죄 ${p.stats.acq}건</span>`);
    const badges=[];
    if(p.stats.heavy)badges.push(`<span class="badge-outcome aggravated" title="1심보다 2심에서 형량이 늘어난 판결 — 엄벌 성향">▲ 가중 ${p.stats.heavy}건</span>`);
    if(p.stats.light)badges.push(`<span class="badge-outcome mitigated" title="1심보다 2심에서 형량이 줄어든 판결">▼ 감형 ${p.stats.light}건</span>`);
    if(p.stats.acq)badges.push(`<span class="badge-outcome acquitted" title="전원 무죄 선고 포함 — 엄격 증명">⚖ 무죄 ${p.stats.acq}건</span>`);
    const caseHTML=p.rulings.map(r=>{
      const pend=r.kind==="pending";
      const t = todayStr();
      const isFuture = r.date && r.date > t;
      const isToday = r.date && r.date === t;
      const isUpcoming = isFuture || (isToday && String(r.result||"").includes("예정"));
      const k = isUpcoming ? "sched" : (r.level===3?"final":r.level===2?"app":"trial");
      const pill = pend ? `<span class="pill st-sched">${LV[r.level]} · ${isUpcoming ? "예정" : "진행 중"}</span>` : `<span class="pill st-${k}">${LV[r.level]}</span>`;
      return `<div class="judge-case">
        <div class="ct">${pill}<a href="#case-${esc(r.caseId)}" onclick="goToCase('${esc(r.caseId)}');return false;" title="사건별 뷰에서 해당 사건 열기">${esc(r.caseTitle)}</a>${r.date?`<span class="d">${fmt(r.date)}</span>`:""}</div>
        <div class="r">${resultHTML(r)}${r.requested&&!r.sentences.length?` <span class="m">(구형 ${esc(r.requested)})</span>`:""}</div>
        ${r.sentences.length>1?sentList(r):""}
        ${r.summary?`<div class="m">${esc(r.summary)}</div>`:""}
        ${r.judgeNote?`<div class="m">${esc(r.judgeNote)}</div>`:""}
        ${r.caseNo?`<div class="m mono">${esc(r.caseNo)}</div>`:""}
      </div>`;
    }).join("");
    return `<article class="person judge-card" id="${panelIdOf(p.court)}">
      <div class="judge-header">
        <h3>${esc(p.court)} <span class="pill ${courtBadgeCls(p.badge)}">${esc(p.badge)}</span></h3>
        <div class="judge-members">${membersHTML}</div>
      </div>
      <div class="judge-stats"><span>${stats.join(" · ")}</span>${badges.length?badges.join(""):""}</div>
      ${justiceProfilesHTML(p)}
      <div class="judge-cases">${caseHTML}</div>
    </article>`;
  }).join("");
  return headerHTML+`<div class="judges">${cards}</div>`;
}

// 타임라인·사건별 뷰의 재판부 텍스트 클릭 → [재판부] 탭의 해당 카드로 이동·하이라이트
function goToPanel(court){
  state.view="judges";
  state.judgeCat="all";
  state.q="";document.getElementById("q").value="";
  try{localStorage.setItem("ins-view","judges")}catch(e){}
  replaceHash();
  render();
  focusCard(panelIdOf(court));
}

// ===== 데이터 로딩 =====
// 온라인 배포본(public/index.html)은 데이터셋 JSON 을 fetch 로만 읽고 내장 사본을 두지 않는다.
// 오프라인 사본(public/insurrection-trials-offline.html)만 scripts/build-offline.py 가 이 객체에
// EMBEDDED.dec03·kim·chae 를 내장해 만든다. 그래서 여기에는 빈 훅만 두고, 있으면 먼저 쓴다.
const EMBEDDED={};

// ===== 링크 복사(공유) =====
let toastTimer=null;
function showToast(msg){
  let t=document.getElementById("toast");
  if(!t&&document.createElement&&document.body){t=document.createElement("div");t.id="toast";t.setAttribute("role","status");document.body.appendChild(t)}
  if(!t)return;
  t.textContent=msg;t.classList.add("show");
  if(toastTimer)clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{t.classList.remove("show")},1500);
}
function copyText(text){
  trackEvent('share_link_copy',{url:text});
  const ok=()=>showToast("복사됐어요! 링크를 공유하세요");
  try{
    if(typeof navigator!=="undefined"&&navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(ok,()=>legacyCopy(text,ok));return}
  }catch(e){}
  legacyCopy(text,ok);
}
// HTTPS 제한 환경 폴백: 숨은 textarea + execCommand
function legacyCopy(text,ok){
  try{
    const ta=document.createElement("textarea");
    ta.value=text;ta.setAttribute("readonly","");ta.style.position="fixed";ta.style.opacity="0";
    document.body.appendChild(ta);ta.select();document.execCommand("copy");document.body.removeChild(ta);
  }catch(e){}
  ok();
}
function baseURL(){
  try{return (location.origin||"")+(location.pathname||"")}catch(e){return ""}
}
function deepLinkURL(type,id){
  const seg=type==="person"?"person/"+id:type==="case"?"case/"+id:"panel/"+id;
  return baseURL()+"#"+state.dataset+"/"+seg;
}
function copyPageLink(){
  let url="";try{url=location.href||baseURL()}catch(e){url=baseURL()}
  copyText(url||baseURL()+currentHash());
}
function copyDeepLink(type,id){copyText(deepLinkURL(type,id))}

// 오프라인 사본은 이 값을 scripts/build-offline.py 가 true 로 바꿔 끼운다. 그러면 fetch 를 시도하지 않고
// 내장 데이터만 쓴다(file:// 로 열어도 콘솔에 네트워크 오류가 남지 않는다).
let OFFLINE_ONLY=false;
const REMOTE={loading:false,error:null,req:0};   // 온라인 fetch 상태
const afterLoad=[];                               // 데이터가 도착하면 실행할 콜백(딥링크 등)

function dataReady(){return loaded.size>=COLLS.length}
function clearStore(){COLLS.forEach(n=>{delete store[n]});loaded.clear()}
// 오프라인 사본이 들고 있는 내장 데이터를 주입한다. 내장이 없으면(온라인) false.
function applyEmbedded(ds){
  const d=EMBEDDED[ds];
  if(!d)return false;
  Object.assign(store,d);COLLS.forEach(n=>loaded.add(n));return true;
}
// 데이터가 준비되면 바로, 아니면 fetch 가 끝난 뒤에 실행한다(딥링크·사건 카드 이동).
function whenDataReady(fn){if(dataReady()){fn();return}afterLoad.push(fn)}
function runAfterLoad(){while(afterLoad.length){const fn=afterLoad.shift();try{fn()}catch(e){}}}
// 데이터를 못 받았을 때의 안내 배너. 내장 데이터가 있으면(오프라인 사본) 띄우지 않는다.
function setLoadError(msg){
  const el=document.getElementById("load-error");
  if(!el)return;
  if(msg){el.innerHTML=`<span>${esc(msg)}</span><button type="button" class="lk-btn" data-retry-load>다시 불러오기</button>`;el.hidden=false}
  else{el.hidden=true;el.textContent=""}
}
function applyDataset(ds,reset,skipURL){
  const prevDs=state.dataset;
  state.dataset=ds;
  // 기록부를 바꾸면 이전 기록부 데이터를 버린다. 내장 사본(오프라인)이 있으면 즉시 채워 첫 화면을 그린다.
  clearStore();
  afterLoad.length=0;
  if(ds!=="impeachment")applyEmbedded(ds);
  const conf=DATASETS[ds]||{};
  REMOTE.error=null;REMOTE.loading=!!conf.file&&!dataReady();
  setLoadError(null);
  if(reset){state.status=null;state.q="";document.getElementById("q").value="";state.personCat="all";state.judgeCat="all";state.outcomeFilter=null;state.tlSched=false;graphState.hiddenCats.clear();hideGraphCard();IMP.status=null;IMP.party="all";IMP.group=null}
  try{localStorage.setItem("trials-dataset",ds)}catch(e){}
  if(!skipURL)replaceHash();
  if(prevDs!==ds)trackEvent('dataset_change',{dataset:ds});
}
function fetchRemote(ds){
  if(OFFLINE_ONLY)return;   // 오프라인 사본: 내장 데이터로 이미 그렸다
  const conf=DATASETS[ds];
  if(!conf||!conf.file){REMOTE.loading=false;return}
  const req=++REMOTE.req;
  REMOTE.loading=true;REMOTE.error=null;setLoadError(null);
  fetch(conf.file)
    .then(res=>{if(!res.ok)throw new Error("HTTP "+res.status);return res.json()})
    .then(data=>{
      // 응답을 기다리는 사이 다른 기록부로 넘어갔으면 이 응답은 버린다.
      if(req!==REMOTE.req||ds!==state.dataset)return;
      clearStore();Object.assign(store,data||{});COLLS.forEach(n=>loaded.add(n));
      REMOTE.loading=false;REMOTE.error=null;setLoadError(null);
      render();runAfterLoad();
    })
    .catch(()=>{
      if(req!==REMOTE.req||ds!==state.dataset)return;
      REMOTE.loading=false;
      // 오프라인 사본은 내장 데이터로 이미 화면이 떠 있으므로 조용히 넘어간다.
      if(dataReady()){render();runAfterLoad();return}
      REMOTE.error="재판 기록을 불러오지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.";
      setLoadError(REMOTE.error);render();
    });
}
document.querySelectorAll(".switcher button").forEach(b=>b.onclick=()=>{const ds=b.dataset.ds;if(ds===state.dataset)return;applyDataset(ds,true);render();fetchRemote(ds)});

/* ===== 22대 국회 탄핵 표결 뷰 ===== */
// 300석 명부 + 2024.12.7(1차)·12.14(2차) 표결 기록. 데이터는 impeachment-assembly-data.json.
const IMP_PARTY_ORDER = ["더불어민주당", "국민의힘", "조국혁신당", "개혁신당", "진보당", "기본소득당", "사회민주당", "무소속"];
const IMP_PARTY_COLOR = {"더불어민주당": "#1D5BBF", "국민의힘": "#DE4B4B", "조국혁신당": "#3A4378", "개혁신당": "#E8862E", "진보당": "#B43A6A", "기본소득당": "#12A5A0", "사회민주당": "#7A5AA6", "무소속": "#8A8F98"};
const IMP = {data: null, loading: false, error: null, mode: "second", status: null, party: "all", layout: "cards", group: null, now: null, tracked: null};
const IMP_STANCE = {support: {label: "공개 찬성", cls: "b-yes"}, oppose: {label: "공개 반대", cls: "b-no"}, undisclosed: {label: "입장 비공개", cls: "b-mid"}, none: {label: "원외", cls: "b-none"}};
const IMP_STANCE_SHORT = {support: "찬성", oppose: "반대", undisclosed: "비공개", none: "원외"};
const IMP_V1 = {"참석": {label: "참석", cls: "b-yes"}, "불참": {label: "불참·퇴장", cls: "b-no"}, "미재임": {label: "미재임", cls: "b-none"}};
const IMP_V1_SHORT = {"참석": "참석", "불참": "퇴장", "미재임": "미재임"};
// 12.4 비상계엄해제요구 결의안은 명패 전자투표여서 의원별 찬반이 회의록에 이름으로 남아 있다. (vote0)
const IMP_V0 = {"참석": {label: "계엄해제 찬성", cls: "b-yes"}, "불참": {label: "불참", cls: "b-no"}, "미재임": {label: "미재임", cls: "b-none"}};
const IMP_V0_SHORT = {"참석": "찬성", "불참": "불참", "미재임": "미재임"};

function impKey(m) { return IMP.mode === "first" ? m.vote1 : IMP.mode === "preliminary" ? m.vote0 : m.stance2; }
function impKeyMeta(k) { return IMP.mode === "first" ? (IMP_V1[k] || IMP_V1["미재임"]) : IMP.mode === "preliminary" ? (IMP_V0[k] || IMP_V0["미재임"]) : (IMP_STANCE[k] || IMP_STANCE.undisclosed); }
// 인사이트 카드의 명단 묶음(meta.analysis.groups)을 현재 선택으로 읽는다.
function impGroupSet() {
  const groups = (IMP.data && IMP.data.meta.analysis && IMP.data.meta.analysis.groups) || [];
  const hit = groups.filter(g => g.id === IMP.group)[0];
  return hit ? new Set(hit.memberIds) : null;
}
// 2026년 현재 근황(meta.current): 요약 카드와 필터 묶음
function impNow() { return (IMP.data && IMP.data.meta.current) || null; }
function impNowGroups() { const n = impNow(); return (n && n.groups) || []; }
function impNowSet() {
  const hit = impNowGroups().filter(g => g.id === IMP.now)[0];
  return hit ? new Set(hit.memberIds) : null;
}
function impNowBadge(m) {
  if (!m.currentStatusBadge) return "";
  const kind = m.currentBadgeKind || "note";
  return `<span class="imp-now-badge k-${esc(kind)}" title="2026년 현재 · ${esc(m.currentTitle || "")}">${esc(m.currentStatusBadge)}</span>`;
}
function impTime(v) { return String(v || "").replace(/-/g, ".").replace(/^(\d{4})\.(\d{2})\.(\d{2})$/, "$1.$2.$3"); }
function impNum(n) { return Number(n || 0).toLocaleString("ko-KR"); }
function impColor(p) { return IMP_PARTY_COLOR[p] || "#8A8F98"; }

function impLoad() {
  if (IMP.data || IMP.loading) return;
  // 오프라인 사본은 탄핵 데이터를 IMP_EMBEDDED 로 들고 있다. 여기서 바로 render() 를 부르면
  // 호출부(render → renderImpeachment)가 돌려주는 '불러오는 중' 문구가 덮어쓰므로 다음 틱에 그린다.
  if (typeof IMP_EMBEDDED !== "undefined" && IMP_EMBEDDED) { IMP.data = IMP_EMBEDDED; IMP.loading = false; setTimeout(render, 0); return; }
  IMP.loading = true;
  fetch("impeachment-assembly-data.json")
    .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
    .then(d => { IMP.data = d; IMP.loading = false; render(); })
    .catch(() => { IMP.loading = false; IMP.error = "탄핵 표결 데이터를 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요."; render(); });
}

function impVoteCard(which) {
  const v = IMP.data.meta.votes[which];
  const on = IMP.mode === which ? " on" : "";
  const attrs = `class="imp-vote-card${on}" type="button" data-imp-mode="${which}" aria-pressed="${IMP.mode === which}"`;
  if (which === "preliminary") {
    const yes = v.yes / 300 * 100, absent = (300 - v.present) / 300 * 100;
    return `<button ${attrs}>
      <span class="imp-vote-h"><span>계엄해제 표결 <span class="imp-date">${impTime(v.date)}</span></span><span class="imp-tag imp-tag-pass">${esc(v.result)}</span></span>
      <span class="imp-nums">
        <span class="imp-num"><b>${impNum(v.yes)}</b><span>찬성</span></span>
        <span class="imp-num"><b>${impNum(v.breakdown.peoplePower)}</b><span>국민의힘 참석</span></span>
        <span class="imp-num"><b>${impNum(300 - v.present)}</b><span>불참</span></span>
      </span>
      <span class="imp-bar" aria-hidden="true">
        <i style="width:${yes.toFixed(1)}%;background:#1D5BBF"></i>
        <i style="width:${absent.toFixed(1)}%;background:#C3CAD3"></i>
      </span>
      <span class="imp-vote-n">${esc(v.resultNote)}</span>
    </button>`;
  }
  if (which === "first") {
    const fail = Math.max(0, v.quorum - v.present);
    return `<button ${attrs}>
      <span class="imp-vote-h"><span>1차 표결 <span class="imp-date">${impTime(v.date)}</span></span><span class="imp-tag imp-tag-fail">${esc(v.result)}</span></span>
      <span class="imp-nums">
        <span class="imp-num"><b>${impNum(v.present)}</b><span>참석</span></span>
        <span class="imp-num"><b>${impNum(v.absent)}</b><span>불참·퇴장</span></span>
        <span class="imp-num"><b>${impNum(v.quorum)}</b><span>의결정족수</span></span>
        <span class="imp-num"><b>−${fail}</b><span>정족수 대비</span></span>
      </span>
      <span class="imp-bar" aria-hidden="true">
        <i style="width:${(v.present / 300 * 100).toFixed(1)}%;background:#1D5BBF"></i>
        <i style="width:${(v.absent / 300 * 100).toFixed(1)}%;background:#C3CAD3"></i>
        <u style="left:${(v.quorum / 300 * 100).toFixed(1)}%"></u>
      </span>
      <span class="imp-vote-n">${esc(v.resultNote)}</span>
    </button>`;
  }
  const yes = v.yes / 300 * 100, no = v.no / 300 * 100, ab = v.abstain / 300 * 100, iv = v.invalid / 300 * 100;
  return `<button ${attrs}>
    <span class="imp-vote-h"><span>2차 표결 <span class="imp-date">${impTime(v.date)}</span></span><span class="imp-tag imp-tag-pass">${esc(v.result)}</span></span>
    <span class="imp-nums">
      <span class="imp-num"><b>${impNum(v.yes)}</b><span>찬성</span></span>
      <span class="imp-num"><b>${impNum(v.no)}</b><span>반대</span></span>
      <span class="imp-num"><b>${impNum(v.abstain)}</b><span>기권</span></span>
      <span class="imp-num"><b>${impNum(v.invalid)}</b><span>무효</span></span>
    </span>
    <span class="imp-bar" aria-hidden="true">
      <i style="width:${yes.toFixed(1)}%;background:#1D5BBF"></i>
      <i style="width:${no.toFixed(1)}%;background:#DE4B4B"></i>
      <i style="width:${ab.toFixed(1)}%;background:#7A5AA6"></i>
      <i style="width:${iv.toFixed(1)}%;background:#C3CAD3"></i>
      <u style="left:${(v.quorum / 300 * 100).toFixed(1)}%"></u>
    </span>
    <span class="imp-vote-n">${esc(v.resultNote)}</span>
  </button>`;
}

function impLegendHTML() {
  const grad = "background:linear-gradient(90deg,#1D5BBF 0 33%,#3A4378 33% 55%,#DE4B4B 55% 78%,#7A5AA6 78% 100%)";
  const items = IMP.mode === "second"
    ? [[grad, "찬성(정당 색)"], ["background:#1D5BBF;opacity:.3", "입장 비공개"], ["background:#DE4B4B;border:2px solid #1A1A1A", "공개 반대"]]
    : [[grad, IMP.mode === "preliminary" ? "찬성(정당 색)" : "참석(정당 색)"], ["background:#1D5BBF;opacity:.3", IMP.mode === "preliminary" ? "불참" : "불참·퇴장"], ["background:#FFFFFF;border:1px dashed #9AA2AC", "미재임"]];
  return items.map(([style, label]) => `<span class="imp-lg"><i style="${style}"></i>${label}</span>`).join("");
}

// 반원 좌석 배치: 안쪽부터 8줄, 줄마다 좌석 수를 반지름에 비례해 나눈다.
function impHemicycle(n, rows) {
  const r0 = 84, dr = 27;
  const radii = [];
  for (let i = 0; i < rows; i++) radii.push(r0 + i * dr);
  const counts = radii.map(r => Math.max(1, Math.round((Math.PI * r) / 15)));
  let diff = n - counts.reduce((a, b) => a + b, 0);
  let guard = 0;
  while (diff !== 0 && guard++ < 500) {
    let idx = 0;
    if (diff > 0) { counts.forEach((c, i) => { if (c < counts[idx]) idx = i; }); counts[idx]++; diff--; }
    else { counts.forEach((c, i) => { if (c > counts[idx]) idx = i; }); counts[idx]--; diff++; }
  }
  // 좌석을 각도 순으로 늘어놓고 정당 순서대로 채워, 정당이 왼쪽부터 세로 띠로 보이게 한다.
  const pts = [];
  counts.forEach((k, ri) => {
    const r = radii[ri], step = Math.PI / k;
    for (let j = 0; j < k; j++) {
      const a = step * (j + 0.5);
      pts.push({x: 283 + r * Math.cos(a), y: 285 - r * Math.sin(a), a});
    }
  });
  pts.sort((p, q) => q.a - p.a);
  return pts;
}

function impSeatsHTML(list) {
  const ids = {};
  list.forEach(m => { ids[m.id] = 1; });
  const present = IMP.data.members.filter(m => IMP.mode === "first" ? m.vote1 !== "미재임" : IMP.mode === "preliminary" ? m.vote0 !== "미재임" : m.stance2 !== "none");
  const ordered = [];
  IMP_PARTY_ORDER.forEach(p => present.filter(m => m.party === p).forEach(m => ordered.push(m)));
  const pts = impHemicycle(ordered.length, 8);
  const circles = ordered.map((m, i) => {
    const p = pts[i] || {x: 0, y: 0};
    const st = impKey(m);
    const dim = ids[m.id] ? 1 : 0.12;
    // 좌석 색은 소속 정당. 표결 상태는 진하기(미공개·불참은 옅게)와 테두리(공개 반대)로 표시한다.
    const fill = impColor(m.party);
    let op = 1, stroke = "none", sw = 0;
    if (IMP.mode !== "second") {
      if (st === "불참") op = 0.3;
      if (st === "미재임") { op = 0.15; stroke = "var(--muted)"; sw = 1; }
    } else {
      if (st === "undisclosed") op = 0.3;
      if (st === "oppose") { stroke = "#1A1A1A"; sw = 2; }
    }
    const title = m.name + " · " + m.party + " · " + m.constituency + " · " + impKeyMeta(st).label;
    return `<circle class="imp-seat" data-imp-id="${esc(m.id)}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="6.2" fill="${fill}" fill-opacity="${op * dim}" stroke="${stroke}" stroke-width="${sw}"><title>${esc(title)}</title></circle>`;
  }).join("");
  const partyLegend = IMP_PARTY_ORDER.map(p => {
    const n = present.filter(m => m.party === p).length;
    if (!n) return "";
    return `<span class="imp-lg"><i style="background:${impColor(p)}"></i>${p} <b>${n}</b></span>`;
  }).join("");
  return `<div class="imp-seatwrap">
    <svg viewBox="0 0 566 300" role="img" aria-label="22대 국회 좌석 배치와 표결 상태">${circles}</svg>
    <div class="imp-lg-row">${partyLegend}</div>
    <div class="imp-lg-row">${impLegendHTML()}</div>
    <p class="imp-hint">좌석을 누르면 의원별 기록을 볼 수 있습니다. 정당별로 왼쪽부터 배열했습니다.</p>
  </div>`;
}

function impCardHTML(m) {
  const s0 = IMP_V0[m.vote0] || IMP_V0["불참"];
  const s1 = IMP_V1[m.vote1] || IMP_V1["참석"];
  const s2 = IMP_STANCE[m.stance2] || IMP_STANCE.undisclosed;
  const swing = m.vote0 === "참석" && m.stance2 === "oppose";
  // 당적이 바뀐 의원은 카드에서도 "2024 정당 → 2026 정당"으로 보여준다(카드 폭에 맞춰 줄임).
  const partyCell = m.currentPartyShort && m.currentPartyShort !== m.party
    ? `<span title="2024년 표결 당시 ${esc(m.party)} · 2026년 현재 ${esc(m.currentParty || m.currentPartyShort)}" style="color:${impColor(m.currentPartyShort)}">● ${esc(m.party)} → ${esc(m.currentPartyShort)}</span>`
    : `<span style="color:${impColor(m.party)}">● ${esc(m.party)}</span>`;
  return `<article class="imp-card" data-imp-id="${esc(m.id)}" tabindex="0" role="button" aria-label="${esc(m.name)} 상세 보기">
    <div class="imp-card-h">
      <span class="imp-ava" style="background:${impColor(m.currentPartyShort || m.party)}">${esc((m.name || "?").slice(0, 1))}${m.photo ? `<img class="imp-ava-img" src="${esc(m.photo)}" alt="${esc(m.name)}" width="34" height="34" loading="lazy" decoding="async" onerror="this.remove()">` : ""}</span>
      <div class="imp-card-n"><strong>${esc(m.name)}</strong><small>${esc(m.constituency)}</small></div>
    </div>
    <div class="imp-card-m">${partyCell}<span>${esc(m.term || "")}${m.role ? " · " + esc(m.role) : ""}</span></div>
    <div class="imp-badges">
      ${impNowBadge(m)}
      <span class="imp-badge ${s0.cls}${IMP.mode === "preliminary" ? " on" : ""}" title="2024.12.4 비상계엄해제 요구안 · ${esc(s0.label)}">12.4 ${esc(IMP_V0_SHORT[m.vote0] || "불참")}</span>
      <span class="imp-badge ${s1.cls}${IMP.mode === "first" ? " on" : ""}" title="2024.12.7 1차 탄핵 표결 · ${esc(s1.label)}">12.7 ${esc(IMP_V1_SHORT[m.vote1] || "참석")}</span>
      <span class="imp-badge ${s2.cls}${IMP.mode === "second" ? " on" : ""}" title="2024.12.14 2차 탄핵 표결 · ${esc(s2.label)}">12.14 ${esc(IMP_STANCE_SHORT[m.stance2] || "비공개")}</span>
      ${swing ? `<span class="imp-sw">계엄해제 찬성→탄핵 반대</span>` : ""}
    </div>
  </article>`;
}

// 반대 85표·1차 불참 105명을 설명하는 인사이트 카드. 숫자와 명단 묶음(그룹)은 meta.analysis에서 온다.
function impInsightHTML() {
  const a = (IMP.data && IMP.data.meta.analysis) || null;
  if (!a) return "";
  const chips = (a.groups || []).map(g => {
    const on = IMP.group === g.id;
    return `<button type="button" class="imp-chip${on ? " on" : ""}" data-imp-group="${esc(g.id)}" aria-pressed="${on}" title="${esc(g.desc)}">${esc(g.label)}</button>`;
  }).join("");
  const stats = (a.points || []).map(p => `<div class="imp-stat"><i>${esc(p.label)}</i><b>${esc(p.value)}</b><p>${esc(p.detail)}</p></div>`).join("");
  const readings = (a.readings || []).map(r => `<li>${esc(r.text)} <b>— ${esc((r.source || []).join(" · "))}</b></li>`).join("");
  return `<section class="imp-insight">
    <div class="imp-insight-h"><span>${esc(a.title)}</span><span class="imp-vtag">무기명 비밀투표 · 일부는 추정</span></div>
    <p class="imp-insight-sum">${esc(a.summary)}</p>
    <div class="imp-stats">${stats}</div>
    <div class="imp-groups"><span class="imp-lab">명단 묶어 보기</span>${chips}${IMP.group ? `<button type="button" class="imp-chip" data-imp-group="">해제</button>` : ""}</div>
    <details class="imp-readings"><summary>당시 보도로 본 반대 85표 해설</summary><ul>${readings}</ul></details>
  </section>`;
}

// 2026년 현재 근황 카드: 2년 사이 무엇이 바뀌었는지 숫자와 배경으로 먼저 보여준다.
// 의원별 문구는 members[].currentNote, 집계와 묶음은 meta.current 에서 온다.
function impNowHTML() {
  const n = impNow();
  if (!n) return "";
  const stats = (n.stats || []).map(s => `<div class="imp-stat"><i>${esc(s.label)}</i><b>${esc(s.value)}</b><p>${esc(s.detail)}</p></div>`).join("");
  const ctx = (n.context || []).map(t => `<li>${esc(t)}</li>`).join("");
  return `<section class="imp-now">
    <div class="imp-now-h"><span>🏛️ ${esc(n.title || "2026년 현재 근황")}</span><span class="imp-vtag">${esc(impTime(n.asOf))} 기준</span></div>
    <p>${esc(n.summary || "")}</p>
    <div class="imp-stats">${stats}</div>
    ${ctx ? `<details class="imp-readings"><summary>2024.12 이후 무슨 일이 있었나</summary><ul>${ctx}</ul></details>` : ""}
  </section>`;
}

// 출처 라벨을 매체명 단위로 묶어 중복 없이 링크한다.
function impSourceLinks(sources) {
  const seen = {}, out = [];
  (sources || []).forEach(([label, url]) => {
    const name = String(label).split(" — ")[0];
    if (seen[name]) return;
    seen[name] = 1;
    out.push(`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(name)}</a>`);
  });
  return out.join(" · ");
}

function renderImpeachment() {
  if (!IMP.data) {
    impLoad();
    return `<div class="empty-state">${IMP.error ? esc(IMP.error) : "22대 국회의원 300석 명부를 불러오는 중입니다."}</div>`;
  }
  const meta = IMP.data.meta, ms = IMP.data.members;
  if (IMP.tracked !== IMP.mode) { IMP.tracked = IMP.mode; trackEvent("view_impeachment", {tab: IMP.mode, layout: IMP.layout}); }
  if (IMP.party !== "all" && IMP_PARTY_ORDER.indexOf(IMP.party) < 0) IMP.party = "all";
  const pool = ms.filter(m => IMP.party === "all" || m.party === IMP.party);
  const counts = {all: pool.length};
  pool.forEach(m => { const k = impKey(m); counts[k] = (counts[k] || 0) + 1; });
  const keys = IMP.mode === "second" ? ["support", "oppose", "undisclosed", "none"] : ["참석", "불참", "미재임"];
  const gset = impGroupSet();
  const nset = impNowSet();
  const list = pool.filter(m => impMatch(m, state.q) && (!IMP.status || impKey(m) === IMP.status) && (!gset || gset.has(m.id)) && (!nset || nset.has(m.id)));

  const chips = [`<button type="button" class="imp-chip${!IMP.status ? " on" : ""}" data-imp-status="" aria-pressed="${!IMP.status}">전체 <b>${impNum(counts.all)}</b></button>`]
    .concat(keys.map(k => {
      const info = impKeyMeta(k);
      const n = counts[k] || 0;
      return `<button type="button" class="imp-chip ${info.cls}${IMP.status === k ? " on" : ""}" data-imp-status="${esc(k)}" aria-pressed="${IMP.status === k}">${info.label} <b>${impNum(n)}</b></button>`;
    })).join("");

  const partyChips = [`<button type="button" class="imp-chip${IMP.party === "all" ? " on" : ""}" data-imp-party="all" aria-pressed="${IMP.party === "all"}">전체 정당 <b>${impNum(ms.length)}</b></button>`]
    .concat(IMP_PARTY_ORDER.filter(p => ms.some(m => m.party === p)).map(p => {
      const n = ms.filter(m => m.party === p).length;
      return `<button type="button" class="imp-chip${IMP.party === p ? " on" : ""}" data-imp-party="${esc(p)}" aria-pressed="${IMP.party === p}"><i class="imp-dot" style="background:${impColor(p)}"></i>${esc(p)} <b>${impNum(n)}</b></button>`;
    })).join("");

  const nowGroups = impNowGroups();
  const nowChips = nowGroups.length ? [`<button type="button" class="imp-chip${!IMP.now ? " on" : ""}" data-imp-now="" aria-pressed="${!IMP.now}">전체 2026</button>`]
    .concat(nowGroups.map(g => {
      const on = IMP.now === g.id;
      return `<button type="button" class="imp-chip${on ? " on" : ""}" data-imp-now="${esc(g.id)}" aria-pressed="${on}" title="${esc(g.desc || "")}">${esc(g.label)} <b>${g.memberIds.length}</b></button>`;
    })).join("") : "";

  const body = IMP.layout === "seats" ? impSeatsHTML(list)
    : (list.length ? `<div class="imp-grid">${list.map(impCardHTML).join("")}</div>` : `<div class="empty-state"><p>조건에 맞는 의원이 없습니다.</p><button type="button" class="lk-btn" data-imp-reset>필터 초기화</button></div>`);

  return `<div class="imp-wrap">
    <div class="imp-votes">${impVoteCard("preliminary")}${impVoteCard("first")}${impVoteCard("second")}</div>
    ${impInsightHTML()}
    ${impNowHTML()}
    <p class="imp-note">${esc(meta.rosterNote)} 2차 표결은 무기명 비밀투표여서 개인별 표 내용은 공식 기록이 없고, 공개적으로 밝힌 입장만 표시했습니다.</p>
    <div class="imp-controls">
      ${nowChips ? `<div class="imp-row"><span class="imp-lab">2026</span><div class="imp-chips">${nowChips}</div></div>` : ""}
      <div class="imp-row"><span class="imp-lab">표결</span><div class="imp-chips">${chips}</div></div>
      <div class="imp-row"><span class="imp-lab">당시 정당</span><div class="imp-chips">${partyChips}</div></div>
      <div class="imp-row imp-row-end">
        <span class="imp-count">${impNum(list.length)}명 표시</span>
        <div class="imp-layout">
          <button type="button" class="imp-chip${IMP.layout === "cards" ? " on" : ""}" data-imp-layout="cards" aria-pressed="${IMP.layout === "cards"}">카드</button>
          <button type="button" class="imp-chip${IMP.layout === "seats" ? " on" : ""}" data-imp-layout="seats" aria-pressed="${IMP.layout === "seats"}">좌석</button>
        </div>
      </div>
    </div>
    ${body}
    <p class="imp-src">자료: ${impSourceLinks(meta.sources)} (${meta.sources.length}건). ${esc(meta.basis)}.</p>
  </div>`;
}

function impBind(root) {
  const el = root || document.getElementById("view-impeachment");
  if (!el) return;
  el.querySelectorAll("[data-imp-mode]").forEach(b => { b.onclick = () => { IMP.mode = b.dataset.impMode; IMP.status = null; render(); }; });
  el.querySelectorAll("[data-imp-status]").forEach(b => { b.onclick = () => { IMP.status = b.dataset.impStatus || null; render(); }; });
  el.querySelectorAll("[data-imp-party]").forEach(b => { b.onclick = () => { IMP.party = b.dataset.impParty; render(); }; });
  el.querySelectorAll("[data-imp-group]").forEach(b => { b.onclick = () => { IMP.group = b.dataset.impGroup || null; render(); }; });
  el.querySelectorAll("[data-imp-now]").forEach(b => { b.onclick = () => { IMP.now = b.dataset.impNow || null; render(); }; });
  el.querySelectorAll("[data-imp-layout]").forEach(b => { b.onclick = () => { IMP.layout = b.dataset.impLayout; render(); }; });
  const reset = el.querySelector("[data-imp-reset]");
  if (reset) reset.onclick = () => { IMP.status = null; IMP.party = "all"; IMP.group = null; IMP.now = null; state.q = ""; const q = document.getElementById("q"); if (q) q.value = ""; render(); };
  el.querySelectorAll("[data-imp-id]").forEach(n => {
    n.onclick = () => impOpen(n.dataset.impId);
    n.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); impOpen(n.dataset.impId); } };
  });
}

function impOpen(id) {
  const m = (IMP.data && IMP.data.members || []).filter(x => x.id === id)[0];
  if (!m) return;
  const dlg = document.getElementById("person-dialog"), content = document.getElementById("modal-content");
  if (!dlg || !content) return;
  const s0 = IMP_V0[m.vote0] || IMP_V0["불참"], s1 = IMP_V1[m.vote1] || IMP_V1["참석"], s2 = IMP_STANCE[m.stance2] || IMP_STANCE.undisclosed;
  const basis0 = m.vote0 === "참석"
    ? (m.party === "국민의힘" ? "국민의힘에서 18명만 들어간 계엄해제 요구안 표결에 참석해 찬성표를 던졌습니다." : "계엄해제 요구안 표결에 참석해 찬성표를 던졌습니다(재석 190명 전원 찬성).")
    : m.vote0 === "미재임" ? "2024.12.13 승계로 12.4 표결 당시에는 의원이 아니었습니다."
    : (m.party === "국민의힘" ? "당 지도부의 집단 불참 방침에 따라 계엄해제 요구안 표결에 들어가지 않았습니다(국민의힘 90명 불참)." : "계엄해제 요구안 표결에 참석하지 않았습니다(불참 110명).");
  const basis1 = m.vote1 === "불참" ? "국민의힘 부결 당론에 따라 표결 전 본회의장에서 퇴장했습니다(105명)."
    : m.vote1 === "미재임" ? "2024.12.13 조국 의원직 상실에 따른 승계로 1차 표결(12.7) 당시에는 의원이 아니었습니다."
    : "본회의장에 남아 표결에 참여했습니다(195명).";
  const basis2 = m.stance2 === "oppose" ? (m.publicStance || "공개적으로 반대 입장을 밝혔습니다.") + " 무기명 비밀투표라 실제 표 내용은 공식 기록으로 확인되지 않습니다."
    : m.stance2 === "support" ? (m.publicStance ? m.publicStance + " " : "") + "2차 표결에 참석해 찬성했습니다(범야권 192명 전원 찬성 전제)."
    : m.stance2 === "undisclosed" ? "국민의힘 부결 당론에 따라 표결에는 참석했으나 개인 입장은 공개하지 않았습니다."
    : "2024.12.12 의원직 상실로 2차 표결(12.14)에는 참석하지 않았습니다.";
  // 발언 원문이 이미 위 설명문에 들어 있으면 인용구를 또 붙이지 않고 출처 줄만 남긴다.
  const cite = `<span class="imp-vtag">${esc(m.stanceKind || "발언")}</span>${esc(impTime(m.stanceDate))}${m.stanceSource ? ` · <a href="${esc(m.stanceSource[1])}" target="_blank" rel="noopener">${esc(String(m.stanceSource[0]).split(" — ")[0])}</a>` : ""}`;
  const dupQuote = m.stanceQuote && String(m.publicStance || "").indexOf(m.stanceQuote) >= 0;
  const quoteHTML = !m.stanceQuote ? "" : (dupQuote
    ? `<p class="imp-cite">${cite}</p>`
    : `<figure class="imp-quote"><blockquote>“${esc(m.stanceQuote)}”</blockquote><cite>${cite}</cite></figure>`);
  const publicRow = m.publicStance && m.stance2 !== "oppose" ? `<div class="imp-vrow"><div class="imp-vrow-h"><span>표결 전 공개 발언</span></div><p>${esc(m.publicStance)}</p></div>` : "";
  // 2024.12.14 이후부터 2026년 현재까지의 행적: 데이터에 currentNote 가 있는 의원만 보여준다.
  const nowAsOf = impTime((impNow() || {}).asOf || "");
  const nowHTML = m.currentNote ? `<section class="imp-now imp-mnow">
      <div class="imp-now-h"><span>🏛️ 2026년 현재 근황 및 행적</span><span class="imp-vtag">${esc(nowAsOf)} 기준</span></div>
      <div class="imp-now-meta">
        <span>현재 직책 <b>${esc(m.currentTitle || "국회의원")}</b></span>
        <span>현재 당적 <b>${esc(m.currentParty || m.party)}</b></span>
      </div>
      <p>${esc(m.currentNote)}</p>
    </section>` : "";
  content.innerHTML = `
    <div class="modal-header">
      <div class="modal-person">
        <span class="imp-ava lg" style="background:${impColor(m.currentPartyShort || m.party)}">${esc(m.name.slice(0, 1))}${m.photo ? `<img class="imp-ava-img" src="${esc(m.photo)}" alt="${esc(m.name)}" width="64" height="64" decoding="async" onerror="this.remove()">` : ""}</span>
        <div class="modal-person-text">
          <h2 id="modal-person-name">${esc(m.name)} <small style="font-size:15px;color:var(--muted);font-weight:400">${esc(m.constituency)}</small></h2>
          <div class="sub"><span class="cat-pill">${esc(m.party)}</span><span class="cat-pill">${esc(m.term || "")}${m.role ? " · " + esc(m.role) : ""}</span>${impNowBadge(m)}</div>
        </div>
      </div>
      <button type="button" class="modal-close" onclick="impClose()" aria-label="닫기">✕</button>
    </div>
    <div class="modal-body imp-modal">
      ${nowHTML}
      <div class="imp-vrow">
        <div class="imp-vrow-h"><span>계엄해제 표결 · 2024.12.4</span><span class="imp-badge ${s0.cls} on">${s0.label}</span></div>
        <p>${esc(basis0)}</p>
      </div>
      <div class="imp-vrow">
        <div class="imp-vrow-h"><span>1차 표결 · 2024.12.7</span><span class="imp-badge ${s1.cls} on">${s1.label}</span></div>
        <p>${esc(basis1)}</p>
      </div>
      <div class="imp-vrow">
        <div class="imp-vrow-h"><span>2차 표결 · 2024.12.14</span><span class="imp-badge ${s2.cls} on">${s2.label}</span></div>
        <p>${esc(basis2)}</p>
      </div>
      ${m.note ? `<p class="imp-mnote">${esc(m.note)}</p>` : ""}
      ${publicRow}
      ${quoteHTML}
      ${m.propNo ? `<p class="imp-mnote">비례대표 ${m.propNo}번</p>` : ""}
    </div>`;
  dlg.showModal();
  trackEvent("impeachment_member", {name: m.name, party: m.party, stance: m.stance2, vote1: m.vote1});
}
function impClose() {
  const dlg = document.getElementById("person-dialog");
  if (dlg && dlg.open) dlg.close();
}


applyDataset(state.dataset,false,!!(initRoute&&initRoute.targetType));
render();
fetchRemote(state.dataset);

// ===== 메타 타이틀 동기화 (OG·트위터 카드) =====
// 문서 타이틀과 og:title·twitter:title 메타태그를 함께 갱신한다. 딥링크 진입·인물 모달·사건 카드 이동 시 호출된다.
function updateMetaTitle(title){
  const t=String(title==null?"":title);
  document.title=t;
  try{
    const og=document.querySelector('meta[property="og:title"]');
    const tw=document.querySelector('meta[name="twitter:title"]');
    if(og)og.setAttribute("content",t);
    if(tw)tw.setAttribute("content",t);
  }catch(e){}
}
function syncCaseMetaTitle(caseId){
  const c=(store.cases||{})[caseId];
  if(c)updateMetaTitle(c.title+" — "+(DATASETS[state.dataset]||{}).title);
}

// ===== 데이터 내보내기 (CSV/JSON) =====
const EXPORT_CASE_COLS=["사건번호","사건명","카테고리","주요피고인","적용죄명","1심선고","2심선고","대법원선고","담당재판부","진행상태"];
const EXPORT_PEOPLE_COLS=["인물ID","이름","역할및직책","분류","주요사건","선고결과요약"];
// CSV 셀 이스케이프: 쉼표·줄바꿈·쌍따옴표가 있으면 통째로 감싸고 내부 쌍따옴표는 두 배로 늘린다.
function csvEscape(v){
  const str=String(v==null?"":v);
  return /[",\r\n]/.test(str)?'"'+str.replace(/"/g,'""')+'"':str;
}
// UTF-8 BOM(\uFEFF) 접두사로 Excel에서 한글이 바로 정상 표시되도록 한다.
function csvRows(rows){return "\uFEFF"+rows.map(r=>r.map(csvEscape).join(",")).join("\r\n")}
function rulingText(r){
  if(!r)return "";
  const d=fmt(r.date);
  const parts=[];
  if(d&&d!=="미정")parts.push(d);
  if(r.result)parts.push(r.result);
  return parts.join(" ");
}
function caseExportRecord(c){
  const byLevel=l=>c.rulings.find(r=>r.level===l);
  const uniq=a=>[...new Set(a.filter(Boolean))];
  return {
    "사건번호":uniq(c.rulings.map(r=>r.caseNo)).join(", "),
    "사건명":c.title,
    "카테고리":uniq(c.defendants.map(d=>d.category)).join(", "),
    "주요피고인":c.defendants.map(d=>d.name).filter(Boolean).join(", "),
    "적용죄명":c.charge||"",
    "1심선고":rulingText(byLevel(1)),
    "2심선고":rulingText(byLevel(2)),
    "대법원선고":rulingText(byLevel(3)),
    "담당재판부":uniq(c.rulings.map(r=>r.court)).join(", "),
    "진행상태":(STATUS[c.status]||{}).label||c.status||""
  };
}
function personExportRecord(id,p,cases){
  const rel=(cases||[]).filter(c=>c.defendantIds&&c.defendantIds.includes(id)).map(c=>c.title);
  return {
    "인물ID":id,
    "이름":(p&&p.name)||"",
    "역할및직책":(p&&p.role)||"",
    "분류":(p&&p.category)||"",
    "주요사건":rel.join(", "),
    "선고결과요약":(p&&p.statusNote)||""
  };
}
function exportPayload(kind){
  const {cases}=model();
  if(kind.indexOf("cases")===0){
    const records=cases.map(caseExportRecord);
    return kind.endsWith("csv")
      ? csvRows([EXPORT_CASE_COLS].concat(records.map(r=>EXPORT_CASE_COLS.map(k=>r[k]))))
      : JSON.stringify(records,null,2);
  }
  const records=Object.entries(store.people||{}).map(([id,p])=>personExportRecord(id,p,cases));
  return kind.endsWith("csv")
    ? csvRows([EXPORT_PEOPLE_COLS].concat(records.map(r=>EXPORT_PEOPLE_COLS.map(k=>r[k]))))
    : JSON.stringify(records,null,2);
}
function exportFileName(kind){
  const d=new Date();
  const pad=n=>String(n).padStart(2,"0");
  const stamp=d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
  const parts=kind.split("-");
  return state.dataset+"-"+parts[0]+"-"+stamp+"."+parts[1];
}
function downloadFile(name,content,mime){
  const blob=new Blob([content],{type:mime+";charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=name;a.style.display="none";
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{try{document.body.removeChild(a);URL.revokeObjectURL(url)}catch(e){}},0);
}
function runExport(kind){
  if(["cases-csv","cases-json","people-csv","people-json"].indexOf(kind)<0)return;
  const isCsv=kind.endsWith("csv");
  downloadFile(exportFileName(kind),exportPayload(kind),isCsv?"text/csv":"application/json");
  trackEvent('export_data',{format:kind,dataset:state.dataset});
  closeExportMenu();
}
// 드롭다운 개폐: 버튼 토글, 메뉴 밖 클릭 시 닫기, ESC 닫기(초점 복귀)
function closeExportMenu(){
  const btn=document.getElementById("export-btn"),menu=document.getElementById("export-menu");
  if(!btn||!menu)return;
  menu.hidden=true;
  btn.setAttribute("aria-expanded","false");
}
function toggleExportMenu(){
  const btn=document.getElementById("export-btn"),menu=document.getElementById("export-menu");
  if(!btn||!menu)return;
  const willOpen=menu.hidden;
  menu.hidden=!willOpen;
  btn.setAttribute("aria-expanded",String(willOpen));
}
(function initExportDropdown(){
  const btn=document.getElementById("export-btn"),menu=document.getElementById("export-menu"),dd=document.getElementById("export-dropdown");
  if(!btn||!menu||!dd)return;
  try{
    btn.addEventListener("click",e=>{if(e&&e.stopPropagation)e.stopPropagation();toggleExportMenu()});
    document.addEventListener("click",e=>{if(!menu.hidden&&!(e.target&&dd.contains(e.target)))closeExportMenu()});
    document.addEventListener("keydown",e=>{if((e.key==="Escape"||e.key==="Esc")&&!menu.hidden){closeExportMenu();btn.focus()}});
  }catch(e){}
})();

// 초기 진입 시 딥링크 처리: 인물 모달 자동 열기 / 사건·재판부 카드의 탭 전환·스크롤·하이라이트.
// 온라인은 데이터를 fetch 로 받으므로 도착한 뒤에 열고, 오프라인(내장 데이터)은 그 자리에서 연다.
function applyInitRoute(){
  if(!initRoute||!initRoute.targetType)return;
  const t=initRoute;initRoute=null;
  if(t.targetType==="person")whenDataReady(()=>openPersonModal(t.targetId,{fromHistory:true}));
  else followHashTarget(t);
}
applyInitRoute();