#!/usr/bin/env python3
"""
Patch script: watchlist w-a2-nvidia 상태 정합화

문제
----
status 는 이미 "signal" 이지만 detail 본문은 여전히 "현재 미통과" 로 남아 있어
2026-07-27 엔비디아 최종 품질인증 획득 사실과 정면으로 충돌한다.
보드에 표시되는 문구가 사실과 반대이므로 정정한다.

변경
----
  - detail   : '미통과' → '600kW 모델 인증 획득(2026-07-27), MW급 라인업 인증 잔존'
  - lastHit  : 인증 획득 보도 시점으로 갱신
  - hits     : 인증 획득 근거 기사 1건을 최상단에 추가 (중복 시 skip)
  - status   : "signal" 유지 (트리거 조건 충족 상태 그대로)

출처 (2026-08-15 확인)
--------------------
  전자신문 2026-07-27  https://www.etnews.com/20260727000159
"""

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

WATCHLIST_PATH = Path('public/data/watchlist.json')
KST = timezone(timedelta(hours=9))
TARGET_ID = 'w-a2-nvidia'

NEW_DETAIL = (
    "2026-07-27 600kW급 CDU가 국내 최초로 엔비디아 최종 품질인증 획득(D2C 방식, ±0.25도). "
    "AIDC 냉각 공급망 진입은 완료 단계로 전환. "
    "잔여 확인 과제는 1MW·2.5MW·4MW 대용량 라인업의 순차 인증 완료 시점, "
    "글로벌 고객 확정 수주 규모, 매출 인식 시점. "
    "A2 별도 축 분리 재검토 트리거는 충족."
)

NEW_HIT = {
    "headline": "LG전자, CDU 국내 최초 엔비디아 품질 인증 획득",
    "url": "https://www.etnews.com/20260727000159",
    "source": "전자신문",
    "publishedAt": "2026-07-27T00:00:00.000Z",
    "score": 5,
    "seenAt": "2026-08-15 14:30",
}


def main():
    if not WATCHLIST_PATH.exists():
        print(f"[!] Not found: {WATCHLIST_PATH}")
        sys.exit(1)

    with open(WATCHLIST_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    items = data['items'] if isinstance(data, dict) else data
    target = next((it for it in items if it.get('id') == TARGET_ID), None)
    if target is None:
        print(f"[!] watchlist item not found: {TARGET_ID}")
        sys.exit(1)

    changed = []

    if target.get('detail') != NEW_DETAIL:
        target['detail'] = NEW_DETAIL
        changed.append('detail')

    hits = target.setdefault('hits', [])
    if any(h.get('url') == NEW_HIT['url'] for h in hits):
        print(f"[skip] hit already present: {NEW_HIT['url']}")
    else:
        hits.insert(0, NEW_HIT)
        changed.append('hits')

    if target.get('lastHit') != NEW_HIT['seenAt']:
        target['lastHit'] = NEW_HIT['seenAt']
        changed.append('lastHit')

    if target.get('status') != 'signal':
        target['status'] = 'signal'
        changed.append('status')

    if not changed:
        print("Done: no change (already up to date).")
        return

    if isinstance(data, dict):
        data['updatedAt'] = datetime.now(KST).replace(microsecond=0).isoformat()

    with open(WATCHLIST_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')

    print(f"Done: updated {TARGET_ID} -> {', '.join(changed)}")


if __name__ == '__main__':
    main()
