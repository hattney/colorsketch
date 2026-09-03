# C단계 (결제 인프라) 진행 상태 — v2 (2026-09-02)

> **이 문서의 목적.** C단계(= `PHASE2_GUIDE.md`) 코드 구현이 어디까지 됐고, `SETUP_CHECKLIST.md`가
> 요구한 항목이 코드에 실제로 어떻게 반영됐으며, 검토자(페이블)가 무엇을 봐야 하는지.
>
> **읽는 순서.** `START_HERE.md` → `PHASE2_GUIDE.md`(불변식 8개) → 이 문서 → 필요한 소스.
> `CONTENT_UPDATE.md` §0~§32는 A/B단계 확정 사양이라 이 문서와 충돌하지 않는다.

---

## 0. 한 줄 요약

**Task 1~7 코드 구현 완료. GitHub `hattney/colorsketch` `main`. Vercel 프로덕션 배포됨.**
첫 배포에서 `FUNCTION_INVOCATION_FAILED` (전 API 함수) → **원인 확정·수정 완료**. 현재 배포에서
모든 함수가 키 없이도 정상 응답(`503`/`404`)하고, sharp 런타임 로드 확인됨. 무료 변환기·`/thanks`
라우트 라이브 확인. 아직 실 키(Gemini·Upstash·Blob·Turnstile·Lemon Squeezy)는 없고 `CHECKOUT_MODE` `disabled`.

| 커밋 | 내용 |
|---|---|
| `8ae5e1c` | 임시 진단 엔드포인트 제거 |
| `9008191` | **`loadOrder`가 Redis 미설정 시 null 반환** (`/api/download` 500 → 404) |
| `5b006c1` | **★ 진짜 원인 수정** — `api/**` 상대 import에 `.js` 확장자 추가 (Node ESM 필수) |
| `73e5429` | (임시) `/api/diag` — 어느 모듈이 터지는지 격리 |
| `abc0ef2` | (헛발) ESM 전용 `nanoid` 제거 + 인라인화 — 원인 아니었으나 의존성 줄여 유지 |
| `a9a2505` | (헛발일 가능성) `export default` → `export function POST/GET` — 정상 패턴이라 유지 |
| `2ba0256` | 이 문서(v1) + `SETUP_CHECKLIST`/`START_HERE` 갱신 |
| `d5eb66f` | Task 7 — `/api/download` + `/thanks` + 7일 blob 스윕 |
| `5bd02af` | Task 6 — `/api/webhook` + 발급 |
| `2959be8` | Task 5 — `/api/checkout` + Lemon Squeezy |
| `cab7d37` | Task 1~4 — 인프라 유틸 + 캐시/레이트리밋 + 워터마크/주문생성 + Turnstile |

### 이번에 배운 것 (페이블 주의)

- **이 프로젝트는 `package.json`에 `"type": "module"`.** Vercel은 `api/**` 함수를 **네이티브 ESM**으로
  빌드하고, Node ESM은 상대경로 import에 **`.js` 확장자를 강제**한다. `tsc --noEmit`·`vite build`는
  확장자 없어도 통과하므로 **로컬 검증만으론 안 잡힌다.** 새 `api/` 파일은 반드시 `from './x.js'` 형태로.
  (`api/cron/cleanup.ts`만 상대 import가 없어서 유일하게 살아 있었다 — 디버깅의 결정적 단서.)
- `nanoid` 같은 ESM 전용 패키지도 잠재 위험. 지금은 `api/`에서 npm 의존성이 `@vercel/blob`·`sharp` 둘뿐.

---

## 1. Task별 구현 현황

`PHASE2_GUIDE.md` §8 작업 순서 기준. 각 항목의 근거·불변식은 그 문서를 따랐다.

| # | 작업 | 상태 | 핵심 파일 |
|---|---|---|---|
| 1 | Redis/Blob 유틸 + 주문 상태 머신 | ✅ 코드 | `api/_lib/{redis,blob,ids,order}.ts` |
| 2 | `/api/ai-preview` 캐시 + 레이트리밋 | ✅ 코드 | `api/_lib/{cache,ratelimit}.ts`, `api/ai-preview.ts` |
| 3 | 저해상도화 + 워터마크 + Blob 원본 + 주문 생성 | ✅ 코드 | `api/_lib/image.ts`, `api/ai-preview.ts` |
| 4 | Turnstile (서버 검증 + 클라 위젯) | ✅ 코드 | `api/_lib/turnstile.ts`, `src/components/Turnstile.tsx` |
| 5 | `/api/checkout` + 결제 진입 | ✅ 코드 | `api/checkout.ts`, `src/utils/checkout.ts` |
| 6 | `/api/webhook` (서명·멱등·발급) | ✅ 코드 | `api/webhook.ts`, `api/_lib/{deliver,email}.ts` |
| 7 | `/api/download` + `/thanks` | ✅ 코드 | `api/download.ts`, `src/pages/Thanks.tsx` |
| — | 7일 Blob 삭제 (가이드엔 없지만 Terms §8이 약속) | ✅ 코드 | `api/cron/cleanup.ts`, `vercel.json` crons |
| 8 | SETUP_CHECKLIST → 사용자 설정 → §7 테스트 9개 | ⬜ **미실행** | — |

**검증:** `npm run lint` + `npm run build` 무오류. `mock` 모드 전체 퍼널(업로드→AI 데모→
폴백 프리뷰→가짜 결제→`ai-hd` 편집기), `/thanks` 라우트 3개 상태, 무료 변환기 — 로컬·프로덕션 확인.
**서버 API 로직 실검증**은 키 등록 후(§7).

---

## 2. 아키텍처 요약 (파일 지도)

```
api/
  ai-preview.ts   POST. Turnstile검증 → 레이트리밋게이트 → (캐시 or Gemini) 2장 병렬
                  → sharp 워터마크+800px → 워터마크없는 원본 Blob 저장 → 주문 previewed
                  → { previews, orderId }
  checkout.ts     POST { orderId }. 주문 previewed 확인 → LS 체크아웃 생성(custom.order_id)
                  → previewed→checkout_pending → { checkoutUrl }
  webhook.ts      POST. raw-body HMAC-SHA256(X-Signature) → 멱등(event:lsOrderId)
                  order_created → paid → deliverOrder() (동기)
                  order_refunded → refunded + blob 삭제
  download.ts     GET ?order=&variant=. orderId가 유일 자격증명 + 20/h IP.
                  delivered+variant → 302 to blob?download=1
                  paid/failed → 락 걸고 deliverOrder() 재시도 → processing/failed
  cron/cleanup.ts GET (vercel cron, 매일 03:00). 7일 지난 Blob 삭제. CRON_SECRET로 보호
  _lib/
    redis.ts      Upstash REST 래퍼(fetch만). getJSON/setJSON/incr+window/pttl/lock.
                  키 없으면 RedisNotConfigured throw
    blob.ts       Vercel Blob. putBytes(path, bytes, {contentType, addRandomSuffix}).
                  order 이미지는 suffix 없음(orderId가 이미 추측불가) + allowOverwrite
    ids.ts        newOrderId=21자 URL-safe(nanoid 알고리즘 인라인, 의존성 없음), sha256HexOfBase64
    order.ts      상태머신. 순수: canTransition/applyTransition/markWebhookProcessed.
                  Redis접촉: loadOrder/saveOrder/createOrder. TTL 7일
    cache.ts      cache:{hash}:{module}:{otherWord}:{variant} → Blob URL. TTL 7일
    ratelimit.ts  checkRateLimit(읽기전용)/consumeRateLimit(성공시)/claimFreshInput(재요청 무료)
    image.ts      sharp. watermarkedPreview(800px+대각타일), upscaleToA4(2480×3508 contain)
    turnstile.ts  siteverify. TURNSTILE_SECRET_KEY 없으면 통과
    deliver.ts    deliverOrder(orderId, origin) — 저장된 원본 업스케일만(모델 호출 0).
                  variant별 멱등·재개, 3회 실패 → failed + 이메일
    email.ts      Resend. 구매자 발급메일 / 관리자 실패알림 / 구매자 사과. 전부 best-effort
src/
  components/Turnstile.tsx          site key 없으면 null 반환. 시도마다 리마운트(토큰 1회용)
  components/OrderRecoveryBanner.tsx localStorage 흔적 → 유효·결제된 주문일 때만 배너
  pages/Thanks.tsx                  /thanks?order=. /api/download 3초 폴링. 스타일별 다운로드/인쇄
  utils/checkout.ts                 startCheckout(orderId) → CheckoutOutcome.
                                    live = /api/checkout → LS로 전체 페이지 리다이렉트
  utils/orderRecovery.ts            localStorage remember/forget/get
  utils/aiPreview.ts                requestAiPreview(img, module, word, turnstileToken?) → {previews, orderId?}
```

주문 상태 머신:
```
created → previewed → checkout_pending → paid → delivered
                  ↘ (webhook 우선) ↗        ↘ 3회 실패 → failed
어느 상태서든 → refunded
```

---

## 3. SETUP_CHECKLIST 항목이 코드에 실제로 어떻게 반영됐나

체크리스트에서 현희님이 하기로 한 것 ↔ 코드가 그 값을 어떻게 쓰는지 / 없으면 어떻게 되는지.

| 체크리스트 | 환경변수 | 코드가 쓰는 곳 | **없을 때 동작 (중요)** |
|---|---|---|---|
| 0. 코드 배포 | — | GitHub `hattney/colorsketch` → Vercel 자동 배포. `git init` 완료, `.gitattributes`(eol=lf) 추가됨 | — |
| 1. Vercel 설정 | — | `vercel.json`: `regions:["iad1"]`, cron, SPA rewrite. 빌드 로그상 함수 5개 컴파일·sharp 에러 없음 확인됨 | — |
| 2. Upstash Redis | `UPSTASH_REDIS_REST_URL`, `_TOKEN` | 주문 상태·캐시·레이트리밋·락 전부 | `RedisNotConfigured` → **캐시/레이트리밋/주문저장 모두 스킵**, AI 프리뷰는 계속 동작(orderId 없음) → **체크아웃 자동 불가** |
| 3. Vercel Blob | `BLOB_READ_WRITE_TOKEN` | 워터마크 없는 원본·HD·캐시 이미지 저장 | `blobConfigured()` false → 주문 생성 스킵 → orderId 없음 → 체크아웃 불가 |
| 4. Gemini | `GEMINI_API_KEY`, `AI_MODEL_ID` | `api/ai-preview.ts` Gemini 직결 | 503 → 클라가 **로컬 트레이서 폴백** + "not AI output" 경고 (§32 정직성). `AI_MODEL_ID` 기본 `gemini-2.5-flash-image` |
| 5. Turnstile | `VITE_TURNSTILE_SITE_KEY`(공개), `TURNSTILE_SECRET_KEY` | 위젯 렌더 / `siteverify` | site key 없으면 위젯 안 뜸(`turnstileRequired=false`), secret 없으면 서버 검증 스킵. **둘 다 있어야 실제 차단** |
| 6. Resend | `RESEND_API_KEY`, `RESEND_FROM`, `ADMIN_EMAIL` | `api/_lib/email.ts` | 전부 no-op. 발급/실패 메일 안 감 (앱은 정상). `RESEND_FROM`은 **검증된 도메인 필요** — 없으면 구매자 메일 실패, 관리자 메일은 계정 소유자 주소로 감 |
| 7. Lemon Squeezy | `LEMONSQUEEZY_API_KEY`, `_STORE_ID`, `_VARIANT_ID`, `_WEBHOOK_SECRET` | `api/checkout.ts`(생성), `api/webhook.ts`(검증·발급) | API/STORE/VARIANT 없으면 `/api/checkout` 503. WEBHOOK_SECRET 없으면 `/api/webhook` 503 |
| (신규) 7일 스윕 | `CRON_SECRET` | `api/cron/cleanup.ts` 인증 | 없으면 인증 없이 실행됨(URL 알면 누구나 트리거). **반드시 설정** |
| 스위치 | `VITE_CHECKOUT_MODE` | `src/utils/checkout.ts` | 미설정 = 프로덕션 `disabled` / dev `mock`. **모든 키 + §7 통과 후에만 `live`** |

### 체크리스트에 추가할 항목 (Task 5·6·7에서 새로 생김)

`SETUP_CHECKLIST.md` 7번(Lemon Squeezy)에 넣어야 함:

1. **상품 "Redirect after purchase" URL** = `https://<배포도메인>/thanks?order={order_id}`
   — 실제로는 `api/checkout.ts`가 체크아웃 생성 시 `product_options.redirect_url`에 넣으므로
   LS 대시보드 설정은 선택. 하지만 이메일 영수증 버튼 텍스트만 대시보드에서.
2. **웹훅 이벤트**: `order_created`, `order_refunded` (구독 이벤트 불필요)
3. **`CRON_SECRET`** 환경변수 (아무 긴 랜덤 문자열)
4. `RESEND_FROM`은 도메인 검증 전이면 구매자 메일이 안 나감 — 테스트 땐 관리자 알림만 확인

---

## 4. 가이드(PHASE2_GUIDE)와 다르게 구현한 부분 — 검토 필요

전부 의도적. 각각 근거 있음. 페이블이 동의하는지 봐야 할 지점.

| 항목 | 가이드 | 실제 구현 | 근거 |
|---|---|---|---|
| **주문 레코드** | `previewUrl`/`hiResUrl` 단수 | `variants: { simple?, detailed? }` 맵 (`{originalUrl, hiResUrl?}`) | $2.99 = 2장. `PHASE2_GUIDE.md` §2 갱신함 |
| **다운로드 URL** | "서명된 24h URL" | Vercel Blob은 서명 URL 없음. `/api/download`가 게이트(상태 확인 후 302 to `blob?download=1`) | Blob 제약. `PHASE2_GUIDE.md` §3-4 갱신함 |
| **결제 진입** | lemon.js 오버레이 | 전체 페이지 리다이렉트 (`window.location.assign(checkoutUrl)`) | 오버레이는 팝업 닫으면 버튼 멈춤. `/thanks`가 어차피 복귀점. 엔드포인트가 URL 반환하므로 나중에 오버레이 얹기 가능 |
| **웹훅 발급** | "45초 넘으면 `waitUntil` 백그라운드" | 동기 실행 | 모델 호출 0(업스케일만) → ~4-8초. `deliverOrder` 멱등·재개 → LS 재시도로 타임아웃 복구. `@vercel/functions` 의존성 회피 |
| **발급 재시도 구동** | 명시 안 됨 | `/api/download`가 `paid` 상태 볼 때 락 걸고 `deliverOrder` 재호출 | LS 재시도가 3회 전에 멈춰도 `/thanks` 폴링이 이어감 |
| **7일 Blob 삭제** | "보존 7일" (메커니즘 없음) | `api/cron/cleanup.ts` + `vercel.json` cron (매일) | Vercel Blob은 TTL 없음. Terms §8 약속을 지키려면 필수 |
| **레이트리밋 카운트** | "IP당 3회/24h, 성공 시" | + `claimFreshInput`: 같은 (IP,이미지,피사체) 재요청은 카운트 0 (캐시로 응답) | 탭 닫고 다시 열기 벌주지 않음 |
| **핸들러 시그니처** | (없음) | `export async function POST/GET` (Vercel Node web handler) | `a9a2505` — `export default`도 됐을 수 있으나 named export가 정상 패턴 |
| **상대 import 확장자** | (없음) | `api/**` 전부 `from './x.js'` | `5b006c1` — Node ESM 필수. 이게 첫 배포 크래시의 진짜 원인 |

---

## 5. 미해결 / 리스크 (페이블 검토 최우선)

### ✅ 해결됨 (v1 → v2)

- **`FUNCTION_INVOCATION_FAILED` (전 API 함수).** 원인 = `api/**` 상대 import에 `.js` 확장자 없음
  (Node ESM 필수). `5b006c1`에서 전부 추가. 임시 `/api/diag`로 격리 확인 후 `8ae5e1c`에서 제거.
  후속으로 `loadOrder`가 Redis 미설정 시 throw하던 것도 `9008191`에서 null 반환으로 수정.
  현재 프로덕션: 전 함수가 키 없이 `503`/`404` 정상 응답, `/api/diag` 시절 sharp 포함 모든 모듈 로드 `ok` 확인.

### 🔴 검증 안 됨 — 키 넣어야 확인 가능

1. **Gemini 응답 파싱** — `extractImage`/`refusalReason`이 현재 모델 응답 포맷과 맞는지 (§32 코드,
   실호출 미검증). `AI_MODEL_ID` 실제 이름 확인 필요.
2. **sharp 실행 결과** — 모듈 로드는 확인됨. 실제 `watermarkedPreview`/`upscaleToA4` 출력물,
   특히 워터마크 **모양**(불투명도 14%, 대각선 타일)은 실 AI 결과로 눈 확인 필요 — `image.ts` 상수로 조절.
3. **Lemon Squeezy Checkout API 페이로드** (`api/checkout.ts`) — JSON:API 형식, `relationships.store`/
   `variant` id를 문자열로 넣음. 실 스토어로 미검증.
4. **LS 웹훅 페이로드 필드명** (`api/webhook.ts`) — `meta.event_name`, `meta.custom_data.order_id`,
   `data.id`, `data.attributes.user_email`. LS 문서 기준, 실 전송 미검증.
5. **`X-Signature` 검증** — hex HMAC-SHA256 of raw body. 헤더 케이싱/인코딩 첫 웹훅에서 확인 (§7 테스트 #6).
6. **`?download=1`** — Vercel Blob 강제 다운로드 쿼리. 실제 동작·파일명 확인.
7. **`redirect_url` origin** — `req.headers.get('origin') || host`로 구성. Vercel 프록시 뒤에서 공개
   도메인 맞는지.

### 🟡 설계상 알아둘 것

- **CGNAT/공유 IP**: `claimFreshInput`이 (IP,해시,피사체) 기준 → 인기 샘플 이미지가 다른 사용자에게
  "이미 제공됨"으로 뜰 수 있음. 그 사용자 카운트만 관대해짐(결과는 동일). 무해로 판단.
- **레이트리밋 check→consume 레이스**: 동시 요청 시 3개를 살짝 넘길 수 있음. 무료 티어라 허용.
- **`processedWebhookIds` 50개 캡**: 한 주문이 50개 넘는 웹훅을 받을 일 없음. OK.
- **환불 시 캐시 blob 유지**: 주문 blob만 삭제. 공유 `cache:` blob은 다른 구매자가 같은 해시를
  정당하게 가질 수 있어 안 지움. 7일 cron이 수거.
- **`deliverOrder` 동시 실행**: 웹훅 + `/api/download` 폴링이 겹칠 수 있음. `/api/download`는
  `lock:deliver:{orderId}` NX 락. 웹훅은 락 안 검(동기라 짧음). variant별 멱등이라 최악의 경우
  중복 업스케일 1회. 허용.
- **`/order/{orderId}` 별도 페이지**: 안 만듦. `/thanks?order=`가 만료 없이 재접근 가능해 동일 역할.
  FAQ #7 문구("revisit the link with your order number")와 일치.

### 🟢 의도적으로 안 한 것

- 업로드 내용 검사/차단 없음 (§32 정책 — 경고 텍스트만, 제공자 정책은 서버서 적용됨)
- lemon.js 오버레이 (위 §4)
- 자동 테스트 (vitest 등) — 순수 함수는 테스트 가능하게 분리해뒀으나 미작성. **§8에서 최소한만 추가 예정**

---

## 6. 페이블에게 — 검토 요청

### 우선순위 1: 결제·발급 무결성 (돈이 걸린 경로)

- `api/webhook.ts` — 서명 검증이 raw body인지(재직렬화 아님), 멱등 키가 충분한지, `order_created`
  외 이벤트를 안전하게 무시하는지, `previewed→paid` 허용이 위험하지 않은지.
- `api/_lib/deliver.ts` — "결제 후 모델 호출 0" 불변식이 진짜 지켜지는지. variant별 멱등/재개가
  타임아웃·중복 웹훅·환불 동시성에서 안전한지. `attempts` 카운트가 무한루프 안 만드는지.
- `api/_lib/order.ts` — 상태 전이표(`NEXT`)에 구멍 없는지. `canTransition`이 결제 전 상태로
  되돌아가는 경로를 막는지.
- `api/checkout.ts` — `fromModel:false`(폴백 프리뷰) 주문 거부, 이미 결제된 주문 처리.

### 우선순위 2: 시크릿·경계

- `PHASE2_GUIDE.md` 불변식 8개 전수 대조. 특히:
  - 시크릿에 `VITE_` 접두사 없는지 (`.env.example` 전체)
  - 클라이언트 번들에 키 안 실리는지 (`npm run build` 후 `dist/assets/*.js` grep)
  - 결제 완료 판정이 웹훅뿐인지 (리다이렉트 쿼리로 발급 안 하는지 — `Thanks.tsx`는 폴링만)
- `api/download.ts` — orderId만으로 남의 주문 못 여는지(nanoid 21 엔트로피), 레이트리밋.

### 우선순위 3: 클라이언트 플로우 회귀

- `src/components/Editor.tsx` — Task 3~7에서 `orderId` 상태, `generateDemo(token?)`,
  `handleCheckout` 유니온 처리, `rememberOrder` 추가됨. §26·§28 3단계 편집기 동작 안 깨졌는지.
- `src/components/AiDemoPanel.tsx` — Turnstile 게이트가 `turnstileRequired=false`(키 없음)일 때
  완전 무해한지. `fireGenerate`가 토큰을 제대로 싣는지.
- `src/utils/checkout.ts` — `mock` 모드 동작이 기존과 동일한지(리뷰 배포용).

### 우선순위 4: 불명확한 결정

- 워터마크 문구·강도 (`api/_lib/image.ts`의 `WATERMARK_TEXT`, `fill-opacity 0.14`)
- 발급을 동기로 한 것 (§4) — waitUntil이 나은지
- 7일 cron 스케줄·범위 (`api/cron/cleanup.ts` — `list()` 전체 순회, 대량이면 느림)

### 검토 방법

```bash
npm install
npm run lint          # tsc --noEmit — 통과해야 함 (단, 확장자 누락은 못 잡는다 — §0 참고)
npm run build         # dist/ — 통과해야 함
npm run dev           # mock 모드 퍼널만 로컬 확인 가능 (vite dev엔 api/ 라우트 없음)
```

- **라이브 API 스모크**: `https://colorsketch-auri12.vercel.app/api/*` 에 Protection Bypass
  토큰(현희님께 요청) 붙여 호출. 키 없이도 `503`/`404`가 정상.
- **`api/` 로직 실검증**은 `SETUP_CHECKLIST.md` 2~7번 키 등록 + `PHASE2_GUIDE.md` §7 테스트.
- **새 `api/` 파일을 만들면 상대 import에 반드시 `.js`** (lint·build는 통과시켜도 런타임에서 터진다).

---

## 7. 다음 작업 (§8)

1. ~~배포 크래시 수정~~ ✅ 완료 (`5b006c1`/`9008191`)
2. ~~`SETUP_CHECKLIST.md` 신규 항목 반영~~ ✅ 완료 (CRON_SECRET, RESEND_FROM, LS 갱신)
3. **현희님이 `SETUP_CHECKLIST.md` 2~7번 진행 → Vercel 환경변수 등록** ← 지금 여기
   - 2 Upstash / 3 Blob / 4 Gemini / 5 Turnstile / 6 Resend / 6b CRON_SECRET / 7 Lemon Squeezy
4. 키 넣고 재배포 → 실호출 검증: AI 프리뷰 실제 결과 + 워터마크 모양, 캐시 히트 헤더, 429
5. `VITE_CHECKOUT_MODE=live` (Preview에서만 먼저) + LS Test mode → `PHASE2_GUIDE.md` §7 테스트 9개
6. (선택) `api/_lib/order.ts`·`deliver.ts` 순수 함수 vitest 최소 테스트
7. 통과 후: `index.html`의 `noindex` 제거, LS Test mode 해제, 도메인 연결 (`DEPLOY.md` 런칭 체크)

---

## 8. 배포 정보

- GitHub: `https://github.com/hattney/colorsketch` (`main`) — 이 문서 이후 커밋이 최신일 수 있음, `git log` 확인
- Vercel: 프로젝트 연결됨(`auri12` 팀), `main` 푸시 시 자동 배포. 리전 `iad1`. 빌드·배포 정상.
- 프로덕션 URL: `https://colorsketch-auri12.vercel.app`
- Deployment Protection: **Standard Protection 켜짐**. 검토용 접근은 Vercel 팀 로그인 또는
  Protection Bypass 토큰(`Settings → Deployment Protection → Protection Bypass for Automation`).
- 현재 실 키 0개. `CHECKOUT_MODE` 미설정(= `disabled`). 무료 변환기·랜딩·`/thanks` 라이브 정상.
- 함수 상태: `/api/{ai-preview,checkout,webhook,download}` → 키 없으면 `503`, `/api/download` 미존재 주문 → `404`.
  `/api/cron/cleanup` → Blob 없으면 `503`. 모두 크래시 없음.
