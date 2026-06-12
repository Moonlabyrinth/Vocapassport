// 로컬 data/db.json → Neon Postgres 업로드 (최초 1회 / 동기화)
// 사용: $env:DATABASE_URL=<연결주소>; node scripts/db-migrate-to-neon.mjs
import { neon } from "@neondatabase/serverless";
import { readFileSync, existsSync, readdirSync } from "fs";
import path from "path";

const URL = process.env.DATABASE_URL;
if (!URL) { console.error("DATABASE_URL 환경변수가 필요합니다."); process.exit(1); }

const sql = neon(URL);
const DB_FILE = path.join(process.cwd(), "data", "db.json");
const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".heic": "image/heic" };

(async () => {
  console.log("1) 테이블 준비");
  await sql`CREATE TABLE IF NOT EXISTS app_state (id int PRIMARY KEY, data jsonb NOT NULL, version int NOT NULL DEFAULT 0)`;
  await sql`CREATE TABLE IF NOT EXISTS photos (name text PRIMARY KEY, mime text NOT NULL, data text NOT NULL, created_at timestamptz DEFAULT now())`;

  console.log("2) db.json 읽기");
  if (!existsSync(DB_FILE)) { console.error("data/db.json 이 없습니다."); process.exit(1); }
  const db = JSON.parse(readFileSync(DB_FILE, "utf8"));
  console.log(`   반:${db.classes?.length} 학생:${db.students?.length} 책:${db.books?.length} 기록:${db.records?.length} 재시험:${db.retests?.length}`);

  console.log("3) Neon app_state 업로드(덮어쓰기)");
  await sql`INSERT INTO app_state (id, data, version) VALUES (1, ${JSON.stringify(db)}::jsonb, 1)
            ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = app_state.version + 1`;

  console.log("4) 사진 업로드");
  let photoN = 0;
  if (existsSync(UPLOAD_DIR)) {
    for (const f of readdirSync(UPLOAD_DIR)) {
      if (f.startsWith(".")) continue;
      const ext = path.extname(f).toLowerCase();
      const mime = MIME[ext] || "application/octet-stream";
      const data = readFileSync(path.join(UPLOAD_DIR, f)).toString("base64");
      await sql`INSERT INTO photos (name, mime, data) VALUES (${f}, ${mime}, ${data})
                ON CONFLICT (name) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data`;
      photoN++;
    }
  }
  console.log(`   사진 ${photoN}건`);

  console.log("5) 검증");
  const [row] = await sql`SELECT (data->'records') IS NOT NULL AS ok, jsonb_array_length(data->'records') AS records, jsonb_array_length(data->'students') AS students, version FROM app_state WHERE id = 1`;
  console.log(`   Neon 저장 확인 → 학생:${row.students} 기록:${row.records} version:${row.version}`);

  console.log("\n✅ Neon 업로드 완료");
})().catch((e) => { console.error("\n❌ " + e.message); process.exit(1); });
