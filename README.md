# 12·3 내란 재판 기록부 (Dec 03 Insurrection Trial Tracker)

12·3 비상계엄 및 내란 관련 주요 사건의 재판 진행 상황과 선고 내역을 정리하고 시각화하는 프로젝트입니다.

- **웹사이트**: https://dec-03-insurrection-trial-tracker.inkstone.workers.dev/

## 파일 구성
- `public/index.html` / `public/insurrection-trials-offline.html`: 타임라인·사건별·인물별 재판 기록부 웹 인터페이스
- `public/insurrection-trials-data.json`: 사건, 피고인, 판결 및 재판부 데이터
- `public/assets/photos/`: 인물사전 프로필 사진(WebP) 및 출처·라이선스 문서
- `wrangler.jsonc`: Cloudflare Workers (Static Assets) 배포 설정

## 로컬 개발 및 실행
```bash
# 의존성 설치
npm install

# Cloudflare Wrangler 로컬 개발 서버 실행
npm run dev
# 또는 http.server 등으로 public/ 서빙
```

## Cloudflare 배포
```bash
# Cloudflare Workers (Static Assets) 배포
npm run deploy

# 또는 Cloudflare Pages 배포
npm run pages:deploy
```
