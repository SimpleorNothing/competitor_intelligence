# CI — 경쟁사 전략 추적 보드

선언된 전략(L1·L2)과 실행 증거(L3)의 정합성을 추적하는 Competitor Intelligence 도구.
**Cloudflare Workers(정적 자산 + run_worker_first)** 배포. 포탈(`samsungda-portal`)과 동일한 아키텍처 패턴.

> Cloudflare가 신규 정적 사이트를 Workers 정적 자산 서빙으로 유도하는 추세라, 계정에 따라
> 대시보드에 Pages 진입점이 보이지 않을 수 있다. 이 레포는 그 경우를 전제로 Workers 구조로 작성됨.

## 구조

```
ci-site/
├── src/
│   └── index.js           # Worker 진입점 — SSO 게이트 → 정적 자산(public/) 프록시
├── public/                 # 정적 자산 루트 (ASSETS 바인딩)
│   ├── index.html          # 보드 전체 (단일 파일, CSS/JS 내장)
│   ├── data/
│   │   ├── strategies.json # L1 전략 프레임 + L2 추진전략 축
│   │   └── evidence.json   # L3 실행 증거 타임라인 + 미분류 인박스
│   └── .nojekyll
├── wrangler.jsonc           # Workers 배포 설정 (assets.run_worker_first: true)
└── README.md
```

## 접근 보호 (Space 방식 SSO)

포탈에서 로그인했으면 `ci.samsungda.net` 자동 통과, 직접 접속 시엔 같은 비밀번호로 로그인.
`src/index.js`가 포탈과 **동일한 3규칙**을 복제해 세션을 공유한다:
- 같은 `SITE_PASSWORD` secret 값
- 같은 토큰 파생 `HMAC(SITE_PASSWORD, "da-portal-auth-v1")`
- 같은 쿠키 `da_portal_session`, `Domain=.samsungda.net`, 약 180일

비밀번호는 **하나**(포탈과 공유). 값이 다르면 세션 호환이 깨진다. 비밀번호를 바꾸면 파생 토큰이 달라져 기존 쿠키가 전부 자동 무효화된다.

`wrangler.jsonc`의 `assets.run_worker_first: true`가 핵심 — 이게 없으면 Cloudflare가 `public/index.html`을 Worker보다 먼저 서빙해 게이트가 걸리지 않는다(포탈 핸드북과 동일한 함정).

## 배포

1. GitHub 레포(`competitor_intelligence`) 이 구조 그대로 push (Private 권장)
2. Cloudflare 대시보드 → **Workers & Pages → Create application** → Git 연결 → 레포 선택
3. **Set up your application** 화면에서:
   - Deploy command: `npx wrangler deploy` (기본값 그대로)
   - Build command는 비워도 무방(정적 파일뿐)
4. **Deploy 누르기 전에 secret 먼저 설정** (터미널에서, 포탈과 동일 값):
   `npx wrangler secret put SITE_PASSWORD`
   (대시보드 배포 후라면 Settings → Variables and Secrets에서 추가 후 재배포)
5. Deploy 실행
6. Custom domain 연결: Worker 설정 → Triggers → Custom Domains → `ci.samsungda.net` 추가
   (samsungda.net이 Cloudflare DNS에 있으면 CNAME 자동 반영)
7. 포탈(`samsungda-portal/public/index.html`)에 도구 카드 추가 + 핸드북 도구 표 갱신

이후 GitHub `main`에 push하면 자동 재배포된다.

> ⚠️ **secret 설정 전에는 게이트가 비활성 상태로 배포된다** (`src/index.js`의 `if (!env.SITE_PASSWORD)` 분기).
> 반드시 배포 직후 `SITE_PASSWORD`를 확인하고, 비밀번호 없이 접속되지 않는지 직접 테스트할 것.

## 데이터 모델 요약

- **strategies.json** — 회사별 `frame`(statement / redefinition / declaredAt / redefinedAt / targets / keyPeople)과
  `axes[]`(code, title, basis: 공표|추론|가설, kpi[], execStatus: 가속|순항|지연|방향전환, statusRationale)
- **evidence.json** — `items[]` 각 항목: date(`YYYY-MM-DD` 또는 `YYYY-MM`), event(사실), interpretation(해석),
  signalType(New|Deep|Insight), confidence(사실|추론|가설), source{name,url,tier}, reviewStatus(seeded|auto|reviewed)
- **inbox[]** — 기존 축에 매핑되지 않는 증거·추가 센싱 요청. 누적 시 새 전략축 출현(방향전환) 조기 경보로 활용

## 운영 규율

- **주간(월) 검토**: `reviewStatus: auto` 항목의 해석 검수 → `reviewed` 승격, 축 매핑 오류 수정,
  `execStatus`·`lastVerified` 갱신
- **증거 원칙**: event(사실)와 interpretation(해석) 분리 유지. 단일 출처·미검증 항목은 confidence를
  `추론`/`가설`로 강등하고 인박스에 재검증 요청 기록
- **분기 검증**: L1·L2가 최신 전략으로 유효한지 총론 재검색 — CEO 교체·조직개편·목표 수치 변경은
  즉시 frame/axes 반영

## 2차 자동화 (예정 — 아직 미구현)

`market-insight` 패턴 재사용:
`mi`의 news.json(경쟁사 태그) → 일 1회 GitHub Action → Claude API로
① 축 매핑(불가 시 inbox) ② 해석 1~2문장 ③ New/Deep/Insight 판정 →
`evidence.json` append(`reviewStatus: auto`) → execStatus 재계산.
필요 시크릿: `ANTHROPIC_API_KEY`, Workflow permissions: Read and write.
