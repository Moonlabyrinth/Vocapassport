import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { findSessionStaff, getSession, staffRoleLabel } from "@/lib/auth";
import { isActiveStudent } from "@/lib/logic";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sess = getSession(req);
  const db = await getDB();
  const teacherSetupNeeded = (db.staffUsers ?? []).length === 0;
  if (!sess) {
    return NextResponse.json({ ok: true, user: null, teacherSetupNeeded });
  }
  if (sess.role === "teacher") {
    const staff = findSessionStaff(db, sess);
    return NextResponse.json({
      ok: true,
      user: staff
        ? {
            id: staff.id,
            name: staff.name,
            role: "teacher",
            staffRole: staff.role,
            staffRoleLabel: staffRoleLabel(staff.role),
            mustChangePassword: staff.mustChangePassword,
          }
        : null,
      teacherSetupNeeded,
    });
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
  return NextResponse.json({ ok: true, user: null, teacherSetupNeeded });
}
