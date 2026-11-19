# 12·3 내란 재판 기록부 (Dec 03 Insurrection Trial Tracker)

12·3 비상계엄 및 내란 관련 주요 사건의 재판 진행 상황과 선고 내역을 정리하고 시각화하는 프로젝트입니다.

- **웹사이트**: https://dec-03-insurrection-trial-tracker.inkstone.workers.dev/

## 파일 구성
- `public/index.html`: 상단 스위처로 네 기록부(12·3 내란 재판 · 윤석열 탄핵 표결 · 김건희·명태균 특검 · 채상병 특검)를 오가는 웹 인터페이스의 HTML 마크업. **온라인 배포본은 아래 `*.json` 을 `fetch` 로만 읽는다**(내장 사본 없음)
- `public/styles.css`: 페이지 전체 스타일. `index.html` 이 `<link>` 로 불러온다
- `public/core.js`: DOM·네트워크와 무관한 순수 로직(해시 라우팅, 날짜·'예정' 판정, 초성 검색, 형량 환산·심급 통계). 브라우저에서는 `app.js` 앞에 로드되고, Node 단위 테스트에서 `require` 로 그대로 쓴다
- `public/app.js`: 화면 렌더링·이벤트·데이터 로딩. `core.js` 다음에 로드된다
- `public/insurrection-trials-offline.html`: 위 세 파일을 모두 인라인하고 네 기록부 데이터까지 내장한 오프라인 단일 파일(`scripts/build-offline.py` 생성). `file://` 로 열어도 동작한다
- `public/insurrection-trials-data.json`: 사건, 피고인, 판결 및 재판부 데이터
- `public/impeachment-assembly-data.json`: 22대 국회의원 300석 명부(승계 1명 포함 301명)와 12.4 비상계엄해제 요구안·1차(2024.12.7)·2차(2024.12.14) 탄핵소추안 표결 기록. 탄핵 반대를 공개한 19명의 발언·출처와 반대 85표·1차 불참 105명 해설(`meta.analysis`) 포함. 2024.12 표결 이후 2026년 현재까지의 행적은 `meta.current`(통계·필터 묶음·출처)와 의원별 `currentTitle`·`currentParty`·`currentStatusBadge`·`currentNote`에 담았다 — 6·3 지방선거 광역단체장 당선 9명, 당적 변경 6명, 의원직 상실·사퇴 2명
- `public/assets/photos/`: 인물사전 프로필 사진(WebP) 및 출처·라이선스 문서
- `public/assets/members/`: 22대 국회의원 301명 공식 프로필 사진(120×120 WebP, 열린국회정보 `NAAS_PIC`)과 출처 문서(`CREDITS.md`)
- `scripts/fetch-member-photos.py`: 의원 사진 수집·크롭(얼굴 검출)·WebP 변환 파이프라인 (수집 기록 `scripts/member-photos.json`)
- `scripts/validate-data.mjs`: 데이터 구조·참조·사진 파일 무결성 + CSS/JS 분리 구조 + 오프라인 단일 파일 인라인 검증 스크립트
- `tests/*.test.js`: `core.js` 순수 로직 단위 테스트(Node 내장 `node:test`, 외부 의존성 없음) — 날짜/'예정' 배지, 해시 라우팅, 초성 검색, 형량·심급 통계
- `scripts/build-offline.py`: `index.html` · `styles.css` · `core.js` · `app.js` 를 읽어 오프라인 단일 파일(`public/insurrection-trials-offline.html`)을 만드는 스크립트. CSS·JS 를 인라인하고 네 기록부 JSON 을 내장하며, 원본 파일은 수정하지 않는다
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

# 데이터 JSON 을 고친 뒤: 오프라인 단일 파일 재생성 (index.html 은 수정되지 않음)
python3 scripts/build-offline.py
```

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
