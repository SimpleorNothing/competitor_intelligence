#!/usr/bin/env node
/**
 * CI 2차 자동화 — market-insight(mi) 경쟁사 기사 → CI evidence.json 자동 적재
 *
 * 흐름 (README "2차 자동화" 구현체):
 *   mi의 news.json(경쟁사 태그) → 일 1회 GitHub Action → Claude API로
 *     ① 축 매핑(불가 시 inbox) ② 해석 1~2문장 ③ New/Deep/Insight 판정
 *   → public/data/evidence.json 에 append(reviewStatus:"auto", origin:"mi")
 *
 * 설계 원칙:
 *   - execStatus 는 절대 자동 변경하지 않는다(운영 규율: 주간 사람 검수 대상).
 *     자동 적재분은 reviewStatus:"auto" 로만 쌓고, 사람이 주간 검토에서 reviewed 승격.
 *   - 멱등성: 이미 적재된 URL·miId 는 재적재하지 않는다.
 *   - 비용 보호: 한 회 실행당 MAX_PER_RUN 건까지만 Claude 호출.
 *   - 의존성 0: Node 20 내장 fetch 만 사용(별도 npm 설치 불필요).
 *
 * 환경변수:
 *   ANTHROPIC_API_KEY (필수)
 *   DRY_RUN=1 (선택 — Claude 호출 없이 후보 선별까지만 검증)
 */

import { readFile, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_DIR = join(ROOT, "public", "data");
const EVIDENCE_PATH = join(DATA_DIR, "evidence.json");
const STRATEGIES_PATH = join(DATA_DIR, "strategies.json");

const MI_NEWS_URL =
  "https://raw.githubusercontent.com/SimpleorNothing/market-insight/main/data/news.json";

const MODEL = "claude-haiku-4-5-20251001";
const DRY_RUN = process.env.DRY_RUN === "1";
const RUN_DATE = new Date().toISOString().slice(0, 10);

// ── 운영 파라미터 ──────────────────────────────────────
const MAX_PER_RUN = 12; // 한 회 Claude 호출 상한 (비용 보호)
const LOOKBACK_DAYS = 30; // 이 기간 내 발행 기사만 대상
const GRADES_ALLOWED = new Set(["긴급", "주요", "주시"]); // 참고 등급 제외

// mi 경쟁사 canonical 명 → CI companyId
const NEWS_NAME_TO_COMPANY = {
  "LG전자": "lg",
  "Midea": "midea",
  "월풀": "whirlpool",
  "Electrolux": "electrolux",
  "BSH": "bsh",
  "Haier": "haier",
  "Carrier": "carrier",
  "Trane": "trane",
  "JCI": "jci",
  "Daikin": "daikin",
  "Lennox": "lennox",
  // "삼성전자"(당사)·"Gree"(CI 미추적)는 매핑하지 않음 → 자동 제외
};

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function normUrl(u) {
  return String(u || "")
    .trim()
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function daysAgo(iso) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
}

// ── 전략 컨텍스트 구성 ─────────────────────────────────
// active && axes 보유 회사만 자동 매핑 대상. 회사별 frame + 축 요약을 프롬프트에 주입.
function buildCompanyContext(strategies) {
  const map = new Map();
  for (const c of strategies.companies || []) {
    if (!c.active || !Array.isArray(c.axes) || c.axes.length === 0) continue;
    const axisLines = c.axes.map(
      (a) => `  - ${a.code} (axisId: "${a.id}"): ${a.title} — ${a.summary || ""}`
    );
    const frameLine = c.frame
      ? `프레임(전략 총론, axisId: "${c.id}-frame"): ${c.frame.statement}` +
        (c.frame.redefinition ? ` / 재정의: ${c.frame.redefinition}` : "")
      : `프레임 axisId: "${c.id}-frame"`;
    map.set(c.id, {
      id: c.id,
      name: c.name,
      frameLine,
      axisLines: axisLines.join("\n"),
      axisIds: new Set([`${c.id}-frame`, ...c.axes.map((a) => a.id)]),
    });
  }
  return map;
}

const SYSTEM = `당신은 가전 경쟁사 전략 추적(Competitor Intelligence) 분석가입니다.
입력으로 경쟁사 관련 뉴스 1건과, 그 회사의 선언 전략축(L1·L2) 목록을 받습니다.
이 뉴스가 어느 전략축의 "실행 증거(L3)"인지 판정하고, 사실과 해석을 분리해 정리합니다.

【판정 규칙】
- relevant: 이 기사가 해당 회사의 전략 실행/방향을 보여주는 증거면 true.
  단순 제품 홍보·일반 시장 기사·주가·잡음이면 false.
- axisId: 가장 잘 맞는 축의 axisId 1개. 어느 축에도 매핑 불가하나 전략적으로 유의미하면 null(→ inbox).
  전략 프레임 자체(총론·CEO·목표 재정의)에 해당하면 "<companyId>-frame".
- event: 기사가 보도한 "사실"만 한국어로 압축(≤120자). 해석·전망 금지, 수치·고유명사 보존.
- interpretation: 이 사실이 해당 축 전략에 갖는 의미 1~2문장(한국어). 당사 관점 해석 허용.
- signalType: New(단발 실행·발표·수치) / Deep(기존 전략의 심화·확대·연속 실행) / Insight(전략 프레임·방향 자체의 변화·재정의급 신호) 중 1개.
- confidence: 사실(신뢰 출처가 보도한 확정 사실) / 추론(사실에서 합리적으로 도출한 해석적 매핑) / 가설(단일·미확정 출처 기반 추정) 중 1개.

【출력 — 절대 규칙】
- 순수 JSON 객체 1개만 출력. 코드펜스·주석·설명·거절 표현 금지.
- 스키마:
{
  "relevant": true,
  "axisId": "lg-a2" 또는 null,
  "event": "...",
  "interpretation": "...",
  "signalType": "New",
  "confidence": "사실"
}
- relevant 가 false 면 나머지 필드는 빈 값이어도 된다.
JSON 외 어떤 텍스트도 출력 금지.`;

async function callClaude(apiKey, userPrompt, retry = false) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (!retry && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 1500));
      return callClaude(apiKey, userPrompt, true);
    }
    throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  let cleaned = text.replace(/^```json\s*|\s*```$/g, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first >= 0 && last > first) cleaned = cleaned.slice(first, last + 1);

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    if (!retry) {
      await new Promise((r) => setTimeout(r, 800));
      return callClaude(apiKey, userPrompt, true);
    }
    throw new Error(`JSON 파싱 실패: ${e.message}`);
  }
}

function buildUserPrompt(company, article) {
  const pts = Array.isArray(article.summaryPoints)
    ? article.summaryPoints.map((p) => `  · ${p.text}`).join("\n")
    : "";
  return `[대상 회사]
${company.name} (companyId: ${company.id})

[${company.name} 전략 프레임]
${company.frameLine}

[${company.name} 전략축 목록]
${company.axisLines}

[뉴스 발행일]
${(article.publishedAt || "").slice(0, 10)}

[뉴스 헤드라인]
${article.headline}

[뉴스 요약]
${article.summary || ""}

[뉴스 핵심 포인트]
${pts}

[뉴스 제품 태그]
${(article.products || []).join(", ") || "-"}

[출처]
${article.source?.name || "-"}`;
}

async function main() {
  log("=== CI 2차 자동화: mi → evidence 적재 시작 ===");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!DRY_RUN && !apiKey) {
    throw new Error("ANTHROPIC_API_KEY 미설정");
  }

  const strategies = JSON.parse(await readFile(STRATEGIES_PATH, "utf-8"));
  const evidence = JSON.parse(await readFile(EVIDENCE_PATH, "utf-8"));
  if (!Array.isArray(evidence.items)) evidence.items = [];
  if (!Array.isArray(evidence.inbox)) evidence.inbox = [];

  const companyCtx = buildCompanyContext(strategies);
  log(`자동 매핑 대상 회사(active+축): ${[...companyCtx.keys()].join(", ") || "없음"}`);

  // mi news.json fetch (public raw)
  let news;
  try {
    const res = await fetch(MI_NEWS_URL, {
      headers: { "User-Agent": "CI-ingest/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    news = await res.json();
  } catch (e) {
    throw new Error(`mi news.json fetch 실패: ${e.message}`);
  }
  const allNews = Array.isArray(news.items) ? news.items : [];
  log(`mi 뉴스 ${allNews.length}건 로드`);

  // 멱등성: 기존 evidence URL + miId, inbox miId
  const seenUrls = new Set(
    evidence.items.map((i) => normUrl(i.source?.url)).filter(Boolean)
  );
  const seenMiIds = new Set();
  for (const i of evidence.items) if (i.miId != null) seenMiIds.add(String(i.miId));
  for (const i of evidence.inbox) if (i.miId != null) seenMiIds.add(String(i.miId));

  // 후보 선별: 매핑되는 active 회사 태그 + 등급 + 발행기간 + 미적재
  const candidates = [];
  for (const art of allNews) {
    if (!GRADES_ALLOWED.has(art.grade)) continue;
    if (daysAgo(art.publishedAt) > LOOKBACK_DAYS) continue;
    if (seenMiIds.has(String(art.id))) continue;
    if (seenUrls.has(normUrl(art.url || art.source?.url))) continue;

    const companyIds = [
      ...new Set(
        (art.competitors || [])
          .map((n) => NEWS_NAME_TO_COMPANY[n])
          .filter((id) => id && companyCtx.has(id))
      ),
    ];
    if (companyIds.length === 0) continue;
    // 기사에 복수 대상사가 거명되면 첫 번째(대표) 회사로 적재
    candidates.push({ art, companyId: companyIds[0] });
  }

  // 최신·고영향 우선 정렬 후 상한 적용
  candidates.sort(
    (a, b) =>
      (b.art.impact || 0) - (a.art.impact || 0) ||
      new Date(b.art.publishedAt) - new Date(a.art.publishedAt)
  );
  const batch = candidates.slice(0, MAX_PER_RUN);
  log(`후보 ${candidates.length}건 → 이번 회 처리 ${batch.length}건 (상한 ${MAX_PER_RUN})`);

  if (batch.length === 0) {
    log("신규 적재 대상 없음, 종료");
    return;
  }

  if (DRY_RUN) {
    for (const { art, companyId } of batch) {
      log(`  [DRY] ${companyId} ← ${art.headline}`);
    }
    log("DRY_RUN: Claude 호출·쓰기 생략");
    return;
  }

  let nextId =
    Math.max(0, ...evidence.items.map((i) => (typeof i.id === "number" ? i.id : 0))) + 1;

  let added = 0;
  let inboxed = 0;
  let skipped = 0;
  let failed = 0;

  for (const { art, companyId } of batch) {
    const company = companyCtx.get(companyId);
    try {
      log(`매핑 中: [${companyId}] ${art.headline.slice(0, 40)}...`);
      const r = await callClaude(apiKey, buildUserPrompt(company, art));

      if (!r || r.relevant === false) {
        skipped++;
        log("  → 무관(skip)");
        continue;
      }

      const signalType = ["New", "Deep", "Insight"].includes(r.signalType)
        ? r.signalType
        : "New";
      const confidence = ["사실", "추론", "가설"].includes(r.confidence)
        ? r.confidence
        : "추론";
      const event = String(r.event || art.headline).trim().slice(0, 160);
      const interpretation = String(r.interpretation || "").trim().slice(0, 400);
      const date = (art.publishedAt || RUN_DATE).slice(0, 10);

      const axisId =
        r.axisId && company.axisIds.has(r.axisId) ? r.axisId : null;

      if (!axisId) {
        // 축 매핑 불가 → inbox 적재
        evidence.inbox.push({
          id: `inbox-auto-${art.id}`,
          note: `[${company.name}] ${event} — 기존 축 매핑 불가(자동). ${interpretation} (출처: ${art.url || art.source?.url || ""})`,
          requestedTo: "경쟁사 동향 센싱 에이전트",
          createdAt: RUN_DATE,
          origin: "mi",
          miId: art.id,
        });
        inboxed++;
        log("  → inbox(축 미매핑)");
        continue;
      }

      evidence.items.push({
        id: nextId++,
        companyId,
        axisId,
        date,
        event,
        interpretation,
        signalType,
        confidence,
        source: {
          name: art.source?.name || "Market Insight",
          url: art.url || art.source?.url || "",
          tier: 3,
        },
        interpretationBy: "claude",
        reviewStatus: "auto",
        origin: "mi",
        miId: art.id,
      });
      added++;
      log(`  → ${axisId} / ${signalType} / ${confidence}`);
      await new Promise((r) => setTimeout(r, 400));
    } catch (err) {
      failed++;
      log(`  ! 실패: ${err.message}`);
    }
  }

  log(`적재 결과: evidence +${added}, inbox +${inboxed}, skip ${skipped}, 실패 ${failed}`);

  if (added === 0 && inboxed === 0) {
    log("변경 없음, 파일 미기록");
    return;
  }

  evidence.updatedAt = new Date().toISOString();
  await writeFile(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + "\n", "utf-8");
  log(
    `evidence.json 갱신 완료 — items ${evidence.items.length}건, inbox ${evidence.inbox.length}건`
  );
  log("=== 완료 ===");
}

main().catch((err) => {
  console.error(`FATAL: ${err.stack || err.message}`);
  process.exit(1);
});
