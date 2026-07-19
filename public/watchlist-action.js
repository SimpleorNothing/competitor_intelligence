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

  // ── 회사(탭) 필터 ───────────────────────────────────────────────────
  // 보드는 상단 탭으로 회사를 전환하지만, 워치리스트·인박스는 전체 항목을
  // 그대로 그려 LG 탭에서 Midea 항목이, Midea 탭에서 LG 항목이 보였다.
  // 항목의 소속 회사를 판정해 현재 탭과 일치하는 것만 렌더한다.
  var KNOWN_CO = ["lg","whirlpool","bsh","electrolux","midea","haier","carrier","trane","jci","daikin","lennox"];

  function curCoId() {
    try {
      var c = (typeof curCompany === "function") ? curCompany() : null;
      return (c && c.id) || null;
    } catch (e) { return null; }
  }
  function curCoName() {
    try {
      var c = (typeof curCompany === "function") ? curCompany() : null;
      return (c && (c.shortName || c.name)) || "";
    } catch (e) { return ""; }
  }
  // 워치리스트: item.companyId → 파일 단위 companyId → axisId 접두(lg-a2 → lg)
  function coOfWatch(w) {
    if (!w) return "";
    if (w.companyId) return w.companyId;
    if (typeof W !== "undefined" && W && W.companyId) return W.companyId;
    return String(w.axisId || "").split("-")[0] || "";
  }
  // 인박스: companyId → (워치리스트 유래면) 원 항목 → note 앞머리 "[Midea …]" → 기본 lg
  // 기본값이 lg 인 이유: companyId 필드 도입 이전 레거시 인박스는 전부 LG 건이다.
  function coOfInbox(i) {
    if (!i) return "lg";
    if (i.companyId) return i.companyId;
    if (i.watchlistId && typeof W !== "undefined" && W && Array.isArray(W.items)) {
      for (var k = 0; k < W.items.length; k++) {
        if (W.items[k].id === i.watchlistId) return coOfWatch(W.items[k]);
      }
    }
    var m = String(i.note || "").match(/^\s*\[([A-Za-z]+)/);
    if (m) {
      var t = m[1].toLowerCase();
      if (KNOWN_CO.indexOf(t) >= 0) return t;
    }
    return "lg";
  }

  // ── watchlistHTML() 오버라이드 ──────────────────────────────────────
  window.watchlistHTML = function () {
    if (!W || !Array.isArray(W.items) || !W.items.length) return "";
    var PRI = { "상": 0, "중": 1, "하": 2 };
    var co = curCoId();
    var mine = W.items.filter(function (i) { return !co || coOfWatch(i) === co; });
    if (!mine.length) {
      return '<section class="watch"><h3>확인 필요 항목 · 상시 감시</h3>' +
        '<p class="rule">' + esc(curCoName()) + ' 감시 항목이 아직 없습니다. 다른 회사의 감시 항목은 해당 탭에서 확인하세요.</p></section>';
    }
    var active = mine.filter(function (i) { return i.status !== "resolved"; });
    var resolved = mine.filter(function (i) { return i.status === "resolved"; });
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
      // 라우트 미배포·프록시 오류 시 본문이 비어 r.json() 이 곧장 터진다.
      // 원인을 알 수 있도록 텍스트로 먼저 읽고 상태코드를 붙여 보고한다.
      var raw = await r.text();
      var d = {};
      if (raw) {
        try { d = JSON.parse(raw); }
        catch (e) { throw new Error("HTTP " + r.status + " — 응답이 JSON이 아님: " + raw.slice(0, 120)); }
      } else if (!r.ok) {
        throw new Error("HTTP " + r.status + " — 응답 본문 없음. /api/watchlist-action 이 배포됐는지 확인하세요.");
      } else {
        throw new Error("빈 응답(HTTP " + r.status + ")");
      }
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

  // ── 인박스 회사 필터 ────────────────────────────────────────────────
  // 인박스는 index.html 의 render() 안에서 인라인으로 그려진다(별도 함수 없음).
  // 파일 크기 제약으로 index.html 을 직접 편집하지 않고, render() 를 감싸
  // 렌더 직후 현재 탭과 다른 회사의 항목을 제거한다. DOM 순서는 E.inbox 배열
  // 순서와 1:1 이므로 인덱스로 대응시킨다.
  function filterInboxByCompany() {
    var sec = document.querySelector("section.inbox");
    if (!sec || typeof E === "undefined" || !E || !Array.isArray(E.inbox)) return;
    var nodes = sec.querySelectorAll(".inbox-entry");
    if (nodes.length !== E.inbox.length) return;   // 구조가 바뀌면 건드리지 않음
    var co = curCoId();
    var shown = 0;
    for (var i = 0; i < nodes.length; i++) {
      var ok = !co || coOfInbox(E.inbox[i]) === co;
      nodes[i].hidden = !ok;
      if (ok) shown++;
    }
    var h3 = sec.querySelector("h3");
    if (h3) h3.textContent = "검증 대기 인박스 · 추가 센싱 요청 (" + shown + ")";
    var old = sec.querySelector(".ib-empty");
    if (old) old.parentNode.removeChild(old);
    if (!shown) {
      var p = document.createElement("p");
      p.className = "rule ib-empty";
      p.textContent = curCoName() + " 검증 대기 항목이 없습니다.";
      sec.appendChild(p);
    }
  }

  if (typeof window.render === "function") {
    var _render = window.render;
    window.render = function () {
      var r = _render.apply(this, arguments);
      try { filterInboxByCompany(); } catch (e) {}
      return r;
    };
  }

  // 인라인 스크립트가 이미 렌더를 마친 뒤라면 한 번 다시 그린다.
  if (typeof W !== "undefined" && W && typeof render === "function") {
    try { render(); } catch (e) {}
  }
})();
