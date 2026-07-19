// public/watchlist-action.js
// 워치리스트 카드 액션 오버레이 — index.html 의 watchlistHTML() 을 덮어쓰고
// wlAction() 을 추가한다.
//
// 왜 별도 파일인가: public/index.html 이 61KB 로 인라인 커밋 한계를 넘어
// 전체 파일 재업로드가 불가하다. src/index.js 의 HTMLRewriter 가 body 끝에
// 이 스크립트를 주입하며, index.html 의 인라인 <script> 뒤에 실행되므로
// 전역 W · E · render() · senseInbox() · senseEsc() 를 그대로 공유한다.
// (index.html 안의 원래 watchlistHTML 정의는 이 시점 이후 사용되지 않는다.
//  Claude Code 로 index.html 을 직접 편집할 수 있게 되면 이 파일을 인라인으로
//  합치고 주입 코드를 제거할 것.)
(function () {
  "use strict";

  // ── 스타일 ─────────────────────────────────────────────────────────
  var css = [
    ".w-foot{display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap}",
    ".w-btn{font-family:var(--mono);font-size:11px;padding:4px 11px;border:1px solid var(--line-strong);background:#fff;color:var(--ink);cursor:pointer}",
    ".w-btn.primary{background:var(--deep);color:#fff;border-color:var(--deep)}",
    ".w-btn.ghost{background:transparent;color:var(--muted)}",
    ".w-btn.sm{font-size:10.5px;padding:3px 8px}",
    ".w-btn:hover:not(:disabled){opacity:.85}",
    ".w-btn:disabled{opacity:.5;cursor:default}",
    ".w-routed{font-family:var(--mono);font-size:11px;color:var(--deep)}",
    ".w-routed b{font-weight:600}",
    ".w-resolved{margin-top:14px}",
    ".w-resolved summary{cursor:pointer;color:var(--muted);font-family:var(--mono);font-size:11px;letter-spacing:.06em}",
    ".w-it.done{opacity:.72;font-size:12.5px;padding:7px 0;border-bottom:1px dotted var(--line)}"
  ].join("\n");
  var st = document.createElement("style");
  st.id = "wl-action-style";
  st.textContent = css;
  document.head.appendChild(st);

  var esc = typeof senseEsc === "function" ? senseEsc : function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
    });
  };

  // ── watchlistHTML() 오버라이드 ──────────────────────────────────────
  window.watchlistHTML = function () {
    if (!W || !Array.isArray(W.items) || !W.items.length) return "";
    var PRI = { "상": 0, "중": 1, "하": 2 };
    var active = W.items.filter(function (i) { return i.status !== "resolved"; });
    var resolved = W.items.filter(function (i) { return i.status === "resolved"; });
    var sorted = active.slice().sort(function (a, b) {
      var sa = a.status === "signal" ? 0 : 1, sb = b.status === "signal" ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return (PRI[a.priority] != null ? PRI[a.priority] : 9) - (PRI[b.priority] != null ? PRI[b.priority] : 9);
    });
    var signalN = active.filter(function (i) { return i.status === "signal"; }).length;
    var scan = W.lastScan ? "마지막 스캔 " + esc(W.lastScan) : "스캔 대기";

    var card = function (w) {
      var sig = w.status === "signal";
      var routed = !!w.routedInboxId;
      var hits = Array.isArray(w.hits) ? w.hits : [];
      var hitsHTML = hits.length
        ? '<div class="w-hits"><div class="hl">감지 기사 ' + hits.length + "</div>" +
          hits.map(function (x) {
            return '<div class="w-hit">' +
              (x.url
                ? '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.headline || x.url) + "</a>"
                : esc(x.headline || "")) +
              '<span class="hm"> · ' + esc(x.source || "") +
              (x.publishedAt ? " · " + esc(String(x.publishedAt).slice(0, 10)) : "") +
              (x.seenAt ? " · 감지 " + esc(x.seenAt) : "") +
              "</span></div>";
          }).join("") + "</div>"
        : "";
      var foot = routed
        ? '<span class="w-routed">✓ 인박스 이동됨 — 아래 <b>검증 대기</b>에서 결과 확인</span>'
        : '<button type="button" class="w-btn primary" onclick="wlAction(\'' + esc(w.id) + '\',\'to-inbox\',this)">인박스로 보내기 + 센싱</button>';
      return '<div class="w-it ' + (sig ? "signal" : "") + '" id="wl-' + esc(w.id) + '">' +
        '<div class="w-head">' +
          '<span class="w-code">' + esc(w.axisCode) + "</span>" +
          '<span class="w-q">' + esc(w.question) + "</span>" +
          '<span class="w-pri p-' + esc(w.priority) + '">' + esc(w.priority) + "</span>" +
          '<span class="w-st ' + (sig ? "signal" : "watching") + '">' + (sig ? "◆ 신호" : "감시중") + "</span>" +
        "</div>" +
        '<div class="w-detail">' + esc(w.detail) + "</div>" +
        hitsHTML +
        '<div class="w-foot">' + foot +
          '<button type="button" class="w-btn ghost" onclick="wlAction(\'' + esc(w.id) + '\',\'resolve\',this)">감시 종료</button>' +
        "</div></div>";
    };

    var resolvedHTML = resolved.length
      ? '<details class="w-resolved"><summary>종결됨 ' + resolved.length + "</summary>" +
        resolved.map(function (w) {
          return '<div class="w-it done"><span class="w-code">' + esc(w.axisCode) + "</span> " + esc(w.question) +
            '<span class="hm"> · ' + esc(w.resolvedAt || "") + (w.resolution ? " · " + esc(w.resolution) : "") + "</span>" +
            '<button type="button" class="w-btn ghost sm" onclick="wlAction(\'' + esc(w.id) + '\',\'reopen\',this)">재개</button></div>';
        }).join("") + "</details>"
      : "";

    return '<section class="watch">' +
      "<h3>확인 필요 항목 · 상시 감시" +
      (signalN ? ' · <span class="sig">신호 ' + signalN + "</span>" : "") +
      '<span class="scan">' + scan + "</span></h3>" +
      '<p class="rule">CI 판정에서 나온 <b>재센싱 트리거</b>를 상시 감시합니다. daily로 MI 뉴스와 키워드 매칭 → 신규 감지 시 <b class="mk">◆ 신호</b>로 표시. <b>인박스로 보내기 + 센싱</b>=검증 대기열 등록과 동시에 추가 센싱 자동 실행, <b>감시 종료</b>=반영 완료 후 감시 해제. 실제 축·증거 반영은 사람이 판단합니다.</p>' +
      sorted.map(card).join("") + resolvedHTML +
      "</section>";
  };

  // ── 카드 액션 — to-inbox / resolve / reopen ─────────────────────────
  // 커밋 → Cloudflare 재배포 → raw 전파에 수초 지연이 있어, 응답 직후 파일을
  // 다시 받으면 이전 값일 수 있다. 그래서 메모리의 W · E 를 먼저 갱신(낙관적)하고
  // 리렌더한다. to-inbox 는 인박스 항목 생성 직후 그 항목의 센싱을 자동 실행한다.
  window.wlAction = async function (id, action, btn) {
    var reason = "";
    if (action === "resolve") {
      reason = prompt("종결 사유(선택): 예) 승격 반영 / 기각 / 무관", "");
      if (reason === null) return;
    } else if (action === "to-inbox") {
      if (!confirm("검증 대기 인박스로 보내고 추가 센싱을 바로 실행할까요?")) return;
    } else if (action === "reopen") {
      if (!confirm("다시 감시 목록으로 되돌릴까요?")) return;
    }
    var old = btn.textContent;
    btn.disabled = true;
    btn.textContent = "처리 중…";
    try {
      var r = await fetch("/api/watchlist-action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: id, action: action, reason: reason })
      });
      var d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "HTTP " + r.status);

      var it = (W.items || []).find(function (x) { return x.id === id; });
      if (it) {
        if (action === "resolve") {
          it.status = "resolved"; it.resolvedAt = "방금";
          if (reason) it.resolution = reason;
        } else if (action === "reopen") {
          it.status = "watching"; delete it.resolvedAt; delete it.resolution;
        } else if (action === "to-inbox") {
          it.routedInboxId = d.inboxId || "ib-" + id;
        }
      }

      if (action === "to-inbox") {
        var item = d.inboxItem;
        E.inbox = E.inbox || [];
        if (item && !E.inbox.find(function (x) { return x.id === item.id; })) E.inbox.push(item);
        render();
        var nid = (item && item.id) || d.inboxId;
        var entry = document.getElementById("ib-" + nid);
        if (entry) {
          entry.scrollIntoView({ behavior: "smooth", block: "center" });
          senseInbox(nid, entry.querySelector(".btn-sense")); // 자동 센싱 — 기존 진행 UI 재사용
        }
        return;
      }
      render();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = old;
      alert("실패: " + (e && e.message ? e.message : e));
    }
  };

  // 인라인 스크립트가 이미 렌더를 마친 뒤라면 한 번 다시 그린다.
  if (typeof W !== "undefined" && W && typeof render === "function") {
    try { render(); } catch (e) {}
  }
})();
