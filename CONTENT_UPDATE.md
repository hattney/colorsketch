# ColorSketch 콘텐츠 & 랜딩 페이지 작업 지시서

> 이 문서의 영문 카피는 **사용자 컨펌 완료본**입니다. 임의로 문구를 바꾸지 말고 그대로 사용하세요.
> 개정이 필요하면 원문을 지우지 말고 개정 사유와 날짜를 함께 남깁니다.
>
> 가격은 **$2.99로 확정**(§7). 절 번호가 클수록 최신이며, 충돌하면 나중 절이 우선합니다.

---

## §0. 구현 현황 (2026-08-26 기준)

이 문서는 이제 **작업 지시서가 아니라 확정 사양서**로 읽으세요. 아래는 각 절이 코드의 어디에 반영됐는지입니다.

| 절 | 상태 | 반영 위치 |
|---|---|---|
| §1 즉시 수정 | ✅ | `Header.tsx`(How it works 제거), `Footer.tsx`(mailto) |
| §2 페이지 구조 | ✅ | `App.tsx` |
| §3 히어로 | ✅ | `Hero.tsx`, `Steps.tsx` |
| §4 샘플 섹션 | ⛔ **폐기** | §13이 대체함 |
| §5 FAQ | ✅ | `Faq.tsx` (§16 9번째 문항 포함) |
| §6 푸터 | ✅ | `Footer.tsx` |
| §7 결제 안내 | ⚠️ 카피만 | ~~`PaywallNote.tsx`~~ → §28에서 `AiDemoPanel.tsx`로 이동. 가격 $2.99, 판매 단위 = HD 2장. 체크아웃 연결은 C단계 |
| §8 Terms | ✅ | `pages/Terms.tsx` (`/terms`) |
| §9 Refund Policy | ✅ | `pages/RefundPolicy.tsx` (`/refund-policy`) |
| §10 디자인 "종이와 잉크" | ⛔ **폐기** | §12가 대체함 |
| §11 완료 기준 | ✅ | lint·build 무오류, 375/768/1440px 정상, 아코디언 키보드 조작 가능, mailto 동작 확인 |
| §12 디자인 B안 | ✅ | `src/index.css` 토큰 + 전 컴포넌트 |
| §13 샘플 2그룹 | ✅ | `Samples.tsx` |
| §14 AI 콜아웃 | ✅ 목업 | ~~`AiCallout.tsx`~~ → §26에서 `AiDemoPanel.tsx`, 노출 판정은 `utils/ink.ts` |
| §15 프롬프트 | ✅ | `utils/prompt.ts` |
| §16 FAQ 추가 문항 | ✅ | `Faq.tsx` 9번 |
| §18 variant 2장 | ✅ 목업 | ~~`AiCallout.tsx`~~ → §26에서 `VariantCards.tsx` |
| §19 강약 재조정(무료 우선) | ✅ | `Hero.tsx`, `Steps.tsx`, `Editor.tsx`(콜아웃 위치), ~~`AiCallout.tsx`~~(→§26), `Samples.tsx`, `Faq.tsx` |
| §20 무료 알고리즘 개선 | ✅ | `utils/lineart.ts`(적응형 임계값), `utils/ink.ts`(파편화 판정), 샘플 4장 재생성 |
| §21 Free 그룹 샘플 교체 | ✅ | `Samples.tsx`, `public/samples/baby-*`, `leaf-ai.png` |
| §22 핸들 재설계 + WYSIWYG | ✅ | `utils/lineart.ts`(mm 굵기), `utils/pipeline.ts`(단일 추적), `Editor.tsx`, ~~`AiCallout.tsx`~~(→§26) |
| §23 히어로 이미지 교체 | ✅ | `Hero.tsx`, `Samples.tsx` |
| §24 편집기 2뷰 + 지우개 Undo | ✅ | `Editor.tsx`, ~~`AiCallout.tsx`~~, `index.css`(.btn-inline) — 2뷰는 §26에서 3단계로 |
| §25 하단 CTA 재배치 + 매직 버튼 | ✅ | `Editor.tsx`, `index.css`(.btn-magic, .magic-card) |
| §26 3단계 분리 + 단계별 헤더 색 | ✅ | `utils/aiFlow.ts`, `utils/checkout.ts`, `SubjectPicker.tsx`, `VariantCards.tsx`, `AiDemoPanel.tsx`, `AiHdPanel.tsx`, `Editor.tsx`, `App.tsx` |
| §27 프리뷰 품질 튜닝 + 한계 확인 | ✅ | `utils/aiFlow.ts`(VARIANT_SETTINGS), `Editor.tsx`(단일 TRACE 렌더) |
| §28 AI 데모 전용 화면 | ✅ | `AiDemoPanel.tsx`(전폭 재설계), `Editor.tsx`, `index.css`(.chip-lg), `utils/aiFlow.ts`(AI_EXAMPLES) |
| §29 덩어리 판정(solidity) + 모드 폴백 | ✅ | `utils/ink.ts`(measureSolidity), `Editor.tsx`(renderVariant), `AiDemoPanel.tsx`(경고 위치) |
| §30 Clean up 5단계 + solidity 재보정 | ✅ | `utils/lineart.ts`(CLEANUP), `Editor.tsx`(슬라이더), `utils/ink.ts`(SOLID_MAX 0.40) |
| §31 Clean up 6단계 + 기본값 light + 배포 준비 | ✅ | `utils/lineart.ts`, `utils/ink.ts`(FRAGMENTED 0.18), `utils/checkout.ts`, `index.html`, `DEPLOY.md`, `.env.example` |
| §32 Nano Banana 직결 (AI 리터치 연결) | ✅ 코드 완료 · 키 필요 | `api/ai-preview.ts`, `utils/aiPreview.ts`, `Editor.tsx`, `AiDemoPanel.tsx`, `PHASE2_GUIDE.md` |

남은 서버 작업은 `PHASE2_GUIDE.md`(= C단계). 진행 순서는 `START_HERE.md`.

### 이 문서 읽는 법

- **절 번호가 클수록 최신이고, 충돌하면 나중 절이 이긴다.** 폐기된 절은 ⛔로 표시돼 있다
- 파일 안에서 §18이 §16보다 앞에 놓여 있다(추가된 순서 그대로). 번호 기준으로 읽을 것
- 카피를 고쳐야 하면 원문을 지우지 말고 **개정 사유와 날짜를 함께** 남긴다

처음 보는 사람이 최근 맥락만 빠르게 잡으려면 이 순서:

| 먼저 | 왜 |
|---|---|
| **§19** | 페이지 톤의 헌법. 무료 우선. 문구를 건드리기 전 반드시 |
| **§20** | 무료 변환 알고리즘 — 적응형 임계값. 판정 지표 연쇄 주의 |
| **§22** | 핸들 3종 + 미리보기·인쇄 일치(단일 추적, mm 굵기) |
| **§24 §26 §28** | 편집기 뷰 구조 — §26이 3단계로, §28이 데모를 전용 화면으로 |
| **§27 §31** | 프리뷰 품질의 실측 한계와 보정. 설정을 만지기 전에 반드시 |
| **§25** | 하단 CTA 배치와 매직 버튼 |
| **§7** | 가격·결제 수단 확정 (Stripe 불가 이유 포함) |

---

## §1. 즉시 수정

1. **"How it works" 버튼 삭제** — 동작하지 않는 버튼과 관련 이벤트 핸들러·미사용 state를 함께 제거한다. (§3의 3단계 스텝 섹션이 이 역할을 대체함)
2. **푸터에 문의 메일 추가** — `gold.auri26@gmail.com`을 `mailto:` 링크로. 푸터 구조는 §6 참조.

---

## §2. 페이지 구조 (단일 랜딩 페이지)

기존 업로드/에디터 화면은 유지하되, 그 **위아래로** 아래 섹션을 붙여 하나의 랜딩 페이지를 만든다.

```
[헤더: 로고 + 최소 내비]
[히어로: §3 도입 문구 + 3단계 스텝]
[업로드 / 에디터 ← 기존 컴포넌트, 페이지의 주인공]
[§4 결과물 샘플 Before/After]
[§5 FAQ 아코디언]
[§6 푸터: 면책 + 문의메일 + 정책 링크]
[별도 라우트: /terms, /refund-policy ← §7, §8 전문]
```

에디터가 페이지의 핵심이므로, 히어로는 화면을 꽉 채우지 말 것(뷰포트 60% 이내). 스크롤 없이 업로드 영역이 보이거나 최소한 눈에 띄어야 한다.

---

## §3. 히어로 도입 문구 (컨펌 완료)

제목:
```
Turn any photo into a coloring page in seconds.
```

본문:
```
Upload a photo or drawing, and ColorSketch instantly converts it into a clean, printable A4 coloring page — right in your browser. No sign-up needed. Try the free converter first, then upgrade to an AI-enhanced version for smoother, richer lines worth framing.
```

3단계 스텝 (아이콘 + 라벨, 가로 배치 / 모바일에선 세로):
```
1. Upload   — any photo (JPG, PNG, WebP, HEIC)
2. Preview  — free, instantly
3. Download — your A4 file, or unlock the AI HD version
```

히어로 하단에 프라이버시 배지를 눈에 띄게 배치 (핵심 차별점):
```
🔒 Free conversions run entirely in your browser — your photo never leaves your device.
```

---

## §4. 결과물 샘플 섹션 (컨펌 완료) — ⛔ 폐기, §13으로 대체됨

> 아래 내용은 기록용입니다. 실제 구현은 §13(두 그룹 구조)을 따릅니다.

제목 / 리드:
```
See real transformations
Every example below was created with ColorSketch — from a real photo to a print-ready coloring page.
```

- Before/After 비교 UI로 2~4쌍 표시. 슬라이더(드래그로 경계 이동) 또는 호버 전환 중 택일하되, **모바일에서 반드시 동작해야 함**(호버 전용 금지).
- 이미지는 아직 없으므로 `public/samples/` 에 플레이스홀더 파일명을 정해두고 (`sample-01-before.jpg` / `sample-01-after.png` …), 사용자가 파일만 넣으면 바로 표시되도록 구현할 것. 파일이 없을 때는 섹션 전체를 렌더링하지 않는다.
- 구현 후 사용자에게 "샘플 이미지를 이 경로에 넣어달라"고 안내할 것.

> 사용자 참고: 샘플 원본은 **직접 촬영한 사진이나 직접 생성한 AI 이미지**만 사용하세요(스톡·타인 사진 금지). 초상권 이슈가 없는 반려동물·풍경·꽃 소재를 권장합니다.

---

## §5. FAQ (컨펌 완료 — 8문항, 아코디언)

섹션 제목: `Frequently asked questions`

1. **Is ColorSketch free?**
   The in-browser converter is 100% free, unlimited, and needs no sign-up — and it gives you the same A4 300 DPI file the paid version does. The optional AI HD conversion is a one-time paid download per image.
   *(2026-08-26 개정 — §19의 강약 재조정. "basic converter"가 무료를 열등한 버전처럼 읽히게 해서 교체)*

2. **When do I pay?**
   Only if you choose the AI HD version. You'll always see a low-resolution watermarked preview first — pay only when you like what you see.

3. **What image formats can I upload?**
   JPG, PNG, WebP, and HEIC (iPhone), up to 10 MB.

4. **What do I get when I purchase?**
   Both styles — Simple and Detailed — as high-resolution A4 files (300 DPI, no watermark), ready to print at home or at a print shop.
   *(2026-08-26 개정 — §7의 판매 단위 변경에 맞춤)*

5. **Can I use the coloring pages commercially?**
   Pages made from your own images are yours to use. You're responsible for having rights to the image you upload.

6. **What happens to my uploaded photos?**
   Free conversions run entirely in your browser — your photo never leaves your device. AI conversions are processed on our servers and automatically deleted within 7 days.

7. **I paid but didn't get my file. What do I do?**
   Your download page stays available — just revisit the link with your order number. Still stuck? Email us at gold.auri26@gmail.com and we'll fix it fast.

8. **Do you offer refunds?**
   Yes — see our [refund policy](/refund-policy). We'll issue a full refund within 14 days if your file wasn't delivered, arrived corrupted, or you were charged twice.

접근성: 아코디언은 `<button>` + `aria-expanded` + `aria-controls`로 구현하고 키보드로 열고 닫을 수 있어야 한다.

---

## §6. 푸터 (컨펌 완료)

면책 한 줄:
```
By uploading an image, you confirm you own it or have permission to use it. ColorSketch processes images at your direction and is not responsible for the content of uploaded images.
```

문의:
```
Questions: gold.auri26@gmail.com   ← mailto 링크
```

링크: `Terms` (/terms) · `Refund Policy` (/refund-policy)
저작권 표기: `© 2026 ColorSketch`

---

## §7. 결제 안내 문구 (2026-08-26 개정 — Phase 2 AI 프리뷰 결과 아래에 배치)

**가격 확정: $2.99. 판매 단위는 "이미지 1장"이 아니라 "이미지 1장의 두 스타일(Simple + Detailed) HD 2개"다.**

번들(3~5장 크레딧)은 검토 후 폐기했다. 크레딧을 차감하려면 주문 토큰이든 로그인이든 서버 상태와
만료 정책, "링크 잃어버렸어요" 문의가 따라붙는데, 한 세션에 여러 장을 올리는 사용자는 소수라
객단가 상승분이 그 복잡도를 못 갚는다. 반면 두 variant는 **프리뷰 단계에서 이미 2장을 생성하므로**
고해상도만 둘 다 뽑으면 되고, 주문 1건 = 전달 1회라 추가 상태가 전혀 없다. 원가는 HD 1장분뿐.

```
Like this preview? Get both HD files.
These are low-resolution watermarked samples. Purchase to download both styles — Simple and Detailed — as full A4 300 DPI files with no watermark. A one-time payment for this image, no subscription, no account needed.
```

CTA 버튼: `Get both HD files — $2.99`

금액은 `src/config.ts`의 `PRICE_USD` 한 곳에만 둔다. 금액을 보여주는 모든 문자열은 `formattedPrice()`를
읽으므로, 가격을 바꾸거나 나중에 A/B 테스트할 때 그 상수 하나만 건드리면 된다.

**결제 수단 관련 확정 사항**
- MoR은 **Lemon Squeezy**. 한국("Republic of Korea (ROK)")이 정산 지원 국가에 포함된다
- **Stripe 직접 연동과 Link by Stripe는 불가.** 한국 거주자·법인은 Stripe 가맹점 계정을 열 수 없다.
  해외 법인이 있어야 하고, 직접 연동하면 미국 판매세·EU VAT·차지백을 전부 직접 떠안게 된다
- LS 결제 수단: 카드, PayPal, Apple Pay, Google Pay, Alipay, WeChat Pay, Cash App Pay, ACH.
  Apple Pay·Google Pay가 원클릭 역할을 대신한다
- LS 수수료는 5% + $0.50, 미국 외 거래에만 +1.5%. 미국 타깃이면 국제 수수료는 붙지 않는다.
  해외 계좌 출금 시 1%. **LS 문서에 "$10 미만 상품은 세일즈팀에 커스텀 요율을 문의하라"고 명시돼 있으니 반드시 문의할 것**

---

## §8. Terms 페이지 — Your content 섹션 (컨펌 완료)

```
Your content.
You retain all rights to images you upload and to the coloring pages generated from them. You must only upload images that you own or are licensed to use. Do not upload images that infringe copyright, violate privacy or publicity rights, or contain unlawful content. You are solely responsible for your uploads and how you use the results. We may remove content and refuse service in cases of misuse. Uploaded images used for AI conversion are stored temporarily for processing and deleted within 7 days.
```

## §9. Refund Policy 페이지 (컨펌 완료)

```
Refund Policy

Because you can always review a free preview and a watermarked AI sample before paying, all sales of HD files are generally final once the file has been downloaded. However, we'll gladly issue a full refund within 14 days if:

1. your file was never delivered,
2. the file is corrupted or materially different from the preview you approved, or
3. you were charged more than once.

Email gold.auri26@gmail.com with your order number — we respond within 48 hours.
```

---

## §10. 디자인 방향 — ⛔ 폐기, §12(B안)로 대체됨

> 아래 "종이와 잉크" 방향은 시안 비교 끝에 폐기됐습니다. 기록용으로만 남깁니다.

현재 UI는 Tailwind 기본 indigo + gray 조합이라 템플릿처럼 보인다. 아래 방향으로 **전체 톤을 다시 잡되, 에디터의 기능적 레이아웃 구조는 유지**한다(사용성 검증된 부분이므로 색·타이포·여백만 교체).

**콘셉트**: "종이와 잉크". 결과물이 A4 인쇄물이므로, 화면도 인쇄물의 물성을 닮게 한다. 화려한 그라데이션·글래스모피즘·네온 액센트 금지.

**컬러 토큰** (Tailwind 설정에 CSS 변수로 정의):
- `--paper: #FBFAF7` — 배경. 순백이 아닌 미색 종이톤
- `--ink: #1C1B1A` — 본문·선. 순검정이 아닌 잉크톤
- `--ink-soft: #6B6864` — 보조 텍스트
- `--rule: #E3DFD8` — 구분선·테두리
- `--accent: #2F6F5E` — 단 하나의 액센트(딥 그린). CTA·활성 상태·포커스 링에만 사용
- `--accent-soft: #EAF2EF` — 액센트 배경

**타이포그래피**:
- 제목: 개성 있는 산세리프 또는 트랜지셔널 세리프 한 종. 굵고 크게, 자간 좁게(-0.02em)
- 본문: 가독성 높은 산세리프. 행간 1.6
- 두 서체는 서로 다른 계열로 대비를 줄 것. 제목·본문 모두 같은 기본 산세리프를 쓰는 건 금지
- 웹폰트는 3개 이하 weight만 로드(성능)

**형태**:
- 라운드는 절제(카드 8px, 버튼 6px). 현재의 `rounded-3xl` 남용 제거
- 그림자 대신 1px `--rule` 테두리로 구획. 캔버스 프리뷰에만 종이가 떠 있는 느낌의 부드러운 그림자 허용
- 여백을 넉넉히 — 섹션 간 세로 여백은 데스크톱 96px 이상

**시그니처 요소** (딱 하나만): 히어로의 Before/After가 **실제 A4 종이 비율(1:1.414) 카드**로 나란히 놓이고, 스크롤 진입 시 오른쪽 카드의 선화가 위에서 아래로 그려지듯 나타나는 연출. `prefers-reduced-motion`을 반드시 존중할 것.

**품질 기준**: 모바일(375px)까지 반응형, 키보드 포커스 링 명확, 색 대비 WCAG AA 충족.

구현 전에 색·서체 조합을 짧게 제안하고 사용자 확인을 받은 뒤 진행할 것.

---

## §11. 완료 기준

- `npm run lint`, `npm run build` 무오류
- 375px / 768px / 1440px 에서 레이아웃 깨짐 없음
- FAQ 아코디언 키보드 조작 가능
- 푸터 mailto 링크 동작
- 샘플 이미지가 없을 때도 페이지가 정상 렌더링됨

---

# 【확정 사항 추가 — 디자인 B안 + AI 리터칭 플로우】

## §12. 디자인 방향 확정 — B안 "컬러링북"

§10의 "종이와 잉크" 방향은 **폐기**한다. 확정안은 아래 B안이며, 기준 구현은 이 폴더의 `DESIGN_REFERENCE.html`이다
(대화 중 `design-b.html`로 부르던 파일과 같은 것). 색·타이포·형태 규칙을 그대로 React/Tailwind로 옮길 것.

**콘셉트**: 사이트 자체가 컬러링 페이지처럼 보인다. 모든 요소가 검정 아웃라인으로 둘러싸이고, 색은 크레용 4색만 쓴다.

**컬러 토큰**
```
--bg:           #FFFDF9   배경
--ink:          #141414   선·본문
--ink-soft:     #5E5A55   보조 텍스트
--crayon-red:   #E8503A   AI/유료 기능
--crayon-yellow:#F5C242   강조·헤더
--crayon-blue:  #3E7BC4   슬라이더·포커스
--crayon-green: #4FA36B   무료 기능·CTA
--line: 2.5px             기본 테두리 두께
```

**타이포**: 제목 `Bricolage Grotesque` 700/800, 본문 `DM Sans` 400/500/700. 제목 자간 -0.03em.

**형태**: 모든 카드·버튼·입력에 2.5px 검정 테두리. 하드 섀도우(4~7px 오프셋, 블러 없음)로 입체감. 버튼은 라운드 30px 알약형, `:active`에서 2px 눌림. 캔버스 영역은 점 패턴 배경.

**시그니처**: 제목 강조어의 색칠이 선 밖으로 살짝 삐져나오는 연출(`.fill` 클래스). 페이지 로드 시 왼쪽→오른쪽으로 칠해진다. `prefers-reduced-motion` 존중. **이 연출은 페이지당 3회 이하로만 사용**한다.

**모드 라벨 변경**: 기존 "🎨 Illustration / 📷 Photo" → **"✏️ Line drawing / 🖼️ Photo & art"**
(판별 기준이 "사진이냐"가 아니라 "이미 선화냐"로 바뀌었기 때문. §14 참조)

## §13. 샘플 섹션 구조 변경 (기존 §4 대체)

단일 그리드가 아니라 **두 그룹**으로 나눈다.

**그룹 1 — `Free` 배지 / "Drawings, illustrations & renders"**
```
Artwork with clear shapes converts beautifully in your browser — instantly, at no cost.
```
2열 Before/After. 샘플: robot, leaf.

**그룹 2 — `AI` 배지 / "Real photos"**
```
Photographs are made of soft gradients, not lines. The free converter can only trace what it finds, so fur, skin and low-contrast backgrounds come out patchy. AI retouch redraws the photo as a proper line drawing first — bold, closed outlines on white — then converts it into a page that is actually pleasant to color.
```
샘플: **dog, flower** (`public/samples/`에 실제로 들어 있는 파일 기준. 초안의 "kitten"은 사용하지 않음).
AI 칸은 `public/samples/{name}-ai.png`를 사용한다. 파일이 없으면 그 카드 전체가 렌더링되지 않는다.

**표시 방식 (2026-08-26 변경)**: 3열 정적 나열 대신 **드래그 비교 슬라이더**(`BeforeAfter.tsx`)를 쓴다.
- Free 그룹: `Photo ↔ Free` 슬라이더
- AI 그룹: `Photo ↔ AI` 슬라이더 + 그 아래에 무료 결과 썸네일과 솔직한 캡션을 한 줄로 붙인다.
  드래그는 가장 잘 팔리는 비교(Photo↔AI)에 쓰되, 무료의 한계는 계속 눈에 보여야 한다
- Pointer Events 하나로 마우스·펜·터치를 모두 처리한다(호버 전용 금지). 키보드는 `role="slider"` + 화살표/Home/End
- 카드가 처음 화면에 들어올 때 핸들이 한 번 좌우로 움직여 드래그 가능함을 알린다. `prefers-reduced-motion`이면 생략

무료 결과의 약점을 숨기지 말 것. 캡션에 솔직하게 적는다 (예: "A white cat on a pale cushion has almost no edges to detect.") — 무료의 한계가 보여야 AI 리터칭의 가치가 전달된다.

## §14. AI 리터칭 유도 플로우 (핵심 전환 지점)

1. 업로드 → 자동 판별. `recommendedMode === 'photo'`이고 **무료 변환 결과의 검은 픽셀 비율이 낮으면**(선을 거의 못 찾은 경우) 에디터 패널 상단에 AI 콜아웃을 띄운다.
2. 콜아웃 문구 (확정):
```
📷 This looks like a real photo
Photos need to be redrawn as line art before they make a good coloring page. Want to try an AI retouch?
```
3. 콜아웃 안에 **흐린 러프 미리보기**를 함께 보여준다 — 무료 변환 결과에 `filter: blur(3.5px)`를 걸고 "Rough preview" 라벨. 결과의 대략적 구도만 감지되게 해서 기대감을 만들되 그대로 쓸 수는 없게 한다.
4. CTA: `✦ Retouch with AI — 2 free previews` (crayon-red 배경) — §18에서 2장 생성으로 바뀌면서 문구도 갱신됨
5. 클릭 → Turnstile → `/api/ai-preview` (PHASE2_GUIDE §3-1) → 저해상도 + 워터마크 결과를 무료 결과와 좌우 비교로 표시 → 결제 유도(§7).

즉 무료 사용자는 **3단계 미리보기**를 거친다: 무료 변환(선명) → AI 러프(흐림) → AI 프리뷰(선명·워터마크·저해상도) → 결제.

## §15. Nano Banana 프롬프트 (AI 리터칭용 · 확정 v4 · 모듈 구조)

한글 프롬프트는 사용하지 않는다. 프롬프트는 **CORE + 피사체 모듈 + 스타일 variant** 세 조각을 이어붙여 만든다.

### 배경: 피사체마다 실패 모드가 다르다
| 피사체 | 대표 실패 | 필요한 지시 |
|---|---|---|
| 반려동물·인물 | 눈·얼굴 주변이 짧은 털 스트로크 덩어리가 됨 | 얼굴엔 털 표현 금지, 눈은 단순 도형으로 |
| 꽃·식물 | 꽃술·꽃 중심부가 점묘 덩어리, 잎맥을 전부 그림 | 중심부는 몇 개의 단순 도형, 주맥만 |
| 사물·제품 | 반사광·그라데이션을 실제 형태로 착각해 얼룩 생성 | 실제 모서리와 이음새만, 반사는 무시 |
| 풍경·실내 | 원경 디테일 과다로 화면이 새까매짐 | 원경은 단순 실루엣으로 |

### CORE (항상 포함)
이미지 편집 모델은 프롬프트가 길수록 개별 지시의 영향력이 떨어진다. **짧게 유지하는 것이 품질에 유리하다.**
```
Redraw as a children's coloring book page: thick uniform black outlines, about 2mm on A4, on pure white. Every shape fully closed so it can be colored in. Turn all texture into a few smooth continuous lines — never short repeated strokes. No shading, gradients, grey, hatching, stippling or reflections. Keep the proportions and pose. A4 portrait, pure black and white, no text, no border.
```

### 피사체 모듈 (하나만 골라 CORE 뒤에 붙임)

선택지는 **MECE**하게 4개 + Auto + 기타로 고정한다. 겹치는 경우의 우선순위 규칙:
**"사진이 아니라 그려진 그림이면 무조건 D(2D artwork)"** — 그림체가 처리 방식을 결정하기 때문이다.
(예: 애니메이션 속 강아지 → A가 아니라 D)

**A. People & pets**
```
Face: clean minimal outlines only — no fur strands, wrinkles or lumps. Each eye is one smooth shape with a solid pupil and one small highlight. At most four whiskers per side. Friendly and cartoon-like.
```

**B. Nature**
```
Each petal and leaf is one smooth closed outline. Never stipple or dot the flower centre — a few simple shapes only. Main leaf vein only, no vein network. Distant scenery becomes bold simple silhouettes.
```

**C. Objects & places**
```
Follow only real edges, seams and openings. Ignore every reflection, highlight and glare — glossy and metallic surfaces stay plain white. Keep straight lines straight. Leave the background white.
```

**D. 2D artwork**
```
This is already a drawing: preserve and thicken its own outlines exactly, keeping the original design and composition. Remove colour fills, cel shading and screentones, leaving white. Close any open outline. Add nothing new.
```

**E. Auto** (기본값)
```
If it is already a drawing, preserve and thicken its own outlines and add nothing new. If there is a face, keep it clean with no fur strands, and each eye as one simple shape with a solid pupil. If there are flowers, one smooth outline per petal and never a stippled centre. If there are manufactured objects, ignore all reflections. Simplify the background.
```

**F. Other** (사용자가 한 단어로 입력) — E 뒤에 한 문장 추가
```
The subject is a {WORD}. Keep what makes it recognizable and simplify everything else.
```

### 스타일 variant (§18 · 두 장 병렬 생성)
- **A — Simple**: `Style: very simple and bold — fewest lines possible, extra thick lines about 3mm, large open areas, for a young child.`
- **B — Detailed**: `Style: keep more interior detail for a richer page, but never thinner than 2mm and no texture strokes on faces or flower centres.`

### 실패 시 대응
전체 프롬프트를 늘리지 말 것. **실패한 항목 한 줄만** 추가해 재생성한다.
예: 눈이 여전히 지저분하면 `The eyes must be simple clean shapes with no texture around them.` 한 문장만 덧붙인다.

### 피사체 모듈 선택 방법 (UI)
AI 콜아웃에 **한 줄짜리 칩 선택기**를 넣는다. 기본값은 `Auto`이며 미선택이어도 플로우를 막지 않는다.
```
What's in your photo?
[ Auto ] [ 🐾 People & pets ] [ 🌿 Nature ] [ 📦 Objects & places ] [ 🎨 2D artwork ] [ ✍️ Other ]
```
`✍️ Other`를 누르면 **한 단어짜리 짧은 입력창**이 열린다 (placeholder: `e.g. car, cake, tattoo`).

**Other 입력값 검증 (필수 — 사용자 입력이 AI 프롬프트에 삽입되므로)**
- 최대 20자, 단어 1~2개까지만 허용
- 영문자·숫자·공백·하이픈만 통과. 줄바꿈·따옴표·중괄호·백틱은 제거
- 프롬프트에는 반드시 고정 문장 템플릿(`The subject is a {WORD}.`) 안에 넣어 삽입한다. 사용자 문자열을 프롬프트에 그대로 이어붙이지 않는다
- 서버(`/api/ai-preview`)에서 재검증한다. 클라이언트 검증만 믿지 않는다
- 검증 실패 시 조용히 Auto로 폴백

**Other 입력값은 그 자체로 가치 있는 데이터다.** 사용자가 실제로 무엇을 올리는지 알려주므로,
자주 등장하는 단어는 다음 정식 모듈 후보가 된다 (예: `car`, `cake`, `tattoo`가 자주 나오면 모듈 신설).

- 선택값(모듈 + Other 단어)은 주문 레코드에 저장하고, 결제 후 고해상도 생성에도 동일하게 사용한다.

### 검수 기준
A4로 인쇄했을 때 6세 아동이 크레용으로 선 안쪽을 칠할 수 있어야 한다. 아래 중 하나라도 보이면 실패로 간주하고 재생성한다.
- 얼굴에 짧은 스트로크 덩어리
- 꽃 중심부의 점묘
- 반사광을 따라 그린 정체불명의 얼룩
- 2D 원본에 없던 선이 새로 추가됨
- 끊긴 윤곽선(색이 새어나가는 영역)
- 2mm보다 얇은 선

## §18. AI 프리뷰는 2개 생성 후 선택 (플로우 변경)

AI 리터칭 결과는 **Variant A(Simple) / Variant B(Detailed) 두 장을 병렬 생성**해 나란히 보여주고 사용자가 고르게 한다.

이유:
- AI 결과는 한 장만 뽑으면 "이건 아닌데" 했을 때 이탈로 직결된다. 두 장이면 선택지가 생겨 전환율이 오른다.
- 아동용/성인용 취향이 갈리므로, 자동 판별보다 사용자 선택이 정확하다.
- 원가 부담이 거의 없다: 프리뷰 2장은 약 $0.006~0.01 수준으로, 판매가 대비 무시할 만하다.
- 어느 쪽을 골랐는지 로그를 쌓으면 이후 자동 추천의 학습 데이터가 된다.

**구현**
- `/api/ai-preview`는 두 variant를 병렬 호출해 `{ orderId, previews: [{ variant:'simple', url }, { variant:'detailed', url }] }` 반환
- 레이트리밋은 **요청 1회 = 2장 생성**으로 계산 (IP당 하루 2~3회)
- 캐시 키는 `cache:{imageHash}:{variant}`
- 사용자가 고른 variant를 주문 레코드에 저장하고, 결제 후 고해상도 생성 시 동일 variant 프롬프트를 사용
- CTA 문구: `✦ Retouch with AI — 2 free previews`

## §16. FAQ 문항 추가 (기존 §5의 8문항에 이어서)

9. **Why does my photo look worse than the examples?**
   Photos are made of soft gradients rather than lines, so the free in-browser converter has less to trace. Use AI retouch — it redraws your photo as bold, closed line art first, which is what makes a page you can actually color.

---

## §19. 강약 재조정 — 무료 우선 (2026-08-26 확정)

타깃은 **한두 장만 뽑는 사람**이다. 이 전제에서 페이지의 무게중심을 다시 잡았다.
충돌하는 경우 §19가 §13의 톤 지침보다 우선한다.

### 원칙

1. **무료가 주인공이다.** 선이 또렷한 입력(일러스트·렌더·제품컷·그래픽)에서는 무료 결과가 완제품이다.
   "무료 = 맛보기"로 읽히면 안 된다. 무료도 **동일한 A4 300 DPI**를 준다는 사실을 반복해서 말한다
2. **AI는 구제책이 아니라 업그레이드다.** "무료로는 안 되니까 돈 내라"가 아니라
   "무료로 이미 받았고, 더 좋게 만들 수도 있다"로 말한다
3. **무료의 한계는 계속 밝힌다.** 다만 대상을 "무료 변환기"가 아니라 **"클로즈업 사진이라는 어려운 입력"**으로
   옮긴다. 도구를 깎아내리지 말고 입력의 난이도를 설명한다
4. **순서가 메시지다.** 사용자가 무료 결과를 받아보기 **전에** 유료 제안이 뜨면 안 된다

### 반영 내역

| 위치 | 변경 |
|---|---|
| 히어로 lede | "No sign-up needed. Try the free converter first"를 굵게. AI는 "only if a photo needs it" 조건절로 후퇴 |
| 히어로 | 체크 칩 3개 추가 — `Free converter, no limits` / `No sign-up, no account` / `One photo, one A4 page` |
| 3단계 스텝 | 3단계 전부 무료 동작으로 통일(Upload → Convert → Print). 기존 3단계의 "or unlock the AI HD version" 제거 |
| 스텝 하단 | 한 줄 추가 — 세 단계 모두 무료이며 AI는 클로즈업 사진에만 해당한다고 명시 |
| 에디터 헤더 | 우측 라벨 `A4 · 300 DPI` → `Free · A4 300 DPI` |
| **에디터 패널 순서** | **AI 콜아웃을 슬라이더 위에서 무료 다운로드 버튼 아래로 이동.** 흐름은 스타일 선택 → 조절 → 무료 다운로드 → (그 다음) AI 제안 |
| AI 콜아웃 제목 | `📷 This looks like a real photo` → `✦ Want to push this photo further?` |
| AI 콜아웃 본문 | "Photos need to be redrawn…"(결함 지적) → "Your free page above is yours to download…"(업그레이드 제안) |
| AI 콜아웃 하단 | `Optional. Your free A4 download stays free — no account, either way.` |
| 샘플 Free 그룹 | 적용 범위를 넓혀 나열하고 **"For these, free is the finished product."**로 마무리 |
| 샘플 AI 그룹 제목 | `Real photos` → `Close-up photos — the hard case` |
| 샘플 AI 그룹 본문 | "free converter can only trace… come out patchy" → 입력 난이도 설명 + "try it first, it may be all you need" |
| 샘플 무료 썸네일 캡션 | "patchy and hard to color" → "usable, but softer than the AI version above" |
| FAQ 1번 | "basic converter" → "in-browser converter", 무제한·동일 300 DPI 명시 |

### 남은 과제

무료 품질 자체를 더 끌어올려야 §19가 말이 된다. 특히 선이 또렷한 입력에서
`illustration`(adaptive threshold) 경로의 결과가 항상 만족스러워야 한다.
실이미지로 회귀 테스트할 때 이 그룹을 최우선으로 볼 것.

---

## §20. 무료 변환 알고리즘 개선 (2026-08-26)

§19의 "free is the finished product"를 뒷받침하려면 무료 결과 자체가 좋아야 한다.
샘플 4장으로 파라미터를 스윕한 결과, 문제는 파라미터가 아니라 **임계값이 절대값이라는 구조**였다.

### 발견

Canny의 강한 엣지 컷이 `threshold` 슬라이더 값(기본 150)을 **그래디언트 크기의 절대값**으로 그대로 썼다.
그래디언트 크기는 이미지 대비에 비례하므로, 같은 150이 이미지마다 전혀 다른 의미가 된다.

| 샘플 | 기존 잉크 비율(기본값) | 판정 |
|---|---|---|
| dog | **0.86%** | 사실상 백지 |
| flower | 7.15% | 옅음 |
| robot | 9.20% | 적당 |
| leaf | 15.80% | 낙서 수준 |

즉 슬라이더가 이미지마다 다른 구간에서만 쓸모 있었고, 저대비 사진은 기본값에서 백지가 나왔다.

### 수정

`src/utils/lineart.ts`의 `cannyPass`가 강한 엣지 컷을 **그 이미지 자신의 그래디언트 분포 백분위**로 잡는다.
- `keepPercentile(threshold)` — 슬라이더 100~300을 백분위 0.90~0.99로 매핑. 기본 150이 0.95에 오도록 두 구간 선형
- `gradientQuantile()` — 히스토그램 버킷팅으로 O(n). 전체 해상도 A4 버퍼를 정렬하면 인터랙티브 예산을 넘는다

결과(기본값): robot 9.24% / leaf 13.05% / dog 12.94% / flower 10.10%.
**슬라이더가 모든 이미지에서 같은 의미를 갖는다.**

### 연쇄 수정 — AI 콜아웃 판정 지표

잉크 비율이 어느 이미지든 10% 근처로 수렴하면서, 기존의 "잉크 < 4.5%" 트리거가 **영원히 안 뜨게** 됐다.
(dog가 0.86% → 7.1%로 올라 콜아웃이 사라짐 = 유료 퍼널 전체가 죽음.)

지표를 **획 파편화**로 교체했다 (`src/utils/ink.ts`).
- `measureFreeQuality()` — 잉크 비율 + `fragmentation`(잉크 1000픽셀당 연결 성분 수)
- 낮으면 긴 연속 윤곽선(그림), 높으면 짧게 끊긴 획(털·잎·직물)
- 트리거: `ink < 0.02` **또는** `fragmentation > 0.6`

실제 앱 동작 확인: **dog 표시 / flower 표시 / leaf 표시 / robot 미표시.**

### 남은 문제 — leaf 샘플의 배치 모순

`leaf`는 앱이 스스로 "무료로는 잘 안 된다"고 판정해 AI 콜아웃을 띄우는데,
페이지에서는 **Free 그룹**에 "free is the finished product" 예시로 걸려 있다. 앞뒤가 맞지 않는다.

원인: `leaf-before.jpg`는 붓 터치가 살아 있는 회화풍 일러스트라, 구조적으로 "선이 또렷한 입력"이 아니다.
잎 윤곽과 붓 텍스처의 대비가 비슷해서 Canny가 둘을 구분하지 못한다.

**권장**: leaf를 AI 그룹으로 옮기고 `leaf-ai.png`(준비 완료)로 Photo↔AI 비교를 만든다.
Free 그룹에는 로봇처럼 **경계가 단단한** 소재(3D 렌더, 제품컷, 벡터풍 그래픽)를 하나 더 넣는다.
단, `leaf-ai.png`/`robot-ai.png`는 A4 비율(880×1255)이고 `-before.jpg`는 정사각(520×520)이라
슬라이더 정합을 위해 프레이밍을 맞춰 다시 잘라야 한다.

---

## §21. Free 그룹 샘플 교체 (2026-08-26)

`leaf`가 Free 그룹에 있으면서 정작 앱은 그 이미지에 AI 콜아웃을 띄우는 모순이 있었다(§20 참조). 정리했다.

| 그룹 | 샘플 | 근거 |
|---|---|---|
| **Free** | `baby`, `robot` | 앱이 콜아웃을 띄우지 않음 = 무료로 충분 |
| **AI** | `dog`, `flower`, `leaf` | 앱이 콜아웃을 띄움 = 무료로 부족 |

**배치 기준은 취향이 아니라 앱의 실제 판정이다.** 새 샘플을 넣을 때도 업로드해서
AI 콜아웃이 뜨는지 보고 그룹을 정할 것.

- `baby` — 연필 일러스트. 이미 선이 그어져 있어 무료 변환이 잘 받아낸다. 760×760
- `leaf-ai.png` — A4 원본을 `leaf-before.jpg`의 정사각 프레이밍에 맞춰 잘라냄(760×760)
- `robot-ai.png` — Free 그룹에 남은 robot에는 AI 카드가 없어 미사용. `샘플이미지/robot-ai_unused.png`로 옮겨 배포 번들에서 제외

---

## §22. 조절 핸들 재설계 + 미리보기·인쇄 일치 (2026-08-26)

원본(`back_version/colorsketch_google_ai_studio`)과 비교 검토한 결과다.

### 원본 대비 판단

- **원본 photo 모드(Sobel + lineWeight 배율)로 되돌리지 않는다.** 단순 이진화라 이중선·노이즈가 심하다. 현재 Canny가 낫다
- **원본 기본 모드였던 `illustration`(adaptive)도 되살리지 않는다.** 연필 일러스트로 검증하니 검은 덩어리가 되고 배경 띠까지 까맣게 잡힌다. 자동판별이 옳게 동작 중이다
- 원본에서 실제로 나았던 건 `lineWeight`가 **굵기와 엣지 민감도를 함께** 조절해 손잡이 하나로 조작됐던 점이다. 이 직관은 아래 핸들 재설계로 흡수했다

### 발견한 버그 — 미리보기와 인쇄물이 달랐다

두 가지가 어긋나 있었다.

1. **굵기**: 팽창 반경이 해상도와 무관한 고정 픽셀이라, 미리보기 1.41mm가 실제 A4에서 **0.34mm**로 나왔다. 머리카락 굵기라 아이가 선 안쪽을 칠할 수 없다
2. **선 밀도**: 내보내기에서 고해상도로 **다시 추적**했는데, 원본을 먼저 확대하면 그래디언트가 뭉개져 검출량이 급감한다. 같은 설정에서 화면 13.3% ↔ 파일 2.67%

### 수정

- **굵기를 mm로 지정한다.** `thicknessMm`(0.5~3mm, A4 기준). 팽창 반경은 캔버스 크기에서 유도 — `radius = (thicknessMm × pxPerMm − 1) / 2`
- **추적은 딱 한 번, 1240×1754(A4 150dpi)에서 한다.** 미리보기는 축소본, 내보내기는 확대본이다(`pipeline.ts`의 `TRACE_LONG_EDGE`, `scaleLineArt`, `composeOutput`). 확대 후 0.62로 재이진화해 회색을 없앤다
- 잡티 제거 기준도 픽셀이 아니라 **mm²**로 잡아 해상도와 무관하게 만들었다
- AI 콜아웃의 파편화 지표를 **해상도 정규화**했다(`REFERENCE_AREA`). 추적 해상도를 바꾼 순간 지표가 4배 작아져 콜아웃이 안 뜨는 회귀가 있었다

검증: 미리보기 12.93% ↔ 내보내기 13.24%. 내보내기가 재추적이 아니라 확대라 훨씬 빠르기도 하다.

### 확정 핸들 (사용자 컨펌 완료 — "3슬라이더 + 도구2")

| 핸들 | 범위 | 비고 |
|---|---|---|
| **Line thickness** | 0.5~3.0 mm | A4 인쇄 기준 실제 치수. 기본 2.0mm(§15가 AI에 요구하는 값과 동일) |
| **Detail** | 0~100 | 높을수록 선이 많이 살아남음. 기본 50 |
| **Clean up** | Off / Normal / Strong | 잡티 제거. 기본 Normal |
| 지우개 | — | 기존 유지 |
| 텍스트 | — | 기존 유지 |

- `Enhance resolution` 토글은 UI에서 제거하고 항상 켠다(전문용어라 판단을 요구하면 안 됨)
- 기본값에서 벗어나면 `Reset` 링크가 나타난다
- 패널에 한 줄 명시: *"Thickness is measured on the printed A4 page, so what you see here is exactly what comes out of the printer."*

### AI 결과에도 동일 핸들

variant를 고르면 결제 안내 아래에 **`Adjust before downloading`** 버튼이 뜬다.
누르면 그 결과가 에디터의 작업 이미지로 교체되고, 자동판별이 `illustration`으로 잡아
**같은 핸들 5개가 그대로 적용된다.** 별도 편집 화면을 만들지 않았다.

C단계에서 실제 `/api/ai-preview` 응답으로 교체할 때도 이 경로를 그대로 쓰면 된다 —
`onEditVariant(url)`에 고해상도 결과 URL을 넘기기만 하면 된다.

---

## §23. 히어로 이미지 교체 (2026-08-26)

히어로의 Before/After를 `robot-before ↔ robot-after`(무료 결과)에서
**`leaf-before ↔ leaf-ai`(AI 결과)**로 교체했다. 같은 이미지를 AI 샘플 그룹에서는 제거했다.

- 태그는 `Photo` / **`AI`**(crayon-red)로 단다. `Coloring page`가 아니다 —
  히어로에 걸린 것은 유료 리터칭 결과이므로, 무료 변환 결과로 오해되면 안 된다
- 캡션도 명시한다: *"Drag the handle to compare — this one used AI retouch"*

**주의**: §19는 무료 우선 강조를 정한 절이고, 히어로에 AI 결과를 거는 것은 그 방향과 긴장 관계에 있다.
히어로 본문(`No sign-up needed. Try the free converter first`)과 체크 칩 3개,
그리고 위 AI 라벨이 그 균형을 잡고 있으니 셋 중 하나라도 손댈 때는 나머지를 함께 볼 것.

현재 샘플 구성:

| 그룹 | 샘플 |
|---|---|
| 히어로 | leaf (Photo ↔ AI) |
| Free | baby, robot |
| AI | dog, flower |

`leaf-after.png`(무료 변환 결과)는 더 이상 쓰이지 않지만 7KB라 남겨뒀다.

---

## §24. 편집기 2뷰 분리 + 지우개 되돌리기 (2026-08-26)

### 문제

AI 플로우가 무료 패널 **아래에 이어 붙는** 구조라, 칩·프리뷰·결제 안내가 쌓이면서 패널이 길어지고
정작 가장 중요한 결제 단계가 노트북 화면 밖으로 밀려났다. 오른쪽 패널이 길어지니 왼쪽 종이 영역도
같이 늘어났다.

### 수정 — 두 개의 편집기 뷰

한 화면에 하나만 뜬다. 서로 우상단 버튼으로 오간다.

| 뷰 | 우상단 버튼 | 내용 |
|---|---|---|
| **Free editor** | `✦ AI preview` | 스타일 선택 → Adjust → 지우개 → 텍스트 → 무료 다운로드/인쇄 |
| **✦ AI page editor** | `← Free editor` | 피사체 칩 → 프리뷰 2장 생성 → 스타일 선택 → Adjust·지우개·텍스트 → 결제 안내 |

- `AI preview` 버튼은 **항상** 있다. 다만 `recommendAi`(사진이면서 무료 결과가 부실)일 때만
  crayon-red로 강조되고 아래에 한 줄 설명이 붙는다. §19의 무료 우선과 충돌하지 않으면서
  원하는 사람은 언제든 들어갈 수 있다
- 스타일을 고르면 그 결과가 **AI 뷰의 작업 이미지**가 되고, 같은 핸들 5개가 그대로 적용된다.
  `Try the other style`로 다시 고를 수 있다
- 지우개 획은 뷰별로 따로 보관한다(`freePaths` / `aiPaths`). 왔다갔다 해도 지운 게 날아가지 않는다
- 무료 결과 품질 판정은 **Free 뷰에서만** 수행한다. AI 결과는 정의상 선화라 판정 대상이 아니다

### 지우개 되돌리기

`Eraser` 헤더에 `Undo` 칩을 추가했다. 마지막 획 하나를 되돌리고, 획이 없으면 비활성이다.
아래에 `N erased strokes` 카운터를 표시한다.

### 함께 고친 레이아웃 버그

캔버스를 감싼 flex 컨테이너에 `items-start`가 없어서 **종이 카드가 행 높이만큼 세로로 늘어났다**
(A4 비율 무시, 436×966). 이게 사용자가 보고한 "페이퍼 영역이 늘어난다"의 정체다.

더 나빴던 건 **지우개가 이것 때문에 엉뚱한 곳에 그려졌다**는 점이다. 포인터 좌표는 엘리먼트 기준으로
정규화되는데 그림은 `object-contain`으로 레터박스 안에 들어가 있어서, 세로로 늘어난 만큼 좌표가 어긋났다.

검증: 지우개 획 하나로 대상 밴드의 잉크가 9777 → 7975로 줄고, `Undo` 후 정확히 9777로 복귀.
캔버스 비율 1.418(=A4), 375·1280px 가로 스크롤 0.

---

## §25. 무료 편집기 하단 CTA 재배치 (2026-08-26)

§24에서 우상단에 만든 `AI preview` 버튼은 **결과를 보기 전**에 놓여 있었다.
"결과물이 맘에 들지 않으면"이라는 제안은 결과를 본 다음에 해야 말이 된다.

### 하단 순서 (확정)

```
[Download A4 — free]      ← 초록, 주 행동
[Print directly]          ← ghost
[✦ 매직 CTA 카드]          ← 빨강, 빛나는 버튼
[Start over with a different image]  ← 작은 링크, 가운데
```

- `Start over`는 우상단에서 하단으로 내렸다. 새 이미지를 올리는 건 마지막에 떠올리는 행동이다
- 우상단에는 `AI preview`만 남기되 **항상 ghost**로 조용하게 둔다. 시끄러운 초대는 하단 카드 하나뿐이다

### 매직 CTA

문구는 판정에 따라 갈린다.
- `recommendAi`(사진 + 무료 결과 부실): *"This one is a hard photo to trace"* — 왜 안 되는지 설명
- 그 외: *"Not happy with this page?"* — 결과를 본 사람에게만 묻는다

두 경우 모두 아래에 한 줄: *"Two previews, free to look at. Your free A4 download stays free either way."*

### 빛나는 버튼 (`.btn-magic`)

§12의 디자인 언어를 깨지 않으려고, 광채를 **테두리·하드 섀도우 뒤에 덧대는 방식**으로 만들었다.
2.5px 검정 테두리와 하드 섀도우, 30px 알약형은 그대로다.

- `::before` — crayon-red 헤일로가 2.2초 주기로 퍼져 나간다
- `::after` — 2.8초 주기로 흰 광택이 왼쪽에서 오른쪽으로 지나간다
- `prefers-reduced-motion` — 애니메이션을 끄고 정적인 헤일로만 남긴다

**주의**: 페이지에서 이 정도로 시끄러운 요소는 이것 하나뿐이어야 한다.
두 개가 되는 순간 둘 다 무시된다.

---

## §26. 3단계 분리 + 단계별 헤더 색 (2026-08-27)

§24가 만든 "무료 / AI" 2뷰는 **결제선을 그리지 못한다.** AI 뷰 하나가
"무료 미리보기"와 "구매한 페이지"를 겸했고, 두 상태 모두 헤더가 노란색이라
사용자는 자기가 지금 어느 쪽에 있는지 화면에서 읽을 수 없었다.
§24는 폐기하지 않는다 — **뷰를 2개에서 3개로 늘려 그 결론을 이어받는다.**

### 세 단계는 세 개의 서로 다른 약속이다

| 단계 | 헤더 | 약속 |
|---|---|---|
| `free` | crayon-yellow / 검정 글씨 | 브라우저 내 변환. 무제한 무료, 다운로드 가능 |
| `ai-demo` | **crayon-red / 흰 글씨** | AI 미리보기. 보는 건 공짜, 아직 아무것도 청구되지 않음 |
| `ai-hd` | **ink(#141414) / 흰 글씨** | 결제 완료. 워터마크 없음, 무료와 동일한 핸들 |

- 빨강은 이미 사이트의 AI 색이다(`.btn-magic`, `.btn-red`). AI 구역 진입이
  **방금 누른 그 시끄러운 것**으로 읽히고, 새 브랜드처럼 보이지 않는다
- 잉크는 크레용 한 칸 위다. 페이지에서 유일하게 꽉 찬 검정 면이고,
  그게 곧 "이건 값을 치른 것"이라는 신호다. 데모 바가 절대 가져가면 안 되는 신호
- 색은 `utils/aiFlow.ts`의 `STAGE_BAR` 한 곳에서만 정의한다.
  헤더는 `App.tsx`가 그린다 — 스크롤 한 칸 밖에서도 읽히는 유일한 부분이라,
  구분을 사이드바 제목이 아니라 **그 띠**가 짊어져야 한다

### 데모 2종은 "생성" 버튼을 누른 뒤에만 나온다

이전에는 AI 뷰에 진입하는 순간 `useEffect`가 미리보기를 렌더했다.
**아무도 묻지 않은 질문에 대한 기본값 답이 첫 화면이 된다** —
그리고 결과가 시원찮으면 그게 "AI란 이런 것"으로 읽힌다. 페이월이 필요로 하는 것의 정반대다.

새 순서는 게이트 3개다.

1. **피사체 선택** — `SubjectPicker`. 기본값 없음(`null`). `Auto`도 눌러야 하는 선택지다
2. **생성** — 선택 전에는 버튼이 비활성. 누른 그 순간에 2종을 만든다
3. **결제 질문** — 2종을 본 뒤에만 가격을 꺼낸다

블러 처리된 rough preview는 삭제했다. 왼쪽 캔버스에 이미 무료 결과가 크게 떠 있어 중복이었고,
"흐릿한 무언가"는 §19의 무료 우선 톤에 아무것도 보태지 않았다.
대신 데모 단계에서는 캔버스 위에 *"Still your free page — AI previews are on the right"* 배지를 둔다.

### 결제 후 재선택은 왜 별도 액션인가

`PHASE2_GUIDE.md`의 실패 대응 설계가 **"결제 이후에는 외부 AI API를 절대 호출하지 않는다"**를
못 박고 있다. 결제 후 피사체를 바꿔 자유롭게 재생성하게 두면 그 안전장치가 그대로 깨진다 —
모델 제공자가 죽어 있는 동안 결제한 사람이 빈손이 된다.

그래서 `ai-hd`의 피사체는 **잠긴 상태로 보여주되**(구매한 조건이므로 숨기지 않는다),
바꾸는 건 `Change` → `Redraw both styles`라는 **이름 붙은 별도 동작**으로 분리했다.
Phase 2에서 이건 저장된 주문에 대한 제한된 재시도로 구현된다. 자기 전용 disclosure 뒤에 두는 것이
이게 평범한 경로가 되지 않게 막는 유일한 방법이다.

### 무료와 유료의 실제 차이

`renderVariantSet(target)` 한 곳이 두 쌍을 모두 만든다.

- `demo` → THUMB 크기(220×311). 워터마크 자리
- `hd` → TRACE 크기(1240×1754). 선택하면 그게 편집 대상 원본이 된다

데모 카드를 골라 편집하게 두면 A4 300dpi 출력이 뭉개진다. **해상도 차이가 곧 상품이다.**

### 결제 시뮬레이션

`utils/checkout.ts`의 `CHECKOUT_MODE`가 유일한 이음매다. 현재 `'mock'`이고,
퍼널 전체를 로컬에서 끝까지 걸어볼 수 있다. 숨은 우회로가 아니다 —
모의 결제가 여는 모든 화면이 "AI 리터치는 아직 연결되지 않았다"를 계속 말하고,
버튼 라벨에도 `(test)`가 붙는다. `/api/checkout`이 들어오는 커밋에서 `'live'`로 바꾼다.

### 파일

| 새로 | 하는 일 |
|---|---|
| `utils/aiFlow.ts` | `Stage`, `STAGE_BAR`, variant 설정·라벨 |
| `utils/checkout.ts` | mock/live 이음매 |
| `components/SubjectPicker.tsx` | 피사체 선택 (데모·HD 공용) |
| `components/VariantCards.tsx` | Simple/Detailed 2장 (데모·HD 공용) |
| `components/AiDemoPanel.tsx` | 2단계 — 미리보기 + 페이월 |
| `components/AiHdPanel.tsx` | 3단계 — 구매한 페이지 선택 |

| 삭제 | 이유 |
|---|---|
| `components/AiCallout.tsx` | `AiDemoPanel`이 대체 |
| `components/PaywallNote.tsx` | 페이월 카피가 `AiDemoPanel`로 이동 |

`Editor.tsx`는 `pane: 'free'|'ai'` 대신 `stage`를 prop으로 받는다(헤더가 같이 움직여야 하므로 소유자는 `App.tsx`).

---

## §27. 프리뷰 품질 — 측정해서 튜닝, 그리고 한계 확인 (2026-08-27)

§26의 데모 2종은 **결제를 유도하기는커녕 반대로 설득했다.** 원인을 추측하지 않고
`utils/ink.ts`의 지표로 조건을 쓸어서 측정했고, 눈으로 확인했다.

**주의: `fragmentation`은 해상도 간 비교에 쓸 수 없다.** 정규화한다고 주석에 적혀 있지만
실제로는 고해상도일수록 값이 올라간다. 모든 후보를 **카드 표시 크기(300×424)로 리샘플한 뒤**
측정해야 비교가 성립한다. 아래 숫자는 전부 그 기준이다.

### 밝혀낸 것 두 가지

**1) `cleanup`의 블러가 선을 부수고 있었다.**
cleanup 프리셋은 Canny 이전에 그레이스케일을 블러한다. 블러는 히스테리시스가 윤곽을 이어붙일 때
쓰는 약한 그라디언트를 지워버린다 — 그래서 모든 획이 끊긴 채로 나왔다. 블러만 껐을 때:

| | 기존 (d30 t3.0 normal) | 블러 off |
|---|---|---|
| robot | frag 0.34 | **0.06** |
| flower | frag 0.49 | **0.05** |
| dog | frag 0.69 | **0.22** |

**2) `detail`은 높일수록 깨끗하다 — 이름과 반대다.**
Canny에서 임계값을 낮추면 약한 에지가 살아남아 **강한 에지에 연결된다.** 즉 detail을 올리면
윤곽이 길고 연속적이 되고 반점이 줄어든다. 기존 `simple: 30`은 그 곡선의 최악점에 있었다.

### 확정한 설정

```
simple:   { detail: 70, thicknessMm: 2.0, cleanup: 'off' }
detailed: { detail: 85, thicknessMm: 1.4, cleanup: 'off' }
```

굵기는 반대 방향으로 작용한다. 너무 부풀리면 인접 윤곽이 붙어 **검은 덩어리**가 된다.
2.0/1.4mm가 샘플셋에서 선이 뭉개지지 않는 최대치였다. 또한 카드는 이제 **썸네일 크기로 두 번째
추적을 돌리지 않는다** — `pipeline.ts`의 "한 번만 추적한다" 규칙 그대로, TRACE에서 한 번 뽑고
카드는 그걸 축소해 보여준다.

### 지표만 믿으면 안 되는 이유

`cleanup:'off' + detail 78 + 2.4mm`는 dog에서 frag 0.22로 **가장 좋은 점수**가 나왔다.
실제로 렌더해서 보니 개의 얼굴 전체가 **하나의 검은 덩어리**였다. 덩어리는 연결 요소가 하나라
파편화 점수가 좋게 나온다. 숫자를 고를 때는 반드시 눈으로 확인할 것.

### 넘을 수 없는 선 — 이게 제품의 존재 이유다

털 클로즈업에서 무료 트레이서가 만든 에지 맵에는 **긴 윤곽이 아예 존재하지 않는다.**
연결 요소 크기로 필터링(200px 이상만 유지)하면 개가 통째로 사라지고 **빈 종이**가 남는다.
살릴 정보 자체가 없다는 뜻이다.

**결론: 어떤 파라미터로도 털 사진에서 결제할 만한 프리뷰는 나오지 않는다.**
구조가 있는 피사체(로봇·제품·꽃·그림)는 위 설정으로 크게 좋아지지만, 정작 사람들이 돈을 낼
사진은 안 된다. 이건 §28의 화면 설계를 강제한다.

---

## §28. AI 데모를 자체 화면으로 분리 (2026-08-27)

§26은 데모를 편집기의 `캔버스 + 사이드바` 틀에 그대로 끼워 넣었다. 그 결과
**왼쪽 큰 캔버스가 무료 결과를 계속 띄우고 있었다.** 여기서 편집되는 건 아무것도 없는데
화면의 3분의 2가 무료 페이지였던 셈이다. 더 나쁜 건 그게 만드는 비교다 —
*"이미 가진 페이지"* 대 *"살까 말까 한 것의 대역"*. 사지 말라고 권하는 구도다.

데모는 이제 **전폭 단일 컬럼**이고, 결정이 일어나는 순서대로 위에서 아래로 흐른다.

| | |
|---|---|
| 1 | **What's in your photo?** — 큰 칩(`.chip-lg`), 맨 위, 가로로 넓게 |
| 2 | **What AI retouch does** — 실제 AI 결과물 before → after |
| 3 | **Your two styles** — 선택 후에만 생성되는 Simple / Detailed |
| 4 | 가격 — 2종이 나온 뒤에만 등장 |

### 2단계에 진짜 AI 결과물을 넣은 이유

§27이 증명했듯 무료 트레이서는 AI를 흉내낼 수 없다. 대역만 보여주면 방문자는
**AI의 실력을 대역으로 판단한다** — 페이월이 필요로 하는 것의 정반대다.
`public/samples`에는 이미 진짜 AI 페이지(`dog-ai.png`, `flower-ai.png`, `leaf-ai.png`)가 있다.
피사체 선택에 맞춰 그중 하나를 before/after로 보여준다(`AI_EXAMPLES`).

정직성은 라벨이 담보한다. 예시는 **샘플 사진**이라고 명시하고, 본인 사진으로 만든 2종에는
"AI 리터치는 아직 연결되지 않았다 — 이건 브라우저 트레이서의 대역"을 붙인다.
과장하지 않으면서 실제 가치를 보여주는 유일한 조합이다.

### 결제 후 화면은 무료 편집기와 동일하다

`ai-hd`는 §26 그대로 캔버스 + 사이드바를 쓴다. 굵기·디테일·정리·지우개·텍스트·다운로드가
전부 같은 자리에 있다. 산 물건을 다루는 법을 새로 배우게 하지 않는다.

### 결제는 재생성하지 않고 재사용한다

데모와 HD가 이제 같은 렌더(TRACE 크기)이므로, 결제 시 `demoPreviews`를 그대로 넘긴다.
`PHASE2_GUIDE.md`의 실패 설계와 같은 모양이다 — **결제 이후 단계는 생성이 아니라 발급.**

---

## §29. 데모 카드가 검은 덩어리로 나오던 문제 (2026-08-28)

검토 중 어두운 캐릭터 일러스트를 넣었더니 2종 카드가 **머리 전체가 새까만 덩어리**로 나왔다.
받은 질문은 "프롬프트가 제대로 들어간 거냐"였는데, **프롬프트는 어디에도 들어가지 않는다** —
`buildPrompt()`의 결과는 개발 모드 `<details>`에 문자열로 찍히는 게 전부이고 AI 호출 경로가 없다.
질문이 나왔다는 것 자체가 §28의 라벨링이 실패했다는 뜻이므로 그것도 같이 고쳤다.

### 원인 1 — 카드가 분석기를 무시하고 있었다

`renderVariantSet`이 `mode: 'photo'`를 하드코딩하고 있었다(§26에서 `AiCallout`로부터 물려받고
§27에서 그대로 둔 것). 즉 **그림을 Canny에 밀어 넣고 있었다.** 무료 편집기는 바로 옆에서
분석기가 고른 모드로 같은 이미지를 멀쩡히 그리는데도. 이제 카드도 같은 결정을 따른다
(`2D artwork` 선택 시에는 `illustration`으로 고정).

### 원인 2 — 잉크 비율로는 덩어리를 못 잡는다

처음엔 잉크 비율 상한을 걸었는데 틀린 접근이었다. 잎사귀·레이스처럼 **정상적으로 빽빽한**
페이지와 **뭉개진** 페이지가 같은 잉크 비율을 갖는다.

쓸 수 있는 신호는 **침식(erosion)** 이다. 검은 마스크를 획 굵기의 절반쯤 침식시키면
선은 사라지고 덩어리는 거의 그대로 남는다. `measureSolidity()`가 그 비율이다.

| | solidity |
|---|---|
| 정상 선화 | 0.00 – 0.09 |
| 털 + 2.0mm (뭉개짐) | 0.59 |
| 어두운 면이 통째로 채워진 경우 | 0.92 – 0.97 |

`SOLID_MAX = 0.25`로 자른다. 판정에 걸리면 **① 다른 모드 → ② 굵기 0.6배** 순으로 재시도한다.
굵기를 먼저 줄이지 않는 이유: 덩어리는 선으로 이루어진 게 아니라서 얇게 해도 안 풀린다.
대개는 모드가 잘못 걸린 것이다.

검증(합성 케이스):
- 털 피사체 → `photo@2.0mm` solidity 0.59 **기각** → `photo@1.2mm` 0.24 **채택**
- 선 그림 → `illustration@2.0mm` 0.09 즉시 채택
- 어두운 면 → 통과하는 후보가 없어 **가장 덜 뭉개진 것**으로 폴백

### 스스로 만든 버그 하나

첫 구현은 모든 후보가 `MIN_INK` 미만이면 빈 페이지를 반환했다. 성긴 선 그림(잉크 1%)이
전부 걸러져 백지가 나왔다. `MIN_INK`를 0.004로 낮추고, 아무것도 통과하지 못하면
**가장 잉크가 많은 후보**를 돌려주도록 고쳤다. 백지보다는 성긴 페이지가 낫다.

### 라벨링

"이건 AI가 아니다" 경고를 카드 **위로** 올렸다. 아래에 두면 읽히지 않는다 —
실제로 첫 검토자가 이 카드들을 AI 결과로 읽고 AI가 고장났다고 판단했다.
카드의 태그도 `Stand-in` → `Not AI`로 바꿨다.

---

## §30. Clean up 3단계 → 5단계 (2026-08-28)

무료·AI 편집기 모두 적용된다(`adjustBlock`이 한 번 만들어져 두 곳에 렌더되므로 자동).

### 왜 3단계로는 부족했나

`cleanup` 뒤에는 서로 **반대로 작용하는 손잡이 두 개**가 있다.

- `blur` — 텍스처를 눌러주지만, §27에서 확인했듯 **획을 끊는 주범**이다
- `speckMm2` — 면적 기준으로 잡티를 지운다. 획 연속성은 건드리지 않는다

기존 3단계는 둘을 묶어놨다. 그래서 **잡티를 지우려면 블러를 받아들이는 수밖에 없었다.**
빠져 있던 칸이 `light`다 — 블러 0, 잡티 제거만.

```
off     blur 0  speck 0
light   blur 0  speck 1.2   ← 새로 추가. 대개 여기가 제일 깨끗하다
normal  blur 2  speck 1.6   ← 기존 normal 그대로 (기본값)
strong  blur 3  speck 2.6   ← 새로 추가
max     blur 4  speck 3.6   ← 기존 strong
```

`normal`과 `max`를 기존 값 그대로 둔 건 의도적이다. `normal`은 `ink.ts`의 `FRAGMENTED`
기준이 맞춰진 기본값이라, 건드리면 AI 콜아웃이 언제 뜨는지가 조용히 바뀐다.

### 실측 (실제 샘플 6장, 편집기 기본값 detail 50 / 2.0mm)

파편화 지표 — 낮을수록 획이 이어져 있다.

| | normal | **light** |
|---|---|---|
| 5_baby_princess | 0.24 | **0.05** |
| 4_robot | 0.37 | **0.09** |
| 0_flower | 0.94 | **0.06** |
| 3_dog | 1.42 | **0.33** |

**`light`가 `normal`보다 4~15배 깨끗하다.** 편집기에서 좋은 품질이 나온다는 예상이 맞았고,
그 칸이 실제로 없었던 것이다.

### 기본값은 왜 안 바꿨나

바꾸면 업셀이 사라진다. `FRAGMENTED = 0.6` 기준으로 미리보기 기하에서 재보면:

| | normal | light |
|---|---|---|
| 3_dog | 0.60 → **콜아웃** | 0.45 → 안 뜸 |
| 1_plants_leaf | 0.67 → **콜아웃** | 0.37 → 안 뜸 |
| 2_baby kitten | 0.66 → **콜아웃** | 0.22 → 안 뜸 |

기본값을 `light`로 옮기려면 `FRAGMENTED`를 0.6 → **0.18 근처**로 같이 내려야 한다
(light 기준 실측: 어려운 쪽 0.45 / 0.37 / 0.22, 쉬운 쪽 0.14 / 0.13 / 0.10 — 0.22와 0.14 사이가 빈다).
샘플 6장으로 매출에 직결되는 임계값을 다시 맞추는 일이라 **별도 결정으로 남겨둔다.**

### 겸사겸사 잡은 버그 — §29의 SOLID_MAX가 틀렸었다

§29의 덩어리 판정을 합성 이미지로 맞췄는데, 그때 획이 실제 2mm보다 얇았다.
실제 렌더로 다시 재니 **정상 페이지가 0.24~0.32, 뭉개진 페이지가 0.49~0.55**였다.
즉 기존 `SOLID_MAX = 0.25`는 **멀쩡한 결과를 전부 기각**하고 있었다.

- 침식 반지름: `획두께px / 1.5` (기존 `/4`는 너무 작아 두꺼운 획이 덩어리로 보였다)
- `SOLID_MAX`: 0.25 → **0.40** (0.32와 0.49 사이)

---

## §31. Clean up 6단계 + 기본값 light + 배포 준비 (2026-08-28)

### 스케일 재설계

§30에서 렌더를 눈으로 확인한 결과 기본값 `normal`이 대부분의 사진에서 이미 망가져 있었다
(꽃은 파편, 로봇은 몸통 붕괴). 좋은 결과가 나오는 구간은 **블러 0** 쪽에 몰려 있으므로,
해상도를 그쪽에 몰아줬다.

```
off     blur 0  speck 0
light   blur 0  speck 1.0   ← 기본값
medium  blur 0  speck 2.2
strong  blur 0  speck 3.6
heavy   blur 2  speck 3.6
max     blur 4  speck 4.5
```

여섯 칸 중 **네 칸이 블러 0**이다. 나머지 두 칸은 텍스처를 정말 지워야 할 때를 위해 남기되,
획이 부서지는 대가가 이제 시작점이 아니라 **명시적 선택**이 된다.

### FRAGMENTED 동반 재보정 — 이건 세트다

기본값에서 블러를 빼면 파편화 수치가 전부 내려간다. 기존 `0.6`을 그대로 뒀다면
**AI 콜아웃이 어떤 사진에서도 안 떴을 것이다** — 업셀이 조용히 사라진다.

원본 샘플 6장, 미리보기 기하, detail 50 / 2.0mm / light 기준:

| 어려운 쪽 | | 쉬운 쪽 | |
|---|---|---|---|
| dog (털) | 0.452 | flower (꽃다발) | 0.140 |
| plants_leaf (수풀) | 0.368 | robot (제품) | 0.127 |
| baby kitten (털) | 0.206 | baby_princess (그림) | 0.102 |

0.206과 0.140 사이가 비어 `FRAGMENTED = 0.18`. **기본값과 이 값은 항상 같이 움직인다.**

주의: `public/samples/*-before.jpg`는 520px로 압축된 카드용 썸네일이라 원본보다 수치가
높게 나온다(로봇 0.127 → 0.225). 저해상도 입력이 실제로 더 어렵게 추적되는 것이므로
버그는 아니지만, 보정은 **원본 해상도 기준**으로 했다.

### 배포 준비

`DEPLOY.md` 신규. 공개 배포에서 가장 위험한 건 **목업 결제가 그대로 나가는 것**이었다.
방문자가 결제 없이 "구매"를 끝낼 수 있고, 그건 사실이 아닌 상태를 보여주는 것이다.

`CHECKOUT_MODE`를 환경변수로 바꾸고 **기본값을 비대칭으로** 잡았다.

| | 기본 동작 |
|---|---|
| dev 서버 | `mock` — 퍼널 전체를 걸어볼 수 있다 |
| 프로덕션 빌드, 미설정 | **`disabled`** — 가격은 보이되 "Not available yet", 아무것도 안 열린다 |
| `VITE_CHECKOUT_MODE=mock` | 검토용 배포에서만 명시적으로 opt-in |

프로덕션 빌드에서 목업 경로가 **번들에서 제거되는 것**까지 확인했다(`(test)` 문자열 부재).

추가로:
- `AI_RETOUCH_CONNECTED = false` — 결제 모드와 **분리된** 플래그. "돈을 받을 수 있나"와
  "리터치가 진짜인가"는 다른 주장이고, 데모 카드를 AI라고 부를 수 있는지는 후자만 결정한다.
  §29의 경고 배너를 이 값에 걸었다(전에는 목업 여부에 걸려 있어서, 정직성이 가장 필요한
  프로덕션 빌드에서 오히려 안 떴다)
- `index.html`에 `noindex, nofollow` + 제거 시점을 적은 주석. 존재하지 않는 유료 기능을
  광고하는 페이지가 색인되면 안 된다
- `.env.example` 신규

---

## §32. Nano Banana 직결 — AI 리터치 연결 (2026-08-28)

### 문서 불일치를 먼저 해소했다

두 문서가 **서로 다른 모델 클래스**를 전제하고 있었다.

| | 전제 |
|---|---|
| §15 | **Nano Banana** — "이미지 편집 모델은 프롬프트가 길수록 개별 지시의 영향력이 떨어진다" |
| `PHASE2_GUIDE.md` §1 (이전) | fal.ai의 **line-art 계열 모델**, `FAL_MODEL_ID` |

§15는 **지시-따르기 편집 모델** 전용으로 쓰여 있다 — *"at most four whiskers per side"*,
*"never stipple the flower centre"*, *"ignore every reflection"*. FLUX 계열 line-art
LoRA·ControlNet은 이런 산문 지시를 대부분 무시한다. 스타일 전이 모델이지 편집 모델이 아니다.

그리고 §15는 이 프로젝트에서 **가장 비싼 자산**이다. v4까지 반복했고 피사체별 실패 모드를
분석해 모듈로 나눠놨다. §27에서 무료 트레이서로 재현하려다 실패한 그 지식이 전부 거기 있다.

**결론: 모델은 Nano Banana 계열로 고정하고, 프로바이더는 직결.**
애그리게이터의 유일한 실질 이점(모델 교체)은 이미 `/api/ai-preview`라는 **자체 경계**가
제공한다. 교체는 그 파일 하나를 고치는 일이지, 벤더가 주는 게 아니다.
`PHASE2_GUIDE.md`·`START_HERE.md`의 fal.ai 표기를 전부 정리했고,
환경변수는 벤더 중립인 `AI_MODEL_ID`로 뒀다.

### 구현

`api/ai-preview.ts` (Vercel Edge, **의존성 추가 없음** — 순수 `fetch`)

- `POST { imageBase64, mimeType, module, otherWord }` → `{ previews: { simple, detailed } }`
- §15의 `buildPrompt()`를 **서버에서** 조립한다. `otherWord`는 클라이언트가 이미 검증했어도
  서버가 다시 `sanitizeSubjectWord()`를 돌린다 — 클라이언트 사본을 믿지 않는다
- variant 2장을 병렬 호출. **한 장이라도 실패하면 쌍 전체를 실패**시킨다. 카드 한 장만 보여주면
  구매에 뭐가 포함되는지 잘못 전달하게 되고, 재시도가 더 싸다
- 모델이 이미지를 안 주는 경우(안전 필터·설명 텍스트 반환 등)를 **정상 경로로 처리**한다.
  API 용어가 아니라 사용자 언어로 사유를 돌려준다

`src/utils/aiPreview.ts`

- 업로드 전 **1280px JPEG로 재인코딩**한다. 12MP 원본을 보낼 이유가 없고(§3-1도 프리뷰는
  저해상도), 호출이 싸고 빨라진다. HEIC도 이 시점엔 이미 디코드된 상태라 같이 정규화된다
- 엔드포인트 없음(404/503/비-JSON)은 **에러가 아니라 정상 상태**로 취급한다 →
  `AiPreviewUnavailable`

### 정직성이 이제 플래그가 아니다

기존 `AI_RETOUCH_CONNECTED` 상수를 **삭제**했다. "이건 AI가 아니다" 경고는 이제
`usedRealAi` — **실제로 모델이 답을 줬는지** —에 걸린다.

- 진짜 AI 결과가 오면 경고가 사라지고 태그가 `Preview`
- 키가 없거나 엔드포인트가 없으면 로컬 트레이서로 폴백하고 경고 + `Not AI` 태그

손으로 켜고 끄는 스위치가 없으므로 **거짓말을 할 수 없는 구조**다. 손으로 켜는 플래그는
켜는 걸 잊거나, 더 나쁘게는 일찍 켜게 된다.

### 콘텐츠 정책 — 경고만, 차단 없음

요청대로 **업로드를 검사하거나 막는 코드는 넣지 않았다.** 저작권 고지는 텍스트로만 존재하고,
프리뷰 생성 전후 모두 보이게 둔다(파일이 실제로 생긴 뒤가 오히려 생각할 시점이다).

다만 **모델 제공자의 정책은 서버 쪽에서 여전히 적용된다** — 그건 우리가 끄고 켤 수 있는 게
아니다. 그래서 거절을 크래시가 아니라 평범한 결과로 처리하고, 다시 시도 버튼과 함께
읽을 수 있는 문구를 보여준다. "오류만 안 나면 된다"는 요구가 코드에서 뜻하는 바가 이것이다.

### 거절은 재시도 대상이 아니다

모델 제공자의 정책이 서버 쪽에서 적용된다는 건, **거절이 자주 밟히는 정상 경로**라는 뜻이다.
사람·아이 사진이 핵심 유스케이스이므로 더욱 그렇다. 처음 구현은 모든 실패에 "Try again"을
붙였는데, 안전 거절에 재시도를 권하면 **같은 사진으로 같은 거절을 반복하는 고리**에 밀어넣게 된다.

`AiPreviewError.retryable`로 갈랐다.

| 상태 | 재시도 | 화면 |
|---|---|---|
| 429 혼잡 · 502 네트워크 | O | "Try again" |
| **422 모델 거절** · 415 형식 · 413 크기 | X | "Back to the free editor" |

거절 문구도 막다른 길이 아니라 **무료 변환기를 가리킨다** — 같은 사진으로 페이지는 여전히 나온다.

### 거절 문구는 이유를 추측하지 않는다

검토 중 나온 초안은 *"deepfake concerns로 인물 이미지 생성이 제한됩니다"* 계열이었다. 쓰지 않았다.

**API는 차단됐다는 사실만 알려주지, 사진의 무엇이 걸렸는지는 말해주지 않는다.** 이유를 적으면
그건 추측이고, 틀린 추측은 없는 것보다 나쁘다 — 아이 사진을 올린 부모에게 딥페이크를 언급하면
불쾌하고, 꽃다발이 거절됐는데 같은 문구가 뜨면 앱이 고장 난 것처럼 보인다.

확정 문구:

| 상황 | 문구 |
|---|---|
| SAFETY / blockReason | *AI retouch isn't available for this photo. Try a different image — your free coloring page still works.* |
| **RECITATION** | *…Try a photo you took yourself — your free coloring page still works.* |
| 이미지 없음(차단 아님) | *AI retouch didn't return a page this time. Please try again.* |

`RECITATION`만 힌트를 다르게 준다. 그건 **API가 실제로 "기존 저작물과 유사"라고 말한 경우**라
추측이 아니기 때문이다.

세 문구 모두 **무료 변환기를 가리킨다.** 여기서 막다른 길을 만들면, 처음부터 작동하는 선택지를
갖고 있던 사용자를 잃는다.

**상태 코드와 문구는 반드시 일치해야 한다.** 처음 구현은 "이미지 없음(차단 아님)"에도 422를
줬는데, 문구는 "다시 시도하세요"였고 버튼은 재시도를 감춘 상태였다 — 서로 모순. 그 경로는
502(재시도 가능)로 고쳤다.

### 배포 시 확인할 것

- `GEMINI_API_KEY` (서버 전용, `VITE_` 접두사 금지 — 붙이면 번들에 노출된다)
- `AI_MODEL_ID` 기본값 `gemini-2.5-flash-image` — **모델명은 자주 바뀌니 현재 목록에서 확인할 것**
- `api/ai-preview.ts`가 `../src/utils/prompt`를 import한다. Vercel 번들러가 처리하지만
  **첫 배포에서 반드시 확인**할 것 (로컬 vite dev에는 `api/` 라우트가 없어 검증 불가)
- `vercel.json`의 rewrite는 이미 `/api/`를 제외하고 있다
