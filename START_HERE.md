# ColorSketch — 작업 시작 안내

> **최종 갱신 2026-09-04.** 새 대화에서 이 폴더를 처음 열었다면 이 문서부터 끝까지 읽을 것.
> 아래 "5분 브리핑"만 읽어도 맥락이 잡히고, 세부 결정은 전부 `CONTENT_UPDATE.md`에 절 번호로 남아 있다.
>
> **C단계(결제) 진행 중.** Task 1~7 코드 완료 + 인프라(Redis·Blob·CRON) 연결 완료, Vercel 배포 정상.
> **남은 것은 외부 서비스 키 4종(Gemini·Turnstile·Resend·Lemon Squeezy) — 현희님 몫.**
> 현재 상태·검토 포인트·제품 리뷰는 전부 **`C_STATUS.md`(v3)**. 이 문서의 C단계 관련 서술보다
> 그쪽이 최신이다. 키 발급 절차와 진행표는 **`SETUP_CHECKLIST.md`**.
>
> **공개 프로덕션 주소: `https://colorsketch-amber.vercel.app`**

---

## 5분 브리핑

**무엇을 만드는가.** 사진·그림을 A4 인쇄용 컬러링 도안으로 바꿔주는 웹앱. 미국 타깃, 영문 사이트.
가입 없이 단건 결제. 한두 장만 뽑는 사람이 타깃이다.

**돈은 어떻게 버는가.** 무료 변환은 **브라우저 안에서만** 돌아 사진이 서버로 가지 않는다(핵심 차별점이자
프라이버시 셀링포인트). 유료는 서버에서만 도는 AI 리터칭 — 가치가 서버에 있어야 결제 게이트가
기술적으로 의미를 가진다. **$2.99에 두 스타일(Simple + Detailed) HD 2장.**

**지금 어디까지 됐는가.**

| 단계 | 내용 | 상태 |
|---|---|---|
| Phase 1 | Web Worker, 자동판별, Canny, HEIC, A4 300dpi | ✅ |
| A단계 | 랜딩 페이지 + 확정 카피 + 디자인 B안(컬러링북) | ✅ |
| B단계 | AI 리터칭 UI + 프롬프트 조립 모듈 | ✅ |
| 편집기 재설계 | 3단계 분리(무료/AI 데모/구매), Clean up 6단계, 품질 재보정 | ✅ §26~§31 |
| **AI 연결** | **`/api/ai-preview` — Gemini(Nano Banana) 직결** | ✅ **§32** (키만 넣으면 동작) |
| **C단계 코드** | **Turnstile·레이트리밋·캐시·워터마크·Blob·주문상태·웹훅·다운로드·`/thanks`** | ✅ **코드 완료** (`C_STATUS.md`) |
| **C단계 인프라** | **Upstash Redis · Vercel Blob · `CRON_SECRET`** | ✅ **완료 09-04** |
| **C단계 외부 키** | **Gemini → Turnstile → Resend → Lemon Squeezy** | ⬜ **현희님 차례 (Gemini 먼저)** |
| **C단계 테스트** | **`PHASE2_GUIDE.md` §7 테스트 9개** | ⬜ 키 등록 후 |

**절대 건드리면 안 되는 전제 4가지.**
1. 시크릿은 서버 환경변수로만. 클라이언트 번들에 어떤 키도 노출하지 않는다
2. 결제 완료 판정은 **웹훅뿐**. 리다이렉트 쿼리스트링을 믿고 발급하면 안 된다
3. 워터마크는 **서버에서 픽셀에 합성**. CSS 오버레이 금지
4. 웹훅 처리는 **멱등**. 같은 이벤트를 두 번 받아도 한 번만 처리

---

## 실행

```
npm install
npm run dev     # http://localhost:3000
npm run lint    # tsc --noEmit
npm run build
```

`npm run dev`는 명령창을 켜둔 동안만 살아 있다. 영구 주소가 필요하면 Vercel 배포(정적 사이트라 5분).

---

## 문서 지도

| 파일 | 무엇이 들어 있나 | 언제 읽나 |
|---|---|---|
| **`START_HERE.md`** | 지금 이 문서. 맥락·구조·다음 작업 | 항상 먼저 |
| **`C_STATUS.md`** (v3) | **C단계 구현 현황·가이드와 다른 점·검토 포인트·다음 작업(§7)·제품 리뷰(§9)** | **C단계를 이어받을 때 — 여기가 항상 최신** |
| **`CONTENT_UPDATE.md`** | 확정 카피(영문), 디자인 토큰, AI 플로우, 프롬프트, **모든 설계 결정의 근거** | 화면·문구·알고리즘을 건드리기 전 |
| **`PHASE2_GUIDE.md`** | 서버리스·결제·주문 상태 머신 명세 (= C단계). 불변식 8개 | C단계 착수할 때 (`C_STATUS.md` §4가 이걸 어디서 벗어났는지 정리) |
| **`SETUP_CHECKLIST.md`** | 계정·키 발급 절차 + **항목별 완료 현황표** | 키를 넣을 때 / 무엇이 남았는지 볼 때 |
| **`DESIGN_REFERENCE.html`** | 디자인 기준 목업. 색·간격·컴포넌트의 정답 | 새 UI를 만들 때 |

### `CONTENT_UPDATE.md` 읽는 법

**절 번호가 클수록 최신이고, 충돌하면 나중 절이 이긴다.** 폐기된 절은 ⛔로 표시돼 있다.
문서 맨 앞 §0에 절별 구현 현황표가 있다. 최근 결정은 이 순서로 읽으면 빠르다:

- **§19** 강약 재조정 — 무료 우선. *페이지 톤의 헌법. 문구를 고칠 때 반드시 먼저 볼 것*
- **§20** 무료 변환 알고리즘 개선 — 적응형 임계값
- **§22** 조절 핸들 재설계 + 미리보기·인쇄 일치
- **§24 → §26 → §28** 편집기 구조. **§28이 최신**(3단계 + AI 데모 전용 화면)
- **§25** 하단 CTA 재배치 + 빛나는 버튼
- **§7** 가격·결제 수단 확정 사항 (Stripe 불가 이유 포함)

---

## 구현된 구조

```
src/
  config.ts               연락처 이메일, PRICE_USD(=2.99). 금액은 여기 한 곳에만
  App.tsx                 라우팅(/, /terms, /refund-policy) + 랜딩 조립
  components/
    Header.tsx            로고 + Examples/FAQ 앵커
    Hero.tsx              §3 히어로 + 프라이버시 배지 + 체크 칩 3개 + Photo↔AI 슬라이더
    BeforeAfter.tsx       드래그 비교 슬라이더 (마우스·터치·키보드)
    Steps.tsx             3단계 스텝 (전부 무료 동작)
    Uploader.tsx          업로드 (드래그·붙여넣기·클릭)
    Editor.tsx            ★ 편집기. free / ai-demo / ai-hd 세 단계를 오간다 (§26·§28)
    AiDemoPanel.tsx       AI 데모 화면(전폭). 피사체 질문 → 실제 AI 예시 → 프리뷰 2장 → 가격
    AiHdPanel.tsx         결제 후 화면. 구매한 2장 중 선택 + 피사체 재실행
    SubjectPicker.tsx     피사체 칩 (데모·HD 공용)
    VariantCards.tsx      Simple/Detailed 카드 (데모·HD 공용)
    Samples.tsx           §13·§21 Free 그룹 / AI 그룹
    Faq.tsx               §5 8문항 + §16 1문항, 접근성 아코디언
    Footer.tsx            면책 + mailto + 정책 링크
  pages/
    Terms.tsx             §8        RefundPolicy.tsx  §9
  utils/
    router.ts             history API 기반 초소형 라우터 + <Link>
    samples.ts            샘플 URL 해석 + 존재 확인 훅
    prompt.ts             §15 프롬프트 조립(CORE + 모듈 + variant) + 입력 검증
    aiFlow.ts             단계 정의·헤더 색·variant 설정·실제 AI 예시 (§26·§31)
    aiPreview.ts          /api/ai-preview 클라이언트 + 폴백 판정 (§32)
    checkout.ts           결제 모드 스위치. startCheckout()이 유일한 이음매 (§31)
    ink.ts                결과 품질 판정(잉크 · 획 파편화 · 덩어리 solidity)
    analyze.ts            "이미 선화인가" 자동 판별
    lineart.ts            ★ 픽셀 처리 (adaptive threshold / Canny) — DOM 의존 없음
    pipeline.ts           ★ 단일 추적 + 스케일 + 합성
    loadImage.ts          HEIC 포함 디코딩
    workerClient.ts       워커 프로토콜
  workers/lineart.worker.ts
api/                      ← 전체 지도는 C_STATUS.md §2. Node 런타임, 상대 import에 .js 필수
  ai-preview.ts           ★ Turnstile→레이트리밋→(캐시 or Gemini)→워터마크→Blob→주문 previewed
  checkout.ts             Lemon Squeezy 체크아웃 생성 → previewed→checkout_pending
  webhook.ts              LS 웹훅. raw-body HMAC 검증 → 멱등 → paid → 발급
  download.ts             주문 상태 확인 후 Blob으로 302. orderId가 유일 자격증명
  cron/cleanup.ts         7일 지난 Blob 삭제 (매일 03:00, CRON_SECRET 보호)
  _lib/                   redis · blob · ids · order · cache · ratelimit · image · turnstile
                          · deliver · email
scripts/
  build-single-file.mjs   검토용 단일 HTML 번들 (npm run build:review)
vercel.json               SPA rewrite (/api/ 는 제외) + cron + regions:["iad1"]
DEPLOY.md                 배포 절차 + 배포 전 확인 항목
```

> ⚠️ **`api/**` 안에서 상대 import를 쓸 땐 반드시 `from './x.js'`** (Node ESM 필수).
> `tsc --noEmit`도 `vite build`도 이걸 못 잡고, 런타임에서 전 함수가 죽는다.
> 첫 배포의 `FUNCTION_INVOCATION_FAILED` 원인이 이거였다 (`C_STATUS.md` §0).

---

## 반드시 알아야 할 설계 3가지

이걸 모르고 고치면 반드시 회귀가 난다.

### 1. 추적은 딱 한 번, 나머지는 전부 확대·축소본이다 (§22)

`pipeline.ts`의 `TRACE_LONG_EDGE = 1754`(A4 150dpi)에서 한 번만 선화를 만든다.
미리보기는 축소본, A4 300dpi 내보내기는 확대본이다(`scaleLineArt` → 0.62로 재이진화).

**내보내기에서 다시 추적하면 안 된다.** 원본을 먼저 확대하면 그래디언트가 뭉개져서
같은 설정인데 화면 13.3% / 파일 2.67%로 딴 물건이 나왔었다. 지금은 12.93% ↔ 13.24%로 일치한다.

### 2. 선 굵기는 픽셀이 아니라 mm다 (§22)

`thicknessMm`(0.5~3mm, 기본 2.0)에서 캔버스 크기로 팽창 반경을 역산한다.
고정 픽셀을 쓰던 시절엔 미리보기 1.41mm가 인쇄물에서 0.34mm로 나왔다.
잡티 제거 기준도 같은 이유로 mm²다.

### 3. Canny 임계값은 절대값이 아니라 백분위다 (§20)

그래디언트 크기는 이미지 대비에 비례하므로 고정 임계값 150은 이미지마다 다른 의미였다
(강아지 0.86% = 백지, 잎 15.8% = 낙서). 지금은 그 이미지 자신의 분포에서 백분위로 자른다.

**연쇄 주의**: 잉크 비율이 어느 이미지든 10% 근처로 수렴하면서 "잉크 < 4.5%" 트리거가
영원히 안 뜨게 됐던 적이 있다. 지금 AI 콜아웃 판정 지표는 **획 파편화**이고,
`REFERENCE_AREA`로 해상도 정규화돼 있다. **추적 해상도를 바꾸면 이 지표를 반드시 재확인할 것.**

---

## 편집기 동작 (§26, §28, §31 — §24·§25를 대체)

한 화면에 **세 단계 중 하나만** 뜬다. 단계마다 상단 바 색이 바뀌므로 스크롤 밖에서도 구분된다.

| 단계 | 상단 바 | 레이아웃 | 구성 |
|---|---|---|---|
| **free** | 노랑 `#f5c242` / 검정 글씨 | 캔버스 + 사이드바 | 스타일 → Adjust → 지우개 → 텍스트 → 무료 다운로드/인쇄 → **매직 CTA** |
| **ai-demo** | **빨강 `#e8503a`** / 흰 글씨 | **전폭 1컬럼 (캔버스 없음)** | 피사체 질문 → 실제 AI 예시 → 프리뷰 2장 → 가격 |
| **ai-hd** | **잉크 `#141414`** / 흰 글씨 | 캔버스 + 사이드바 (free와 동일) | 구매한 2장 중 선택 → free와 같은 핸들 → HD 다운로드 |

- 색은 `utils/aiFlow.ts`의 `STAGE_BAR` 한 곳에만 정의한다. 바는 `App.tsx`가 그린다
- 핸들은 free와 ai-hd가 **동일**하다: Line thickness(mm) / Detail(0~100) /
  **Clean up 6단계**(Off·Light·Medium·Strong·Heavy·Max, 기본 **Light**) + 지우개(+Undo) + 텍스트
- `ai-demo`에 캔버스를 되살리지 말 것 (§28). 거기서 편집되는 건 아무것도 없고,
  무료 결과를 옆에 띄우면 "이미 가진 것" 대 "살까 말까 한 것"의 비교가 되어 구매를 막는다
- 지우개 획은 단계별로 따로 보관한다(`freePaths` / `aiPaths`)
- 무료 결과 품질 판정은 **free 단계에서만** 한다
- 페이지에서 시끄러운 요소는 하단 매직 CTA **하나뿐**이어야 한다. 두 개가 되면 둘 다 무시된다

---

## 샘플 이미지 규칙 (§21)

| 그룹 | 샘플 |
|---|---|
| 히어로 | leaf (Photo ↔ AI) |
| Free | baby, robot |
| AI | dog, flower |

**배치 기준은 취향이 아니라 앱의 실제 판정이다.** 새 샘플을 넣을 땐 업로드해서
AI 콜아웃이 뜨는지 보고 그룹을 정한다. 뜨면 AI 그룹, 안 뜨면 Free 그룹.

- Before/After는 **같은 프레이밍·같은 종횡비**여야 슬라이더가 어긋나지 않는다
- 파일이 하나라도 없으면 그 카드만 빠지고 페이지는 정상 동작한다
- 샘플 원본은 직접 촬영했거나 직접 생성한 이미지만 쓴다(스톡·타인 사진 금지)

---

## AI가 진짜인지 아닌지는 자동으로 표시된다 (§32)

`/api/ai-preview`가 실제 이미지를 돌려주면 프리뷰 2장이 진짜 AI 결과다.
키가 없거나(503) 엔드포인트가 없으면(404) **로컬 트레이서로 폴백**하고,
카드에 `Not AI` 태그와 "These two are not AI output" 경고가 붙는다.

**이건 수동 플래그가 아니라 파생값이다** (`usedRealAi`). 손으로 켜고 끄는 스위치를
다시 만들지 말 것 — 켜는 걸 잊거나, 더 나쁘게는 일찍 켜게 된다.

로컬 `npm run dev`에는 `api/` 라우트가 없으므로 **개발 중에는 항상 폴백 상태**가 정상이다.

---

## C단계 — 서버리스 + 결제 (코드 완료, 키 대기)

> **09-04 현재: Task 1~7 코드와 인프라가 모두 끝났다.** 아래는 그 설계 원칙과 이음매 지도이며,
> "다음에 구현할 것"이 아니라 **"고칠 때 깨뜨리면 안 되는 것"**으로 읽어야 한다.
> 실제 다음 작업 목록은 **`C_STATUS.md` §7**에 있다.

`PHASE2_GUIDE.md`의 본문 상당수는 AI 미연결 시점에 쓰였으므로, 앞머리 경고 절들이 본문보다 우선한다:

1. **"읽기 전에" 절 (§32 갱신)** — 현재 상태 + 지켜야 할 불변식 8가지. 본문보다 우선한다
2. **비로그인 결제 실패 대응** — 생성 실패는 설계로 제거하고, 전달 실패는 3중 경로로 받는다
3. 프리뷰는 2장 병렬. 레이트리밋은 "요청 1회 = 2장", 캐시 키는 `cache:{imageHash}:{module}:{variant}`

특히 이 원칙을 기억할 것:

> **결제 이후에는 외부 AI API를 절대 호출하지 않는다.**
> 프리뷰 단계에서 워터마크 없는 원본을 Blob에 저장해두고, 결제 후에는 그것을 A4 300dpi로
> 업스케일해 발급만 한다. "돈은 받았는데 AI가 죽어서 못 만듦"이 원천 차단된다.

이메일이 계정을 대신한다 — Lemon Squeezy 체크아웃은 비로그인이어도 구매자 이메일을 반드시 받고
웹훅으로 넘겨준다. `paid` 전이 즉시 다운로드 링크를 자동 발송하는 게 1차 안전망이다.

클라이언트 쪽 연결 지점 (§32 이후 기준):

| 이음매 | 현재 상태 (09-04) |
|---|---|
| `api/ai-preview.ts` | ✅ Turnstile·레이트리밋·캐시·워터마크·Blob·주문생성 **전부 붙어 있다** |
| `utils/aiPreview.ts`의 `requestAiPreview()` | ✅ Turnstile 토큰을 싣는다 |
| `utils/checkout.ts`의 `startCheckout()` | ✅ **결제의 유일한 이음매.** `live`면 `/api/checkout` → LS 리다이렉트 |
| `Editor.tsx`의 `chooseVariant(variant, dataUrl)` | ✅ 동작 |
| `utils/router.ts` | ✅ `/thanks` 추가됨 |
| `utils/prompt.ts`의 `buildPrompt()` | ✅ 서버·클라 공유 |
| `utils/prompt.ts`의 `sanitizeSubjectWord()` | ✅ 서버에서 다시 호출한다. 클라이언트 검증은 UX용일 뿐 |

> ⚠️ `AiCallout.tsx`와 `PaywallNote.tsx`는 **삭제됐다.** 옛 문서가 이걸 가리키면 무시하고
> `AiDemoPanel.tsx`를 볼 것.

> ⚠️ **`CHECKOUT_MODE=live`는 §7 테스트 9개를 통과한 뒤에만.** 워터마크·Blob 원본 저장은
> 이제 들어가 있지만(그래서 위 경고의 원래 위험은 해소됐다), 실 키로 한 번도 돌려본 적이 없는
> 경로다. 반드시 **Preview 환경에서 먼저** 켜고 LS Test mode로 검증할 것.

---

## 결제 관련 확정 사항 (§7) — 다시 논의하지 말 것

- MoR은 **Lemon Squeezy**. 한국("Republic of Korea (ROK)")이 정산 지원 국가에 포함된다
- **Stripe 직접 연동과 Link by Stripe는 불가.** 한국 거주자·법인은 Stripe 가맹점 계정을 못 연다.
  해외 법인이 필요하고, 직접 연동하면 미국 판매세·EU VAT·차지백을 전부 직접 떠안는다
- LS 수수료 5% + $0.50. **미국 외 거래에만** +1.5%이므로 미국 타깃이면 안 붙는다. 해외 계좌 출금 1%
- **LS 문서에 "$10 미만 상품은 세일즈팀에 커스텀 요율을 문의하라"고 명시돼 있다. 반드시 문의할 것**
- 번들(3~5장 크레딧)은 검토 후 폐기했다. 이유는 §7 참조

---

## 남은 과제

**런칭 전 반드시 (P0)** — 근거는 `C_STATUS.md` §9:

- **US Letter 용지 지원.** 타깃이 영미권인데 사이트 전체가 A4 단독이다. 미국 표준은
  Letter(8.5×11")라 집 프린터에서 여백이 어긋난다. 영국·호주는 A4이므로 **옵션형**이 정답
- **OG/Twitter 메타 + 파비콘.** `index.html`에 없다. Pinterest·페이스북 육아 그룹이 이 카테고리의
  핵심 유입인데 지금 공유하면 빈 카드가 뜬다. before/after 이미지를 `og:image`로
- **`api/` 결제 경로 코드 정독** (`C_STATUS.md` §6 우선순위 1). 돈이 걸린 경로인데 아직 안 했다

**그 다음 (P1)**:

- **퍼널 이벤트 심기.** 업로드 → 무료 다운로드 → AI 콜아웃 노출 → 리터칭 클릭 → variant 선택
  → 체크아웃 시작 → 결제 완료. 이 7개면 방문자 100명으로도 어디서 새는지 보인다.
  A/B 테스트는 한 쪽당 8,000명이 필요하니 오픈 직후엔 순차 테스트(2주 단위)로 갈 것.
  지금은 분석 도구가 **아예 없다** — Vercel Analytics(무료)라도 먼저
- **커스텀 도메인 + 도메인 메일.** 유료 결제를 받는데 연락처가 Gmail이다. Resend 도메인 검증과
  겹치는 작업이라 도메인을 먼저 정하면 일석이조
- **무료 변환 품질 회귀 테스트.** 선이 또렷한 입력에서 항상 만족스러워야 §19의
  "free is the finished product"가 성립한다. 실이미지 10~20장으로 확인할 것

**메모**: `leaf-after.png`는 더 이상 쓰이지 않지만 7KB라 남겨뒀다

---

## 작업 원칙

- 영문 카피는 `CONTENT_UPDATE.md`의 확정본을 그대로 쓴다. 고쳐야 하면 원문을 지우지 말고
  **개정 사유와 날짜를 함께 남긴다**
- 불명확한 결정(가격, 모델 선택 등)은 임의로 정하지 말고 질문한다
- 목업으로 채운 화면에는 반드시 그 사실이 보이게 표시한다
- 샘플·문구가 앱의 실제 동작과 어긋나면 그건 버그다. 문구를 맞추거나 동작을 고치거나 둘 중 하나
