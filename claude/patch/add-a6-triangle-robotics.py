#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
A6 evidence 2건 추가
  1) 마곡-양재-창원 삼각 로보틱스 거점 (한국경제 2026-07-27 보도, 교차검증 완료)
  2) CEO 직속 로보틱스사업센터 신설 (2026-07-01, inews24)

설계 (실패 리스크 제거):
  - SHA 가드 없음. 실행 시점의 evidence.json을 파싱해 max(id)+1을 동적 부여
    → 선행 PR(#114/#113/#101) 머지 순서와 무관하게 동작
  - 동일 event 문자열이 이미 존재하면 해당 건 스킵 (멱등 — 재실행 안전)
  - json.dumps(ensure_ascii=False, indent=2) + trailing newline 라운드트립
    (evidence.json은 이 포맷과 정확히 라운드트립함이 검증돼 있음)
  - 쓰기 전 재파싱 검증. 실패 시 파일 미변경 상태로 종료

실행 전제: 최신 main을 머지한 작업 트리에서 실행 (PR 본문 절차 참조)
"""
import json
import sys
from pathlib import Path

PATH = Path(__file__).resolve().parents[2] / "public" / "data" / "evidence.json"

NEW_ITEMS = [
    {
        "companyId": "lg",
        "axisId": "lg-a6",
        "date": "2026-07-27",
        "event": "마곡(선행 R&D)–양재(데이터·사업)–창원(부품·완제품 생산) 삼각 로보틱스 거점 완성 보도 — 양재 R&D캠퍼스 데이터팩토리 8월 가동, 연내 최대 300대 'LG 클로이드' 투입해 대규모 학습 데이터 확보. 창원 스마트파크 액추에이터 초도 물량 생산 돌입",
        "interpretation": "데이터–부품–완제품 풀스택 내재화 구조가 실행 단계로 전환 — id49(증권가 추론)의 창원 파일럿·연내 적용 시나리오가 보도로 사실화. 액추에이터 초도생산은 4/29 1분기 컨콜 CFO 공표('상반기 초도 양산')와 정합. 데이터팩토리는 6월 복수 보도(전자신문: 양재 4개층 1만평 전환, 7월 100대→연내 수백대)와 정합하며 이번 보도가 '8월 가동·최대 300대'로 구체화. 차별화 포인트를 '가전 제조 노하우+독자 풀스택'으로 명시 — 당사 레인보우로보틱스(자회사 인수) 경로와 정면 대비",
        "signalType": "Insight",
        "confidence": "사실",
        "source": {
            "name": "한국경제(지면 14면, 김채연 기자)·전자신문·머니투데이 교차검증",
            "url": None,
            "tier": 2
        },
        "interpretationBy": "claude",
        "reviewStatus": "auto"
    },
    {
        "companyId": "lg",
        "axisId": "lg-a6",
        "date": "2026-07-01",
        "event": "CEO 직속 '로보틱스사업센터' 신설(7.1) — 사업개발·영업·오퍼레이션을 갖춘 완결형 사업조직, 로봇 학습용 데이터팩토리 전담 조직 포함",
        "interpretation": "HS로보틱스연구소(R&D, id45)와 별개로 사업 기능이 CEO 직속으로 격상 — 로봇이 연구 단계를 넘어 독립 사업 단위로 승격됐다는 조직 신호. A6 execStatus '가속' 판단 근거 강화. '로봇 완제품+핵심 부품+데이터 생성·학습 인프라를 결합한 종합 로보틱스 솔루션 기업' 지향 공표와 결합 시, 삼각 거점(양재 데이터팩토리 포함)의 관제 조직으로 해석 가능",
        "signalType": "Deep",
        "confidence": "사실",
        "source": {
            "name": "inews24",
            "url": "https://www.inews24.com/view/1985130",
            "tier": 2
        },
        "interpretationBy": "claude",
        "reviewStatus": "auto"
    }
]


def find_items(data):
    """evidence 배열 위치 자동 탐지 (최상위 list 또는 dict 내 list 모두 대응)"""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for v in data.values():
            if (isinstance(v, list) and v and isinstance(v[0], dict)
                    and "id" in v[0] and "axisId" in v[0]):
                return v
    sys.exit("[abort] evidence 배열을 찾지 못했습니다 — 파일 구조 확인 필요")


def main():
    raw = PATH.read_text(encoding="utf-8")
    data = json.loads(raw)
    items = find_items(data)

    existing_events = {it.get("event", "") for it in items}
    next_id = max(it["id"] for it in items if isinstance(it.get("id"), int)) + 1

    added = []
    for ni in NEW_ITEMS:
        if ni["event"] in existing_events:
            print(f"skip (이미 존재): {ni['event'][:40]}...")
            continue
        items.append({"id": next_id, **ni})
        added.append(next_id)
        next_id += 1

    if not added:
        print("추가할 항목 없음 — 파일 미변경 종료")
        return

    out = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    json.loads(out)  # 쓰기 전 재파싱 검증
    PATH.write_text(out, encoding="utf-8")
    print(f"완료: id {added} 추가, 총 {len(items)}건")


if __name__ == "__main__":
    main()
