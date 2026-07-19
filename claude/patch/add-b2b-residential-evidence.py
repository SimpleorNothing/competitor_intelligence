#!/usr/bin/env python3
# B2B 주거 증거 5건 등재 — 레포 루트에서 실행
#   python3 claude/patch/add-b2b-residential-evidence.py
#
# 왜 스크립트인가: evidence.json 이 91KB 로 인라인 커밋 한계를 넘어 Claude 가
# 직접 커밋할 수 없다. 내용은 로컬에서 검증 완료(JSON 유효 · 멱등).
#
# 배경: strategies.json 의 A1 kpi(압구정 7,000세대)·A3 kpi(우리 단지 연결 30만)에
# 주장을 썼는데 대응 evidence 가 없어 '근거 없는 주장' 상태였다. 그 갭을 메운다.
# 축을 가로지르므로 axisId 는 각각 원 축(A1·A3·A6)에 두고 tags 로 묶는다.
# (중첩축 설계: claude/axis-overlay-design.md)
import json, sys, os

P = "public/data/evidence.json"
if not os.path.exists(P):
    sys.exit("레포 루트에서 실행하세요 — 없음: " + P)

d = json.load(open(P, encoding='utf-8'))
items = d['items']
have = {(i['axisId'], i['date'], i['event'][:24]) for i in items}
nid = max(int(i['id']) for i in items) + 1

NEW = [
 dict(axisId="lg-a1", date="2026-07-19",
  event="현대건설 협력으로 압구정 재건축 2·3·5구역 조합원 7,000여 세대에 가전 구독 공급 발표. 구역별 냉장고·세탁기·건조기·스타일러·식기세척기 등 5~7종 선택, 3·5구역 펜트하우스는 SKS·LG 시그니처 공급 계획. 구독 세대는 입주 후 5년간 전문 매니저의 분해 세척·성능 점검 제공",
  interpretation="A1 증거 14건이 전부 B2C·해외확장이었는데 선분양 빌트인 특판이라는 신규 채널이 열림. 당사 AI구독클럽은 B2C 중심이라 건설사 채널 대응 공백. 계약금액·구독매출 기여분 미공개로 규모 판단은 유보",
  signalType="New", confidence="사실",
  source=dict(name="LG전자 발표(보도 인용)", url="https://www.socialvalue.kr/news/view/1065576323365614", tier=2)),
 dict(axisId="lg-a3", date="2026-07-10",
  event="GS건설과 '차세대 AI홈 공동개발 업무협약(MOU)' 체결. 류재철 LG전자 CEO·허윤홍 GS건설 대표 참석. 씽큐 온을 중심으로 가전·IoT·서비스를 자이 단지 인프라와 연계 — 세대 내 가전·조명·난방·환기 제어 + 단지 내 엘리베이터 호출·주차 위치·방문 이력·커뮤니티 예약 통합. 성수1지구 재개발부터 적용",
  interpretation="A3 '최근 90일 실행 증거 얇음' 판정을 철회한 직접 근거. CEO가 직접 협약식에 나온 것은 우선순위 신호이며, AI홈이 단지 단위 판매 유닛으로 작동하기 시작했음을 의미",
  signalType="Deep", confidence="사실",
  source=dict(name="LG전자 발표(전자신문 인용)", url="https://www.etnews.com/20260713000135", tier=1)),
 dict(axisId="lg-a3", date="2026-06",
  event="씽큐 앱 아파트 전용 기능 '우리 단지 연결' 적용 규모 30만 세대 초과 ('26 상반기 기준). 입주민은 씽큐 온과 앱을 연동해 세대 내 기기 제어·공용시설 이용을 음성으로 사용",
  interpretation="AI홈 개별 매출목표는 여전히 미공표지만, 단지 인프라 연동의 설치기반이 정량으로 처음 확인된 지표. 향후 B2B 주거 채널의 규모 판단 기준선",
  signalType="Insight", confidence="사실",
  source=dict(name="LG전자 발표(보도 인용)", url="https://www.socialvalue.kr/news/view/1065576323365614", tier=2)),
 dict(axisId="lg-a6", date="2026-04",
  event="GS건설과 홈로봇 'LG 클로이드(CLOiD)'를 아파트 단지에 적용하기 위한 '로봇 친화형 아파트' MOU 체결",
  interpretation="7월 AI홈 MOU의 선행 단계. 로봇이 B2C 가정용이 아니라 건설사향 단지 인프라로 먼저 진입하는 경로 — A6 '28 홈로봇 상업화 목표의 중간 착지점",
  signalType="New", confidence="사실",
  source=dict(name="LG전자 발표(한국경제 인용)", url="https://www.hankyung.com/article/2026071325121", tier=2)),
 dict(axisId="lg-a6", date="2026-07-13",
  event="GS건설과 서울 성동구 성수전략정비구역1지구 재개발 사업에서 단지 내 홈로봇 'LG 클로이드'와 자율주행 기반 서빙·배송 로봇 도입 계획 공개",
  interpretation="'26.4 MOU가 특정 단지 적용으로 구체화. 클로이드 아파트 순찰 이미지가 공개돼 PoC 단계를 넘어선 배치 계획으로 진전 — 다만 도입 시점·대수는 미공개",
  signalType="Deep", confidence="사실",
  source=dict(name="LG전자 발표(경향신문 인용)", url="https://www.khan.co.kr/article/202607131647001", tier=2)),
]

added = []
for n in NEW:
    key = (n['axisId'], n['date'], n['event'][:24])
    if key in have:
        print("  skip(중복):", n['axisId'], n['date'])
        continue
    items.append(dict(id=nid, companyId="lg", **n,
                      interpretationBy="claude", reviewStatus="auto", tags=["B2B주거"]))
    added.append(nid)
    nid += 1

d['updatedAt'] = "2026-07-19T00:00:00+09:00"
json.dump(d, open(P, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
open(P, 'a', encoding='utf-8').write("\n")
print("추가 id:", added, "| 총", len(items), "건")
print()
print("검증: python3 -m json.tool " + P + " > /dev/null && echo OK")
