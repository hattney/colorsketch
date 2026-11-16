# 무료 버전 배포 인수인계 (Cloudflare Pages)

작성: 2026-11-16. 이 문서 하나만 읽고 이어서 작업할 수 있도록 썼습니다.
사용자 호칭은 "현희님", 답변은 한국어로 합니다.

## 1. 왜 이 작업을 하는가

ColorSketch(사진 → 컬러링 페이지)는 결제를 붙이면 Vercel Pro(월 $20)가 필요해서 보류됐습니다.
수요가 확인되지 않은 상태에서 고정비를 내지 않기로 했고, 대신 다음을 합니다.

- 무료 변환기는 전부 브라우저에서 돌아가므로 서버가 필요 없습니다.
- 이 부분만 Cloudflare Pages 무료 플랜(상업적 이용 허용)에 올려 4~6주 수요를 봅니다.
- AI 유료 기능 자리에는 대기 명단(이메일)을 넣어 구매 의향을 잽니다.
- 판단 기준(제안): 6주 뒤 월 방문 1,000명 미만이고 대기 명단이 거의 없으면 중단.
  현희님은 대기 명단은 거의 안 쓸 거라고 보고 있어서, 주 지표는 방문자 수와 실제 사용입니다.

## 2. 지금 상태

| 항목 | 상태 |
|---|---|
| 무료 전용 빌드 (`npm run build:free`) | 완료, 커밋 `24eb0dd`, main에 푸시됨 |
| 로컬 검증 (화면, 대기 명단 함수) | 완료 |
| `wrangler login` | 완료 (현희님이 2026-11-16에 허용) |
| KV 저장소 생성 | 완료, id `1ae777986009479e89ceb444ea279ea1`, `wrangler.toml`에 반영 |
| Pages 프로젝트 생성 | 완료, `colorsketch.pages.dev` |
| 배포 | 완료 (2026-11-16), curl 점검 전부 통과, 관리자 토큰은 `.env.pages.local` |
| 방문자 집계 켜기 | 완료 (2026-11-16, 프로젝트 → 메트릭 탭 맨 아래 Web Analytics, 배포 시 비콘 자동 삽입) |
| Google Search Console | 소유권 확인 완료 (2026-11-16, HTML 파일 방식, `functions/google125384cf37bfbfa1.html.ts`로 제공) |

기존 Vercel 사이트(`colorsketch-amber.vercel.app`, 유료 경로 포함, noindex)는 그대로 떠 있습니다. 건드리지 않습니다.

## 3. 남은 작업 (순서대로)

작업 폴더는 `D:\NEW_study_work\2608_ai_small_site_coloring\colorsketch-handoff` 입니다.
명령은 Bash 도구로 실행합니다. PowerShell에서는 `npx`가 실행 정책에 막히므로 `npx.cmd`를 써야 합니다.

### 3-1. 로그인 확인

```bash
npx wrangler whoami
```

"You are logged in"이 나와야 합니다. 아니면 현희님께 `npx.cmd wrangler login`을 다시 부탁합니다.

### 3-2. KV 저장소 만들기

```bash
npx wrangler kv namespace create WAITLIST
```

출력에 나오는 `id`를 `wrangler.toml`의 `REPLACE_WITH_KV_NAMESPACE_ID` 자리에 넣습니다.
이 id는 비밀이 아니므로 커밋해도 됩니다.

### 3-3. Pages 프로젝트 만들기

```bash
npx wrangler pages project create colorsketch --production-branch main
```

출력에 실제 주소가 나옵니다. `colorsketch.pages.dev`가 이미 쓰이고 있으면 `colorsketch-xxx.pages.dev`처럼 뒤에 문자가 붙습니다.
**이 주소를 다음 단계의 `SITE_URL`로 씁니다.** 프로젝트 이름이 바뀌었다면 `wrangler.toml`의 `name`도 맞춥니다.

### 3-4. 관리자 토큰 설정

대기 명단 조회용입니다. 직접 생성하고, 채팅에는 값을 적지 않습니다.

```bash
TOKEN=$(openssl rand -hex 24)
echo "$TOKEN" | npx wrangler pages secret put ADMIN_TOKEN --project-name colorsketch
printf 'PAGES_ADMIN_TOKEN=%s\n' "$TOKEN" > .env.pages.local
```

`.env*`는 gitignore 대상이라 `.env.pages.local`은 커밋되지 않습니다. 현희님께는 "토큰은 이 파일에 있다"고만 알립니다.

### 3-5. 빌드와 배포

```bash
SITE_URL=https://<3-3에서 받은 주소> npm run build:free
npx wrangler pages deploy dist --project-name colorsketch --branch main
```

`SITE_URL` 끝에 슬래시를 붙이지 않습니다. 이 값이 canonical, 공유 이미지, 사이트맵 주소에 들어갑니다.
`functions/` 폴더는 배포 때 자동으로 함께 올라갑니다.

### 3-6. 배포 확인

`B=https://<주소>` 로 두고 확인합니다.

```bash
curl -s -o /dev/null -w "%{http_code}\n" $B/                       # 200
curl -s $B/ | grep -c "noindex"                                    # 0 이어야 함
curl -s $B/robots.txt                                              # Allow + Sitemap 줄
curl -s -o /dev/null -w "%{http_code}\n" $B/sitemap.xml            # 200
curl -s -o /dev/null -w "%{http_code}\n" $B/og.png                 # 200
curl -s -o /dev/null -w "%{http_code}\n" $B/terms                  # 200 (SPA 폴백)
curl -s -w " [%{http_code}]\n" -X POST $B/api/waitlist -H "content-type: application/json" -d '{"email":"deploy-check@example.com","source":"editor"}'   # {"ok":true} [200]
curl -s -w " [%{http_code}]\n" $B/api/waitlist                     # 401
```

토큰으로 목록이 조회되는지도 확인합니다(값은 출력하지 않도록 파일에서 읽습니다).

```bash
curl -s -H "authorization: Bearer $(cut -d= -f2 .env.pages.local)" $B/api/waitlist
```

확인이 끝나면 테스트 주소를 지웁니다.

```bash
npx wrangler kv key delete "e:deploy-check@example.com" --namespace-id <KV id> --remote
```

`POST /api/waitlist`가 503이면 KV 바인딩이 안 붙은 것입니다. `wrangler.toml`의 id를 확인하고 다시 배포합니다.

브라우저로도 한 번 확인합니다: 사진 업로드 → 변환 → 다운로드, 에디터 하단 대기 명단 카드.

### 3-7. 마무리

- `wrangler.toml`(KV id 반영)을 커밋하고 푸시합니다.
- 현희님께 주소와 아래 "현희님이 할 일"을 전달합니다.

## 4. 현희님이 할 일 (배포 후 안내)

1. **방문자 집계 켜기:** Cloudflare 대시보드 → Workers & Pages → colorsketch → Metrics → Web Analytics 활성화. 이게 있어야 방문자 수로 판단할 수 있습니다.
2. **Google Search Console 등록:** 사이트 소유 확인이 필요합니다. HTML 태그 방식을 고르면 받은 메타 태그를 `index.html`에 넣고 다시 배포해야 하니, 태그 값을 받아서 작업합니다.
3. **도메인(선택):** 나중에 자체 도메인을 붙이면 `SITE_URL`을 바꿔 다시 빌드·배포합니다.
4. **대기 명단 보는 법:** `https://<주소>/api/waitlist?token=<.env.pages.local의 값>`

## 5. 코드 구조 요약

- `src/config.ts`의 `FREE_ONLY` (`import.meta.env.MODE === 'free'`)가 무료 버전 분기의 전부입니다.
- 분기가 들어간 곳: `App.tsx`(결제 관련 경로 차단), `Editor.tsx`(AI 버튼 숨김, 대기 명단 카드), `Hero.tsx`, `Steps.tsx`, `Samples.tsx`, `Faq.tsx`(무료용 목록 별도), `Footer.tsx`, `Terms.tsx`.
- `src/components/Waitlist.tsx`: 이메일 폼. `/api/waitlist`로 POST.
- `functions/api/waitlist.ts`: Cloudflare Pages Function. KV에 이메일, 시각, 출처, hard(어려운 사진 여부)만 저장. IP는 저장하지 않고 해시로 시간당 5회 제한만 합니다.
- `vite.config.ts`의 `freeEdition` 플러그인: free 모드에서 noindex 제거, robots.txt·sitemap.xml 생성, `SITE_URL`이 있으면 canonical·공유 이미지 태그 삽입.
- `scripts/make-og.mjs`: 공유 이미지(`public/og.png`) 생성.
- 기본 빌드(`npm run build`)는 유료 경로 포함 전체 버전이고 Vercel이 씁니다. 영향받지 않게 유지합니다.

로컬 실행:

```bash
npm run build:free && npm run pages:dev     # http://localhost:8788, 로컬 KV, ADMIN_TOKEN=local-test-token
```

## 6. 작업할 때 주의할 점

- **비밀값:** 현희님의 API 키를 채팅으로 받지 않습니다. 직접 생성한 값(관리자 토큰 등)만 다루고, 채팅에 값을 적지 않습니다.
- **개인정보 원칙:** 무료 버전은 "사진이 기기를 떠나지 않는다"고 약속합니다. 사진을 서버로 보내는 코드를 넣지 않습니다.
- **용지 표기:** "A4"만 단독으로 쓰지 않습니다. 항상 "US Letter or A4".
- **tsconfig에 `strict`가 없습니다.** 구분 유니온은 `=== false`로 좁힙니다.
- **포매터:** prettier 설정 파일이 없습니다. 기본값으로 돌리면 파일 전체가 바뀌니 돌리지 않습니다(필요하면 `--print-width 100 --single-quote`).
- **수정 방식:** 긴 수정은 스크래치패드에 `.cjs` 스크립트를 쓰고 `node`로 실행합니다. heredoc 안의 백틱 때문에 `node -`는 깨집니다.
- **커밋:** 메시지를 파일로 쓰고 `git commit -F`. `.claude/`는 커밋하지 않습니다. main에 푸시하면 Vercel도 다시 배포됩니다(전체 버전, 문제없음).
- **브라우저 패널:** 패널이 가려져 있으면 `window.innerWidth`가 0이고 스크롤·rAF가 동작하지 않습니다. `resize_window`로 크기를 지정하면 측정은 됩니다. 스크린샷은 믿기 어려우니 DOM으로 확인합니다.
- **미리보기 서버 설정:** 세션 루트가 상위 폴더라 `D:\NEW_study_work\2608_ai_small_site_coloring\.claude\launch.json`을 읽습니다. `colorsketch-free-pages`(포트 8788)가 등록돼 있습니다.
- **Turnstile:** 무료 버전에는 없습니다. 전체 버전의 Turnstile은 자동화 브라우저를 차단하므로 테스트할 수 없습니다.

## 7. 알려진 문제와 남은 판단

- **무료 변환 품질:** 일러스트는 잘 나오지만 실사에 가까운 이미지는 거칩니다. 이번 검증의 핵심 변수입니다.
- **검색 유입:** 지금은 한 페이지짜리 SPA입니다. 유입이 없으면 키워드별 정적 페이지("photo to coloring page" 계열)를 추가하는 것이 다음 후보입니다. 시장 조사(경쟁 서비스, 검색량, Etsy 시세)는 아직 하지 못했습니다.
- **Vercel 쪽 비용 로그:** `/api/admin/stats`가 "Could not read stats"를 냅니다. Upstash 무료 DB가 미사용으로 멈췄을 가능성이 있으나 원인은 확인하지 않았습니다. 무료 버전과는 무관합니다.
- **기존 Vercel 사이트:** 가격과 결제 버튼이 보이는 상태로 떠 있습니다(noindex). 무료 버전이 자리 잡으면 내릴지 현희님이 정합니다.
