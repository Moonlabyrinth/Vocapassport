import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { findSessionStaff, getSession, staffRoleLabel } from "@/lib/auth";
import { isActiveStudent } from "@/lib/logic";
import { teacherView, studentView, guardianView } from "@/lib/scope";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sess = getSession(req);
  if (!sess) {
    return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  }
  const db = await getDB();
  if (sess.role === "teacher") {
    const staff = findSessionStaff(db, sess);
    if (!staff) {
      return NextResponse.json({ ok: false, error: "관리자 계정이 변경되었습니다. 다시 로그인해 주세요." }, { status: 401 });
    }
    return NextResponse.json({
      ok: true,
      role: "teacher",
      user: {
        id: staff.id,
        name: staff.name,
        role: "teacher",
        staffRole: staff.role,
        staffRoleLabel: staffRoleLabel(staff.role),
        mustChangePassword: staff.mustChangePassword,
      },
      db: teacherView(db, staff.role),
    });
  }
  // 학생/보호자: 연결된 학생(자녀) 데이터만
  const me = db.students.find((s) => s.id === sess.id);
  if (!me || !isActiveStudent(me)) {
    return NextResponse.json({ ok: false, error: "사용할 수 없는 계정입니다." }, { status: 401 });
  }
  if (sess.role === "guardian") {
    return NextResponse.json({
      ok: true,
      role: "guardian",
      user: { id: sess.id, name: me.name, role: "guardian" },
      db: guardianView(db, sess.id),
    });
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
