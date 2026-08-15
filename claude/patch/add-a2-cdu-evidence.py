#!/usr/bin/env python3
"""
Patch script: Add 2 new A2 evidence items for LG CDU certification + H1 2026 project subs
- CDU 인증 완료 (NVIDIA 부품 품질 인증)
- H1 2026 6천억원 규모 프로젝트 수주 및 생산 진행
Sources: LG Electronics H1 2026 반기보고서 Ⅱ.7.(5) 회사의 경쟁우위 요소
Idempotency: deduplication via event string hash (md5)
"""

import json
import hashlib
import sys
from pathlib import Path

def get_event_hash(event_str):
    """Generate deterministic hash for deduplication"""
    return hashlib.md5(event_str.encode('utf-8')).hexdigest()

def main():
    # Load evidence.json
    evidence_path = Path('public/data/evidence.json')
    if not evidence_path.exists():
        print(f"❌ Not found: {evidence_path}")
        sys.exit(1)
    
    with open(evidence_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Existing event hashes (for deduplication)
    existing_hashes = {
        get_event_hash(item['event']): item['id']
        for item in data['items']
    }
    
    # Calculate next ID
    max_id = max(item['id'] for item in data['items']) if data['items'] else 0
    next_id = max_id + 1
    
    # Define new items
    new_items = [
        {
            "id": next_id,
            "companyId": "lg",
            "axisId": "lg-a2",
            "date": "2026-06",
            "event": "CDU 일부 모델 NVIDIA 등 글로벌 빅테크 기업 부품 품질 인증 획득 완료",
            "interpretation": "냉각수 분배 장치(CDU)의 부품 품질 인증이 '절차 진행 중'에서 '인증 획득'으로 전환. Hyperscaler 및 Colocation 사업자 공급망 진입 완료 신호. 다만 '일부 모델' 표현으로 전체 라인 커버 확인 필요.",
            "signalType": "New",
            "confidence": "사실",
            "source": {
                "name": "LG Electronics H1 2026 반기보고서",
                "url": "https://example.com/lg_h1_2026",
                "tier": 1
            },
            "interpretationBy": "claude",
            "reviewStatus": "seeded"
        },
        {
            "id": next_id + 1,
            "companyId": "lg",
            "axisId": "lg-a2",
            "date": "2026-06",
            "event": "H1 2026 중 6천억원 규모 프로젝트 수주, 현재 생산 진행 중",
            "interpretation": "6천억원 이상 규모의 AIDC 프로젝트 수주 및 양산 개시. Hyperscaler·Colocation 중심 북미 핵심 시장 수주 신호. 고객 구체명은 미공개.",
            "signalType": "New",
            "confidence": "사실",
            "source": {
                "name": "LG Electronics H1 2026 반기보고서",
                "url": "https://example.com/lg_h1_2026",
                "tier": 1
            },
            "interpretationBy": "claude",
            "reviewStatus": "seeded"
        }
    ]
    
    # Check for duplicates
    added_count = 0
    for item in new_items:
        event_hash = get_event_hash(item['event'])
        if event_hash in existing_hashes:
            print(f"⚠️  Skipped (duplicate): ID {item['id']} - {item['event'][:50]}...")
        else:
            data['items'].append(item)
            existing_hashes[event_hash] = item['id']
            added_count += 1
            print(f"✓ Added: ID {item['id']} - {item['event'][:50]}...")
    
    # Update timestamp
    from datetime import datetime
    data['updatedAt'] = datetime.utcnow().isoformat() + 'Z'
    
    # Write back
    with open(evidence_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')
    
    print(f"\n✅ Patch complete: {added_count} items added")
    print(f"   Updated: {data['updatedAt']}")

if __name__ == '__main__':
    main()
