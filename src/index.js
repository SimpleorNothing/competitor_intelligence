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
// 결과는 검토용 후보로 반환할 뿐, evidence.json에 자동 반영하지 않는다(운영 규율).
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

async function senseWeb(note, env) {
  if (!env.ANTHROPIC_API_KEY) return null; // 미설정 → 웹 센싱 생략
  try {
    const prompt =
      "너는 삼성 DA 기획팀의 경쟁사 동향 센싱 에이전트다. 다음 \"추가 센싱 요청\"에 대해 " +
      "웹에서 최신·1차 출처(거래소 공시·Tier1 매체) 위주로 사실을 조사하라. " +
      "한국어로 5줄 이내, 각 핵심 사실 끝에 출처 URL을 괄호로 붙이고, 확인 불가한 항목은 " +
      "\"미확인\"으로 명시하라. 사실과 추정을 구분하라.\n\n요청: " + note;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
      }),
    });
    if (!r.ok) return { error: "API " + r.status };
    const data = await r.json();
    const summary = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return { summary: summary || "(웹 결과 없음)" };
  } catch (e) {
    return { error: String(e && e.message ? e.message : e) };
  }
}

async function handleSense(request, env, ctx) {
  let body = {};
  try { body = await request.json(); } catch (e) {}
  const note = String(body.note || "").slice(0, 600);
  const id = String(body.id || "");
  if (!note) return json({ error: "note required" }, 400);
  const [mi, web] = await Promise.all([senseMiMatch(note), senseWeb(note, env)]);
  return json({ id, note, mi, web, ts: new Date().toISOString() });
}

export default {
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
