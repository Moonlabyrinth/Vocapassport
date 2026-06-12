// 저장소 — 듀얼 모드
// - 로컬(개발/시작하기.bat): data/db.json 파일 + data/uploads 사진
// - 클라우드(DATABASE_URL 설정 시): Neon Postgres (전체 DB를 jsonb 한 행에 저장)
// 같은 인터페이스(getDB/mutate/savePhoto/getPhoto)를 제공해 라우트는 그대로 동작한다.

import { promises as fs } from "fs";
import path from "path";
import { Database, emptyDatabase } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

const DATABASE_URL = process.env.DATABASE_URL;
export const useNeon = !!DATABASE_URL;

// ===================== Neon(Postgres) 구현 =====================
type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;
let _sql: Sql | null = null;
let _initPromise: Promise<void> | null = null;

async function getSql(): Promise<Sql> {
  if (!_sql) {
    const { neon } = await import("@neondatabase/serverless");
    _sql = neon(DATABASE_URL!) as unknown as Sql;
  }
  if (!_initPromise) {
    const sql = _sql;
    _initPromise = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS app_state (id int PRIMARY KEY, data jsonb NOT NULL, version int NOT NULL DEFAULT 0)`;
      await sql`CREATE TABLE IF NOT EXISTS photos (name text PRIMARY KEY, mime text NOT NULL, data text NOT NULL, created_at timestamptz DEFAULT now())`;
      await sql`INSERT INTO app_state (id, data, version) VALUES (1, ${JSON.stringify(emptyDatabase())}::jsonb, 0) ON CONFLICT (id) DO NOTHING`;
    })();
  }
  await _initPromise;
  return _sql;
}

async function neonRead(): Promise<{ db: Database; version: number }> {
  const sql = await getSql();
  const rows = await sql`SELECT data, version FROM app_state WHERE id = 1`;
  const row = rows[0];
  const data = (row?.data ?? {}) as Partial<Database>;
  return { db: { ...emptyDatabase(), ...data }, version: Number(row?.version ?? 0) };
}

async function neonMutate<T>(mutator: (db: Database) => T | Promise<T>): Promise<T> {
  const sql = await getSql();
  for (let attempt = 0; attempt < 6; attempt++) {
    const { db, version } = await neonRead();
    const result = await mutator(db);
    const updated = await sql`UPDATE app_state SET data = ${JSON.stringify(db)}::jsonb, version = version + 1 WHERE id = 1 AND version = ${version} RETURNING version`;
    if (updated.length > 0) return result;
    // 동시 쓰기 충돌 → 최신 상태로 다시 시도
  }
  throw new Error("저장 충돌이 반복됩니다. 잠시 후 다시 시도해주세요.");
}

// ===================== 파일 구현 =====================
let writeChain: Promise<unknown> = Promise.resolve();

async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}
async function fileRead(): Promise<Database> {
  try {
    const txt = await fs.readFile(DB_FILE, "utf8");
    return { ...emptyDatabase(), ...(JSON.parse(txt) as Partial<Database>) };
  } catch {
    return emptyDatabase();
  }
}
async function fileWrite(db: Database): Promise<void> {
  await ensureDirs();
  const tmp = DB_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmp, DB_FILE);
}
function fileMutate<T>(mutator: (db: Database) => T | Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const db = await fileRead();
    const result = await mutator(db);
    await fileWrite(db);
    return result;
  };
  const p = writeChain.then(run, run);
  writeChain = p.then(() => undefined, () => undefined);
  return p;
}

// ===================== 공개 인터페이스 =====================
/** 읽기 전용 스냅샷 */
export async function getDB(): Promise<Database> {
  if (useNeon) return (await neonRead()).db;
  await ensureDirs();
  return fileRead();
}

/** 읽기-수정-쓰기를 안전하게 직렬화하여 DB를 갱신 */
export async function mutate<T>(mutator: (db: Database) => T | Promise<T>): Promise<T> {
  return useNeon ? neonMutate(mutator) : fileMutate(mutator);
}

/** 사진 저장 */
export async function savePhoto(name: string, mime: string, buf: Buffer): Promise<void> {
  if (useNeon) {
    const sql = await getSql();
    await sql`INSERT INTO photos (name, mime, data) VALUES (${name}, ${mime}, ${buf.toString("base64")}) ON CONFLICT (name) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data`;
    return;
  }
  await ensureDirs();
  await fs.writeFile(path.join(UPLOAD_DIR, name), buf);
}

/** 사진 읽기 */
export async function getPhoto(name: string): Promise<{ mime: string; buf: Buffer } | null> {
  if (useNeon) {
    const sql = await getSql();
    const rows = await sql`SELECT mime, data FROM photos WHERE name = ${name}`;
    if (!rows[0]) return null;
    return { mime: String(rows[0].mime), buf: Buffer.from(String(rows[0].data), "base64") };
  }
  try {
    const buf = await fs.readFile(path.join(UPLOAD_DIR, path.basename(name)));
    return { mime: mimeFromExt(name), buf };
  } catch {
    return null;
  }
}

function mimeFromExt(name: string): string {
  const ext = path.extname(name).toLowerCase();
  const m: Record<string, string> = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".webp": "image/webp", ".heic": "image/heic",
  };
  return m[ext] || "application/octet-stream";
}

/** 짧은 고유 id */
export function genId(prefix = ""): string {
  const s = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  return prefix ? `${prefix}_${s}` : s;
}
