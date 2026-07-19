// src/watchlist-action.js
// 워치리스트 카드 액션 엔드포인트 — /api/watchlist-action (POST)
//   to-inbox : evidence.json inbox[] 에 센싱 요청 생성 + watchlist 에 routedInboxId 표시
//              응답의 inboxItem 을 받아 프런트가 곧바로 /api/sense 를 자동 실행한다.
//   resolve  : watchlist status=resolved (daily cron 스캔에서 제외) + 종결 사유 기록
//   reopen   : resolved → watching 복귀
//
// index.js 가 인라인 커밋 한계에 가까워 별도 모듈로 분리했다. 순환 참조를 피하려고
// 헬퍼(json·base64·KST)를 이 파일 안에서 자체 정의한다.
// 인증은 index.js 의 isAuthed 게이트가 이미 커버한다(동일 출처 + SameSite=Lax 쿠키).

const REPO = "SimpleorNothing/competitor_intelligence";
const EVIDENCE_PATH = "public/data/evidence.json";
const WATCHLIST_PATH = "public/data/watchlist.json";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

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
  const bin = atob(String(b64).replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function kstDate() {
  return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
}

function kstStamp() {
  return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ");
}

async function ghGetJson(path, gh) {
  const r = await fetch(
    "https://api.github.com/repos/" + REPO + "/contents/" + path + "?ref=main",
    { headers: gh });
  if (!r.ok) return { error: path + " 조회 실패 " + r.status };
  const meta = await r.json();
  try { return { meta, data: JSON.parse(b64DecodeUtf8(meta.content)) }; }
  catch (e) { return { error: path + " 파싱 실패" }; }
}

async function ghPutJson(path, data, sha, message, gh) {
  const r = await fetch(
    "https://api.github.com/repos/" + REPO + "/contents/" + path,
    {
      method: "PUT",
      headers: { ...gh, "content-type": "application/json" },
      body: JSON.stringify({
        message,
        content: b64EncodeUtf8(JSON.stringify(data, null, 2) + "\n"),
        sha,
        branch: "main",
      }),
    });
  if (!r.ok) {
    const t = await r.text();
    return { error: "커밋 실패 " + r.status + " " + t.slice(0, 160) };
  }
  const out = await r.json();
  return { commit: (out.commit && out.commit.html_url) || null };
}

// 워치리스트 항목 → 인박스 센싱 요청 note. 감지 기사 URL 최대 3건을 덧붙인다.
function buildInboxNote(w) {
  const hits = Array.isArray(w.hits) ? w.hits : [];
  const urls = hits.slice(0, 3).map((h) => h.url).filter(Boolean).join(" ");
  let note = w.question + " — " + (w.detail || "");
  if (hits.length) {
    note += " [워치리스트 감지 " + hits.length + "건" + (urls ? ": " + urls : "") + "]";
  }
  return note.slice(0, 600);
}

export async function handleWatchlistAction(request, env, ctx) {
  if (!env.GITHUB_TOKEN) return json({ error: "GITHUB_TOKEN 시크릿 필요" }, 501);

  let body = {};
  try { body = await request.json(); } catch (e) {}
  const id = String(body.id || "");
  const action = String(body.action || "");
  const reason = String(body.reason || "").slice(0, 200);
  if (!id || !["to-inbox", "resolve", "reopen"].includes(action)) {
    return json({ error: "id·action 필요 (to-inbox|resolve|reopen)" }, 400);
  }

  const gh = {
    "user-agent": "ci-watchlist-action",
    accept: "application/vnd.github+json",
    authorization: "Bearer " + env.GITHUB_TOKEN,
  };

  const wl = await ghGetJson(WATCHLIST_PATH, gh);
  if (wl.error) return json({ error: wl.error }, 502);
  const item = (wl.data.items || []).find((x) => x.id === id);
  if (!item) return json({ error: "워치리스트 항목 없음: " + id }, 404);
  const stamp = kstStamp();

  // ── resolve / reopen : watchlist 한 파일만 ──
  if (action === "resolve" || action === "reopen") {
    if (action === "resolve") {
      item.status = "resolved";
      item.resolvedAt = stamp;
      if (reason) item.resolution = reason;
    } else {
      item.status = "watching";
      delete item.resolvedAt;
      delete item.resolution;
    }
    wl.data.updatedAt = kstDate() + "T00:00:00+09:00";
    const msg = "data: 워치리스트 " + (action === "resolve" ? "종결" : "재개") +
      " — " + id + (reason ? " (" + reason + ")" : "") + " [skip-log]";
    const put = await ghPutJson(WATCHLIST_PATH, wl.data, wl.meta.sha, msg, gh);
    if (put.error) return json({ error: put.error }, 502);
    return json({ ok: true, action, id, commit: put.commit });
  }

  // ── to-inbox : evidence 먼저 커밋(실제 작업 생성) → watchlist 마커 ──
  // 마커 커밋이 실패해도 inbox id 중복검사 덕분에 재시도가 안전하다.
  const inboxId = "ib-" + id;
  const ev = await ghGetJson(EVIDENCE_PATH, gh);
  if (ev.error) return json({ error: ev.error }, 502);
  ev.data.inbox = ev.data.inbox || [];
  let inboxItem = ev.data.inbox.find((x) => x.id === inboxId);
  if (!inboxItem) {
    inboxItem = {
      id: inboxId,
      requestedTo: "경쟁사 동향 센싱 에이전트",
      note: buildInboxNote(item),
      createdAt: kstDate(),
      origin: "watchlist",
      watchlistId: id,
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
      it2.routedInboxId = inboxId;
      it2.routedAt = stamp;
      wl2.data.updatedAt = kstDate() + "T00:00:00+09:00";
      await ghPutJson(WATCHLIST_PATH, wl2.data, wl2.meta.sha,
        "data: 워치리스트 인박스 이동표시 — " + id + " [skip-log]", gh);
    }
  }

  // inboxItem 을 함께 반환 → 프런트가 낙관적 렌더 후 /api/sense 자동 실행
  return json({ ok: true, action, id, inboxId, inboxItem });
}
