#!/usr/bin/env python3
# 워치리스트 액션 버튼(+ to-inbox 자동 센싱) 패치 — 레포 루트에서 실행
#   python3 claude/patch/apply-watchlist-action.py
# 멱등하지 않다. 이미 적용된 상태에서 재실행하면 assert 에서 멈춘다(안전).
import sys, os
JS   = "src/index.js"
HTML = "public/index.html"
for p in (JS, HTML):
    if not os.path.exists(p):
        sys.exit("레포 루트에서 실행하세요 — 없음: " + p)

# ══════════════════════════════════════════════════════════════════════
# 1) src/index.js — /api/watchlist-action 엔드포인트
# ══════════════════════════════════════════════════════════════════════
src = open(JS, encoding='utf-8').read()

anchor = """async function handleWatchlistScan(request, env, ctx) {
  return json(await scanWatchlist(env, "manual"));
}
"""
assert src.count(anchor) == 1

block = r'''
// ── GitHub Contents 헬퍼 (promote/watchlist 공용) ─────────────────────
const EVIDENCE_PATH = DATA_PATH; // "public/data/evidence.json"

async function ghGetJson(path, gh) {
  const r = await fetch(
    "https://api.github.com/repos/" + DATA_REPO + "/contents/" + path + "?ref=main",
    { headers: gh });
  if (!r.ok) return { error: path + " 조회 실패 " + r.status };
  const meta = await r.json();
  try { return { meta, data: JSON.parse(b64DecodeUtf8(meta.content)) }; }
  catch (e) { return { error: path + " 파싱 실패" }; }
}
async function ghPutJson(path, data, sha, message, gh) {
  const r = await fetch(
    "https://api.github.com/repos/" + DATA_REPO + "/contents/" + path,
    { method: "PUT", headers: { ...gh, "content-type": "application/json" },
      body: JSON.stringify({
        message, content: b64EncodeUtf8(JSON.stringify(data, null, 2) + "\n"),
        sha, branch: "main" }) });
  if (!r.ok) { const t = await r.text(); return { error: "커밋 실패 " + r.status + " " + t.slice(0, 160) }; }
  const out = await r.json();
  return { commit: (out.commit && out.commit.html_url) || null };
}
function kstDate() { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); }

function buildInboxNote(w) {
  const hits = Array.isArray(w.hits) ? w.hits : [];
  const urls = hits.slice(0, 3).map((h) => h.url).filter(Boolean).join(" ");
  let note = w.question + " — " + (w.detail || "");
  if (hits.length) note += " [워치리스트 감지 " + hits.length + "건" + (urls ? ": " + urls : "") + "]";
  return note.slice(0, 600);
}

// ── 워치리스트 액션(/api/watchlist-action) ───────────────────────────
//   to-inbox : evidence.json inbox[] 센싱 요청 생성 + watchlist 항목에 routedInboxId 표시
//              → 응답의 inboxItem 을 받아 프런트가 곧바로 /api/sense 자동 실행
//   resolve  : watchlist status=resolved (cron 스캔 제외) + 종결 사유 기록
//   reopen   : resolved → watching 복귀
// 두 파일을 건드리는 to-inbox 는 evidence 를 먼저 커밋(실제 작업 생성)하고
// watchlist 마커는 그다음. 마커가 실패해도 inbox id 중복검사로 재시도가 안전하다.
async function handleWatchlistAction(request, env, ctx) {
  if (!env.GITHUB_TOKEN) return json({ error: "GITHUB_TOKEN 시크릿 필요" }, 501);
  let body = {};
  try { body = await request.json(); } catch (e) {}
  const id = String(body.id || "");
  const action = String(body.action || "");
  const reason = String(body.reason || "").slice(0, 200);
  if (!id || !["to-inbox", "resolve", "reopen"].includes(action))
    return json({ error: "id·action 필요 (to-inbox|resolve|reopen)" }, 400);

  const gh = {
    "user-agent": "ci-watchlist-action",
    accept: "application/vnd.github+json",
    authorization: "Bearer " + env.GITHUB_TOKEN,
  };

  const wl = await ghGetJson(WATCHLIST_PATH, gh);
  if (wl.error) return json({ error: wl.error }, 502);
  const item = (wl.data.items || []).find((x) => x.id === id);
  if (!item) return json({ error: "워치리스트 항목 없음: " + id }, 404);
  const stamp = nowKstStamp();

  // ── resolve / reopen : watchlist 한 파일만 ──
  if (action === "resolve" || action === "reopen") {
    if (action === "resolve") {
      item.status = "resolved"; item.resolvedAt = stamp;
      if (reason) item.resolution = reason;
    } else {
      item.status = "watching"; delete item.resolvedAt; delete item.resolution;
    }
    wl.data.updatedAt = kstDate() + "T00:00:00+09:00";
    const msg = "data: 워치리스트 " + (action === "resolve" ? "종결" : "재개") +
      " — " + id + (reason ? " (" + reason + ")" : "") + " [skip-log]";
    const put = await ghPutJson(WATCHLIST_PATH, wl.data, wl.meta.sha, msg, gh);
    if (put.error) return json({ error: put.error }, 502);
    return json({ ok: true, action, id, commit: put.commit });
  }

  // ── to-inbox : evidence 먼저(작업 생성) → watchlist 마커 ──
  const inboxId = "ib-" + id;
  const ev = await ghGetJson(EVIDENCE_PATH, gh);
  if (ev.error) return json({ error: ev.error }, 502);
  ev.data.inbox = ev.data.inbox || [];
  let inboxItem = ev.data.inbox.find((x) => x.id === inboxId);
  if (!inboxItem) {
    inboxItem = {
      id: inboxId, requestedTo: "경쟁사 동향 센싱 에이전트",
      note: buildInboxNote(item), createdAt: kstDate(),
      origin: "watchlist", watchlistId: id,
    };
    ev.data.inbox.push(inboxItem);
    ev.data.updatedAt = kstDate() + "T00:00:00+09:00";
    const putE = await ghPutJson(EVIDENCE_PATH, ev.data, ev.meta.sha,
      "data: 워치리스트→인박스 — " + id, gh);
    if (putE.error) return json({ error: putE.error }, 502);
  }
  // watchlist 마커 (최신 sha 재조회)
  const wl2 = await ghGetJson(WATCHLIST_PATH, gh);
  if (!wl2.error) {
    const it2 = (wl2.data.items || []).find((x) => x.id === id);
    if (it2 && !it2.routedInboxId) {
      it2.routedInboxId = inboxId; it2.routedAt = stamp;
      wl2.data.updatedAt = kstDate() + "T00:00:00+09:00";
      await ghPutJson(WATCHLIST_PATH, wl2.data, wl2.meta.sha,
        "data: 워치리스트 인박스 이동표시 — " + id + " [skip-log]", gh);
    }
  }
  // inboxItem 을 함께 반환 → 프런트가 낙관적 렌더 후 /api/sense 자동 실행
  return json({ ok: true, action, id, inboxId, inboxItem });
}
'''

src = src.replace(anchor, anchor + block)

route_anchor = """      if (url.pathname === "/api/watchlist-scan" && request.method === "POST") {
        return handleWatchlistScan(request, env, ctx);
      }
"""
assert src.count(route_anchor) == 1
src = src.replace(route_anchor, route_anchor + """      if (url.pathname === "/api/watchlist-action" && request.method === "POST") {
        return handleWatchlistAction(request, env, ctx);
      }
""")

open(JS,'w',encoding='utf-8').write(src)

print("[1/2] src/index.js 패치 완료")

# ══════════════════════════════════════════════════════════════════════
# 2) public/index.html — 액션 버튼 · 종결 접힘 · wlAction(자동 센싱)
# ══════════════════════════════════════════════════════════════════════
h = open(HTML, encoding='utf-8').read()

# ── 1) CSS 추가 (.sense-prog .el 블록 뒤) ──────────────────────────────
css_anchor = ".sense-prog .el{margin-left:auto;flex:none}\n"
assert h.count(css_anchor) == 1
css_new = css_anchor + """.w-foot{display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap}
.w-btn{font-family:var(--mono);font-size:11px;padding:4px 11px;border:1px solid var(--line-strong);background:#fff;color:var(--ink);cursor:pointer}
.w-btn.primary{background:var(--deep);color:#fff;border-color:var(--deep)}
.w-btn.ghost{background:transparent;color:var(--muted)}
.w-btn.sm{font-size:10.5px;padding:3px 8px}
.w-btn:hover:not(:disabled){opacity:.85}
.w-btn:disabled{opacity:.5;cursor:default}
.w-routed{font-family:var(--mono);font-size:11px;color:var(--deep)}
.w-routed b{font-weight:600}
.w-resolved{margin-top:14px}
.w-resolved summary{cursor:pointer;color:var(--muted);font-family:var(--mono);font-size:11px;letter-spacing:.06em}
.w-it.done{opacity:.72;font-size:12.5px;padding:7px 0;border-bottom:1px dotted var(--line)}
"""
h = h.replace(css_anchor, css_new)

# ── 2) watchlistHTML() 전면 교체 ──────────────────────────────────────
start = h.index("function watchlistHTML(){")
end = h.index("\nfunction render(){", start)
old = h[start:end]
assert "w-hits" in old and len(old) < 4000

new_fn = r"""function watchlistHTML(){
  if(!W || !Array.isArray(W.items) || !W.items.length) return '';
  const PRI = { '상':0, '중':1, '하':2 };
  const active   = W.items.filter(i => i.status !== 'resolved');
  const resolved = W.items.filter(i => i.status === 'resolved');
  const sorted = active.slice().sort((a,b)=>{
    const sa = a.status==='signal'?0:1, sb = b.status==='signal'?0:1;
    if(sa!==sb) return sa-sb;
    return (PRI[a.priority]!=null?PRI[a.priority]:9) - (PRI[b.priority]!=null?PRI[b.priority]:9);
  });
  const signalN = active.filter(i=>i.status==='signal').length;
  const scan = W.lastScan ? ('마지막 스캔 ' + senseEsc(W.lastScan)) : '스캔 대기';
  const card = w => {
    const sig = w.status==='signal';
    const routed = !!w.routedInboxId;
    const hits = Array.isArray(w.hits) ? w.hits : [];
    return `
      <div class="w-it ${sig?'signal':''}" id="wl-${senseEsc(w.id)}">
        <div class="w-head">
          <span class="w-code">${senseEsc(w.axisCode)}</span>
          <span class="w-q">${senseEsc(w.question)}</span>
          <span class="w-pri p-${senseEsc(w.priority)}">${senseEsc(w.priority)}</span>
          <span class="w-st ${sig?'signal':'watching'}">${sig?'◆ 신호':'감시중'}</span>
        </div>
        <div class="w-detail">${senseEsc(w.detail)}</div>
        ${hits.length?`
        <div class="w-hits">
          <div class="hl">감지 기사 ${hits.length}</div>
          ${hits.map(x=>`<div class="w-hit">${x.url?`<a href="${senseEsc(x.url)}" target="_blank" rel="noopener">${senseEsc(x.headline||x.url)}</a>`:senseEsc(x.headline||'')}<span class="hm"> · ${senseEsc(x.source||'')}${x.publishedAt?' · '+senseEsc(String(x.publishedAt).slice(0,10)):''}${x.seenAt?' · 감지 '+senseEsc(x.seenAt):''}</span></div>`).join('')}
        </div>`:''}
        <div class="w-foot">
          ${routed
            ? `<span class="w-routed">✓ 인박스 이동됨 — 아래 <b>검증 대기</b>에서 결과 확인</span>`
            : `<button type="button" class="w-btn primary" onclick="wlAction('${senseEsc(w.id)}','to-inbox',this)">인박스로 보내기 + 센싱</button>`}
          <button type="button" class="w-btn ghost" onclick="wlAction('${senseEsc(w.id)}','resolve',this)">감시 종료</button>
        </div>
      </div>`;
  };
  return `
  <section class="watch">
    <h3>확인 필요 항목 · 상시 감시${signalN?` · <span class="sig">신호 ${signalN}</span>`:''}<span class="scan">${scan}</span></h3>
    <p class="rule">CI 판정에서 나온 <b>재센싱 트리거</b>를 상시 감시합니다. daily로 MI 뉴스와 키워드 매칭 → 신규 감지 시 <b class="mk">◆ 신호</b>로 표시. <b>인박스로 보내기 + 센싱</b>=검증 대기열 등록과 동시에 추가 센싱 자동 실행, <b>감시 종료</b>=반영 완료 후 감시 해제. 실제 축·증거 반영은 사람이 판단합니다.</p>
    ${sorted.map(card).join('')}
    ${resolved.length?`
    <details class="w-resolved">
      <summary>종결됨 ${resolved.length}</summary>
      ${resolved.map(w=>`<div class="w-it done">
        <span class="w-code">${senseEsc(w.axisCode)}</span> ${senseEsc(w.question)}
        <span class="hm"> · ${senseEsc(w.resolvedAt||'')}${w.resolution?' · '+senseEsc(w.resolution):''}</span>
        <button type="button" class="w-btn ghost sm" onclick="wlAction('${senseEsc(w.id)}','reopen',this)">재개</button>
      </div>`).join('')}
    </details>`:''}
  </section>`;
}
"""
h = h[:start] + new_fn + h[end:]

# ── 3) wlAction() 추가 (senseInbox 앞) ────────────────────────────────
sense_anchor = "async function senseInbox(id, btn){"
assert h.count(sense_anchor) == 1
wl_action = r"""// 워치리스트 카드 액션 — to-inbox / resolve / reopen
// to-inbox 는 인박스 항목 생성 직후 그 항목의 "추가 센싱"을 자동 실행한다.
// 커밋 → Cloudflare 재배포 → raw 전파에 수초 지연이 있어, 응답 직후 파일을 다시 받으면
// 이전 값일 수 있다. 그래서 메모리의 W·E를 먼저 갱신(낙관적)하고 리렌더한다.
async function wlAction(id, action, btn){
  let reason = '';
  if(action === 'resolve'){
    reason = prompt('종결 사유(선택): 예) 승격 반영 / 기각 / 무관', '');
    if(reason === null) return;
  } else if(action === 'to-inbox'){
    if(!confirm('검증 대기 인박스로 보내고 추가 센싱을 바로 실행할까요?')) return;
  } else if(action === 'reopen'){
    if(!confirm('다시 감시 목록으로 되돌릴까요?')) return;
  }
  const old = btn.textContent; btn.disabled = true; btn.textContent = '처리 중…';
  try{
    const r = await fetch('/api/watchlist-action', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ id: id, action: action, reason: reason })
    });
    const d = await r.json();
    if(!r.ok || d.error) throw new Error(d.error || ('HTTP ' + r.status));

    const it = (W.items||[]).find(x=>x.id===id);
    if(it){
      if(action==='resolve'){ it.status='resolved'; it.resolvedAt='방금'; if(reason) it.resolution=reason; }
      else if(action==='reopen'){ it.status='watching'; delete it.resolvedAt; delete it.resolution; }
      else if(action==='to-inbox'){ it.routedInboxId = d.inboxId || ('ib-'+id); }
    }
    if(action==='to-inbox'){
      const item = d.inboxItem;
      E.inbox = E.inbox || [];
      if(item && !E.inbox.find(x=>x.id===item.id)) E.inbox.push(item);
      render();
      const nid = (item && item.id) || d.inboxId;
      const entry = document.getElementById('ib-' + nid);
      if(entry){
        entry.scrollIntoView({ behavior:'smooth', block:'center' });
        const sb = entry.querySelector('.btn-sense');
        senseInbox(nid, sb);   // 자동 센싱 — 진행 표시는 기존 UI 재사용
      }
      return;
    }
    render();
  }catch(e){
    btn.disabled = false; btn.textContent = old;
    alert('실패: ' + (e && e.message ? e.message : e));
  }
}

"""
h = h.replace(sense_anchor, wl_action + sense_anchor)
open(HTML,'w',encoding='utf-8').write(h)

print("[2/2] public/index.html 패치 완료")
print()
print("검증:")
print("  node --check src/index.js")
print("  python3 -c \"import re;h=open('public/index.html',encoding='utf-8').read();open('/tmp/x.js','w',encoding='utf-8').write(re.findall(r'<script(?![^>]*src=)[^>]*>(.*?)</script>',h,re.S)[0])\" && node --check /tmp/x.js")
