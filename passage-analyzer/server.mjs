// 독해 지문 분석기 로컬 서버 - node server.mjs 로 실행, http://localhost:3456
// 개인용 도구라 인증 없이 127.0.0.1 에만 바인딩한다.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getConfig,
  saveConfig,
  resolveApiKey,
  listAnalyses,
  getAnalysis,
  saveAnalysis,
  deleteAnalysis,
  ALLOWED_MODELS,
} from "./lib/store.mjs";
import { analyzePassage, friendlyError } from "./lib/analyze.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, "public");
const PORT = Number(process.env.PORT) || 3456;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return null;
  }
}

function serveStatic(req, res, pathname) {
  const rel = pathname === "/" ? "index.html" : pathname.slice(1);
  const file = path.resolve(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== path.join(PUBLIC_DIR, "index.html")) {
    sendJson(res, 404, { error: "not found" });
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: "not found" });
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}

// SSE 이벤트 한 건 전송
function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function handleAnalyze(req, res) {
  const body = await readBody(req);
  if (!body || typeof body.passage !== "string" || !body.passage.trim()) {
    sendJson(res, 400, { error: "지문을 입력해 주세요." });
    return;
  }
  const passage = body.passage.trim();
  if (passage.length > 20000) {
    sendJson(res, 400, { error: "지문이 너무 깁니다 (20,000자 이하)." });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const apiKey = resolveApiKey();
  if (!apiKey) {
    sse(res, "error", { message: "API 키가 설정되지 않았습니다. 설정(⚙️)에서 Anthropic API 키를 입력해 주세요." });
    res.end();
    return;
  }

  const { model } = getConfig();
  const useWebSearch = body.useWebSearch !== false; // 기본 ON

  try {
    const { rawText, result } = await analyzePassage({
      apiKey,
      model,
      passage,
      useWebSearch,
      onStatus: (message) => sse(res, "status", { message }),
      onDelta: (text) => sse(res, "delta", { text }),
    });
    const record = saveAnalysis({ passage, result, rawText, model, webSearchUsed: useWebSearch });
    sse(res, "done", { record });
  } catch (err) {
    console.error("[analyze]", err);
    sse(res, "error", { message: friendlyError(err) });
  }
  res.end();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const p = url.pathname;

  try {
    if (req.method === "POST" && p === "/api/analyze") return await handleAnalyze(req, res);

    if (req.method === "GET" && p === "/api/analyses") {
      return sendJson(res, 200, { analyses: listAnalyses() });
    }

    const idMatch = p.match(/^\/api\/analyses\/([0-9a-f-]+)$/);
    if (idMatch) {
      if (req.method === "GET") {
        const record = getAnalysis(idMatch[1]);
        return record ? sendJson(res, 200, { record }) : sendJson(res, 404, { error: "없는 분석입니다." });
      }
      if (req.method === "DELETE") {
        return deleteAnalysis(idMatch[1])
          ? sendJson(res, 200, { ok: true })
          : sendJson(res, 404, { error: "없는 분석입니다." });
      }
    }

    if (p === "/api/settings") {
      if (req.method === "GET") {
        const cfg = getConfig();
        const key = resolveApiKey();
        return sendJson(res, 200, {
          hasKey: !!key,
          keyPreview: key ? key.slice(0, 10) + "…" + key.slice(-4) : null,
          keyFromEnv: !!process.env.ANTHROPIC_API_KEY,
          model: cfg.model,
          allowedModels: ALLOWED_MODELS,
        });
      }
      if (req.method === "POST") {
        const body = await readBody(req);
        if (!body) return sendJson(res, 400, { error: "잘못된 요청입니다." });
        const next = saveConfig({ apiKey: body.apiKey, model: body.model });
        return sendJson(res, 200, { ok: true, model: next.model, hasKey: !!(process.env.ANTHROPIC_API_KEY || next.apiKey) });
      }
    }

    if (req.method === "GET") return serveStatic(req, res, p);
    sendJson(res, 405, { error: "method not allowed" });
  } catch (err) {
    console.error("[server]", err);
    if (!res.headersSent) sendJson(res, 500, { error: "서버 오류가 발생했습니다." });
    else res.end();
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`독해 지문 분석기 실행 중: http://localhost:${PORT}`);
});
