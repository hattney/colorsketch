# ColorSketch Phase 2 구현 가이드 (= C단계)

> 이 문서는 Claude Code에게 전달하는 작업 지시서입니다.
> 사용법: Claude Code에서 이 폴더를 열고
> **"PHASE2_GUIDE.md를 읽고 §8 작업 순서대로 구현해줘. 태스크 하나 끝날 때마다 결과를 보고하고 다음으로 넘어가."**
> 라고 입력하세요.
>
> **먼저 맨 위의 "읽기 전에" 절을 읽을 것.** 본문 상당수가 AI 미연결 시점에 쓰였고,
> 그 절이 현재 상태와 지켜야 할 불변식을 담고 있으며 본문보다 우선합니다.

---

## ⚠️ 읽기 전에 (2026-08-28 갱신 — 이 절이 아래 본문보다 우선한다)

이 문서의 본문은 **AI가 미연결이고 프리뷰가 1장이던 시점**에 쓰였다. 그 뒤로 많이 진행됐다.
아래 표가 현재 상태이고, 본문과 충돌하면 **여기와 `CONTENT_UPDATE.md`의 큰 절 번호가 이긴다.**

### 이미 끝난 것 — 다시 만들지 말 것

| | 상태 |
|---|---|
| 무료 변환기 전체 (업로드·추적·핸들·다운로드·인쇄) | 완료 |
| 편집기 3단계 분리 (`free` / `ai-demo` / `ai-hd`) + 단계별 헤더 색 | 완료 (§26, §28) |
| Clean up 6단계, 기본값 `light` | 완료 (§30, §31) |
| **`POST /api/ai-preview` — Gemini(Nano Banana) 직결** | **완료 (§32)**. Edge 런타임, 의존성 0, 순수 `fetch` |
| 클라이언트 연결 `src/utils/aiPreview.ts` | 완료. 엔드포인트 없으면 로컬 트레이서로 폴백 |
| 결제 모드 스위치 `src/utils/checkout.ts` | 완료 (§31). `mock`/`disabled`/`live` |
| 배포 준비 (`DEPLOY.md`, `.env.example`, noindex) | 완료 (§31) |

**`GEMINI_API_KEY`만 넣으면 AI 리터치가 실제로 돈다.** 남은 건 그 위에 얹는 유료 인프라다.

### 삭제된 파일 — 본문이 이걸 가리키면 무시할 것

| 없어진 것 | 대체 |
|---|---|
| `src/components/AiCallout.tsx` | `AiDemoPanel.tsx` (전폭 레이아웃) |
| `src/components/PaywallNote.tsx` | 페이월 카피가 `AiDemoPanel.tsx` 안으로 이동 |

새로 생긴 것: `utils/aiFlow.ts`, `utils/checkout.ts`, `utils/aiPreview.ts`,
`components/AiDemoPanel.tsx`, `AiHdPanel.tsx`, `SubjectPicker.tsx`, `VariantCards.tsx`,
`api/ai-preview.ts`.

### 아직 안 한 것 — 여기서부터가 작업이다

Turnstile · 레이트리밋(Upstash) · 캐시 · 워터마크 · 저해상도 프리뷰 · Blob 원본 저장 ·
주문 상태 머신 · `/api/checkout` · `/api/webhook` · `/api/download` · `/thanks` 페이지.

### 손대기 전에 반드시 읽을 불변식

깨면 조용히 망가지는 것들이다. 각 항목의 근거는 `CONTENT_UPDATE.md`의 해당 절에 있다.

1. **선화 추적은 한 번만** (`utils/pipeline.ts`). 미리보기·다운로드·인쇄가 전부 그 한 장의
   확대·축소본이다. 크기별로 다시 추적하면 화면과 인쇄가 어긋난다
2. **기본 `cleanup`과 `ink.ts`의 `FRAGMENTED`는 한 세트다** (§31). 블러가 파편화 수치를
   좌우하므로, 기본값을 옮기면 AI 콜아웃이 뜨는 조건이 조용히 바뀐다. **항상 같이 재보정할 것**
3. **정직성 표시는 파생값이지 플래그가 아니다** (§32). "이건 AI가 아니다" 경고는
   `usedRealAi` — 실제로 모델이 답을 줬는지 — 에 걸려 있다. 수동 스위치를 다시 만들지 말 것.
   수동 스위치는 켜는 걸 잊거나 더 나쁘게는 일찍 켜게 된다
4. **HTTP 상태와 사용자 문구는 일치해야 한다** (§32). 422는 클라이언트가 재시도 버튼을
   감추는 신호다. "다시 시도하세요"라고 쓰려면 상태도 재시도 가능해야 한다
5. **거절 문구는 이유를 추측하지 않는다** (§32). API는 차단 사실만 알려준다.
   `RECITATION`만 예외 — 그건 API가 실제로 말해준 경우다
6. **`sanitizeSubjectWord()`는 서버에서 다시 돌린다.** 클라이언트 사본을 믿지 않는다
7. **시크릿에 `VITE_` 접두사 금지.** 붙는 순간 브라우저 번들에 실린다
8. `src/config.ts`의 `PRICE_USD`가 표기 금액의 **유일한 출처**다 (현재 `2.99`)

---

## ⚠️ 비로그인 결제의 실패 대응 설계 (2026-08-26 추가 — 이 절이 §3·§4보다 우선한다)

계정이 없으므로 "결제는 됐는데 파일을 못 받는" 상황의 복구 경로를 설계로 못 박는다.
실패는 두 종류이고, **첫 번째는 아예 발생하지 않게 만든다.**

### (A) 생성 실패 — 설계로 제거한다

**원칙: 결제 이후에는 외부 AI API를 절대 호출하지 않는다.**

- `/api/ai-preview` 단계에서 각 variant의 **워터마크 없는 원본을 Blob에 저장**한다.
  사용자에게 내려보내는 것은 그 원본을 축소하고 워터마크를 픽셀 합성한 사본뿐이다
- 결제 후 `/api/download`가 하는 일은 **생성이 아니라 발급**이다 — 저장해둔 원본을
  A4 300dpi로 업스케일(선화는 흑백 라인이라 업스케일 열화가 거의 없다)해서 서명 URL을 발급한다
- 이 순서면 모델 제공자가 죽어 있든 레이트리밋에 걸리든 **결제 이후 단계에는 외부 의존성이 없다.**
  "돈은 받았는데 AI가 안 돌아서 못 만듦"이라는 케이스 자체가 사라진다
- Blob 보존 기간은 결제 여부와 무관하게 7일 (§8 Terms의 "7일 내 삭제"와 일치)

### (B) 전달 실패 — 3중 경로로 받는다

브라우저가 끊기거나 사용자가 결제 직후 창을 닫는 경우다. **주문은 결제 이전에 이미 서버에 존재한다** —
`orderId`, `imageHash`, 고른 variant, 피사체 모듈이 프리뷰 시점에 저장돼 있으므로,
서버는 무엇을 누구에게 줘야 하는지 결제 순간에 이미 알고 있다.

1. **웹훅이 유일한 진실이다.** 리다이렉트는 유실될 수 있지만 웹훅은 실패 시 자동 재시도된다.
   웹훅 수신 = `paid` 전이 = 발급 가능. 브라우저가 살아 있는지와 무관하다
2. **이메일이 계정을 대신한다.** Lemon Squeezy 체크아웃은 비로그인이어도 **구매자 이메일을 반드시 받고**,
   웹훅 페이로드로 전달한다. 즉 "비로그인"이지만 식별자는 있다.
   `paid` 전이 즉시 다운로드 링크를 이메일로 자동 발송한다 — 이게 1차 안전망이다
3. **localStorage 복구 배너.** 클라이언트는 `orderId`를 localStorage에 남긴다.
   재방문 시 서버에 상태를 물어 `paid`/`delivered`면 "받지 못한 주문이 있습니다" 배너와 다운로드 버튼을 띄운다
4. **주문번호 재발급 페이지.** `/order/{orderId}`는 만료 없이 살아 있고, 몇 번이든 다시 받을 수 있다.
   FAQ 7번이 이 경로를 안내한다

### 그래도 실패하면

- 업스케일·발급이 실패하면 3회까지 자동 재시도 → 최종 실패 시 `failed` 전이
- `failed`는 **관리자 알림 + 사용자에게 사과·환불 안내 메일 자동 발송**
- 환불은 Lemon Squeezy 대시보드에서 원클릭. §9 환불 정책의 "미전달 시 14일 내 전액 환불"이 이 케이스다
- 차지백이 들어와도 MoR인 LS가 방어를 대신한다

### 구현 시 반드시 지킬 것

- 웹훅 처리는 **멱등**하다. `processedWebhookIds`에 이미 있는 이벤트 ID는 스킵한다
- 결제 완료 판정은 **웹훅뿐**이다. 리다이렉트 페이지의 쿼리스트링을 믿고 발급하면 안 된다
- 발급 URL은 **서명된 단기 URL**로 만들되, `/order/{orderId}` 페이지에서 언제든 새로 서명해 재발급한다
- `orderId`는 서버가 생성하는 nanoid다. 추측 가능한 순번을 쓰면 남의 주문을 열 수 있다

---

## 0. 전제와 목표

- Phase 1 완료 상태의 ColorSketch(Vite + React 19 + TypeScript) 프로젝트가 현재 폴더에 있다.
- 목표: **무료 클라이언트 프리뷰 → AI 프리뷰(저해상도+워터마크, 횟수 제한) → 결제 → 고화질 다운로드** 퍼널의 서버 측을 구현한다.
- 배포 대상: **Vercel** (미국 리전 `iad1` 고정). 결제: **Lemon Squeezy** (MoR, USD). AI 변환: **Google Gemini 직결 (Nano Banana)**. 봇 차단: **Cloudflare Turnstile**.
- 절대 원칙:
  - API 키·시크릿은 서버 환경변수로만 사용한다. 클라이언트 번들에 어떤 시크릿도 노출하지 않는다.
  - 결제 완료의 유일한 판정 기준은 **웹훅**이다. 리다이렉트 페이지는 상태 표시용일 뿐이다.
  - 워터마크는 서버에서 픽셀에 합성한다. CSS 오버레이 금지.
  - 모든 웹훅 처리는 멱등(idempotent)해야 한다.

## 1. 인프라 구성 요소

| 역할 | 서비스 | 비고 |
|---|---|---|
| 호스팅 + 서버리스 | Vercel | `api/` 폴더의 함수, 리전 `iad1` |
| 키-값 저장 (주문 상태, 레이트리밋, 캐시 인덱스) | Upstash Redis | Vercel Marketplace로 연결 |
| 이미지 파일 저장 (원본, AI 결과) | Vercel Blob | 결과물 서명 URL 발급 |
| AI 선화 변환 | **Google Gemini 직결 (Nano Banana)** | §32에서 확정. §15 프롬프트가 **지시-따르기 편집 모델** 전용이라 line-art 스타일 모델로는 대체되지 않는다. 모델 ID는 `AI_MODEL_ID`(벤더 중립) 환경변수 |
| 결제 (MoR) | Lemon Squeezy | Single payment 상품 1개, custom data로 orderId 전달 |
| 봇 차단 | Cloudflare Turnstile | AI 프리뷰 요청 전 검증 |

## 2. 주문 상태 머신

Redis 키 `order:{orderId}` 에 JSON으로 저장한다.

```
created ──(AI 프리뷰 성공)──> previewed ──(체크아웃 시작)──> checkout_pending
checkout_pending ──(웹훅 order_created 검증됨)──> paid
paid ──(고해상도 변환 성공, Blob 업로드 완료)──> delivered
paid ──(변환 3회 재시도 실패)──> failed        ← 관리자 알림 + 환불 안내 대상
어떤 상태에서든 ──(환불 웹훅)──> refunded
```

주문 레코드 필드: `orderId, status, imageHash, module, otherWord?, fromModel, variants, lsOrderId, email(웹훅에서 수신), createdAt, updatedAt, attempts, processedWebhookIds[]`

- `orderId`: 서버가 생성하는 nanoid. 클라이언트가 임의 지정 불가.
- `imageHash`: 업로드 이미지의 SHA-256. **캐시 키**로 사용 — `cache:{imageHash}:{module}:{variant}` 에 변환 결과 Blob 경로 저장, TTL 7일.
- `processedWebhookIds`: 멱등 처리용. 이미 처리한 웹훅 이벤트 ID는 스킵. 무한 증가를 막으려 최근 50개만 보관.
- **판매 단위가 2장이라 `previewUrl`/`hiResUrl` 단수가 아니다** (2026-09-01, C단계 Task 1). `$2.99`는 Simple + Detailed **둘 다**를 사므로 레코드는
  `variants: { simple?: { originalUrl, hiResUrl? }, detailed?: {...} }` 맵이다.
  `originalUrl` = 프리뷰 시점에 저장한 **워터마크 없는 모델 원본**, `hiResUrl` = 발급 시점에 A4 300dpi로 업스케일한 것. §(A)의 "결제 후 생성 안 함"이 이 두 필드의 분리에 걸려 있다.
- `fromModel`: 프리뷰가 실제 모델에서 왔는지. 로컬 트레이서 폴백 프리뷰는 팔 HD가 없으므로 `/api/checkout`이 `fromModel:false` 주문을 거부한다.
- **다운로드 URL은 Vercel Blob이라 S3식 만료 서명이 없다** (2026-09-01). 대신 `/api/download`가 게이트다 — 주문 상태를 확인한 뒤에만 URL(추측 불가·7일 후 삭제)을 302로 넘긴다. `/order/{orderId}`에서 몇 번이든 재발급.

## 3. 서버리스 함수 (api/ 폴더)

### 3-1. `POST /api/ai-preview` — **이미 존재한다 (§32)**

새로 만들지 말고 `api/ai-preview.ts`에 **덧붙일 것.**

현재 하는 일:

```
요청  { imageBase64, mimeType, module, otherWord }
응답  { previews: { simple, detailed } }   // 각각 data: URL
```

- Edge 런타임, **의존성 0** (순수 `fetch`). Gemini `generateContent` 직결
- §15의 `buildPrompt()`를 서버에서 조립. `sanitizeSubjectWord()` 재검증
- variant 2장 **병렬** 호출. 한 장이라도 실패하면 쌍 전체 실패
  (카드 한 장만 보여주면 구매 내용을 잘못 전달한다)
- 모델이 이미지를 안 주는 경우를 정상 경로로 처리 — 상태와 문구가 짝을 이룬다:

  | 상태 | 의미 | 클라이언트 |
  |---|---|---|
  | 422 | 모델 거절 (SAFETY / RECITATION) | 재시도 숨김, "무료 편집기로" |
  | 502 | 네트워크·응답 이상 | "Try again" |
  | 429 | 제공자 혼잡 | "Try again" |
  | 503 | `GEMINI_API_KEY` 없음 | 폴백 (에러 아님) |
  | 413 / 415 | 파일 크기·형식 | 재시도 숨김 |

**여기에 추가할 것 (순서대로):**

1. **Turnstile 토큰 검증** (`TURNSTILE_SECRET_KEY`). 실패 시 403
2. **레이트리밋**: IP당 3회/24h (Upstash `ratelimit:{ip}` INCR + EXPIRE). 초과 시 429 + 남은 시간.
   **요청 1회 = 2장 생성** 기준으로 셀 것.
   카운트는 **성공 시에만** 증가 — 실패한 요청으로 무료 횟수를 소모시키지 않는다
3. **캐시**: 이미지 SHA-256 → 키 `cache:{imageHash}:{module}:{variant}`.
   피사체 모듈이 프롬프트를 바꾸므로 **키에 반드시 포함**한다. 히트면 모델 호출 없이 반환
4. **저해상도화 + 워터마크**: 응답 이미지를 긴 변 800px로 줄이고 워터마크를 대각선 타일로
   픽셀 합성. Edge 런타임에서는 `sharp`를 못 쓰니 **Node 런타임으로 바꾸거나**
   (`export const config = { runtime: 'nodejs' }`) WASM 이미지 라이브러리를 쓸 것.
   **이 결정은 사용자에게 물어볼 것**
5. **워터마크 없는 원본을 Blob에 저장** — §(A)의 핵심이다. 결제 후에는 생성하지 않고 이것을 발급한다
6. **주문 생성** (`created` → `previewed`), 응답에 `orderId` 추가

**4·5번을 넣기 전까지는 결제를 열면 안 된다.** 지금 응답은 워터마크 없는 전체 결과를
그대로 내려주므로, 유료 상품이 프리뷰 단계에서 공짜로 나간다.

### 3-2. `POST /api/checkout`
1. 바디: `orderId`. 상태가 `previewed`인지 확인.
2. Lemon Squeezy Checkout API로 체크아웃 URL 생성. `checkout_data.custom.order_id`에 orderId를 심는다.
3. 상태 `checkout_pending` 전환 후 `{ checkoutUrl }` 반환. 프론트는 LS 오버레이(lemon.js)로 연다.

### 3-3. `POST /api/webhook` (Lemon Squeezy)
1. `X-Signature` 헤더를 `LEMONSQUEEZY_WEBHOOK_SECRET`으로 HMAC-SHA256 검증. **raw body**로 검증할 것(파싱된 JSON 재직렬화 금지). 실패 시 401.
2. 이벤트 ID가 `processedWebhookIds`에 있으면 200으로 즉시 종료(멱등).
3. `order_created`: custom data의 orderId로 레코드 조회 → `paid` 전환 → **고해상도 발급 실행**: 프리뷰 때 저장한 `variants.{simple,detailed}.originalUrl`(워터마크 없는 모델 원본)을 각각 A4 300dpi(긴 변 3508px)로 업스케일 → Blob 업로드 → `variants.*.hiResUrl` 채우고 `delivered`. **2장 다 성공해야 `delivered`.** §(A)대로 **모델을 다시 호출하지 않는다** — 업스케일만. 실패 시 `attempts` 증가, 최대 3회. 최종 실패 시 `failed` + `RESEND_API_KEY` 있으면 관리자 메일 발송.
4. `order_refunded`: 상태 `refunded`, `variants.*.hiResUrl`·`originalUrl` Blob 전부 삭제.
5. 함수 시간 초과 대비: 변환이 45초를 넘길 수 있으면 웹훅에서는 `paid`까지만 처리하고 변환은 `waitUntil` 백그라운드로 넘긴 뒤 즉시 200을 반환하는 구조로 작성.

### 3-4. `GET /api/download?orderId=...&variant=simple|detailed`
1. 상태 확인: `delivered`면 해당 variant의 `hiResUrl`로 **302 리다이렉트**(Vercel Blob은 만료 서명 URL이 없다 — 이 엔드포인트가 게이트다. URL은 추측 불가, blob은 7일 후 삭제). `variant` 생략 시 상태 JSON만 반환.
2. `paid`(발급 중)면 `{ status: "processing" }` — 프론트는 3초 폴링.
3. `failed`면 실패 안내 + 문의 메일 주소. 그 외 상태는 404.
4. orderId만 알면 다운로드 가능하므로 orderId는 추측 불가능한 길이(nanoid 21자)로 생성하고, 이 엔드포인트에도 IP 레이트리밋(20회/h)을 건다.
5. 손님 UX는 무료 다운로드와 동일하다 — `/thanks`의 "Download A4 HD" 버튼이 이 URL을 가리키는 `<a download>`이고, "Print"은 같은 바이트로 무료 편집기와 같은 인쇄 창을 연다. 복사할 링크를 노출하지 않는다.

## 4. 프론트엔드 변경

1~2번은 **이미 되어 있다** (§26·§28·§32). AI 진입 버튼, 피사체 선택, 프리뷰 2장, 가격 카드,
결제 후 HD 편집기가 전부 붙어 있고 단계별로 헤더 색이 바뀐다. 새로 만들지 말 것.

남은 것:

1. **Turnstile 위젯**을 `AiDemoPanel`의 "Generate my two previews" 앞에 넣고,
   토큰을 `requestAiPreview()`에 실어 보낸다 (`src/utils/aiPreview.ts`)
2. **`/api/checkout` 연결**: `src/utils/checkout.ts`의 `startCheckout()` 본문을 교체하고
   `CHECKOUT_MODE`를 `live`로. 그 함수가 유일한 이음매다 — 다른 파일을 고칠 필요 없다
3. **`/thanks?orderId=...` 페이지**: `/api/download` 폴링 → 완료 시 다운로드 버튼.
   "링크를 잃어버려도 이 주소로 다시 받을 수 있음" 문구 + 주문번호 표기.
   라우팅은 `src/utils/router.ts`에 경로 하나 추가하면 된다 (의존성 없는 자체 라우터)
4. **429 처리**: 남은 시간 안내 + "결제하면 제한 없이" 유도.
   `aiPreview.ts`가 이미 429를 재시도 가능으로 분류하므로 문구만 다듬으면 된다
5. **localStorage 복구 배너**: `orderId`를 남기고, 재방문 시 `paid`/`delivered`면
   "받지 못한 주문이 있습니다" 배너 (§(B) 3번)

**가격 표기는 `src/config.ts`의 `PRICE_USD`가 유일한 출처다** (현재 `2.99`).
본문 §5에 있던 `VITE_PRICE_DISPLAY`는 쓰지 않는다 — 출처가 둘이면 어긋난다.
실제 청구 금액은 Lemon Squeezy 상품 설정이 정하므로, **둘이 같은지 배포 전에 확인**할 것.

## 5. 환경변수 (.env.example 갱신)

```
GEMINI_API_KEY=
AI_MODEL_ID=
LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_STORE_ID=
LEMONSQUEEZY_VARIANT_ID=
LEMONSQUEEZY_WEBHOOK_SECRET=
TURNSTILE_SECRET_KEY=
VITE_TURNSTILE_SITE_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
BLOB_READ_WRITE_TOKEN=
RESEND_API_KEY=            # 선택: 실패 알림용
ADMIN_EMAIL=               # 선택
# VITE_PRICE_DISPLAY 는 쓰지 않는다 — 가격 출처는 src/config.ts 의 PRICE_USD 하나뿐 (§4)
```

## 6. 사용자가 직접 해야 하는 일 (Claude Code는 이 체크리스트를 문서 `SETUP_CHECKLIST.md`로 별도 생성할 것)

1. Vercel 가입 → GitHub 저장소 연결 → 프로젝트 생성, 리전 iad1
2. Vercel Marketplace에서 Upstash Redis, Vercel Blob 활성화
3. Google AI Studio에서 Gemini API 키 발급
4. Cloudflare 가입 → Turnstile 사이트 등록 → site key / secret key
5. Lemon Squeezy 가입 → Store 생성 → Single payment 상품/variant 생성(가격 설정) → API 키 → Webhook 등록(`https://<도메인>/api/webhook`, 이벤트: order_created, order_refunded) → **Test mode로 시작**
6. 위 값들을 Vercel 환경변수에 등록

## 7. 테스트 계획 (구현 완료 판정 기준)

Lemon Squeezy **Test mode** + Vercel Preview 배포에서 아래가 전부 통과해야 완료:

1. AI 프리뷰: 같은 이미지 2회 요청 시 두 번째는 캐시 히트(AI 모델 호출 로그 없음)
2. 레이트리밋: 4번째 요청에서 429, 응답에 재시도 가능 시각 포함
3. Turnstile 토큰 없이 요청 → 403
4. 테스트 카드 결제 → 웹훅 수신 → 30초 내 `delivered` → 다운로드 URL 정상, 워터마크 없음, 긴 변 3508px
5. 같은 웹훅 페이로드 재전송(LS 대시보드 resend) → 중복 변환 없음, 200
6. 서명 위조 웹훅 → 401
7. `/thanks` 페이지 새로고침/재방문 → 동일 orderId로 재다운로드 가능
8. API 키를 일부러 틀리게 넣고 결제 → `failed` 전환 확인, (설정 시) 관리자 메일 수신
9. `npm run lint`와 `npm run build` 무오류

## 8. 작업 순서

0번은 이미 끝났다. **1번부터 시작한다.**

| # | 작업 | 비고 |
|---|---|---|
| 0 | ~~`/api/ai-preview` (Gemini 직결)~~ | **완료 (§32)** — `GEMINI_API_KEY`만 넣으면 동작 |
| 1 | Redis/Blob 유틸 + 주문 상태 모듈 | 순수 함수로 분리해 테스트 가능하게 |
| 2 | `/api/ai-preview`에 캐시 + 레이트리밋 추가 | 기존 파일에 **덧붙이기** |
| 3 | 저해상도화 + 워터마크 + Blob 원본 저장 | 런타임 선택(Node vs WASM)은 **먼저 질문** |
| 4 | Turnstile (서버 검증 + 클라이언트 위젯) | |
| 5 | `/api/checkout` + lemon.js | `startCheckout()` 하나만 교체 |
| 6 | `/api/webhook` | 서명 검증 · 멱등 · 백그라운드 변환 |
| 7 | `/api/download` + `/thanks` 페이지 | |
| 8 | `SETUP_CHECKLIST.md` → 사용자 설정 → §7 테스트 | |

**3번을 끝내기 전에는 `CHECKOUT_MODE`를 `live`로 바꾸지 말 것.** 워터마크가 없으면
유료 결과물이 무료 프리뷰 단계에서 그대로 나간다.

각 단계 완료 시 **변경 파일 목록과 남은 리스크**를 짧게 보고할 것.
불명확한 결정(이미지 처리 런타임, 워터마크 문구, 가격 표기 위치 등)은
임의로 정하지 말고 사용자에게 질문할 것.

### 매 단계 확인

```bash
npm run lint     # tsc --noEmit
npm run build
```

두 개가 통과하지 않으면 다음 단계로 넘어가지 않는다.
