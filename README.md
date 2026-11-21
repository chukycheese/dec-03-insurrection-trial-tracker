# 12·3 내란 재판 기록부 (Dec 03 Insurrection Trial Tracker)

12·3 비상계엄 및 내란·특검 관련 주요 사건의 재판 진행 상황, 선고 내역, 국회 탄핵 표결 기록을 정리하고 시각화한 웹 프로젝트입니다.

- **라이브 사이트**: https://dec-03-insurrection-trial-tracker.inkstone.workers.dev/

## 주요 기능
- **4개 기록부 통합 조회**: 12·3 내란 재판, 윤석열 탄핵 표결, 김건희·명태균 특검, 채상병 특검 탭 전환
- **사건·인물·재판부 정리**: 심급별 선고 결과, 판결 요지, 피고인·재판부 정보 및 보도 출처 연결
- **관계도 및 통계 시각화**: 사건·인물 간 관계도(D3.js) 및 형량·심급 통계 뷰 제공
- **오프라인 단일 HTML 지원**: 별도 서버 없이 브라우저에서 바로 열 수 있는 오프라인 사본(`public/insurrection-trials-offline.html`) 빌드 지원

## 데이터 내려받기
각 기록부 데이터는 `public/` 아래 JSON 파일로 제공되며, 아래 주소에서 바로 내려받거나 저장소를 클론해 사용할 수 있습니다.

- **12·3 내란 재판**: `https://dec-03-insurrection-trial-tracker.inkstone.workers.dev/insurrection-trials-data.json`
- **윤석열 탄핵 표결**: `https://dec-03-insurrection-trial-tracker.inkstone.workers.dev/impeachment-assembly-data.json`
- **김건희·명태균 특검**: `https://dec-03-insurrection-trial-tracker.inkstone.workers.dev/kim-trials-data.json`
- **채상병 특검**: `https://dec-03-insurrection-trial-tracker.inkstone.workers.dev/chae-trials-data.json`

```bash
# 특정 데이터만 바로 받기
curl -O https://dec-03-insurrection-trial-tracker.inkstone.workers.dev/insurrection-trials-data.json

# 전체 저장소 내려받기 (public/*-data.json 포함)
git clone https://github.com/chukycheese/dec-03-insurrection-trial-tracker.git
```

## 프로젝트 구조
- `public/`: 웹 앱 정적 파일(`index.html`, `styles.css`, `core.js`, `app.js`), 기록부 JSON 데이터, 이미지 에셋
- `scripts/`: 데이터 무결성 검증(`validate-data.mjs`) 및 오프라인 HTML 빌드(`offline-build.mjs`) 스크립트
- `tests/`: 핵심 로직 단위 테스트(`node:test`)
- `wrangler.jsonc`: Cloudflare Workers 정적 에셋 배포 설정

## 로컬 실행 및 검증
```bash
npm install
npm run dev           # 로컬 개발 서버 실행
npm test              # 단위 테스트
npm run validate      # 데이터 무결성 검증 + 단위 테스트
npm run build:offline # 오프라인 단일 HTML 재생성
```
