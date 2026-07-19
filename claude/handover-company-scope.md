# Claude Code 핸드오버 — 회사 스코프 잔여 2건

작성 2026-07-19 · 대상 `SimpleorNothing/competitor_intelligence` · 선행 PR #109(머지 완료)

PR #109에서 워치리스트·인박스의 **표시**는 회사 탭 기준으로 필터되도록 고쳤다.
아래 두 건은 파일 크기 때문에 GitHub MCP 인라인 커밋이 불가해 로컬 git으로 처리한다.

- `src/index.js` 32KB — 안전 한계(~30KB) 초과
- `public/data/evidence.json` 91KB — 인라인 커밋 확정 실패 구간(56~64KB↑)

권장 브랜치: `company-scope-followup` → PR → squash merge.

---

## 1. `src/index.js` — 승격 시 companyId 하드코딩 제거 (우선순위 상)

**증상**: `handlePromote`가 새 evidence 항목을 항상 `companyId: "lg"`로 기록한다.
Midea 인박스를 "판정대로 반영하기"로 승격하면 `axisId: "midea-a1"` 인데 `companyId: "lg"`인
불일치 항목이 생긴다. 보드 표시는 `axisId` 기준이라 화면엔 안 보이지만, companyId로
집계·필터하는 후속 로직(탭 필터 확장, 회사별 카운트)에서 그대로 오염된다.

**위치**: `async function handlePromote(...)` 내부, `for (const it of items.slice(0, 5))` 루프.

변경 전:
```js
    added.push({
      id: nextId++,
      companyId: "lg",
      axisId: String(it.axisId),
```

변경 후:
```js
    const axisId = String(it.axisId);
    // companyId 는 axisId 접두(lg-a2 → lg)에서 도출. 과거 "lg" 하드코딩 탓에
    // Midea 등 타사 인박스를 승격하면 LG 증거로 잘못 들어갔다.
    const coId = axisId.split("-")[0] || (entry && entry.companyId) || "lg";
    added.push({
      id: nextId++,
      companyId: coId,
      axisId,
```

주의: `entry`는 루프 앞에서 이미 선언돼 있다(`const entry = (data.inbox || []).find(...)`).
`axisId` 지역 상수를 새로 만들므로 루프 안에서 `it.axisId`를 다시 쓰는 곳이 없는지 확인.

검증: `node --check src/index.js` → `npx wrangler dev` 로컬에서
`POST /api/promote` 에 `items:[{axisId:"midea-a1", event:"테스트"}]` → 결과 항목의
`companyId === "midea"` 확인 후 커밋 되돌리기.

---

## 2. `public/data/evidence.json` — 레거시 인박스 companyId 백필 (우선순위 중)

**현황**: `inbox[]` 12건 중 `companyId` 필드를 가진 항목이 없다. PR #109는 note 앞머리
`[Midea …]` 문자열로 회사를 추정해 필터한다. 동작은 하지만 note를 편집하면 깨지는
문자열 의존이므로 필드로 고정한다.

| inbox id | companyId | 근거 |
|---|---|---|
| `inbox-1` | `lg` | LG 2026 TV 라인업 |
| `inbox-4` | `lg` | LG 구독 매출 재확인 |
| `inbox-5` | `lg` | LG·삼성 GB200 냉각 |
| `inbox-6` | `lg` | LG HS·ES 이관/조직개편 |
| `inbox-7` | `midea` | 4대 전략주축 선포 시점 |
| `inbox-8` | `midea` | AIDC 냉각 단독 매출 |
| `inbox-9` | `midea` | 이구환신 · 중국 수요 |
| `inbox-10` | `midea` | Annto 홍콩 IPO |
| `inbox-11` | `midea` | 구독형 BM 갭 시그널 |
| `inbox-12` | `midea` | 전주택 스마트 전략 |
| `ib-w-a2-nvidia` | `lg` | 워치리스트 `lg-a2` 유래 |
| `ib-w-a4-costtarget` | `lg` | 워치리스트 `lg-a4` 유래 |

적용 스크립트(레포 루트에서 실행, 키 순서·들여쓰기 2칸 유지):

```python
import json, collections
p = "public/data/evidence.json"
d = json.load(open(p, encoding="utf-8"), object_pairs_hook=collections.OrderedDict)
MIDEA = {"inbox-7","inbox-8","inbox-9","inbox-10","inbox-11","inbox-12"}
for i in d["inbox"]:
    if "companyId" not in i:
        i["companyId"] = "midea" if i["id"] in MIDEA else "lg"
open(p, "w", encoding="utf-8").write(json.dumps(d, ensure_ascii=False, indent=2) + "\n")
```

검증:
```bash
python3 -m json.tool public/data/evidence.json > /dev/null
git diff --stat   # inbox 12줄 추가만, items[] 무변경일 것
```

`items[]`가 diff에 뜨면 중단할 것 — Worker(`/api/promote`, `/api/watchlist-action`)가
`JSON.stringify(data, null, 2)`로 쓰므로 포맷은 동일해야 하지만, 비ASCII 이스케이프
차이가 생기면 전체 파일이 재작성돼 리뷰가 불가능해진다(`ensure_ascii=False` 필수).

---

## 3. 후속 확인 (선택)

- 백필 후 `public/watchlist-action.js`의 `coOfInbox()` note 추정 분기는 그대로 둬도 된다
  (새 항목은 필드로 판정되고, 추정은 폴백으로만 남음).
- `public/data/watchlist.json`은 파일 단위 `companyId: "lg"` + 전 항목 `axisId` 접두가
  `lg-` 라 별도 조치 불필요. Midea 워치리스트를 만들 때는 `items[].companyId`를
  항목마다 넣거나 회사별 파일 분리를 결정해야 한다 — **판단 필요**.
- `scanWatchlist`(cron)는 MI news를 회사 구분 없이 키워드 매칭한다. Midea 항목이
  추가되면 중국어 키워드·소스 커버리지를 별도 점검할 것.
