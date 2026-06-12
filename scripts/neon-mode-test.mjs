// DB(Neon) 모드 동작 검증 — 로컬 secret.key로 선생님 쿠키 서명 후 API 확인 (비파괴)
import crypto from "crypto";
import { readFileSync } from "fs";

const BASE = "http://localhost:3000";
const secret = readFileSync("data/secret.key", "utf8");
function signToken(sess) {
  const full = { ...sess, exp: Date.now() + 3600 * 1000 };
  const payload = Buffer.from(JSON.stringify(full)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
const COOKIE = `wtm_session=${signToken({ role: "teacher", id: "teacher", name: "선생님" })}`;
async function api(path, body) {
  const res = await fetch(BASE + path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Cookie: COOKIE },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const ok = (c, m) => { if (!c) throw new Error("❌ " + m); console.log("  ✓ " + m); };

(async () => {
  const s = await api("/api/state");
  ok(s.status === 200 && s.json.role === "teacher", "선생님 인증 OK");
  ok(s.json.db.records.length === 403, `Neon에서 기록 403건 읽음: ${s.json.db.records.length}`);
  ok(s.json.db.students.length === 16, `학생 16명 읽음: ${s.json.db.students.length}`);

  // 비파괴 쓰기 검증: 임시 반 생성 → 확인 → 삭제
  const created = await api("/api/command", { type: "createClass", name: "__neon_test__", scheduleType: "월수금", passThreshold: 80 });
  ok(created.json.ok && created.json.id, "Neon에 쓰기(임시 반 생성)");
  const after = await api("/api/state");
  ok(after.json.db.classes.some((c) => c.id === created.json.id), "쓴 내용이 Neon에서 다시 읽힘(영속)");
  const del = await api("/api/command", { type: "deleteClass", id: created.json.id });
  ok(del.json.ok, "임시 반 삭제(원복)");
  const final = await api("/api/state");
  ok(!final.json.db.classes.some((c) => c.id === created.json.id), "삭제 반영됨 — 데이터 원상복구");
  ok(final.json.db.classes.length === 3, `반 3개 유지: ${final.json.db.classes.length}`);

  console.log("\n✅ Neon DB 모드 정상 — 읽기/쓰기/영속/원복 확인");
})().catch((e) => { console.error("\n" + e.message); process.exit(1); });
