// 분석 결과/설정 저장소 - data/ 폴더의 JSON 파일 두 개로 관리한다.
// 개인용 로컬 도구라 DB 없이 파일이면 충분. 쓰기는 임시 파일 → rename으로 원자적 처리.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(ROOT, "data");
const ANALYSES_FILE = path.join(DATA_DIR, "analyses.json");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  ensureDataDir();
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

// ---- 설정 (API 키, 모델) ----

export const DEFAULT_MODEL = "claude-opus-4-8";
export const ALLOWED_MODELS = ["claude-opus-4-8", "claude-sonnet-5"];

export function getConfig() {
  const cfg = readJson(CONFIG_FILE, {});
  return {
    apiKey: typeof cfg.apiKey === "string" ? cfg.apiKey : "",
    model: ALLOWED_MODELS.includes(cfg.model) ? cfg.model : DEFAULT_MODEL,
  };
}

export function saveConfig({ apiKey, model }) {
  const cur = getConfig();
  const next = {
    // 빈 문자열로 저장하면 키 삭제, undefined면 기존 값 유지
    apiKey: apiKey === undefined ? cur.apiKey : String(apiKey).trim(),
    model: ALLOWED_MODELS.includes(model) ? model : cur.model,
  };
  writeJson(CONFIG_FILE, next);
  return next;
}

// 환경변수 우선, 없으면 설정 파일의 키 사용
export function resolveApiKey() {
  return process.env.ANTHROPIC_API_KEY || getConfig().apiKey || "";
}

// ---- 분석 결과 ----

function readAnalyses() {
  const list = readJson(ANALYSES_FILE, []);
  return Array.isArray(list) ? list : [];
}

export function listAnalyses() {
  // 목록 화면용 요약만 반환 (전체 결과는 개별 조회)
  return readAnalyses()
    .map((a) => ({
      id: a.id,
      title: a.title,
      createdAt: a.createdAt,
      model: a.model,
      sourceGuess: a.result?.source?.guess || null,
      sourceChecked: !!a.sourceChecked,
      parsed: !!a.result,
    }))
    .sort((x, y) => (y.createdAt || "").localeCompare(x.createdAt || ""));
}

export function getAnalysis(id) {
  return readAnalyses().find((a) => a.id === id) || null;
}

export function saveAnalysis({ passage, result, rawText, model }) {
  const record = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    title: passage.replace(/\s+/g, " ").trim().slice(0, 60),
    passage,
    model,
    sourceChecked: false, // 출처는 필요할 때 findSource로 별도 조회
    result: result || null, // 파싱된 JSON (실패 시 null)
    rawText, // 모델 원문 응답 (파싱 실패 대비 보관)
  };
  const list = readAnalyses();
  list.push(record);
  writeJson(ANALYSES_FILE, list);
  return record;
}

// 별도 출처 조회(findSource) 결과를 기존 레코드에 병합해 저장한다.
export function updateAnalysisSource(id, { source, rawText }) {
  const list = readAnalyses();
  const idx = list.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  const record = list[idx];
  record.result = record.result || {};
  record.result.source = source || null;
  record.sourceChecked = true;
  if (rawText) record.sourceRawText = rawText;
  writeJson(ANALYSES_FILE, list);
  return record;
}

export function deleteAnalysis(id) {
  const list = readAnalyses();
  const next = list.filter((a) => a.id !== id);
  if (next.length === list.length) return false;
  writeJson(ANALYSES_FILE, next);
  return true;
}
