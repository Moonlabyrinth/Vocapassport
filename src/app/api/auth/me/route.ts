import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isActiveStudent } from "@/lib/logic";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sess = getSession(req);
  const db = await getDB();
  const teacherSetupNeeded = !db.settings.teacherPasswordHash;
  if (!sess) {
    return NextResponse.json({ ok: true, user: null, teacherSetupNeeded });
  }
  if (sess.role === "student") {
    const me = db.students.find((s) => s.id === sess.id);
    if (!me || !isActiveStudent(me)) {
      // 학생이 삭제/퇴원됨 → 세션 무효 취급
      return NextResponse.json({ ok: true, user: null, teacherSetupNeeded });
    }
    return NextResponse.json({
      ok: true,
      user: {
        id: me.id,
        name: me.name,
        role: "student",
        loginId: me.loginId,
        mustChangePassword: me.mustChangePassword,
      },
      teacherSetupNeeded,
    });
  }
  return NextResponse.json({
    ok: true,
    user: { id: "teacher", name: "선생님", role: "teacher" },
    teacherSetupNeeded,
  });
}
