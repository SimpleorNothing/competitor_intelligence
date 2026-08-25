#!/usr/bin/env python3
"""org.html 원문 팝업: 미등록 PDF를 조용히 404 내지 않고 '원문 미등록'으로 표시.

배경
  public/reports/2026_2Q_business_report.pdf 가 리포지토리에 없는데
  org.html 팝업은 해당 경로를 링크하고 있어 클릭 시 무반응/404가 난다.
  (2026 반기보고서 반영 당시 '남은 수동 작업 2번'이 미완료)

이 스크립트는 팝업을 열 때 각 PDF에 HEAD 요청을 보내
  - 200 + content-type 에 pdf 포함  -> 정상 링크 유지
  - 그 외(404 / SPA fallback HTML)   -> .na 클래스 + '원문 미등록 · DART에서 조회'
로 표시한다. 네트워크 오류(catch)일 때는 오판을 피하려고 아무 표시도 하지 않고
다음 열람 때 재검사한다. PDF가 커밋되면 자동으로 정상 링크로 복귀한다.

멱등: MARKER 존재 시 즉시 종료.
실행: python3 claude/patch/fix-org-report-links.py
"""
import io
import sys

PATH = "public/org.html"
MARKER = "rptChecked"

OLD_CSS = ".rptbox .lnk .mt{margin-left:auto;font-size:11px;color:var(--muted);font-weight:400;white-space:nowrap}"
NEW_CSS = OLD_CSS + (
    "\n.rptbox .lnk.na{color:var(--muted);cursor:not-allowed;pointer-events:none}"
    "\n.rptbox .lnk.na .mt{color:#b45309;font-weight:600}"
)

OLD_JS = "function openRpt(){document.getElementById('rptpop').hidden=false;}"
NEW_JS = """let rptChecked=false;
async function checkRpt(){
  if(rptChecked)return;
  const lnks=[...document.querySelectorAll('#rptpop .lnk')];
  let ok=true;
  await Promise.all(lnks.map(async a=>{
    try{
      const r=await fetch(a.getAttribute('href'),{method:'HEAD'});
      if(r.ok&&(r.headers.get('content-type')||'').toLowerCase().includes('pdf'))return;
      a.classList.add('na');
      const mt=a.querySelector('.mt'); if(mt)mt.textContent='원문 미등록 · DART에서 조회';
    }catch(e){ok=false;}
  }));
  rptChecked=ok;
}
function openRpt(){document.getElementById('rptpop').hidden=false;checkRpt();}"""


def main():
    src = io.open(PATH, encoding="utf-8").read()

    if MARKER in src:
        print("SKIP: 이미 적용됨 (%s)" % PATH)
        return 0

    assert src.count(OLD_CSS) == 1, "CSS 앵커 불일치 (%d건)" % src.count(OLD_CSS)
    assert src.count(OLD_JS) == 1, "openRpt 앵커 불일치 (%d건)" % src.count(OLD_JS)

    out = src.replace(OLD_CSS, NEW_CSS).replace(OLD_JS, NEW_JS)

    # 사전 검증
    assert out.count('class="lnk"') == 5, "원문 링크 5개가 아님"
    assert out.count("<script>") == out.count("</script>"), "script 태그 불균형"
    assert MARKER in out

    io.open(PATH, "w", encoding="utf-8").write(out)
    print("OK: %s 패치 완료 (%d -> %d bytes)" % (PATH, len(src), len(out)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
