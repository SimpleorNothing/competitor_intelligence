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

    // 인증된 세션 → 정적 자산(public/) 서빙
    if (await isAuthed(request, env)) {
      return env.ASSETS.fetch(request);
    }

    // 미인증 → 로그인 화면
    return new Response(loginPage(url.pathname + url.search, false), {
      status: 401, headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
};
