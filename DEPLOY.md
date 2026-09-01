# 배포 가이드

Vercel 기준. 정적 SPA라 서버 설정은 `vercel.json`의 rewrite 하나가 전부다.

## 지금 배포하면 무엇이 동작하나

| | 상태 |
|---|---|
| 무료 변환기 (업로드 → 선화 → A4 300 DPI 다운로드·인쇄) | **완전히 동작한다** |
| 편집 핸들 (굵기 / 디테일 / Clean up 6단계 / 지우개 / 텍스트) | **완전히 동작한다** |
| 랜딩·샘플·FAQ·약관·환불정책 | **완전히 동작한다** |
| AI 리터치 | **없다.** `/api/ai-preview` 미구현 |
| 결제 | **없다.** `/api/checkout`·웹훅 미구현 |

즉 **무료 제품은 지금 그대로 내보낼 수 있고, 유료 퍼널은 껍데기다.**

## 배포 전 반드시 확인할 것

### 1. `VITE_CHECKOUT_MODE`

|  | 무엇이 보이나 |
|---|---|
| 설정 안 함 (프로덕션 빌드 기본값) | `disabled` — 가격은 보이되 버튼이 "Not available yet", **아무것도 열리지 않는다** |
| `mock` | 결제 없이 HD 단계까지 전부 걸어볼 수 있다. **검토용 링크에만** |
| `live` | Phase 2 완료 후 |

**공개 도메인에 `mock`으로 올리지 말 것.** 방문자가 결제 없이 "구매"를 끝낼 수 있고,
그건 사실이 아닌 상태를 보여주는 것이다. 기본값이 `disabled`인 이유다.

### 2. noindex

`index.html`에 `<meta name="robots" content="noindex, nofollow">`가 들어 있다.
존재하지 않는 유료 기능을 광고하는 페이지가 색인되면 안 되기 때문이다.
**AI와 결제가 실제로 붙는 날 이 줄을 지운다.**

### 3. 정직성 플래그

데모 카드 위의 "이건 AI 결과물이 아니다" 경고는 이제 **플래그가 아니라 실제 결과**에 걸려 있다.
`/api/ai-preview`가 진짜 이미지를 돌려주면 경고가 사라지고, 그렇지 않으면(키 없음·엔드포인트 없음)
로컬 트레이서로 폴백하면서 경고가 뜬다. 손으로 켜고 끄는 스위치가 없으므로 거짓말을 할 수 없다.

`GEMINI_API_KEY`가 없으면 `/api/ai-preview`는 503을 돌려주고, 화면은 폴백 + 경고 상태가 된다.

## 절차

```bash
npm install
npm run lint      # tsc --noEmit
npm run build     # dist/
```

로컬에서 프로덕션 빌드 확인:

```bash
npm run preview
```

Vercel CLI로 배포(계정 로그인은 직접 해야 한다):

```bash
npx vercel
```

프로덕션 승격:

```bash
npx vercel --prod
```

Vercel 프로젝트 설정:

- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`
- Region: **iad1** (`PHASE2_GUIDE.md` §0에서 고정)
- Environment Variables: 검토용 배포라면 `VITE_CHECKOUT_MODE=mock`, 공개용이면 설정하지 않는다

## 검토용 단일 파일

서버 없이 파일 하나로 돌려보게 하려면:

```bash
npm run build:review   # dist-single/colorsketch-review.html
```

다운로드·인쇄는 샌드박스에서 막힌다(`README.md` 참고). 그 두 개까지 검토받아야 하면
Vercel 프리뷰 배포를 쓴다.

## 도메인을 붙이기 전에

- [ ] `CONTACT_EMAIL`(`src/config.ts`)이 실제로 받는 주소인지
- [ ] `PRICE_USD`가 Lemon Squeezy 상품 가격과 같은지 — 표기만 하는 값이라 어긋나도 결제는 되고, 사용자만 속는다
- [ ] 약관·환불정책의 사업자 정보가 실제 정보인지
- [ ] noindex 제거 여부 (위 2번)
- [ ] `AI_RETOUCH_CONNECTED` (위 3번)
