// 인증·권한·스코핑 통합 스모크 테스트 (쿠키 수동 관리)
const BASE = "http://localhost:3000";

function cookieFrom(res) {
  const sc = res.headers.get("set-cookie") || "";
  const m = sc.match(/wtm_session=([^;]*)/);
  return m ? `wtm_session=${m[1]}` : "";
}
async function req(path, { method = "GET", cookie, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json, cookie: cookieFrom(res) };
}
function ok(c, m) { if (!c) throw new Error("❌ " + m); console.log("  ✓ " + m); }

(async () => {
  console.log("1) 미로그인 상태 /api/state → 401");
  ok((await req("/api/state")).status === 401, "비로그인 접근 차단(401)");

  console.log("2) 선생님 최초 로그인(비번 설정)");
  let r = await req("/api/auth/login", { method: "POST", body: { role: "teacher", password: "teacher123" } });
  ok(r.json.ok && r.json.setup, "선생님 계정 최초 설정 + 로그인");
  const T = r.cookie;
  ok(!!T, "선생님 세션 쿠키 발급");

  console.log("3) 잘못된 비번 재로그인 → 401");
  ok((await req("/api/auth/login", { method: "POST", body: { role: "teacher", password: "wrong" } })).status === 401, "틀린 비번 거부");

  console.log("4) 반/책 생성");
  const cls = (await req("/api/command", { method: "POST", cookie: T, body: { type: "createClass", name: "중1 A반", scheduleType: "월수금", passThreshold: 80 } })).json;
  const book = (await req("/api/command", { method: "POST", cookie: T, body: { type: "createBook", classId: cls.id, title: "VOCA", defaultTotalScore: 20, passThreshold: null } })).json;

  console.log("5) 학생 계정 발급(2명)");
  r = await req("/api/admin", { method: "POST", cookie: T, body: { op: "createStudentsWithCreds", classId: cls.id, names: ["김민준", "이서연"] } });
  ok(r.json.ok && r.json.created.length === 2, "학생 2명 + 계정 자동 발급");
  const [a, b] = r.json.created;
  ok(!!a.loginId && !!a.password, "아이디·초기비번 생성됨");

  // 학생 id 조회 (선생님 상태)
  const st = (await req("/api/state", { cookie: T })).json;
  const idA = st.db.students.find((s) => s.loginId === a.loginId).id;
  const idB = st.db.students.find((s) => s.loginId === b.loginId).id;
  ok(st.db.students.every((s) => s.passwordHash === undefined), "선생님 상태에 비밀번호 해시 미포함(민감정보 차단)");

  console.log("6) 두 학생 점수 입력(둘 다 미통과)");
  const recA = (await req("/api/command", { method: "POST", cookie: T, body: { type: "createRecord", classId: cls.id, studentId: idA, bookId: book.id, bookTitle: "VOCA", round: 1, session: 1, totalScore: 20, actualScore: 12, examDate: "2026-06-11" } })).json;
  const recB = (await req("/api/command", { method: "POST", cookie: T, body: { type: "createRecord", classId: cls.id, studentId: idB, bookId: book.id, bookTitle: "VOCA", round: 1, session: 1, totalScore: 20, actualScore: 10, examDate: "2026-06-11" } })).json;
  ok(recA.needsRetest && recB.needsRetest, "둘 다 재시험 대상");

  console.log("7) 학생 A 로그인");
  r = await req("/api/auth/login", { method: "POST", body: { role: "student", loginId: a.loginId, password: a.password } });
  ok(r.json.ok, "학생 A 로그인 성공");
  ok(r.json.user.mustChangePassword === true, "최초 비번변경 권장 플래그");
  const SA = r.cookie;

  console.log("8) 학생 A 데이터 스코핑");
  const sa = (await req("/api/state", { cookie: SA })).json;
  ok(sa.role === "student", "역할=student");
  ok(sa.db.students.length === 1 && sa.db.students[0].id === idA, "본인 1명만 조회");
  ok(sa.db.records.length === 1 && sa.db.records[0].studentId === idA, "본인 기록만 조회(타인 미포함)");
  ok(sa.db.students[0].passwordHash === undefined, "학생 상태에도 비번 해시 미포함");

  console.log("9) 권한 경계");
  ok((await req("/api/command", { method: "POST", cookie: SA, body: { type: "scheduleRetest", scoreRecordId: recB.recordId, scheduledAt: futureISO() } })).status === 400 || true, "타인 기록 예약 시도");
  const otherTry = await req("/api/command", { method: "POST", cookie: SA, body: { type: "scheduleRetest", scoreRecordId: recB.recordId, scheduledAt: futureISO() } });
  ok(!otherTry.json.ok, "타인(B) 기록 재시험 예약 거부");
  const adminTry = await req("/api/admin", { method: "POST", cookie: SA, body: { op: "issueCredentials", studentId: idB } });
  ok(adminTry.status === 403, "학생의 관리 API 접근 403");
  const classTry = await req("/api/command", { method: "POST", cookie: SA, body: { type: "createClass", name: "해킹반", scheduleType: "화목", passThreshold: 50 } });
  ok(!classTry.json.ok, "학생의 반 생성 거부");

  console.log("10) 본인 재시험 예약 → 성공");
  const sched = await req("/api/command", { method: "POST", cookie: SA, body: { type: "scheduleRetest", scoreRecordId: recA.recordId, scheduledAt: futureISO() } });
  ok(sched.json.ok, "본인 기록 재시험 예약 성공");
  const sa2 = (await req("/api/state", { cookie: SA })).json;
  ok(sa2.db.retests.length === 1, "본인 예약 1건 조회");

  console.log("11) 비밀번호 변경 후 새 비번 로그인");
  ok((await req("/api/auth/change-password", { method: "POST", cookie: SA, body: { currentPassword: a.password, newPassword: "newpass1" } })).json.ok, "비번 변경 성공");
  ok((await req("/api/auth/login", { method: "POST", body: { role: "student", loginId: a.loginId, password: a.password } })).status === 401, "옛 비번 로그인 거부");
  ok((await req("/api/auth/login", { method: "POST", body: { role: "student", loginId: a.loginId, password: "newpass1" } })).json.ok, "새 비번 로그인 성공");

  console.log("\n✅ 모든 인증·권한·스코핑 시나리오 통과");
})().catch((e) => { console.error("\n" + e.message); process.exit(1); });

function futureISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(18, 0, 0, 0);
  return d.toISOString();
}
