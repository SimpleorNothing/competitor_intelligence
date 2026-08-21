#!/usr/bin/env python3
"""LG전자 2026 반기보고서(2026-08-14) 근거 6건을 evidence.json에 추가.

실행:  python3 claude/patch/add-2026h1-evidence.py
멱등:  이미 적재된 id/event가 있으면 건너뜀. 여러 번 돌려도 중복되지 않음.

동반 커밋: strategies.json(LG frame·A1/A3/A5/A6), org-2026H1.json, org.html,
          lg-h1-revenue.html 은 이미 main에 반영됨. 이 스크립트는 L3 증거 레이어만 채운다.
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PATH = os.path.join(ROOT, "public", "data", "evidence.json")

SRC = {"name": "LG전자 2026 반기보고서 (DART)", "url": "https://dart.fss.or.kr/", "tier": 1}

NEW = [
    ("lg-frame", "Insight",
     "2026 반기보고서 연결 실적 — 매출 47조5,537억원(+9.4% YoY), 영업이익 3조2,528억원(+71.3%). 부문별로 HS 14조188억(영업이익 1조2,556억), MS 10조2,840억(5,912억, 전년 동기 -1,868억에서 흑자전환), VS 6조903억(4,028억), ES 5조5,484억(4,843억), 이노텍 11조621억(5,411억).",
     "이익 급증의 주 동인은 HS의 본업 개선과 MS 흑자전환·이노텍 회복이고, 전략 서사의 축인 ES는 오히려 감익. 'B2B·신사업 전환이 실적을 끌고 있다'는 서술과 실제 손익 기여 구조가 아직 어긋나 있음을 보여주는 기준선."),
    ("lg-frame", "Insight",
     "2026 반기보고서 「임원 현황」 기준 임원 294명(등기 7·미등기 287). 2026 1분기보고서 322명 대비 -28명으로, 조주완 前 CEO(CEO산하)를 포함해 사장 1·부사장 6·전무 9·상무 15가 퇴임하고 신규 선임은 2명(장지용·황상연 상무), 승진은 0명.",
     "감축이 'OO사업본부 산하'·'CFO/CTO부문 산하' 같은 보직 없는 대기성 자리에 집중되고 본부 라인 조직은 유지됐다. 전임 CEO 라인 정리를 겸한 임원층 슬림화이며, 류재철 체제의 인적 재편이 1년 만에 마무리된 시점으로 볼 수 있다."),
    ("lg-a6", "Deep",
     "Bear Robotics가 2026년 6월 22일자로 Kinisi Industries, Inc. 및 종속기업 지분 100%를 취득. 이전대가 132억원(현금 28억 + Bear Robotics 보통주 202만주 104억), 식별가능 순자산 공정가치 -3억원, 영업권 135억원, 취득 부대비용 17억원.",
     "대가의 거의 전액이 영업권으로 잡히는 인력·기술 확보형(acqui-hire) 딜. 현금이 아닌 Bear Robotics 주식으로 대가를 지급해 피인수 인력을 로봇 자회사에 묶어두는 구조이며, LG의 로봇 전략이 하드웨어 내재화에서 Physical AI 소프트웨어 역량 확보로 확장되고 있음을 회계처리로 확인해 준다."),
    ("lg-a3", "Deep",
     "2026 반기보고서가 HS 사업전략으로 '생성형 AI 기반 홈 허브를 중심으로 고객 사용 패턴을 학습·예측하는 차세대 AI홈 구현'을 명시. 같은 기간 미국에 PraxiumAI, Inc.와 Prospectus AI, Inc.(각 지분 54.0%, 업종 '신기술사업')를 설립해 연결 편입.",
     "AI홈이 뉴스룸·컨콜 레벨을 넘어 정기공시 본문의 사업전략으로 올라왔다. 지분 54%짜리 미국 AI 법인 2곳 신설은 사업내용이 공시되지 않아 확정 해석은 이르지만, AI 역량을 자체 R&D가 아닌 외부 조인트 구조로 조달하려는 시도로 보인다 — 다음 분기 공시에서 사업내용·매출 발생 여부 확인 필요."),
    ("lg-a5", "Deep",
     "2026 반기보고서 지역별 매출(소재지 기준) — 대한민국 18조5,097억원(+12.2% YoY), 미주 12조3,828억원(+11.3%), 아시아및아프리카 9조2,873억원(+5.7%), 유럽 7조3,739억원(+4.5%). 또한 2026년 6월 LG Electronics Reynosa가 Kwang Sung Electronics Mexico의 멕시코 레이노사 사업장을 인수.",
     "'글로벌 사우스 중심 재편'이라는 선언과 달리 상반기 성장 기여는 국내·미주가 주도했다. 지역 포트폴리오 전환은 아직 투자·선언 단계이고 매출 구성 변화로는 나타나지 않았다는 반증 근거. 반면 레이노사 사업장 인수는 관세 대응 역내 생산 내재화가 실제로 진행 중임을 보여준다."),
    ("lg-a1", "New",
     "2026 반기보고서는 구독 매출을 별도 공시하지 않았으나, '국내시장에서 빠르게 성장시킨 D2C 및 구독사업은 해외시장으로 진입을 확대하고 있으며 지속적인 인프라 투자를 통해 성장 잠재력이 증대되고 있다'고 성장성 항목에 기재. 대한민국 매출은 18조5,097억원으로 4개 지역 중 최고 증가율(+12.2%).",
     "구독은 정기공시에서 여전히 별도 세그먼트가 아니어서 정량 추적은 컨콜 의존이 계속된다. 다만 서술이 '국내 안착 → 해외 확장'으로 유지되고 국내 매출 성장률이 가장 높아 A1 방향성 자체는 재확인."),
]


def main():
    with open(PATH, encoding="utf-8") as f:
        data = json.load(f)

    existing = {x.get("event") for x in data["items"]}
    nid = max(x["id"] for x in data["items"] if isinstance(x.get("id"), int))

    added = 0
    for axis, sig, event, interp in NEW:
        if event in existing:
            continue
        nid += 1
        data["items"].append({
            "id": nid,
            "companyId": "lg",
            "axisId": axis,
            "date": "2026-08-14",
            "event": event,
            "interpretation": interp,
            "signalType": sig,
            "confidence": "사실",
            "source": dict(SRC),
            "interpretationBy": "claude",
            "reviewStatus": "reviewed",
        })
        added += 1

    if not added:
        print("이미 반영됨 — 변경 없음")
        return 0

    data["updatedAt"] = "2026-08-21T23:30:00+09:00"
    with open(PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"evidence.json에 {added}건 추가 (총 {len(data['items'])}건)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
