/*! update-badge.js — 도구모음 공용 업데이트 배지
 * 페이지 하단 footer(#ub-footer)에 "update : YYYY.M.D" 표시. 클릭 시 최근 변경 내역 패널.
 * 데이터 우선순위: window.__UPDATE_BADGE_DATA(인라인) → 같은 출처의 version.json → <meta app-updated>.
 * 의존성 없음 · 토큰 스타일 인라인 주입 · 어느 스택에 붙여도 동작.
 *
 *   <script defer src="/update-badge.js" data-src="/version.json"></script>
 */
(function () {
  if (window.__updateBadgeMounted) return;
  window.__updateBadgeMounted = true;

  var SRC =
    (document.currentScript && document.currentScript.getAttribute('data-src')) ||
    window.__UPDATE_BADGE_SRC ||
    'version.json';

  var T = {
    bg: '#ffffff', surface: '#f6f7f9', text: '#1a1d21',
    muted: '#5b6470', border: '#e6e9ee', brand: '#1257d6'
  };

  function fmt(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d)) return iso;
      var p = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric'
      }).formatToParts(d).reduce(function (o, x) { o[x.type] = x.value; return o; }, {});
      return p.year + '.' + p.month + '.' + p.day;
    } catch (e) { return iso; }
  }

  function el(tag, css, txt) {
    var n = document.createElement(tag);
    if (css) n.style.cssText = css;
    if (txt != null) n.textContent = txt;
    return n;
  }

  function mount(data) {
    if (!data || !data.updated_at) return;

    var st = document.createElement('style');
    st.textContent =
      '#ub-root{position:relative;display:inline-block;font-family:"Pretendard",-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}' +
      '#ub-btn{display:inline-flex;align-items:center;gap:7px;padding:0;border:none;background:transparent;color:' + T.muted + ';font-size:15px;line-height:1;cursor:pointer}' +
      '#ub-btn:hover{color:' + T.text + '}' +
      '#ub-btn:focus-visible{outline:2px solid ' + T.brand + ';outline-offset:2px;border-radius:4px}' +
      '#ub-txt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '#ub-txt b{font-weight:400}' +
      '#ub-panel{position:absolute;left:0;bottom:calc(100% + 8px);width:320px;max-width:78vw;max-height:50vh;overflow:auto;background:' + T.bg + ';border:1px solid ' + T.border + ';border-radius:14px;box-shadow:0 12px 28px rgba(16,22,34,.16);padding:14px 14px 10px;animation:ub-rise .14s ease-out;z-index:9999}' +
      '#ub-panel[hidden]{display:none}' +
      '@keyframes ub-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}' +
      '.ub-h{font-size:15px;color:' + T.muted + ';margin:0 0 8px;display:flex;justify-content:space-between;align-items:center}' +
      '.ub-x{border:0;background:transparent;color:' + T.muted + ';font-size:16px;line-height:1;cursor:pointer;padding:2px 5px;border-radius:6px}' +
      '.ub-x:hover{background:' + T.surface + ';color:' + T.text + '}' +
      '.ub-item{padding:9px 0;border-top:1px solid ' + T.border + '}' +
      '.ub-item:first-of-type{border-top:0}' +
      '.ub-when{font-size:15px;color:' + T.muted + ';font-variant-numeric:tabular-nums}' +
      '.ub-what{font-size:15px;color:' + T.text + ';margin-top:3px;word-break:break-word;line-height:1.45}';
    document.head.appendChild(st);

    var root = el('div'); root.id = 'ub-root';
    var btn = el('button'); btn.id = 'ub-btn'; btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');
    var txt = el('span'); txt.id = 'ub-txt';
    txt.appendChild(document.createTextNode('update : '));
    var b = el('b', null, fmt(data.updated_at));
    txt.appendChild(b);
    if (data.summary) txt.appendChild(document.createTextNode(' (' + data.summary + ')'));
    btn.appendChild(txt);

    var panel = el('div'); panel.id = 'ub-panel'; panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', '업데이트 내역');
    var head = el('div'); head.className = 'ub-h';
    head.appendChild(el('span', null, '업데이트 내역'));
    var x = el('button', null, '×'); x.className = 'ub-x'; x.type = 'button';
    x.setAttribute('aria-label', '닫기');
    head.appendChild(x);
    panel.appendChild(head);

    var log = (data.log && data.log.length) ? data.log
      : [{ at: data.updated_at, summary: data.summary || '—' }];
    log.forEach(function (it) {
      var item = el('div'); item.className = 'ub-item';
      var when = el('div', null, fmt(it.at)); when.className = 'ub-when';
      var what = el('div', null, it.summary || '—'); what.className = 'ub-what';
      item.appendChild(when); item.appendChild(what);
      panel.appendChild(item);
    });

    function open(o) {
      panel.hidden = !o;
      btn.setAttribute('aria-expanded', o ? 'true' : 'false');
    }
    btn.addEventListener('click', function () { open(panel.hidden); });
    x.addEventListener('click', function () { open(false); btn.focus(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) { open(false); btn.focus(); }
    });
    document.addEventListener('click', function (e) {
      if (!root.contains(e.target)) open(false);
    });

    root.appendChild(panel); root.appendChild(btn);

    // footer 안에 동적 타임스탬프 삽입
    var footer = document.getElementById('ub-footer');
    if (footer) {
      footer.textContent = '';
      footer.appendChild(root);
    } else {
      // fallback: footer가 없으면 .wrap 마지막에 추가
      var wrap = document.querySelector('.wrap');
      var fallback = el('footer', 'margin-top:8px;padding-top:20px;border-top:1px solid #e6e9ee;text-align:left;color:#5b6470;font-size:15px');
      fallback.appendChild(root);
      if (wrap) wrap.appendChild(fallback);
      else document.body.appendChild(fallback);
    }
  }

  function fromMeta() {
    var t = document.querySelector('meta[name="app-updated"]');
    if (!t || !t.content) return null;
    var n = document.querySelector('meta[name="app-update-note"]');
    var note = (n && n.content) || '';
    return { updated_at: t.content, summary: note, log: [{ at: t.content, summary: note || '최신 배포' }] };
  }

  function boot() {
    if (window.__UPDATE_BADGE_DATA) { mount(window.__UPDATE_BADGE_DATA); return; }
    // version.json(커밋 이력 자동 생성)을 먼저 시도하고, 없으면 meta로 폴백
    var fallback = function () { var m = fromMeta(); if (m) mount(m); };
    fetch(SRC, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.log && d.log.length) mount(d);
        else fallback();
      })
      .catch(fallback);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
