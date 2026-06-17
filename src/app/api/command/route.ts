import { NextRequest, NextResponse } from "next/server";
import { mutate } from "@/lib/db";
import { applyAction, Action, ActionResult } from "@/lib/actions";
import { getSession, authorizeAction } from "@/lib/auth";

export const dynamic = "force-dynamic";

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
    return applyAction(db, body);
  });

  const status = result.ok ? 200 : result.error === "권한이 없습니다." ? 403 : 400;
  return NextResponse.json(result, { status });
}
