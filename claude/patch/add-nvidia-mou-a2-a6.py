#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LG·엔비디아 전략적 사업협력 MOU('26.8.13 현지) 센싱 반영 패치.

대상: public/data/evidence.json 만 수정 (strategies.json 미변경 — 별도 지시 대기)

설계 원칙
  - ID 동적 부여: max(기존 id) + 1 부터 순차. PR #114/#115/#117/#118 등
    evidence.json 을 동시에 건드리는 PR 들과 어떤 머지 순서로도 충돌하지 않음.
  - 멱등성: event 문자열 선두 32자 기준 중복 검사 → 재실행해도 중복 추가 안 됨.
  - 인박스: id 리터럴이 아니라 requestedTo 내용으로 매칭 → PR #115 선/후 머지
    어느 쪽이든 inbox-13 note 갱신 또는 신규 생성으로 안전 동작.
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
EV = ROOT / "public" / "data" / "evidence.json"

if not EV.exists():
    sys.exit("!! evidence.json 경로를 찾을 수 없음: %s" % EV)

data = json.loads(EV.read_text(encoding="utf-8"))
items = data.setdefault("items", [])
inbox = data.setdefault("inbox", [])

MOU_URL = "https://biz.heraldcorp.com/article/10841415"
KHAN_URL = "https://www.khan.co.kr/article/202608141000001/"
WORK_URL = "http://www.worktoday.co.kr/news/articleView.html?idxno=87975"
ETN_URL = "https://www.etnews.com/20260727000159"
NSP_URL = "https://www.newspim.com/news/view/20260804000603"

NEW_ITEMS = [
    {
        "companyId": "lg",
        "axisId": "lg-a6",
        "date": "2026-08-13",
        "event": (
            "구광모 (주)LG 대표-젠슨 황 엔비디아 CEO, 산타클라라 엔비디아 본사에서 "
            "로봇·AI팩토리·모빌리티 3개 분야 '전략적 사업협력 MOU' 체결('26.6월 트윈타워 회동의 후속). "
            "로봇 분야는 엔비디아 로봇 파운데이션 모델 'Isaac GR00T'와 엣지 컴퓨팅 '젯슨 토르' 기반 "
            "이족보행 휴머노이드를 '27년 1분기 공개 목표로 공동 개발 — LG전자 액추에이터, LG이노텍 센서, "
            "LG에너지솔루션 배터리, LG CNS 데이터 학습을 결합. 권봉석 (주)LG COO, 류재철 LG전자 CEO, "
            "홍범식 LG유플러스 CEO, 현신균 LG CNS CEO, 이홍락 AI연구원 공동원장 등 계열사 CEO 총출동"
        ),
        "interpretation": (
            "A6의 성격이 바뀐 분수령. 기존 클로이/클로이드가 '가전·서비스의 연장'이었다면 이번 건은 "
            "로봇을 엔비디아 피지컬 AI 스택에 편입시키는 구조 — 두뇌(파운데이션 모델·컴퓨팅)는 엔비디아, "
            "몸(액추에이터·센서·배터리)과 제조 현장 데이터는 LG라는 분업. 개발 속도는 자체 개발 대비 "
            "압도적으로 빨라지지만 플랫폼 종속이 대가다. 당사 관점의 실질 위협은 휴머노이드 제품 자체가 "
            "아니라, 계열사 부품 역량을 '원 LG'로 묶어 로봇 밸류체인을 수직 결합한 조직 동원력. "
            "'27.1Q 공개 시점을 A6 실행력 검증의 1차 마감선으로 삼아야 함"
        ),
        "signalType": "Insight",
        "confidence": "사실",
        "source": {"name": "헤럴드경제(LG그룹 공식 발표 인용)", "url": MOU_URL, "tier": 2},
    },
    {
        "companyId": "lg",
        "axisId": "lg-a6",
        "date": "2026-08-14",
        "event": (
            "MOU 발표와 함께 휠베이스(바퀴형) 로봇의 연내 생산현장 실증 계획 공개 — "
            "가정·상업 공간 적용도 추진한다고 명시"
        ),
        "interpretation": (
            "이족보행은 '27.1Q 공개이지만 매출로 연결되는 실물은 휠베이스 쪽이 먼저다. "
            "'생산현장 → 상업 → 가정' 순의 전개 경로는 양재 데이터 팩토리·창원 액추에이터 생산과 맞물려 "
            "삼각 거점(A6 기존 증거)의 실증 무대가 확정됐다는 뜻. 가정용 적용 언급은 A3(AI홈)·A1(구독)과의 "
            "교차 지점이므로 제품화 시점에 축 재배치 검토 필요"
        ),
        "signalType": "New",
        "confidence": "사실",
        "source": {"name": "워크투데이(LG그룹 공식 발표 인용)", "url": WORK_URL, "tier": 3},
    },
    {
        "companyId": "lg",
        "axisId": "lg-a2",
        "date": "2026-08-13",
        "event": (
            "엔비디아 MOU의 AI 팩토리 축 — 엔비디아 'DSX' 아키텍처에 LG전자 냉각기술, "
            "LG에너지솔루션 배터리(전력저장), LG CNS·LG유플러스 설계·운영, LS 전력솔루션을 결합. "
            "'27년 상반기 엔비디아 차세대 플랫폼 '베라 루빈' 기반 레퍼런스 사이트 구축 → "
            "'28년 상반기 충남 천안에 80MW 규모 AI 팩토리 구축. 서버·냉각·전력 설비를 모듈로 사전 제작해 "
            "현장 조립하는 프리팹 방식으로 건축기간 20% 이상 단축 목표. 검증된 통합 솔루션을 "
            "글로벌 빅테크 고객 대상 패키지로 제안할 계획"
        ),
        "interpretation": (
            "A2의 정의를 다시 써야 하는 건. LG전자는 지금까지 '냉각 장비 벤더'였는데, 이번 구도에서는 "
            "그룹이 데이터센터를 직접 짓고 운영하는 오퍼레이터 겸 EPC 패키지 공급자로 올라선다. "
            "천안 80MW는 외부 수주가 아니라 자체 수요 — 수주 없이도 레퍼런스와 매출을 동시에 만드는 구조라 "
            "'수주 확정 여부'만 보던 기존 추적 지표로는 진척을 놓친다. 다만 80MW는 하이퍼스케일러 "
            "단일 캠퍼스(수백MW~GW)에 비하면 소규모이고, 착공·투자금액·부지 등 정량 공시가 아직 없다는 점은 "
            "할인 요인. IR 자료·설비투자 공시로 확인되기 전까지 계획 단계로 취급"
        ),
        "signalType": "Insight",
        "confidence": "사실",
        "source": {"name": "경향신문(LG그룹 공식 발표 인용)", "url": KHAN_URL, "tier": 2},
    },
    {
        "companyId": "lg",
        "axisId": "lg-a2",
        "date": "2026-07-27",
        "event": (
            "LG전자, 600kW급 냉각수분배장치(CDU)에 대해 엔비디아 최종 품질인증 획득 — 국내 기업 최초. "
            "'AI Factory DSX Infrastructure' 요건 검증 완료. 온도제어 정밀도 ±0.25℃, 가상센서·누수감지, "
            "통합관제시스템 연동 지원. 펌프·CDU그룹 이상 시 예비장치 자동전환 장애대비 운전시험 통과. "
            "칠러-CDU-콜드플레이트를 아우르는 '칩 투 칠러' 토털 솔루션으로 포트폴리오 확대 방침"
        ),
        "interpretation": (
            "id133(7월 DSX 목록 등재, 테스트용 제품·인증란 공란)에서 미결로 남겼던 쟁점의 해소 — "
            "'등재 ≠ 채택' 단서가 '최종 품질인증 획득'으로 확정됐다. 엔비디아 서버랙 채용 데이터센터에 "
            "납품할 자격을 확보한 것이므로 A2 데이터센터 냉각 서사가 '가설·추론'에서 '공급망 진입 사실'로 격상. "
            "단, DSX 검증은 제조사가 규정 시험법으로 검증하고 엔비디아가 요건 충족을 확인하는 구조이며 "
            "구매 보증이 아니다. 매출 인식은 실제 수주·납품 시점부터. "
            "당사 대응: 국내 최초 타이틀을 선점당했으므로 인증 획득 자체를 따라가는 것은 실익이 낮고, "
            "통합제어(DCCM)·턴키 범위에서 경쟁 포지션을 잡는 편이 현실적"
        ),
        "signalType": "Insight",
        "confidence": "사실",
        "source": {"name": "전자신문(LG전자 공식 발표)", "url": ETN_URL, "tier": 1},
    },
    {
        "companyId": "lg",
        "axisId": "lg-a2",
        "date": "2026-08-04",
        "event": (
            "미국 빅테크 1곳 대상 엔비디아 인증 600kW급 CDU 1,000~2,000대 규모 수주 추진 중이며 "
            "'27년 하반기~'28년 사이 본격 납품을 예상한다는 단독 보도 — 고객사·금액·계약 여부 모두 미공개"
        ),
        "interpretation": (
            "성사 시 인증 이후 첫 대형 공급 사례가 되지만 현 시점은 '추진' 단계로, 회사 공식 확인·공시가 없다. "
            "수치(1,000~2,000대)는 단일 매체 단독이라 교차검증 미완. "
            "확정 시 A2 trajGrade 상향의 결정적 근거가 되므로 트리거로 걸어두되, 현재는 미검증 취급"
        ),
        "signalType": "New",
        "confidence": "추론",
        "source": {"name": "뉴스핌(단독, 회사 미확인)", "url": NSP_URL, "tier": 3},
    },
]

# ── 증거 추가 (동적 ID + 멱등) ──────────────────────────────────────
existing_keys = {str(it.get("event", ""))[:32] for it in items}
numeric_ids = [int(it["id"]) for it in items if str(it.get("id", "")).isdigit()]
next_id = (max(numeric_ids) + 1) if numeric_ids else 1

added = []
for tpl in NEW_ITEMS:
    if tpl["event"][:32] in existing_keys:
        print("  · 스킵(이미 존재): %s…" % tpl["event"][:28])
        continue
    rec = {"id": next_id}
    rec.update(tpl)
    rec["interpretationBy"] = "claude"
    rec["reviewStatus"] = "auto"
    items.append(rec)
    existing_keys.add(tpl["event"][:32])
    added.append((next_id, tpl["axisId"]))
    next_id += 1

# ── 인박스 처리 ────────────────────────────────────────────────────
NOTE_13 = (
    "[갱신 '26.8.15] 트리거 충족 — LG전자 600kW CDU 엔비디아 최종 품질인증 획득('26.7.27, 국내 최초, 회사 공식). "
    "'등재 ≠ 채택' 단서 해소됨. 남은 미결: ①확정 수주·납품 공시(美 빅테크 1,000~2,000대 추진설은 단독보도·미확인) "
    "②천안 80MW AI팩토리 투자금액·착공 정량 공시 ③A2 trajGrade(현 behind) 상향 여부 판단. "
    "→ 이 3건 확인 시 완전 승격."
)
NOTE_MOB = (
    "[스코프 경계 판단 요청] LG·엔비디아 MOU 3개 축 중 '모빌리티' — 엔비디아 드라이브 하이페리온 기반 "
    "AI 정의 차량(AIDV)용 고성능 컴퓨팅 플랫폼을 개발해 완성차 OEM에 공급. LG전자 VS(전장) 영역으로 "
    "현 CI 보드(HS·ES 중심 6축) 스코프 밖이나, 로봇(A6)·AI팩토리(A2)와 동일 MOU·동일 엔비디아 스택을 "
    "공유하므로 '피지컬 AI' 상위 개념에서는 한 묶음. 별도 축 신설 없이 맥락 주석으로 유지할지, "
    "A6에 태그로 물릴지 결정 필요."
)


def next_inbox_id():
    nums = [int(str(e.get("id", "")).split("-")[-1])
            for e in inbox if str(e.get("id", "")).split("-")[-1].isdigit()]
    return "inbox-%d" % ((max(nums) + 1) if nums else 1)


def upsert_inbox(match_fn, requested_to, note, label):
    """id 리터럴이 아니라 내용 기준으로 매칭 — PR 머지 순서에 따라 id가 달라져도 안전."""
    hit = next((e for e in inbox if match_fn(e)), None)
    if hit is not None:
        hit["note"] = note
        print("  · 인박스 갱신(%s) — %s" % (hit.get("id"), label))
        return
    nid = next_inbox_id()
    inbox.append({
        "id": nid,
        "companyId": "lg",
        "requestedTo": requested_to,
        "note": note,
        "createdAt": "2026-08-15",
    })
    print("  · 인박스 신규(%s) — %s" % (nid, label))


# ① 엔비디아 인증 트리거 감시(PR #115의 inbox-13). 미머지면 새로 생성.
upsert_inbox(
    lambda e: "엔비디아" in str(e.get("requestedTo", "")) or "엔비디아 인증" in str(e.get("note", "")),
    "A2 엔비디아 인증·수주 확정 추적",
    NOTE_13,
    "A2 엔비디아 트리거",
)

# ② 모빌리티(AIDV) 스코프 경계 판단
upsert_inbox(
    lambda e: "모빌리티" in str(e.get("requestedTo", "")),
    "모빌리티(AIDV) 스코프 판단",
    NOTE_MOB,
    "모빌리티 스코프 경계",
)

data["updatedAt"] = "2026-08-15T00:00:00+09:00"

EV.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

print("\n증거 %d건 추가:" % len(added))
for i, ax in added:
    print("   id%-4d %s" % (i, ax))
print("총 items: %d / inbox: %d" % (len(items), len(inbox)))
print("완료 — public/data/evidence.json")
