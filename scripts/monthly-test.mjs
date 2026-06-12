// 먼슬리 테스트 기능 검증 (로컬 파일모드, 크래프트 쿠키) — 비파괴(끝에 생성분 삭제)
import crypto from "crypto";
import { readFileSync } from "fs";

const BASE = "http://localhost:3000";
const secret = readFileSync("data/secret.key", "utf8");
function sign(sess) {
  const full = { ...sess, exp: Date.now() + 3600 * 1000 };
  const p = Buffer.from(JSON.stringify(full)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(p).digest("base64url");
  return `${p}.${sig}`;
}
const T = `wtm_session=${sign({ role: "teacher", id: "teacher", name: "선생님" })}`;
async function api(path, body, cookie = T) {
  const res = await fetch(BASE + path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const ok = (c, m) => { if (!c) throw new Error("❌ " + m); console.log("  ✓ " + m); };

(async () => {
  const st0 = await api("/api/state");
  ok(st0.status === 200, "선생님 인증");
  const someStudent = st0.json.db.students.find((s) => s.status !== "withdrawn");
  ok(!!someStudent, "학생 확보: " + someStudent.name);

  // 1) 먼슬리 생성 (영역 듣기/독해)
  const c = await api("/api/command", { type: "createMonthlyTest", name: "__테스트 먼슬리__", date: "2026-06-20", sections: [
    { key: "listening", label: "듣기", maxScore: 30 },
    { key: "reading", label: "독해", maxScore: 50 },
  ]});
  ok(c.json.ok && c.json.id, "먼슬리 생성");
  const mtId = c.json.id;

  // 2) 결과 입력 (한 학생)
  const r = await api("/api/command", { type: "setMonthlyResults", monthlyTestId: mtId, entries: [
    { studentId: someStudent.id, scores: { listening: 27, reading: 44 } },
  ]});
  ok(r.json.ok, "영역 점수 입력");

  // 3) 상태 확인
  const st = await api("/api/state");
  const mt = st.json.db.monthlyTests.find((t) => t.id === mtId);
  ok(mt && mt.sections.length === 2, "먼슬리 정의 저장(영역 2)");
  const res = st.json.db.monthlyResults.find((x) => x.monthlyTestId === mtId && x.studentId === someStudent.id);
  ok(res && res.scores.listening === 27 && res.scores.reading === 44, "학생 영역 점수 저장(듣기27·독해44, 총점71)");

  // 4) 단어시험 통계 불변 (먼슬리가 records에 안 섞임)
  ok(st.json.db.records.length === st0.json.db.records.length, `단어시험 기록 수 불변(${st.json.db.records.length}) — 통계 분리됨`);

  // 5) 학생 스코핑: 해당 학생은 본인 먼슬리 결과만 봄
  const sCookie = `wtm_session=${sign({ role: "student", id: someStudent.id, name: someStudent.name })}`;
  const ss = await api("/api/state", null, sCookie);
  ok(ss.json.role === "student", "학생 로그인 스코프");
  ok(ss.json.db.monthlyResults.length === 1 && ss.json.db.monthlyResults[0].studentId === someStudent.id, "학생은 본인 먼슬리 결과만");
  ok(ss.json.db.monthlyTests.some((t) => t.id === mtId), "학생이 본 먼슬리 정의 포함");

  // 6) 학생은 먼슬리 생성 불가 (권한)
  const deny = await api("/api/command", { type: "createMonthlyTest", name: "x", date: "2026-06-20", sections: [{ key: "a", label: "a", maxScore: 10 }] }, sCookie);
  ok(!deny.json.ok, "학생의 먼슬리 생성 거부");

  // 7) 빈 점수로 결과 제거
  await api("/api/command", { type: "setMonthlyResults", monthlyTestId: mtId, entries: [{ studentId: someStudent.id, scores: {} }] });
  const st2 = await api("/api/state");
  ok(!st2.json.db.monthlyResults.some((x) => x.monthlyTestId === mtId), "빈 입력 시 결과 제거");

  // 8) 정리: 먼슬리 삭제
  const del = await api("/api/command", { type: "deleteMonthlyTest", id: mtId });
  ok(del.json.ok, "먼슬리 삭제(원복)");
  const st3 = await api("/api/state");
  ok(!st3.json.db.monthlyTests.some((t) => t.id === mtId), "삭제 반영 — 데이터 원상복구");

  console.log("\n✅ 먼슬리 기능 정상 — 영역점수·통계분리·학생스코핑·권한·원복 확인");
})().catch((e) => { console.error("\n" + e.message); process.exit(1); });
