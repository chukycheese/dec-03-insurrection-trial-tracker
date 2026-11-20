# 12·3 내란 재판 기록부 (Dec 03 Insurrection Trial Tracker)

12·3 비상계엄 및 내란 관련 주요 사건의 재판 진행 상황과 선고 내역을 정리하고 시각화하는 프로젝트입니다.

- **웹사이트**: https://dec-03-insurrection-trial-tracker.inkstone.workers.dev/

## 파일 구성
- `public/index.html`: 상단 스위처로 네 기록부(12·3 내란 재판 · 윤석열 탄핵 표결 · 김건희·명태균 특검 · 채상병 특검)를 오가는 웹 인터페이스의 HTML 마크업. **온라인 배포본은 아래 `*.json` 을 `fetch` 로만 읽는다**(내장 사본 없음)
- `public/styles.css`: 페이지 전체 스타일. `index.html` 이 `<link>` 로 불러온다
- `public/core.js`: DOM·네트워크와 무관한 순수 로직(해시 라우팅, 날짜·'예정' 판정, 초성 검색, 형량 환산·심급 통계). 브라우저에서는 `app.js` 앞에 로드되고, Node 단위 테스트에서 `require` 로 그대로 쓴다
- `public/app.js`: 화면 렌더링·이벤트·데이터 로딩. `core.js` 다음에 로드된다
- `public/insurrection-trials-offline.html`: 위 세 파일을 모두 인라인하고 네 기록부 데이터까지 내장한 오프라인 단일 파일(`npm run build:offline` 생성). `file://` 로 열어도 동작한다. 소스를 고친 뒤 다시 만들지 않으면 `npm run validate` 가 실패한다
- `public/insurrection-trials-data.json`: 사건, 피고인, 판결 및 재판부 데이터. `judges` 항목은 이름·직위 외에 선택 필드로 프로필을 가질 수 있다 — `appointed`(제청·임명권자), `note`(경력), `stance`(`다수의견`/`반대의견`), `opinion`(2026-11-19 한덕수 사건 의견·역할), `history`(주요 이전 판결의 사건명·연도·결론·정론지 출처). 12명 대법관 프로필은 재판부 탭에서 접기/펼치기로 표시된다
- `public/impeachment-assembly-data.json`: 22대 국회의원 300석 명부(승계 1명 포함 301명)와 12.4 비상계엄해제 요구안·1차(2024.12.7)·2차(2024.12.14) 탄핵소추안 표결 기록. 탄핵 반대를 공개한 19명의 발언·출처와 반대 85표·1차 불참 105명 해설(`meta.analysis`) 포함. 2024.12 표결 이후 2026년 현재까지의 행적은 `meta.current`(통계·필터 묶음·출처)와 의원별 `currentTitle`·`currentParty`·`currentStatusBadge`·`currentNote`에 담았다 — 6·3 지방선거 광역단체장 당선 9명, 당적 변경 6명, 의원직 상실·사퇴 2명
- `public/assets/photos/`: 인물사전 프로필 사진(WebP) 및 출처·라이선스 문서
- `public/assets/members/`: 22대 국회의원 301명 공식 프로필 사진(120×120 WebP, 열린국회정보 `NAAS_PIC`)과 출처 문서(`CREDITS.md`)
- `scripts/fetch-member-photos.py`: 의원 사진 수집·크롭(얼굴 검출)·WebP 변환 파이프라인 (수집 기록 `scripts/member-photos.json`)
- `scripts/validate-data.mjs`: 데이터 구조·참조·사진 파일 무결성 + CSS/JS 분리 구조 + 오프라인 단일 파일 인라인·**동기화**(현재 소스로 다시 만들어 바이트 단위 비교) + d3 지연 로딩 구조 검증 스크립트
- `tests/*.test.js`: `core.js` 순수 로직 단위 테스트(Node 내장 `node:test`, 외부 의존성 없음) — 날짜/'예정' 배지, 해시 라우팅, 초성 검색, 형량·심급 통계
- `scripts/offline-build.mjs`: 오프라인 단일 파일 빌더(Node). `index.html` · `styles.css` · `core.js` · `app.js` 를 읽어 CSS·JS 를 인라인하고 네 기록부 JSON 을 내장하며, 원본 파일은 수정하지 않는다. 검증(`npm run validate`)도 같은 빌더로 사본을 다시 만들어 비교한다
- `scripts/build-offline.py`: `scripts/offline-build.mjs` 를 호출하는 얇은 래퍼(예전 명령 `python3 scripts/build-offline.py` 호환용)
- `.github/workflows/deploy.yml`: `main` 푸시 시 검증 후 자동 배포하는 GitHub Actions 워크플로
- `wrangler.jsonc`: Cloudflare Workers (Static Assets) 배포 설정

## 로컬 개발 및 실행
```bash
# 의존성 설치
npm install

# Cloudflare Wrangler 로컬 개발 서버 실행
npm run dev
# 또는 http.server 등으로 public/ 서빙

# 단위 테스트 (core.js 순수 로직)
npm test

# 데이터 무결성 검증 + 단위 테스트 (CI 가 실행하는 명령)
npm run validate

# 데이터 JSON·CSS·JS 를 고친 뒤: 오프라인 단일 파일 재생성 (index.html 은 수정되지 않음)
npm run build:offline
# 또는 python3 scripts/build-offline.py (같은 빌더를 호출한다)
```

`public/insurrection-trials-offline.html` 은 `index.html`·`styles.css`·`core.js`·`app.js`·JSON 4종을 그대로 반영한 사본이다. 소스를 고치고 사본을 다시 만들지 않으면 `npm run validate`(CI)가 "오프라인 사본 동기화" 검사에서 실패한다.

관계도(graph) 뷰의 `d3@7` 은 첫 로드 때 받지 않고, 그 탭을 처음 열 때 `app.js` 의 `ensureD3()` 가 CDN 에서 한 번만 불러온다. 다른 화면에서는 d3 요청이 0건이다.

## Cloudflare 배포

### 자동 배포 (GitHub Actions)

`main` 브랜치에 푸시(또는 PR 머지)하면 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) 워크플로가 실행되어,
데이터 무결성(JSON) 검증과 단위 테스트(`npm run validate`)를 통과한 뒤 Cloudflare Workers로 자동 배포됩니다.

- **트리거**: `main` 브랜치 `push`, GitHub 웹 UI의 `workflow_dispatch` 수동 실행
- **흐름**: `test` 잡(Node 24, `npm run validate` = 데이터 무결성 검증 + 단위 테스트) → `deploy` 잡(`cloudflare/wrangler-action@v4`)

#### 필수 Secrets 설정

저장소의 **Settings > Secrets and variables > Actions**에서 아래 시크릿을 등록하세요.

| Secret | 설명 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare 대시보드(My Profile > API Tokens)에서 **Edit Cloudflare Workers** 권한으로 생성한 API 토큰 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 계정 ID (선택 사항 — Workers > Overview 또는 계정 우측 사이드바에서 확인) |

### 로컬 수동 배포
```bash
# Cloudflare Workers (Static Assets) 배포
npm run deploy

# 또는 Cloudflare Pages 배포
npm run pages:deploy
```
