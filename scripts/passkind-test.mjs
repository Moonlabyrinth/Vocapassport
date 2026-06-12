// 통과 종류(본시험/재시험/면제) 액션 검증 — 실제 데이터 비파괴(테스트 후 auto로 복원)
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
async function getRecord(id) {
  const s = await api("/api/state");
  return s.json.db.records.find((r) => r.id === id);
}
function ok(c, m) { if (!c) throw new Error("❌ " + m); console.log("  ✓ " + m); }

(async () => {
  const state = await api("/api/state");
  ok(state.status === 200 && state.json.role === "teacher", "크래프트 쿠키로 선생님 인증");

  const records = state.json.db.records;
  // auto 상태(passedOverride 미설정)인 '미통과' 기록 + 만점 아닌 기록 하나
  const target = records.find((r) => r.passedOverride == null && r.passed === false && !r.isPerfect);
  ok(!!target, `테스트 대상(auto·미통과) 확보: ${target.id}`);
  const originalChoice = "auto"; // 복원 목표

  // 1) 재시험 통과
  let r = await api("/api/command", { type: "setRecordPassKind", recordId: target.id, kind: "retest" });
  ok(r.json.ok && r.json.passed === true, "재시험 통과 처리 → passed=true");
  let rec = await getRecord(target.id);
  ok(rec.passKind === "retest" && rec.passedOverride === true && rec.passed === true, "passKind=retest 저장됨");

  // 2) 면제
  await api("/api/command", { type: "setRecordPassKind", recordId: target.id, kind: "exempt" });
  rec = await getRecord(target.id);
  ok(rec.passKind === "exempt" && rec.passed === true, "면제 → passKind=exempt, passed=true");

  // 3) 본시험 통과
  await api("/api/command", { type: "setRecordPassKind", recordId: target.id, kind: "main" });
  rec = await getRecord(target.id);
  ok(rec.passKind === "main" && rec.passed === true, "본시험 통과 → passKind=main");

  // 4) 미통과(fail) → 종류 제거
  await api("/api/command", { type: "setRecordPassKind", recordId: target.id, kind: "fail" });
  rec = await getRecord(target.id);
  ok(rec.passedOverride === false && rec.passed === false && (rec.passKind == null), "미통과 → passKind 제거, passed=false");

  // 5) auto 복원
  await api("/api/command", { type: "setRecordPassKind", recordId: target.id, kind: "auto" });
  rec = await getRecord(target.id);
  ok(rec.passedOverride == null && (rec.passKind == null), "자동 판정 복원(원상복구)");
  ok(rec.passed === false, "auto 복원 후 점수기준 미통과 유지(원래값)");

  // 6) 일괄 처리: auto·미통과 기록 2개 → 재시험 통과 → 복원
  const two = records.filter((r) => r.passedOverride == null && r.passed === false).slice(0, 2).map((r) => r.id);
  if (two.length === 2) {
    await api("/api/command", { type: "setRecordsPassKind", recordIds: two, kind: "retest" });
    const after = await api("/api/state");
    const both = two.map((id) => after.json.db.records.find((r) => r.id === id));
    ok(both.every((r) => r.passKind === "retest" && r.passed), "일괄 재시험 통과 적용");
    await api("/api/command", { type: "setRecordsPassKind", recordIds: two, kind: "auto" });
    const after2 = await api("/api/state");
    ok(two.map((id) => after2.json.db.records.find((r) => r.id === id)).every((r) => r.passedOverride == null && r.passKind == null), "일괄 auto 복원");
  }

  console.log("\n✅ 통과 종류(본시험/재시험/면제) 액션 모두 정상 — 데이터 원상복구 완료");
})().catch((e) => { console.error("\n" + e.message); process.exit(1); });
