# CI — 경쟁사 전략 추적 보드

선언된 전략(L1·L2)과 실행 증거(L3)의 정합성을 추적하는 Competitor Intelligence 도구.
`2030-insight`와 동일한 GitHub Pages 정적 보드 패턴(빌드 과정 없음, `.nojekyll`).

## 구조

```
ci-site/
├── index.html            # 보드 전체 (단일 파일, CSS/JS 내장)
├── data/
│   ├── strategies.json   # L1 전략 프레임 + L2 추진전략 축 (느린 층, 큐레이션)
│   └── evidence.json     # L3 실행 증거 타임라인 + 미분류 인박스 (빠른 층, 누적)
├── .nojekyll
└── README.md
```

## 데이터 모델 요약

- **strategies.json** — 회사별 `frame`(statement / redefinition / declaredAt / redefinedAt / targets / keyPeople)과
  `axes[]`(code, title, basis: 공표|추론|가설, kpi[], execStatus: 가속|순항|지연|방향전환, statusRationale)
- **evidence.json** — `items[]` 각 항목: date(`YYYY-MM-DD` 또는 `YYYY-MM`), event(사실), interpretation(해석),
  signalType(New|Deep|Insight), confidence(사실|추론|가설), source{name,url,tier}, reviewStatus(seeded|auto|reviewed)
- **inbox[]** — 기존 축에 매핑되지 않는 증거·추가 센싱 요청. 누적 시 새 전략축 출현(방향전환) 조기 경보로 활용

## 배포 (핸드북 절차와 동일)

1. 이 레포(`competitor_intelligence`)의 `main` 브랜치에 파일 일체 커밋 (완료)
2. Settings → Pages → Source: `main` 브랜치 root (Actions 불필요 — 정적 파일뿐)
3. Custom domain `ci.samsungda.net` 입력 → DNS check 후 Enforce HTTPS
4. DNS 등록기관에서 `ci` → `<계정>.github.io` CNAME 레코드 추가
5. 포탈(`samsungda-portal/public/index.html`)에 도구 카드 추가 + 핸드북 도구 표 갱신

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
