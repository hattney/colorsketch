# ColorSketch 배포 설정 체크리스트 (C단계)

> **최종 갱신 2026-09-04.** 현희님이 직접 하시는 계정 생성·키 발급 절차.
> Claude Code는 계정 생성·결제수단 입력·**API 키를 입력란에 넣는 일**을 대신 못 합니다(보안 규칙).
> 반면 **인프라 리소스 생성(스토어·환경변수)은 대행 가능**하며, 아래 0~3·6b가 그렇게 끝났습니다.
>
> 각 키가 없어도 앱은 안 죽습니다. 캐시·레이트리밋·워터마크·주문저장·결제가 하나씩 켜질 뿐입니다.

## 현재 진행 상황 (한눈에)

| # | 항목 | 상태 | 누가 |
|---|---|---|---|
| 0 | 코드 배포 (GitHub → Vercel) | ✅ 완료 | — |
| 1 | Vercel 프로젝트 설정 | ✅ 완료 | — |
| 2 | Upstash Redis | ✅ 완료 (09-04) | Claude 대행 |
| 3 | Vercel Blob | ✅ 완료 (09-04) | Claude 대행 |
| 6b | `CRON_SECRET` | ✅ 완료 (09-04) | Claude 대행 |
| **4** | **Google Gemini 키** | ⬜ **다음** | **현희님** |
| **5** | **Cloudflare Turnstile** | ⬜ | **현희님** |
| **6** | **Resend (선택)** | ⬜ | **현희님** |
| **7** | **Lemon Squeezy** | ⬜ | **현희님** |
| 9 | §7 테스트 9개 | ⬜ | 함께 |

**4번(Gemini)이 가장 먼저입니다** — AI 프리뷰가 실물로 나와야 워터마크 모양·품질을 눈으로
확인하고 나머지를 판단할 수 있습니다. 5·6·7은 그 뒤에 해도 됩니다.

---

## 0. 코드 배포 — ✅ 완료

- GitHub: `https://github.com/hattney/colorsketch` (`main`)
- Vercel: `auri12` 팀 → `colorsketch` 프로젝트, `main` 푸시 시 자동 배포
- **공개 프로덕션 주소: `https://colorsketch-amber.vercel.app`** ← 7번 웹훅 등록에 이 주소를 씁니다
  (배포별 URL인 `colorsketch-<해시>-auri12.vercel.app`은 Deployment Protection 때문에
  로그인 벽이 뜹니다. 외부에 주는 주소는 항상 위의 `-amber` 쪽입니다)

---

## 1. Vercel 프로젝트 설정 확인

vercel.com → 프로젝트 → **Settings**

| 항목 | 값 |
|---|---|
| Framework Preset | **Vite** |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Functions Region | **Washington, D.C., USA (iad1)** — `vercel.json`이 이미 지정하지만 대시보드에서도 확인 |
| Node.js Version | 20.x 이상 |

배포 로그에서 이것 두 개를 꼭 확인 (`api/ai-preview.ts`가 처음 배포되는 것이라):
- [ ] `api/ai-preview` 함수가 **Node.js** 런타임으로 빌드됐는지 (Edge 아님)
- [ ] `sharp` 관련 에러가 없는지

---

## 2. Upstash Redis (주문 상태·레이트리밋·캐시) — ✅ 완료 (2026-09-03, Claude가 대행)

`colorsketch-redis` (Upstash for Redis, Free — 월 500,000 커맨드, Washington D.C. iad1)
생성·프로젝트 연결 완료 (Production + Preview).

⚠️ **실제 자동 생성된 변수명은 체크리스트 예상과 다름**: 마켓플레이스 통합은
`KV_REST_API_URL` / `KV_REST_API_TOKEN` (+ `KV_URL`, `REDIS_URL`,
`KV_REST_API_READ_ONLY_TOKEN`)을 넣는다. `api/_lib/redis.ts`가 이 이름도
읽도록 수정됨 (커밋 `d025358`) — 추가 조치 불필요.

---

## 3. Vercel Blob (원본·완성 파일 저장) — ✅ 완료 (2026-09-03, Claude가 대행)

`colorsketch-blob` (Access: **Public**, 리전 iad1) 생성·프로젝트 연결 완료.
자동 추가된 변수: `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID`, `BLOB_WEBHOOK_PUBLIC_KEY`.

참고: 이전에 스토어 없이 홀로 존재하던 `BLOB_READ_WRITE_TOKEN`(정체불명, 현희님 확인 결과
직접 추가한 것 아님)은 현희님 승인 하에 삭제 후 재생성함.

무료 플랜: 저장 1GB + 전송 월 10GB. 파일은 7일 후 자동 삭제되므로 쌓이지 않습니다.

---

## 4. Google Gemini (AI 리터치 — Nano Banana) — ⬜ **다음 작업 (현희님)**

[aistudio.google.com](https://aistudio.google.com) → 로그인 → **Get API key** → **Create API key**

Vercel → Settings → Environment Variables 에 직접 추가:

| 변수 | 값 |
|---|---|
| `GEMINI_API_KEY` | 발급받은 키 (`AIza...`) |
| `AI_MODEL_ID` | `gemini-2.5-flash-image` — ⚠️ **발급 화면의 모델 목록에서 이미지 편집 모델 정확한 이름을 확인**하고 넣으세요. 이름이 자주 바뀝니다. 비워두면 이 기본값을 씀 |

- 결제 계정 연결이 필요할 수 있습니다(이미지 모델은 유료 티어). 사용량은 프리뷰당 2회 호출.
- [ ] 키를 Vercel에 넣고 재배포 → 업로드 → AI 프리뷰 생성 시 실제 선화 2장이 나오면 성공
      (안 나오면 폴백 트레이서 + "not AI output" 경고가 뜸)

---

## 5. Cloudflare Turnstile (봇 차단) — ⬜ 현희님

[dash.cloudflare.com](https://dash.cloudflare.com) → 가입 → 왼쪽 메뉴 **Turnstile** → **Add widget**

- Widget name: `ColorSketch`
- Domain: **`colorsketch-amber.vercel.app`** (나중에 커스텀 도메인도 추가)
- Widget Mode: **Managed** (기본)

발급되는 키 2개를 Vercel 환경변수에:

| 변수 | 어느 키 | 비고 |
|---|---|---|
| `VITE_TURNSTILE_SITE_KEY` | Site Key | **공개 키** — 브라우저에 노출돼도 정상. `VITE_` 접두사 맞음 |
| `TURNSTILE_SECRET_KEY` | Secret Key | 서버 전용. 절대 `VITE_` 붙이지 말 것 |

- 둘 다 넣어야 작동합니다. 하나만 넣으면: 사이트키만 → 위젯은 뜨는데 서버 검증 안 함 / 시크릿만 → 위젯 안 뜨는데 서버가 토큰을 요구해서 프리뷰가 막힘.
- [ ] 재배포 후 AI 프리뷰 화면에 "I'm not a robot" 체크박스가 뜨는지 확인

---

## 6. (선택) Resend — 발급 메일 + 실패 알림 — ⬜ 현희님

결제 완료 시 구매자에게 다운로드 링크 메일, 발급 3회 실패 시 관리자·구매자에게 메일이 갑니다.
없어도 앱은 돌아갑니다(다운로드는 `/thanks` 페이지 + localStorage 배너로 복구).

[resend.com](https://resend.com) → 가입 → API Keys → Create

| 변수 | 값 |
|---|---|
| `RESEND_API_KEY` | `re_...` |
| `RESEND_FROM` | `ColorSketch <noreply@내도메인>` — ⚠️ **Resend에서 도메인 검증을 해야** 구매자에게 메일이 나감. 미검증 상태면 계정 소유자(=`ADMIN_EMAIL`)에게만 전송됨 → 테스트 땐 관리자 알림만 확인 가능 |
| `ADMIN_EMAIL` | 알림 받을 주소 (gold.auri26@gmail.com 등) |

---

## 6b. CRON_SECRET — 7일 자동 삭제 보호 (필수) — ✅ 완료 (2026-09-03, Claude가 대행)

Secret 타입으로 Production + Preview에 등록됨 (48자 랜덤 hex). 값은 Vercel에만 저장.

---
<details><summary>원래 안내 (참고용)</summary>

Vercel Blob은 자동 만료가 없어서 매일 도는 정리 작업(`api/cron/cleanup.ts`)이 7일 지난
이미지를 지웁니다. Terms의 "7일 내 삭제" 약속이 여기 달려 있습니다.

| 변수 | 값 |
|---|---|
| `CRON_SECRET` | 아무 긴 랜덤 문자열 (예: `openssl rand -hex 24` 결과). Vercel이 cron 호출 시 `Authorization: Bearer <값>`으로 보냄 → 이게 없으면 URL 아는 사람이 정리 작업을 트리거할 수 있음 |

`vercel.json`에 cron 스케줄(`매일 03:00`)이 이미 있으니, 이 변수만 넣으면 됩니다.
</details>

---

## 7. Lemon Squeezy (결제) — ⬜ 현희님 (코드는 완료, 진행 가능)

1. [lemonsqueezy.com](https://lemonsqueezy.com) 가입 → **Store** 생성
   - 국가: **Republic of Korea (ROK)** (정산 지원 국가)
   - 사업자 정보 입력 (약관·환불정책 페이지의 정보와 일치해야 함)
2. **Products → New Product**
   - 이름: `ColorSketch — AI HD coloring page (2 styles)`
   - 가격: **$2.99** — `src/config.ts`의 `PRICE_USD`와 **반드시 일치**
   - 결제 유형: **Single payment** (구독 아님)
   - "Redirect after purchase": 비워둬도 됨. 코드(`api/checkout.ts`)가 체크아웃 생성 시
     `https://<도메인>/thanks?order={주문id}`로 자동 지정함
3. **Settings → API** → API key 발급
4. **Settings → Webhooks → Add endpoint**
   - URL: **`https://colorsketch-amber.vercel.app/api/webhook`**
   - Signing secret: 아무 긴 문자열 생성해서 저장 (아래 `LEMONSQUEEZY_WEBHOOK_SECRET`에 씀)
   - 이벤트: **`order_created`**, **`order_refunded`** 만 체크 (구독 이벤트 불필요)
5. **Test mode 켜기** (스토어 우상단 토글) — 실제 청구 없이 테스트 카드로 검증
6. ⚠️ **$10 미만 상품 커스텀 요율**: LS 문서에 "$10 미만은 세일즈팀에 문의" 명시. **support@lemonsqueezy.com 에 문의** ("single payment product under $10, requesting custom rate")

Vercel 환경변수:

| 변수 | 어디서 |
|---|---|
| `LEMONSQUEEZY_API_KEY` | Settings → API |
| `LEMONSQUEEZY_STORE_ID` | Store 설정 URL의 숫자, 또는 Settings → Stores |
| `LEMONSQUEEZY_VARIANT_ID` | 상품 → variant의 ID (상품이 단일이면 자동 생성된 variant) |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | 4번에서 만든 signing secret |

---

## 8. 환경변수 전체 요약

Vercel → Settings → Environment Variables. **Production + Preview 둘 다** 체크해서 추가하세요.

**2026-09-04 기준 실제 등록 현황** (Vercel `colorsketch` 프로젝트, 전부 Production + Preview):

| 변수 | 출처 | 상태 | 없으면 |
|---|---|---|---|
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | 2번 (자동) | ✅ | 캐시·레이트리밋·주문저장 없음 → 결제 불가 |
| `KV_URL` / `REDIS_URL` / `KV_REST_API_READ_ONLY_TOKEN` | 2번 (자동) | ✅ | 코드가 안 씀 (Upstash가 함께 넣는 것) |
| `BLOB_READ_WRITE_TOKEN` | 3번 (자동) | ✅ | 원본 저장 없음 → 결제 불가 |
| `BLOB_STORE_ID` / `BLOB_WEBHOOK_PUBLIC_KEY` | 3번 (자동) | ✅ | 코드가 안 씀 |
| `CRON_SECRET` | 6b번 | ✅ | 7일 정리 작업이 무인증 노출 |
| `VITE_CHECKOUT_MODE` | 아래 참고 | ✅ | 프로덕션은 자동으로 `disabled` |
| **`GEMINI_API_KEY`** | **4번** | ⬜ | AI 프리뷰가 폴백 트레이서로 (경고 표시) |
| `AI_MODEL_ID` | 4번 | ⬜ | 기본값 `gemini-2.5-flash-image` 사용 |
| **`VITE_TURNSTILE_SITE_KEY`** | **5번** | ⬜ | 봇 위젯 안 뜸 |
| **`TURNSTILE_SECRET_KEY`** | **5번** | ⬜ | 서버 봇 검증 안 함 |
| `RESEND_API_KEY` / `RESEND_FROM` / `ADMIN_EMAIL` | 6번 | ⬜ | 발급·실패 메일 안 감 (앱은 정상, `/thanks`로 복구) |
| **`LEMONSQUEEZY_API_KEY`** | **7번** | ⬜ | 결제 불가 |
| **`LEMONSQUEEZY_STORE_ID`** | **7번** | ⬜ | 결제 불가 |
| **`LEMONSQUEEZY_VARIANT_ID`** | **7번** | ⬜ | 결제 불가 |
| **`LEMONSQUEEZY_WEBHOOK_SECRET`** | **7번** | ⬜ | `/api/webhook` 503 → 결제돼도 발급 안 됨 |

> ⚠️ **Redis 변수 이름 주의.** 문서 초안은 `UPSTASH_REDIS_REST_URL`/`_TOKEN`을 가정했지만
> Vercel 마켓플레이스 Upstash 통합은 **`KV_REST_API_URL`/`KV_REST_API_TOKEN`**(레거시 Vercel KV
> 이름)을 넣습니다. `api/_lib/redis.ts`가 둘 다 읽도록 고쳐졌으므로(커밋 `d025358`)
> 어느 쪽이 들어와도 동작합니다. 직접 손으로 넣을 일은 없습니다.

### `VITE_CHECKOUT_MODE`

| 단계 | 값 | 현재 |
|---|---|---|
| 키 넣는 중 | **설정 안 함**(= `disabled`) 또는 `mock`(검토용) | ← **지금 여기** |
| Gemini 키 들어간 뒤 | `mock` 유지하며 실제 AI 프리뷰·워터마크를 눈으로 확인 | |
| 모든 키 세팅 + §7 테스트 9개 통과 후 | `live` | |

환경변수를 바꾸면 **재배포(Redeploy)** 해야 반영됩니다.

---

## 9. 완료 검증 (Claude와 함께)

모든 키가 들어가고 `VITE_CHECKOUT_MODE=live` + Lemon Squeezy **Test mode**에서
`PHASE2_GUIDE.md` §7의 테스트 9개를 실행합니다:

1. 같은 이미지 2번 요청 → 2번째 캐시 히트 (`x-colorsketch-cache: hit` 헤더)
2. 프리뷰 4번째 요청 → 429 + 재시도 가능 시각
3. Turnstile 토큰 없이 요청 → 403
4. 테스트 카드 결제 → 웹훅 → 30초 내 `delivered` → 다운로드 정상, 워터마크 없음, 긴 변 3508px
5. 같은 웹훅 재전송 → 중복 발급 없음, 200
6. 서명 위조 웹훅 → 401
7. `/thanks` 새로고침/재방문 → 같은 주문번호로 재다운로드
8. API 키 일부러 틀리게 → `failed` 전환 (+ 설정 시 관리자 메일)
9. `npm run lint` + `npm run build` 무오류

---

## 10. 도메인 붙이기 직전 (런칭 체크)

- [ ] `src/config.ts`의 `CONTACT_EMAIL`이 실제 받는 주소인지
- [ ] `PRICE_USD`(2.99)가 Lemon Squeezy 상품 가격과 같은지
- [ ] 약관·환불정책의 사업자 정보가 실제인지
- [ ] `index.html`의 `<meta name="robots" content="noindex, nofollow">` **제거** (AI·결제가 실제로 붙는 날)
- [ ] Cloudflare Turnstile 위젯에 커스텀 도메인 추가
- [ ] Lemon Squeezy **Test mode 끄기**
