// src/index.js
// CI 보드 — Cloudflare Workers (정적 자산 + run_worker_first)
// 포탈(samsungda-portal)과 동일한 3규칙을 복제해 SSO에 편입한다.
//   1) 같은 SITE_PASSWORD secret 값
//   2) 같은 토큰 파생: HMAC(SITE_PASSWORD, "da-portal-auth-v1")
//   3) 같은 쿠키: da_portal_session, Domain=.samsungda.net, 약 180일
// → 포탈에서 로그인했으면 ci.samsungda.net 자동 통과.
//   ci.samsungda.net 직접 접속 시엔 같은 비밀번호로 로그인 후 같은 쿠키 발급.
//
// Pages Functions(_middleware.js)와 달리 Workers는 fetch 핸들러 하나가
// 게이트 → (통과 시) env.ASSETS.fetch(request)로 정적 자산을 직접 서빙한다.
// wrangler.jsonc의 assets.run_worker_first:true 가 있어야 이 Worker가
// 정적 자산보다 먼저 모든 요청을 가로챈다.

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const AUTH_COOKIE = "da_portal_session";
const AUTH_MSG = "da-portal-auth-v1";
const AUTH_MAX_AGE = 60 * 60 * 24 * 180; // 약 180일

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hmacHex(key, message) {
  const k = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message));
  return bytesToHex(new Uint8Array(sig));
}
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function parseCookies(header) {
  const out = {};
  (header || "").split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i > -1) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  });
  return out;
}
function sessionToken(env) {
  return hmacHex(env.SITE_PASSWORD, AUTH_MSG);
}
async function isAuthed(request, env) {
  const cookie = parseCookies(request.headers.get("cookie"))[AUTH_COOKIE];
  if (!cookie) return false;
  return timingSafeEqual(cookie, await sessionToken(env));
}
function cookieDomainAttr(hostname) {
  return hostname === "samsungda.net" || hostname.endsWith(".samsungda.net")
    ? "; Domain=.samsungda.net" : "";
}
function safeNextPath(next) {
  return typeof next === "string" && /^\/(?!\/)/.test(next) ? next : "/";
}
function escAttr(s) {
  return String(s).replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

function loginPage(next, isError) {
  return `<!DOCTYPE html><html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>CI — 로그인</title>
<style>
  :root{--bg:#EDEFEC;--surface:#fff;--text:#17222D;--muted:#5C6B79;--border:#D3D9D6;--brand:#17222D;--err:#B02E24}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'IBM Plex Sans KR',-apple-system,'Malgun Gothic',sans-serif;color:var(--text);background:var(--bg);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .login{width:100%;max-width:340px;background:var(--surface);border:1px solid var(--border);border-top:4px solid var(--brand);padding:30px 26px}
  .mark{font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:12px;letter-spacing:.08em;background:var(--brand);color:var(--bg);padding:3px 8px;display:inline-block;margin-bottom:14px}
  h1{font-size:19px;font-weight:700;letter-spacing:-.01em;margin-bottom:6px}
  .sub{color:var(--muted);font-size:13px;margin-bottom:20px}
  input[type=password]{width:100%;font:inherit;font-size:14px;padding:11px 13px;border:1px solid var(--border);background:#fff;outline:none}
  input[type=password]:focus{border-color:var(--brand)}
  button{width:100%;margin-top:12px;font:inherit;font-size:14px;font-weight:600;color:#fff;background:var(--brand);border:none;padding:11px 13px;cursor:pointer}
  .err{color:var(--err);font-size:13px;margin-bottom:12px}
</style></head><body>
  <form class="login" method="POST" action="/__auth">
    <span class="mark">CI</span>
    <h1>경쟁사 전략 추적 보드</h1>
    <p class="sub">계속하려면 비밀번호를 입력하세요.</p>
    ${isError ? '<p class="err">비밀번호가 올바르지 않습니다.</p>' : ""}
    <input type="password" name="password" autofocus autocomplete="current-password" required>
    <input type="hidden" name="next" value="${escAttr(next)}">
    <button type="submit">입장</button>
  </form>
</body></html>`;
}

// ── 업데이트 내역(/version.json) — 커밋 이력에서 자동 생성 ─────────────────
// 포탈(samsungda-portal)과 동일한 방식: index.html을 손으로 고칠 필요 없이,
// GitHub 커밋 메시지의 첫 줄이 그대로 "업데이트 내역"이 된다
// (public/update-badge.js가 이 JSON을 읽어 footer의 #ub-footer에 렌더링).
//  - 제외: Merge/chore 커밋, 메시지에 [skip-log]가 포함된 커밋
//  - 표시 정리: "type(scope):" 접두어와 "(#PR번호)" 꼬리표 제거
//  - 엣지 캐시 5분(GitHub API 무인증 한도 보호). GITHUB_TOKEN 시크릿이 있으면 사용.
const LOG_REPO = "SimpleorNothing/competitor_intelligence";
const LOG_LIMIT = 40;

function cleanCommitSummary(line) {
  let s = (line || "").trim();
  s = s.replace(/^[a-z]+(\([^)]*\))?!?:\s*/i, ""); // conventional commit 접두어
  s = s.replace(/\s*\(#\d+\)\s*$/, "");            // PR 번호 꼬리표
  return s.trim();
}

async function handleVersionJson(request, env, ctx) {
  const cache = caches.default;
  const cacheKey = new Request("https://competitor-intelligence.internal/version.json");
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let log = [];
  try {
    const headers = {
      "user-agent": "ci-board-update-badge",
      accept: "application/vnd.github+json",
    };
    if (env.GITHUB_TOKEN) headers.authorization = "Bearer " + env.GITHUB_TOKEN;
    const r = await fetch(
      `https://api.github.com/repos/${LOG_REPO}/commits?per_page=60`,
      { headers }
    );
    if (r.ok) {
      const commits = await r.json();
      log = commits
        .filter((c) => !(c.parents && c.parents.length > 1)) // merge 커밋 제외
        .map((c) => ({
          at: (c.commit && c.commit.author && c.commit.author.date) || "",
          raw: ((c.commit && c.commit.message) || "").split("\n")[0].trim(),
        }))
        .filter(
          (it) =>
            it.at &&
            it.raw &&
            !/^(merge|chore)\b/i.test(it.raw) &&
            !it.raw.includes("[skip-log]")
        )
        .map((it) => ({ at: it.at, summary: cleanCommitSummary(it.raw) }))
        .filter((it) => it.summary)
        .slice(0, LOG_LIMIT);
    }
  } catch (e) {
    // GitHub 장애/한도 초과 시 빈 log → 배지는 meta(배포 시각) 기반으로 폴백
  }

  const vm = env.CF_VERSION_METADATA;
  const updatedAt =
    (vm && vm.timestamp) || (log[0] && log[0].at) || new Date().toISOString();
  const res = json({ updated_at: updatedAt, log });
  res.headers.set("cache-control", "public, max-age=60, s-maxage=300");
  if (log.length) ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

// ── 추가 센싱(/api/sense) ─────────────────────────────────────────────
// 미분류 인박스 항목의 "추가 센싱하기" 버튼이 호출한다.
//   1) MI DB: market-insight 뉴스 저장소(news.json)에서 note 키워드 매칭
//   2) 웹 센싱: ANTHROPIC_API_KEY 시크릿이 있으면 Claude + web_search로 최신 조사
// 결과는 검토용 후보만 반환하고, 반영은 별도 /api/promote(버튼 확인)로만 수행.
const MI_NEWS_URL =
  "https://raw.githubusercontent.com/SimpleorNothing/market-insight/main/data/news.json";

// note에서 매칭용 키워드 추출 (2자 이상, 요청 상용어 제거)
const SENSE_STOP = new Set(
  ("추가 센싱 요청 필요 확인 상태 관련 대비 여부 최신 진척 후속 재검증 재확인 통과 시점 즉시 " +
   "포착 출처 공시 기반 확정치 인용치 표현 목표 실적 발표 최대 변곡점 불일치 그리고 또는 " +
   "가능 여부를 대한 위한 통해 등의 등이 이후 현재 관측 정리").split(/\s+/)
);
function senseKeywords(note) {
  return Array.from(new Set(
    String(note || "")
      .replace(/[·—\-,()%'"“”‘’\/\[\]|]/g, " ")
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 2 && !SENSE_STOP.has(w))
  )).slice(0, 14);
}

async function senseMiMatch(note) {
  try {
    const r = await fetch(MI_NEWS_URL, { headers: { "user-agent": "ci-sense" } });
    if (!r.ok) return [];
    const data = await r.json();
    const items = Array.isArray(data) ? data : (data.items || data.news || []);
    const kws = senseKeywords(note).map((k) => k.toLowerCase());
    if (!kws.length) return [];
    return items
      .map((it) => {
        const hay = [
          it.headline, it.summary,
          Array.isArray(it.tags) ? it.tags.join(" ") : "",
          Array.isArray(it.competitors) ? it.competitors.join(" ") : "",
        ].join(" ").toLowerCase();
        let score = 0;
        kws.forEach((k) => { if (hay.includes(k)) score++; });
        return { it, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) =>
        b.score - a.score ||
        String(b.it.publishedAt || "").localeCompare(String(a.it.publishedAt || ""))
      )
      .slice(0, 6)
      .map((x) => ({
        headline: x.it.headline || "",
        summary: x.it.summary || "",
        url: x.it.url || (x.it.source && x.it.source.url) || "",
        source: (x.it.source && x.it.source.name) || "",
        publishedAt: x.it.publishedAt || "",
        score: x.score,
      }));
  } catch (e) {
    return [];
  }
}

// 전략축 카탈로그 — 자체 정적 자산(strategies.json)에서 로드
async function loadAxisCatalog(env) {
  try {
    const r = await env.ASSETS.fetch(new Request("https://ci.internal/data/strategies.json"));
    if (!r.ok) return [];
    const s = await r.json();
    const co = (s.companies || []).find((c) => c.active) || (s.companies || [])[0];
    if (!co) return [];
    const axes = (co.axes || []).map((a) => ({ id: a.id, code: a.code, title: a.title }));
    if (co.id) axes.unshift({ id: co.id + "-frame", code: "F0", title: "전략 프레임" });
    return axes;
  } catch (e) {
    return [];
  }
}

function extractJson(text) {
  const t = String(text || "").replace(/```json|```/g, "").trim();
  try { return JSON.parse(t); } catch (e) {}
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a > -1 && b > a) {
    try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {}
  }
  return null;
}

async function senseWeb(note, env, axes) {
  if (!env.ANTHROPIC_API_KEY) return null; // 미설정 → 웹 센싱 생략
  try {
    const axisList = (axes || []).map((a) => a.id + "(" + (a.code || "") + " " + (a.title || "") + ")").join(", ");
    const prompt =
      "너는 삼성 DA 기획팀의 경쟁사 동향 센싱 에이전트다. 아래 '검증 대기' 항목을 웹에서 " +
      "최신·1차 출처(거래소 공시·회사 공식 발표·Tier1 매체) 위주로 조사하고, 승격 조건에 따라 판정하라.\n" +
      "승격 조건: ①1차 출처로 사실 확인 ②출처 간 수치 불일치 해소(확정치 확보) ③대기 중 이벤트 발생·실적 확정.\n" +
      "가능한 전략축(axisId): " + axisList + "\n\n" +
      "반드시 아래 JSON 객체 하나만 출력하라. 마크다운·코드펜스·설명문 금지. summary는 평문(#, ** 등 마크다운 기호 금지).\n" +
      '{"summary":"5줄 이내 조사 요약, 각 사실 끝에 (출처URL)","verdict":"승격|부분승격|대기",' +
      '"reason":"판정 근거 1~2문장","items":[{"axisId":"...","date":"YYYY-MM-DD 또는 YYYY-MM",' +
      '"event":"확정된 사실","interpretation":"당사(삼성 DA) 관점 해석","signalType":"New|Deep|Insight",' +
      '"confidence":"사실|추론","source":{"name":"출처명","url":"https://...","tier":1}}],' +
      '"noteUpdate":"대기·부분승격 시 인박스에 남길 갱신 노트(없으면 null)","removeFromInbox":false}\n' +
      "규칙: items에는 출처로 확인된 사실만 넣는다. confidence '사실'은 1차 출처(공시·회사 발표)가 있을 때만. " +
      "모든 쟁점이 해소된 완전 승격일 때만 removeFromInbox를 true로. 아무것도 확인 못 하면 items는 빈 배열, verdict '대기'.\n\n" +
      "요청: " + note;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      }),
    });
    if (!r.ok) return { error: "API " + r.status };
    const data = await r.json();
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    const p = extractJson(text);
    if (p && typeof p === "object" && p.summary) {
      return {
        summary: String(p.summary).trim(),
        verdict: ["승격", "부분승격", "대기"].includes(p.verdict) ? p.verdict : "대기",
        reason: String(p.reason || "").slice(0, 300),
        items: Array.isArray(p.items) ? p.items.slice(0, 5) : [],
        noteUpdate: typeof p.noteUpdate === "string" && p.noteUpdate.trim() ? p.noteUpdate.trim().slice(0, 600) : null,
        removeFromInbox: p.removeFromInbox === true,
      };
    }
    return { summary: text || "(웹 결과 없음)" };
  } catch (e) {
    return { error: String(e && e.message ? e.message : e) };
  }
}

// ── 판정 반영(/api/promote) ───────────────────────────────────────────
// "판정대로 반영하기" 버튼이 호출. GitHub Contents API로 evidence.json을
// main에 직접 커밋 → Cloudflare 자동 재배포로 보드에 반영.
// GITHUB_TOKEN 시크릿(repo contents 쓰기 권한) 필요. 승격 항목은
// reviewStatus "auto"(AI자동·검토전 배지)로 들어가 주간 검토 대상이 된다.
const DATA_REPO = "SimpleorNothing/competitor_intelligence";
const DATA_PATH = "public/data/evidence.json";

function b64EncodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(bin);
}
function b64DecodeUtf8(b64) {
  const bin = atob(String(b64 || "").replace(/\n/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function handlePromote(request, env, ctx) {
  if (!env.GITHUB_TOKEN) {
    return json({ error: "GITHUB_TOKEN 시크릿 필요 — repo contents 쓰기 권한 토큰을 Worker에 등록하세요" }, 501);
  }
  let body = {};
  try { body = await request.json(); } catch (e) {}
  const inboxId = String(body.id || "");
  const items = Array.isArray(body.items) ? body.items : [];
  const noteUpdate = typeof body.noteUpdate === "string" && body.noteUpdate.trim() ? body.noteUpdate.trim().slice(0, 600) : null;
  const removeFromInbox = body.removeFromInbox === true;
  if (!inboxId) return json({ error: "id required" }, 400);
  if (!items.length && !noteUpdate && !removeFromInbox) return json({ error: "반영할 변경이 없습니다" }, 400);

  const gh = {
    "user-agent": "ci-sense-promote",
    accept: "application/vnd.github+json",
    authorization: "Bearer " + env.GITHUB_TOKEN,
  };
  const getRes = await fetch(
    "https://api.github.com/repos/" + DATA_REPO + "/contents/" + DATA_PATH + "?ref=main",
    { headers: gh }
  );
  if (!getRes.ok) return json({ error: "evidence.json 조회 실패 " + getRes.status }, 502);
  const meta = await getRes.json();
  let data;
  try { data = JSON.parse(b64DecodeUtf8(meta.content)); }
  catch (e) { return json({ error: "evidence.json 파싱 실패" }, 502); }

  const entry = (data.inbox || []).find((x) => x.id === inboxId);
  let nextId = Math.max(0, ...(data.items || []).map((i) => Number(i.id) || 0)) + 1;
  const added = [];
  for (const it of items.slice(0, 5)) {
    if (!it || !it.axisId || !it.event) continue;
    added.push({
      id: nextId++,
      companyId: "lg",
      axisId: String(it.axisId),
      date: String(it.date || new Date().toISOString().slice(0, 10)),
      event: String(it.event).slice(0, 600),
      interpretation: String(it.interpretation || "").slice(0, 600),
      signalType: ["New", "Deep", "Insight"].includes(it.signalType) ? it.signalType : "New",
      confidence: ["사실", "추론", "가설"].includes(it.confidence) ? it.confidence : "추론",
      source: {
        name: String((it.source && it.source.name) || "웹 센싱").slice(0, 120),
        url: it.source && it.source.url ? String(it.source.url).slice(0, 300) : null,
        tier: [1, 2, 3].includes(Number(it.source && it.source.tier)) ? Number(it.source.tier) : 2,
      },
      interpretationBy: "claude",
      reviewStatus: "auto",
    });
  }
  data.items = (data.items || []).concat(added);
  if (entry) {
    if (removeFromInbox) data.inbox = data.inbox.filter((x) => x.id !== inboxId);
    else if (noteUpdate) entry.note = noteUpdate;
  }
  data.updatedAt = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10) + "T00:00:00+09:00";

  const msg = "data: 센싱 반영 — " + inboxId +
    (removeFromInbox ? " 승격·인박스 제거" : noteUpdate ? " 노트 갱신" : " 증거 추가") +
    " (+" + added.length + "건)";
  const putRes = await fetch(
    "https://api.github.com/repos/" + DATA_REPO + "/contents/" + DATA_PATH,
    {
      method: "PUT",
      headers: { ...gh, "content-type": "application/json" },
      body: JSON.stringify({
        message: msg,
        content: b64EncodeUtf8(JSON.stringify(data, null, 2) + "\n"),
        sha: meta.sha,
        branch: "main",
      }),
    }
  );
  if (!putRes.ok) {
    const t = await putRes.text();
    return json({ error: "커밋 실패 " + putRes.status, detail: t.slice(0, 200) }, 502);
  }
  const out = await putRes.json();
  return json({
    ok: true,
    added: added.length,
    removed: removeFromInbox,
    noteUpdated: !!(noteUpdate && !removeFromInbox),
    commit: (out.commit && out.commit.html_url) || null,
  });
}

// ── 워치리스트 스캔(daily cron) ───────────────────────────────────────
// public/data/watchlist.json 의 '확인 필요' 항목을 MI news.json 과 키워드
// 매칭한다. 신규 뉴스 감지 시 status를 watching→signal로 올리고 hits에
// 기록(검토 대기). strategies/evidence 는 건드리지 않는다 — 사람이 판단.
// cron(scheduled) 과 /api/watchlist-scan(수동) 이 이 함수를 호출.
const WATCHLIST_PATH = "public/data/watchlist.json";

function miNewsHaystack(it) {
  return [
    it.headline, it.summary,
    Array.isArray(it.tags) ? it.tags.join(" ") : "",
    Array.isArray(it.competitors) ? it.competitors.join(" ") : "",
  ].join(" ").toLowerCase();
}
async function fetchMiItems() {
  try {
    const r = await fetch(MI_NEWS_URL, { headers: { "user-agent": "ci-watchlist" } });
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data) ? data : (data.items || data.news || []);
  } catch (e) { return []; }
}
function matchNewsForKeywords(keywords, items) {
  const kws = (keywords || []).map((k) => String(k).toLowerCase().trim()).filter(Boolean);
  if (!kws.length) return [];
  return items
    .map((it) => {
      const hay = miNewsHaystack(it);
      let score = 0;
      kws.forEach((k) => { if (hay.includes(k)) score++; });
      return { it, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) =>
      b.score - a.score ||
      String(b.it.publishedAt || "").localeCompare(String(a.it.publishedAt || ""))
    )
    .slice(0, 3)
    .map((x) => ({
      headline: x.it.headline || "",
      url: x.it.url || (x.it.source && x.it.source.url) || "",
      source: (x.it.source && x.it.source.name) || "",
      publishedAt: x.it.publishedAt || "",
      score: x.score,
    }));
}
function nowKstStamp() {
  return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ");
}
async function scanWatchlist(env, reason) {
  if (!env.GITHUB_TOKEN) return { ok: false, error: "GITHUB_TOKEN 미설정 — watchlist 커밋 불가" };
  const gh = {
    "user-agent": "ci-watchlist",
    accept: "application/vnd.github+json",
    authorization: "Bearer " + env.GITHUB_TOKEN,
  };
  const getRes = await fetch(
    "https://api.github.com/repos/" + DATA_REPO + "/contents/" + WATCHLIST_PATH + "?ref=main",
    { headers: gh }
  );
  if (!getRes.ok) return { ok: false, error: "watchlist.json 조회 실패 " + getRes.status };
  const meta = await getRes.json();
  let wl;
  try { wl = JSON.parse(b64DecodeUtf8(meta.content)); }
  catch (e) { return { ok: false, error: "watchlist.json 파싱 실패" }; }

  const items = await fetchMiItems();
  const stamp = nowKstStamp();
  let changed = 0, newSignals = 0;

  for (const w of (wl.items || [])) {
    w.lastChecked = stamp;
    if (w.status === "resolved") continue;
    const matches = matchNewsForKeywords(w.keywords, items);
    const seen = new Set((w.hits || []).map((h) => h.url).filter(Boolean));
    const fresh = matches.filter((m) => m.url && !seen.has(m.url));
    if (fresh.length) {
      w.hits = fresh.map((m) => ({ ...m, seenAt: stamp })).concat(w.hits || []).slice(0, 5);
      w.lastHit = stamp;
      if (w.status === "watching") { w.status = "signal"; newSignals++; }
      changed++;
    }
  }
  wl.lastScan = stamp;
  wl.scanReason = reason || "cron";
  wl.updatedAt = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10) + "T00:00:00+09:00";

  // 신규 매칭이 없으면 커밋 생략(매일 무의미 커밋 방지). lastScan은 다음 신호 때 함께 반영.
  if (!changed) return { ok: true, scanned: (wl.items || []).length, changed: 0, newSignals: 0, committed: false };

  const msg = "data: 워치리스트 스캔 — 신호 " + newSignals + "건 감지 (" + (reason || "cron") + ") [skip-log]";
  const putRes = await fetch(
    "https://api.github.com/repos/" + DATA_REPO + "/contents/" + WATCHLIST_PATH,
    {
      method: "PUT",
      headers: { ...gh, "content-type": "application/json" },
      body: JSON.stringify({
        message: msg,
        content: b64EncodeUtf8(JSON.stringify(wl, null, 2) + "\n"),
        sha: meta.sha,
        branch: "main",
      }),
    }
  );
  if (!putRes.ok) {
    const t = await putRes.text();
    return { ok: false, error: "커밋 실패 " + putRes.status, detail: t.slice(0, 200) };
  }
  const out = await putRes.json();
  return {
    ok: true,
    scanned: (wl.items || []).length,
    changed, newSignals, committed: true,
    commit: (out.commit && out.commit.html_url) || null,
  };
}
async function handleWatchlistScan(request, env, ctx) {
  return json(await scanWatchlist(env, "manual"));
}

async function handleSense(request, env, ctx) {
  let body = {};
  try { body = await request.json(); } catch (e) {}
  const note = String(body.note || "").slice(0, 600);
  const id = String(body.id || "");
  if (!note) return json({ error: "note required" }, 400);
  const axes = await loadAxisCatalog(env);
  const [mi, web] = await Promise.all([senseMiMatch(note), senseWeb(note, env, axes)]);
  return json({ id, note, mi, web, ts: new Date().toISOString() });
}

export default {
  async scheduled(event, env, ctx) {
    // daily cron — 워치리스트를 MI news 와 대조해 신호 갱신
    ctx.waitUntil(scanWatchlist(env, "cron"));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const host = url.hostname;

    // SITE_PASSWORD 미설정 시 게이트 비활성 (로컬 개발 편의) — 운영에서는 반드시 설정
    if (!env.SITE_PASSWORD) {
      return env.ASSETS.fetch(request);
    }

    // 로그인 처리
    if (url.pathname === "/__auth" && request.method === "POST") {
      const form = await request.formData();
      const password = form.get("password") || "";
      const nextPath = safeNextPath(form.get("next"));
      const ok = timingSafeEqual(
        await hmacHex(password, AUTH_MSG),
        await hmacHex(env.SITE_PASSWORD, AUTH_MSG)
      );
      if (!ok) {
        return new Response(loginPage(nextPath, true), {
          status: 401, headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      const token = await sessionToken(env);
      const cookie = `${AUTH_COOKIE}=${token}; Path=/; Max-Age=${AUTH_MAX_AGE}; HttpOnly; Secure; SameSite=Lax${cookieDomainAttr(host)}`;
      return new Response(null, {
        status: 303,
        headers: { "location": nextPath, "set-cookie": cookie },
      });
    }

    // 인증된 세션 → 업데이트 내역 JSON(커밋 이력 자동 생성) 또는 정적 자산(public/) 서빙
    if (await isAuthed(request, env)) {
      if (url.pathname === "/version.json") {
        return handleVersionJson(request, env, ctx);
      }
      if (url.pathname === "/api/sense" && request.method === "POST") {
        return handleSense(request, env, ctx);
      }
      if (url.pathname === "/api/promote" && request.method === "POST") {
        return handlePromote(request, env, ctx);
      }
      if (url.pathname === "/api/watchlist-scan" && request.method === "POST") {
        return handleWatchlistScan(request, env, ctx);
      }
      // 루트 페이지: /version.json 이 GitHub API 순간 장애 등으로 빈 log를
      // 반환해도 update-badge.js가 배포 시각 기준으로는 최소한 폴백하도록
      // <meta app-updated>를 주입한다(포탈과 동일한 이중 안전장치).
      if (url.pathname === "/" || url.pathname === "/index.html") {
        const assetRes = await env.ASSETS.fetch(request);
        const vm = env.CF_VERSION_METADATA;
        const ct = assetRes.headers.get("content-type") || "";
        if (vm && vm.timestamp && ct.includes("text/html")) {
          const ts = escAttr(vm.timestamp);
          return new HTMLRewriter()
            .on("head", {
              element(el) {
                el.append(`\n<meta name="app-updated" content="${ts}">`, { html: true });
              },
            })
            .transform(assetRes);
        }
        return assetRes;
      }
      return env.ASSETS.fetch(request);
    }

    // 미인증 → 로그인 화면
    return new Response(loginPage(url.pathname + url.search, false), {
      status: 401, headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
};
