# 12·3 내란 재판 기록부 (Dec 03 Insurrection Trial Tracker)

12·3 비상계엄 및 내란 관련 주요 사건의 재판 진행 상황과 선고 내역을 정리하고 시각화하는 프로젝트입니다.

- **웹사이트**: https://dec-03-insurrection-trial-tracker.inkstone.workers.dev/

## 파일 구성
- `public/index.html` / `public/insurrection-trials-offline.html`: 타임라인·사건별·인물별 재판 기록부와 [탄핵 표결] 뷰를 담은 웹 인터페이스
- `public/insurrection-trials-data.json`: 사건, 피고인, 판결 및 재판부 데이터
- `public/impeachment-assembly-data.json`: 22대 국회의원 300석 명부(승계 1명 포함 301명)와 윤석열 대통령 탄핵소추안 1차(2024.12.7)·2차(2024.12.14) 표결 기록
- `public/assets/photos/`: 인물사전 프로필 사진(WebP) 및 출처·라이선스 문서
- `scripts/validate-data.mjs`: 데이터 구조·참조·사진 파일 무결성 검증 스크립트
- `.github/workflows/deploy.yml`: `main` 푸시 시 검증 후 자동 배포하는 GitHub Actions 워크플로
- `wrangler.jsonc`: Cloudflare Workers (Static Assets) 배포 설정

## 로컬 개발 및 실행
```bash
# 의존성 설치
npm install

# Cloudflare Wrangler 로컬 개발 서버 실행
npm run dev
# 또는 http.server 등으로 public/ 서빙

# 데이터 무결성 검증 (JSON 구조·참조·사진 파일)
npm run validate
```

## Cloudflare 배포

### 자동 배포 (GitHub Actions)

`main` 브랜치에 푸시(또는 PR 머지)하면 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) 워크플로가 실행되어,
데이터 무결성(JSON) 검증 후 Cloudflare Workers로 자동 배포됩니다.

- **트리거**: `main` 브랜치 `push`, GitHub 웹 UI의 `workflow_dispatch` 수동 실행
- **흐름**: `test` 잡(Node 24, 데이터 무결성 검증) → `deploy` 잡(`cloudflare/wrangler-action@v4`)

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
