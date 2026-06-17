import { NextRequest, NextResponse } from "next/server";
import { genId } from "@/lib/db";
import { mutate } from "@/lib/db";
import { applyAction, Action, ActionResult } from "@/lib/actions";
import { getSession, authorizeAction, findSessionStaff } from "@/lib/auth";
import { Database } from "@/lib/types";

export const dynamic = "force-dynamic";

function actionSummary(action: Action): string {
  const labels: Record<string, string> = {
    createClass: "반 생성",
    updateClass: "반 수정",
    deleteClass: "반 삭제",
    createStudent: "학생 생성",
    updateStudent: "학생 정보 수정",
    deleteStudent: "학생 삭제",
    createBook: "책 생성",
    updateBook: "책 수정",
    deleteBook: "책 삭제",
    createRecord: "성적 입력",
    updateRecord: "성적 수정",
    updateRecords: "성적 일괄 수정",
    deleteRecord: "성적 삭제",
    deleteRecords: "성적 일괄 삭제",
    scheduleRetest: "재시험 예약",
    rescheduleRetest: "재시험 일정 변경",
    cancelRetest: "재시험 예약 취소",
    completeRetest: "재시험 결과 입력",
    createHomework: "숙제 등록",
    updateHomework: "숙제 수정",
    deleteHomework: "숙제 삭제",
    createNotice: "공지 등록",
    updateNotice: "공지 수정",
    deleteNotice: "공지 삭제",
    setRecordPassStatus: "성적 통과 여부 변경",
    setRecordsPassStatus: "성적 통과 여부 일괄 변경",
    setRetestPassStatus: "재시험 통과 여부 변경",
    setRecordPassKind: "통과 판정 변경",
    setRecordsPassKind: "통과 판정 일괄 변경",
    createMonthlyTest: "먼슬리 생성",
    updateMonthlyTest: "먼슬리 수정",
    deleteMonthlyTest: "먼슬리 삭제",
    setMonthlyResults: "먼슬리 성적 입력",
    updateAchievementPeriods: "성취 평가 기간 수정",
  };
  return labels[action.type] ?? action.type;
}

function actionTargetId(action: Action): string | null {
  if ("id" in action && typeof action.id === "string") return action.id;
  if ("recordId" in action && typeof action.recordId === "string") return action.recordId;
  if ("studentId" in action && typeof action.studentId === "string") return action.studentId;
  if ("classId" in action && typeof action.classId === "string") return action.classId;
  if ("monthlyTestId" in action && typeof action.monthlyTestId === "string") return action.monthlyTestId;
  if ("retestId" in action && typeof action.retestId === "string") return action.retestId;
  return null;
}

function appendAudit(db: Database, sess: NonNullable<ReturnType<typeof getSession>>, action: Action) {
  db.auditLogs ??= [];
  const staff = findSessionStaff(db, sess);
  db.auditLogs.push({
    id: genId("audit"),
    actorId: staff?.id ?? sess.id,
    actorName: staff?.name ?? sess.name,
    actorRole: staff?.role ?? sess.role,
    actionType: action.type,
    summary: actionSummary(action),
    targetId: actionTargetId(action),
    createdAt: new Date().toISOString(),
  });
  if (db.auditLogs.length > 1000) db.auditLogs = db.auditLogs.slice(-1000);
}

export async function POST(req: NextRequest) {
  let body: Action;
  try {
    body = (await req.json()) as Action;
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }
  if (!body || typeof body.type !== "string") {
    return NextResponse.json({ ok: false, error: "type 누락" }, { status: 400 });
  }

  const sess = getSession(req);
  if (!sess) {
    return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  }

  // 재시험 일정 변경 주체는 클라이언트를 믿지 않고 세션 역할로 서버에서 주입한다.
  if (body.type === "rescheduleRetest") {
    body.by = sess.role === "teacher" ? "teacher" : "student";
  }

  const result = await mutate((db): ActionResult => {
    const authErr = authorizeAction(db, sess, body);
    if (authErr) return { ok: false, error: authErr };
    const applied = applyAction(db, body);
    if (applied.ok) appendAudit(db, sess, body);
    return applied;
  });

  const status = result.ok ? 200 : result.error === "권한이 없습니다." ? 403 : 400;
  return NextResponse.json(result, { status });
}
