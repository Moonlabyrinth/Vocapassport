import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isActiveStudent } from "@/lib/logic";
import { teacherView, studentView } from "@/lib/scope";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sess = getSession(req);
  if (!sess) {
    return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  }
  const db = await getDB();
  if (sess.role === "teacher") {
    return NextResponse.json({
      ok: true,
      role: "teacher",
      user: { id: "teacher", name: "선생님", role: "teacher" },
      db: teacherView(db),
    });
  }
  // 학생: 본인 데이터만
  const me = db.students.find((s) => s.id === sess.id);
  if (!me || !isActiveStudent(me)) {
    return NextResponse.json({ ok: false, error: "사용할 수 없는 학생 계정입니다." }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    role: "student",
    user: {
      id: sess.id,
      name: me?.name ?? sess.name,
      role: "student",
      loginId: me?.loginId ?? "",
      mustChangePassword: me?.mustChangePassword ?? false,
    },
    db: studentView(db, sess.id),
  });
}
