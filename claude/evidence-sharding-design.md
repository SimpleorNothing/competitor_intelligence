# evidence 월별 샤딩 설계

작성 2026-07-19

## 문제

`evidence.json` 96KB. GitHub Contents API 는 부분 수정이 없어 한 건을 넣어도 파일 전체를 보내야 하는데, Claude 는 그 크기를 인라인으로 커밋할 수 없다. 증거 5건(2KB) 등재에 96KB 수작업 handover 가 필요했다. 증거는 계속 쌓이는 파일이라 상황은 악화만 된다.

## 구조

```
public/data/evidence.json          96KB  ← 아카이브로 고정(105건). 더 늘리지 않음
public/data/evidence/2026-07.json   ~2KB ← 신규 증거는 여기부터
public/data/evidence/2026-08.json   ~2KB
...
```

**월별(삽입 시점 기준) 샤드.** 축별이 아니라 월별을 택한 이유:

- 축별은 신규 축이 생길 때마다 파일이 늘고, promote 가 여러 축에 걸친 항목을 넣을 때 커밋이 축 수만큼 발생한다
- 월별은 promote 가 항상 한 파일만 쓴다. 커밋 1회
- 월 목록을 `SHARD_START`부터 현재 KST 월까지 결정적으로 계산할 수 있어 **매니페스트 파일이 불필요**하다 (매니페스트는 그 자체가 동시 쓰기 충돌 지점이 된다)

증거의 `date` 필드는 사건 시점 그대로 두고, 샤드는 **적재 시점** 기준으로 가른다. 보드는 어차피 병합 후 date 로 정렬한다.

## 프런트 무변경

`index.html`(61KB)은 손댈 수 없다. 그래서 프런트는 그대로 `data/evidence.json` 하나만 fetch 하고, Worker 가 그 GET 요청을 가로채 병합해 돌려준다.

```
브라우저 → GET /data/evidence.json
  Worker: env.ASSETS.fetch(request)          → base(정적 96KB)
          env.ASSETS.fetch(/data/evidence/YYYY-MM.json) × N → 샤드
          id 중복 제거 후 items 합치기
        → 예전과 동일한 모양의 JSON 반환
```

- `env.ASSETS.fetch` 는 정적 자산을 직접 서빙하므로 Worker 재진입(무한 루프)이 없다
- 샤드가 하나도 없으면 base 응답을 **그대로 반환**한다 → 배포 직후 동작은 현재와 완전히 동일. 첫 샤드가 생기기 전까지 회귀 위험이 없다
- 병합 응답은 `cache-control: public, max-age=30`

## /api/promote 변경

| | 이전 | 이후 |
|---|---|---|
| 신규 증거 | `evidence.json` items 에 append | **이번 달 샤드**에 append (없으면 생성) |
| inbox 제거·노트 갱신 | `evidence.json` | `evidence.json` (동일) |
| 커밋 수 | 1 | 최대 2 (샤드 + inbox) |

`id` 전역 유일성은 **base + 기배포 샤드 + 현재 샤드**의 최대값에서 +1 해 유지한다. 기배포 샤드는 정적 자산에서 읽어 GitHub API 호출을 늘리지 않는다.

부수 효과로 동시 쓰기 충돌이 줄어든다 — 증거 추가와 inbox 조작이 서로 다른 파일을 건드린다.

## 검증 항목

- [ ] 샤드 0개 상태에서 보드가 현재와 동일하게 뜨는지 (base 그대로 반환 경로)
- [ ] 샤드 1개 추가 후 증거 건수가 base + 샤드로 늘어나는지
- [ ] `id` 중복 시 base 가 우선되고 중복 표시되지 않는지
- [ ] promote 로 증거 추가 시 샤드에만 쓰이고 `evidence.json` items 는 불변인지
- [ ] 월이 바뀔 때 새 샤드가 자동 생성되는지

## 롤백

`src/index.js` 의 `/data/evidence.json` 라우트 한 줄을 제거하면 즉시 이전 동작으로 돌아간다. `evidence.json` 은 그대로 있으므로 데이터 손실 경로가 없다. 샤드에 쌓인 증거는 그때 수동 병합이 필요하다.

## 이후

`evidence.json` 96KB 는 아카이브로 굳는다. 과거 증거를 **수정**해야 할 때는 여전히 Claude Code 가 필요하지만, **추가**는 이제 Claude 가 직접 한다. 수정 빈도는 추가 빈도보다 훨씬 낮으므로 실무적으로 병목이 해소된다.
