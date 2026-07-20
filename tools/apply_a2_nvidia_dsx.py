#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
A2(HVAC·AIDC) — 엔비디아 DSX Infrastructure LGE CDU 등재 반영 패치
생성일: 2026-07-20 / 브랜치: a2-nvidia-dsx-cdu

실행: 레포 루트에서  python3 tools/apply_a2_nvidia_dsx.py
대상: public/data/evidence.json (신규 id 132·133 + inbox-13)
      public/data/strategies.json (lg-a2 statusRationale)
      public/data/watchlist.json (w-a2-nvidia 트리거 발화 반영)

※ evidence.json(96KB)·strategies.json(33KB)은 GitHub MCP 인라인 푸시 한계(~56-64KB / ~30KB)를
   초과하여 Claude Code 로컬 git 환경에서 적용해야 함.

적용 전 base blob SHA (main 기준, 불일치 시 중단):
  public/data/evidence.json    27109542a63a8307e93011364e59e8a46a53808c
  public/data/strategies.json  a8b80cbe3557a60b6d19794000f6447bef598723
  public/data/watchlist.json   6c9910ea2cbbb3b96c77990c0545e81cb9a03790
검증: printf 'blob %d\\0' "$(wc -c < FILE)" | cat - FILE | sha1sum
"""
import json, sys, hashlib, collections, io, os

EV = "public/data/evidence.json"
ST = "public/data/strategies.json"
WL = "public/data/watchlist.json"

BASE_SHA = {
    EV: "27109542a63a8307e93011364e59e8a46a53808c",
    ST: "a8b80cbe3557a60b6d19794000f6447bef598723",
    WL: "6c9910ea2cbbb3b96c77990c0545e81cb9a03790",
}

NEW_ITEMS = [
{
  "id": 132,
  "companyId": "lg",
  "axisId": "lg-a2",
  "date": "2026-06-07",
  "event": "젠슨 황 엔비디아 CEO 방한·구광모 회장 TMM — 엔비디아 공식 블로그로 LG전자 CDU·콜드플레이트 열관리 솔루션 '인증 협력' 및 DSX 레퍼런스 기반 프리패브 모듈형 설계 기술 협력 공식화. LG유플러스·LG CNS는 DSX 기반 AI 팩토리 구축, LG엔솔은 800V DC/BESS 협력",
  "interpretation": "id67('26.1 회동)의 후속 확정 단계. 엔비디아가 자사 채널에 LG전자를 DSX AI 팩토리 인프라 파트너로 명시하면서 '개별 벤더 인증'에서 'One LG 스택(냉각+구축+전력) 동시 정렬'로 협력 범위가 확대. 다만 이 시점 문구도 여전히 certification cooperation(협력)이며 통과 사실은 미기재",
  "signalType": "Deep",
  "confidence": "사실",
  "source": {
    "name": "NVIDIA 공식 블로그",
    "url": "https://blogs.nvidia.com/blog/nvidia-and-lg-group-ai-factory/",
    "tier": 1
  },
  "interpretationBy": "claude",
  "reviewStatus": "auto",
  "tags": ["AIDC", "엔비디아생태계"]
},
{
  "id": 133,
  "companyId": "lg",
  "axisId": "lg-a2",
  "date": "2026-07-20",
  "event": "엔비디아 마켓플레이스 'AI Factory DSX Infrastructure' 검증 목록에 LGE 600kW급 CDU 등재 — 냉각용량 600kW@4°C ATD, 유량 850LPM@35psi, Validation Type 8종(Hydraulic Constant DP/Constant Flow, Flow Sensor Accuracy, Cold Start, Thermal Low Load/Nominal Capacity, Pump Failover, Pumping Capacity) 표기. Wetted Materials Compatibility·Supply Chain Status는 공란",
  "interpretation": "id67의 '인증 미통과' 상태가 부분 해소 — 엔비디아 1차 채널에 LG 명의 CDU가 최초 노출되며 A2 최대 변곡점이 실체화. 단 과신 금지 3가지: ① 등재분 600kW는 LG 주력이 아님('25.10 DCW Asia 공개 신제품은 1.4MW급, 보도상 '인증 진행 과정에서 개발한 테스트용 제품') ② Wetted Materials·Supply Chain Status 공란 = 절차 미완결(LG측도 '곧 마무리' 표현) ③ 동일 리스트에 AVC·BOYD·Carrier·CoolIT 등 선점 벤더가 병렬 등재 — 등재≠채택. 삼성 DA 시사점: Validation Type 8종이 사실상 AIDC 냉각 진입 스펙 표준(유압 정압/정유량·콜드스타트·펌프 페일오버 등 신뢰성·이중화 중심)으로 굳어지는 중이며, 진입 장벽이 열성능이 아니라 표준 준수·검증 트랙 확보로 이동",
  "signalType": "New",
  "confidence": "사실",
  "source": {
    "name": "NVIDIA Marketplace (DSX Infrastructure, Manufacturer=LGE)",
    "url": "https://marketplace.nvidia.com/en-us/enterprise/dsx-infrastructure/",
    "tier": 1
  },
  "interpretationBy": "claude",
  "reviewStatus": "auto",
  "tags": ["AIDC", "엔비디아생태계", "잠정"]
}
]

NEW_INBOX = {
  "id": "inbox-13",
  "note": "엔비디아 DSX Infrastructure 등재(id133) 후속 트리거 3종 — ① 마켓플레이스 LGE 행의 Wetted Materials Compatibility·Supply Chain Status 공란이 채워지는 시점(=인증 완결 신호) ② 1.4MW급 CDU 추가 등재 여부(=주력 제품 진입) ③ '26.7.30 LG전자 2Q 컨콜에서 ES 데이터센터 수주·엔비디아 인증 언급. 등재 사실 확인 후 A2 trajGrade(현 behind) 재검토 필요 여부는 SimpleorNothing 판단 대기",
  "requestedTo": "경쟁사 동향 센싱 에이전트",
  "createdAt": "2026-07-20"
}

ST_OLD = "단 엔비디아 벤더 인증 미통과(id67)"
ST_NEW = ("단 엔비디아 인증은 '26.7.20 마켓플레이스 DSX Infrastructure 목록에 600kW급 CDU 등재로 부분 진전(id133) — "
          "등재분은 주력 1.4MW급이 아닌 인증용 개발품이고 Wetted Materials·Supply Chain Status 공란으로 절차 미완결, 등재≠채택")

WL_DETAIL_NEW = ("'26.7.20 엔비디아 마켓플레이스 DSX Infrastructure 목록에 LGE 600kW급 CDU 등재로 부분 통과 확인(id133). "
                 "다만 등재분은 인증용 개발품이고 Wetted Materials·Supply Chain Status 공란 = 절차 미완결. "
                 "잔여 감시: 공란 충족 시점 / 1.4MW급 추가 등재 / 확정 수주. 완결 시 A2 별도 축 분리 재검토 트리거.")

WL_HIT = {
  "headline": "엔비디아 마켓플레이스 'AI Factory DSX Infrastructure'에 LGE 600kW CDU 등재",
  "url": "https://marketplace.nvidia.com/en-us/enterprise/dsx-infrastructure/",
  "source": "NVIDIA Marketplace (1차)",
  "publishedAt": "2026-07-20T00:00:00.000Z",
  "score": 10,
  "seenAt": "2026-07-20 22:00"
}

NEW_TS = "2026-07-20T00:00:00+09:00"
OLD_TS = "2026-07-19T00:00:00+09:00"


def blob_sha(path):
    data = open(path, "rb").read()
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def main():
    for p, want in BASE_SHA.items():
        if not os.path.exists(p):
            sys.exit("파일 없음: %s (레포 루트에서 실행하세요)" % p)
        got = blob_sha(p)
        if got != want:
            sys.exit("SHA 불일치 %s\n  기대 %s\n  실제 %s\n→ main이 갱신됐습니다. 패치 재생성 필요." % (p, want, got))

    # 1) evidence.json — indent=2 + 후행 개행 포맷 보존
    raw = open(EV, encoding="utf-8").read()
    d = json.loads(raw, object_pairs_hook=collections.OrderedDict)
    ids = {i["id"] for i in d["items"]}
    dup = ids & {132, 133}
    if dup:
        sys.exit("중복 id 존재: %s" % dup)
    if any(x.get("id") == "inbox-13" for x in d["inbox"]):
        sys.exit("inbox-13 중복")
    d["items"].extend(NEW_ITEMS)
    d["inbox"].append(NEW_INBOX)
    d["updatedAt"] = NEW_TS
    out = json.dumps(d, ensure_ascii=False, indent=2) + "\n"
    open(EV, "w", encoding="utf-8").write(out)

    # 2) strategies.json — 손수 포맷된 파일이므로 문자열 치환(전체 재직렬화 금지)
    s = open(ST, encoding="utf-8").read()
    if s.count(ST_OLD) != 1:
        sys.exit("strategies.json 앵커 문자열 %d회 매치 — 수동 확인 필요" % s.count(ST_OLD))
    s = s.replace(ST_OLD, ST_NEW).replace('"updatedAt": "%s"' % OLD_TS,
                                          '"updatedAt": "%s"' % NEW_TS, 1)
    open(ST, "w", encoding="utf-8").write(s)

    # 3) watchlist.json — w-a2-nvidia 트리거 발화 반영
    w = json.loads(open(WL, encoding="utf-8").read(), object_pairs_hook=collections.OrderedDict)
    tgt = [x for x in w["items"] if x.get("id") == "w-a2-nvidia"]
    if len(tgt) != 1:
        sys.exit("watchlist w-a2-nvidia %d건 매치" % len(tgt))
    t = tgt[0]
    if any(h.get("url") == WL_HIT["url"] for h in t.get("hits", [])):
        print("watchlist hit 이미 존재 — skip")
    else:
        t["detail"] = WL_DETAIL_NEW
        t["hits"].insert(0, WL_HIT)
        t["status"] = "signal"
        t["lastHit"] = "2026-07-20 22:00"
        t["lastChecked"] = "2026-07-20 22:00"
        open(WL, "w", encoding="utf-8").write(json.dumps(w, ensure_ascii=False, indent=2) + "\n")

    # 4) 검증
    for p in (EV, ST, WL):
        json.load(open(p, encoding="utf-8"))
    print("OK — evidence.json items %d, inbox %d / strategies.json lg-a2 갱신 완료" %
          (len(d["items"]), len(d["inbox"])))
    print("다음: git add public/data/evidence.json public/data/strategies.json public/data/watchlist.json"
          " && git commit -m 'A2: 엔비디아 DSX Infrastructure LGE 600kW CDU 등재 반영(id132·133)'"
          " && git push origin a2-nvidia-dsx-cdu")


if __name__ == "__main__":
    main()
