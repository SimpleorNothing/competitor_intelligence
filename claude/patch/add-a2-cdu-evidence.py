#!/usr/bin/env python3
"""
Patch script: A2 축 — 엔비디아 CDU '최종 품질인증 획득'(2026-07-27) 마일스톤 반영

배경
----
기존 evidence 에는 다음이 이미 존재한다.
  - #138 (2026-06)    인증 절차 진행 중·곧 완료 예정
  - #136 (2026-07-20) 600kW CDU, DSX 인증 로스터 등재 (테스트 프로토타입)
  - #145 (2026-08-06) 2Q 컨콜 — 상반기 수주 6,000억원 초과 + "일부 모델 인증 완료"

따라서 '상반기 6,000억원 수주'는 #145 와 중복이므로 추가하지 않는다.
빠져 있는 것은 2026-07-27 자 '국내 최초 최종 품질인증 획득' 이라는 확정 마일스톤
(600kW급·D2C·후속 MW급 라인업 인증 계획)뿐이며, 이 1건만 추가한다.

중복 방지
--------
event 문자열 md5 는 표현이 조금만 달라도 통과하므로,
(axisId, date, source.url) 조합을 안정 키로 삼아 재실행 멱등성을 보장한다.
키워드가 겹치는 인접 항목은 '단계'가 달라 자동 판별이 불가능하므로
(#136 로스터 등재 vs 본 건 최종 인증 획득) 삭제·차단하지 않고
사람이 검토하도록 경고만 출력한다.

출처 (2026-08-15 확인)
--------------------
  - 전자신문 2026-07-27  https://www.etnews.com/20260727000159
  - ZDNet Korea 2026-07-27 https://zdnet.co.kr/view/?no=20260727165411
"""

import json
import hashlib
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

EVIDENCE_PATH = Path('public/data/evidence.json')
KST = timezone(timedelta(hours=9))


def get_event_hash(event_str):
    """Generate deterministic hash for exact-duplicate detection."""
    return hashlib.md5(event_str.encode('utf-8')).hexdigest()


def stable_key(item):
    """
    Idempotency key: axis + event date + primary source URL.
    Exact and stable across reruns, and unaffected by wording edits.
    """
    return (
        item.get('axisId'),
        str(item.get('date', '')),
        (item.get('source') or {}).get('url', ''),
    )


def related_items(item, existing):
    """
    Report neighbouring items sharing axis + key terms so a human can confirm the
    new entry is a distinct milestone rather than a restatement. Advisory only —
    stage ('절차 진행 중' / '로스터 등재' / '인증 획득') cannot be inferred reliably
    from keywords, so this never blocks the insert.
    """
    keys = ('엔비디아', 'CDU', '인증')
    out = []
    for prev in existing:
        if prev.get('axisId') != item['axisId']:
            continue
        prev_event = prev.get('event', '')
        if sum(k in prev_event for k in keys) >= 2:
            out.append(prev)
    return out


def main():
    if not EVIDENCE_PATH.exists():
        print(f"[!] Not found: {EVIDENCE_PATH}")
        sys.exit(1)

    with open(EVIDENCE_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    existing_hashes = {
        get_event_hash(item['event']): item['id']
        for item in data['items']
    }
    existing_keys = {stable_key(item): item['id'] for item in data['items']}

    max_id = max(item['id'] for item in data['items']) if data['items'] else 0
    next_id = max_id + 1

    new_items = [
        {
            "id": next_id,
            "companyId": "lg",
            "axisId": "lg-a2",
            "date": "2026-07-27",
            "event": (
                "600kW급 CDU가 엔비디아 최종 품질인증 획득 — 국내 기업 최초. "
                "GPU/CPU 콜드플레이트에 냉각수를 순환시키는 D2C(Direct-to-Chip) 방식, "
                "온도제어 정밀도 ±0.25도, 누수감지·원격모니터링 탑재. "
                "1MW·2.5MW·4MW 대용량 라인업으로 순차 인증 확대 계획 발표."
            ),
            "interpretation": (
                "#138(절차 진행 중)·#136(로스터 등재, 프로토타입) 단계를 넘어 "
                "'인증 획득'이 확정된 시점. 엔비디아 액체냉각 공급망 진입이 실제로 완료됐음을 "
                "보여주는 1차 마일스톤이며, w-a2-nvidia 워치리스트의 트리거 조건이 충족된 근거. "
                "다만 인증 대상은 600kW 단일 모델이므로 MW급 라인업 인증 완료 시점과 "
                "확정 수주·매출 인식 시점은 별도 추적이 필요하다."
            ),
            "signalType": "New",
            "confidence": "사실",
            "source": {
                "name": "LG전자 발표(전자신문·ZDNet Korea 인용)",
                "url": "https://www.etnews.com/20260727000159",
                "tier": 1
            },
            "interpretationBy": "claude",
            "reviewStatus": "seeded"
        }
    ]

    added_count = 0
    for item in new_items:
        event_hash = get_event_hash(item['event'])
        if event_hash in existing_hashes:
            print(f"[skip] exact duplicate of #{existing_hashes[event_hash]}: {item['event'][:50]}...")
            continue

        key = stable_key(item)
        if key in existing_keys:
            print(f"[skip] already present as #{existing_keys[key]} (axis/date/source match)")
            continue

        data['items'].append(item)
        existing_hashes[event_hash] = item['id']
        existing_keys[key] = item['id']
        added_count += 1
        print(f"[add ] #{item['id']} ({item['date']}) {item['event'][:60]}...")

        for rel in related_items(item, data['items'][:-1]):
            print(f"       ~ related, verify distinct: #{rel['id']} ({rel.get('date')}) {rel.get('event','')[:70]}...")

    if added_count:
        data['updatedAt'] = datetime.now(KST).replace(microsecond=0).isoformat()
        with open(EVIDENCE_PATH, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write('\n')

    print(f"\nDone: {added_count} item(s) added. total={len(data['items'])}")


if __name__ == '__main__':
    main()
