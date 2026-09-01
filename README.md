# ColorSketch

사진·그림을 A4 인쇄용 컬러링 도안(선화)으로 변환하는 웹앱. 미국 타깃, 영문 사이트, 가입 없는 단건 결제.

- 무료 변환은 **브라우저에서만** 돌아간다. 사진이 서버로 가지 않는다 — 핵심 차별점이다
- 유료는 서버에서만 실행되는 AI 리터칭. **$2.99에 두 스타일(Simple + Detailed) HD 2장**

> **새 대화에서 이 폴더를 열었다면 [`START_HERE.md`](START_HERE.md)부터 읽으세요.**
> 맥락·구조·다음 작업·지켜야 할 설계가 전부 거기 있습니다.

## 실행

```
npm install
npm run dev     # http://localhost:3000
npm run lint    # tsc --noEmit
npm run build

npm run build:review   # dist-single/colorsketch-review.html — 서버 없이 도는 단일 파일
```

`build:review`는 외부 검토용 빌드다. CSS·JS·워커(blob URL)·샘플 이미지(data URI)를 전부
한 파일에 넣기 때문에 링크나 파일 하나만 주면 서버 없이 돌아간다. 제약이 둘 있다.

- **다운로드·인쇄는 동작하지 않는다.** 샌드박스가 페이지에서 시작하는 파일 저장을 막는다. 앱 버그가 아니다
- 워커를 막는 샌드박스에서는 메인 스레드로 폴백한다(`utils/workerClient.ts`). 결과물은 같고 변환 중 화면이 잠깐 멈춘다

## 현재 상태

**Phase 1 + A단계 + B단계 완료.** 랜딩·편집기·정책 페이지가 전부 동작하고,
AI 리터칭 UI는 서버 없이 목업으로 붙어 있다. 다음은 C단계(서버리스 + 결제).

- 클라이언트 사이드 변환 (Web Worker, 메인 스레드 논블로킹)
- 자동 판별 기준은 "사진이냐"가 아니라 **"이미 선화냐"** (`utils/analyze.ts`)
- 사진 모드는 Canny + **적응형 백분위 임계값** (고정 임계값은 이미지마다 의미가 달랐다)
- **선화 추적은 한 번만.** 미리보기·다운로드·인쇄가 전부 그 한 장의 확대·축소본이라 서로 일치한다
- **선 굵기는 A4 기준 mm.** 화면에서 본 굵기가 그대로 인쇄된다
- 편집기 2뷰: Free editor ↔ AI page editor, 핸들은 동일
- HEIC(iPhone) 지원, 라우트 `/`, `/terms`, `/refund-policy`

## 문서

| 파일 | 내용 |
|---|---|
| [`START_HERE.md`](START_HERE.md) | **여기부터.** 맥락, 구조, 설계 원칙, 다음 작업 |
| [`CONTENT_UPDATE.md`](CONTENT_UPDATE.md) | 확정 카피·디자인 토큰·AI 플로우·프롬프트. 모든 결정의 근거 (§0에 현황표) |
| [`PHASE2_GUIDE.md`](PHASE2_GUIDE.md) | 서버리스·결제 명세 (= C단계) |
| [`DESIGN_REFERENCE.html`](DESIGN_REFERENCE.html) | 디자인 기준 목업 |
