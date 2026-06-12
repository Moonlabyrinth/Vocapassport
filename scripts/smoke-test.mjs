// 핵심 시나리오 통합 스모크 테스트
const BASE = "http://localhost:3000";

async function cmd(action) {
  const res = await fetch(BASE + "/api/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${action.type} 실패: ${json.error}`);
  return json;
}
async function state() {
  return (await fetch(BASE + "/api/state", { cache: "no-store" })).json();
}
function assert(cond, msg) {
  if (!cond) throw new Error("❌ " + msg);
  console.log("  ✓ " + msg);
}

const iso10 = (daysFromNow, h, m) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const today = new Date().toISOString().slice(0, 10);

(async () => {
  console.log("1) 반 생성 (컷 80%)");
  const cls = await cmd({ type: "createClass", name: "중1 A반", scheduleType: "월수금", passThreshold: 80 });

  console.log("2) 학생/책 생성");
  const s1 = await cmd({ type: "createStudent", classId: cls.id, name: "김민준" });
  const book = await cmd({ type: "createBook", classId: cls.id, title: "능률 VOCA", defaultTotalScore: 20, passThreshold: null });

  console.log("3) 점수 입력 — 통과(18/20=90%)");
  const passRec = await cmd({ type: "createRecord", classId: cls.id, studentId: s1.id, bookId: book.id, bookTitle: "능률 VOCA", round: 1, session: 1, totalScore: 20, actualScore: 18, examDate: today });
  assert(passRec.passed === true, "90%는 통과로 판정");
  assert(passRec.needsRetest === false, "통과 시 재시험 불필요");

  console.log("4) 점수 입력 — 미통과(14/20=70%)");
  const failRec = await cmd({ type: "createRecord", classId: cls.id, studentId: s1.id, bookId: book.id, bookTitle: "능률 VOCA", round: 1, session: 2, totalScore: 20, actualScore: 14, examDate: today });
  assert(failRec.passed === false, "70%는 미통과로 판정");
  assert(failRec.needsRetest === true, "미통과 시 재시험 대상");

  console.log("5) 만점 입력 (20/20)");
  const perfectRec = await cmd({ type: "createRecord", classId: cls.id, studentId: s1.id, bookId: book.id, bookTitle: "능률 VOCA", round: 1, session: 3, totalScore: 20, actualScore: 20, examDate: today });

  console.log("6) 10분 단위 검증 — 18:05 거부");
  let rejected = false;
  try { await cmd({ type: "scheduleRetest", scoreRecordId: failRec.recordId, scheduledAt: iso10(1, 18, 5) }); }
  catch (e) { rejected = true; }
  assert(rejected, "18:05(10분 단위 아님) 예약 거부");

  console.log("7) 재시험 예약 — 내일 18:00");
  const rt = await cmd({ type: "scheduleRetest", scoreRecordId: failRec.recordId, scheduledAt: iso10(1, 18, 0) });

  console.log("8) 재시험 결과 — 또 미통과(15/20=75%) → 재재시험 필요");
  const r2 = await cmd({ type: "completeRetest", retestId: rt.id, actualScore: 15, totalScore: 20, examDate: today });
  assert(r2.passed === false, "75%는 여전히 미통과");
  assert(r2.needsRetest === true, "재재시험 대상");

  console.log("9) 재재시험 예약 후 통과(19/20=95%)");
  const rt2 = await cmd({ type: "scheduleRetest", scoreRecordId: r2.recordId, scheduledAt: iso10(2, 19, 0) });
  const r3 = await cmd({ type: "completeRetest", retestId: rt2.id, actualScore: 19, totalScore: 20, examDate: today });
  assert(r3.passed === true, "95%는 통과 → 재시험 체인 종료");

  console.log("10) 책별 컷 변경 → 자동 재판정");
  // 컷을 95%로 올리면 18/20(90%) 통과기록이 미통과로 바뀌어야 함
  await cmd({ type: "updateBook", id: book.id, patch: { passThreshold: 95 } });
  const st = await state();
  const reEval = st.records.find((r) => r.id === passRec.recordId);
  assert(reEval.passed === false, "컷 95%로 올리면 90% 기록은 미통과로 재판정");
  await cmd({ type: "updateBook", id: book.id, patch: { passThreshold: null } }); // 원복

  console.log("\n전체 상태 요약:");
  const fin = await state();
  console.log("  반:", fin.classes.length, "학생:", fin.students.length, "책:", fin.books.length, "기록:", fin.records.length, "재시험:", fin.retests.length);
  console.log("\n✅ 모든 시나리오 통과");
})().catch((e) => {
  console.error("\n" + e.message);
  process.exit(1);
});
