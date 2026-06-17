import { NextRequest, NextResponse } from "next/server";
import { mutate } from "@/lib/db";
import {
  getSession,
  hashPassword,
  findSessionStaff,
  verifyPassword,
  validateNewPassword,
} from "@/lib/auth";
import { isActiveStudent } from "@/lib/logic";

export const dynamic = "force-dynamic";

interface Body {
  currentPassword?: string;
  newPassword?: string;
}

export async function POST(req: NextRequest) {
  const sess = getSession(req);
  if (!sess) {
    return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  }
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }
  const cur = body.currentPassword ?? "";
  const next = body.newPassword ?? "";
  const verr = validateNewPassword(next);
  if (verr) return NextResponse.json({ ok: false, error: verr }, { status: 400 });

  const result = await mutate((db) => {
    if (sess.role === "teacher") {
      const staff = findSessionStaff(db, sess);
      if (!staff) return { ok: false, error: "관리자 계정을 찾을 수 없습니다. 다시 로그인해 주세요." };
      const ok = verifyPassword(cur, staff.passwordSalt, staff.passwordHash);
      if (!ok) return { ok: false, error: "현재 비밀번호가 올바르지 않습니다." };
      const { hash, salt } = hashPassword(next);
      staff.passwordHash = hash;
      staff.passwordSalt = salt;
      staff.mustChangePassword = false;
      staff.updatedAt = new Date().toISOString();
      db.auditLogs ??= [];
      db.auditLogs.push({
        id: `audit_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        actorId: staff.id,
        actorName: staff.name,
        actorRole: staff.role,
        actionType: "changeStaffPassword",
        summary: "본인 관리자 비밀번호 변경",
        targetId: staff.id,
        createdAt: staff.updatedAt,
      });
      return { ok: true };
    }
    const me = db.students.find((s) => s.id === sess.id);
    if (!me) return { ok: false, error: "학생을 찾을 수 없습니다." };
    if (!isActiveStudent(me)) return { ok: false, error: "퇴원 처리된 학생 계정입니다." };
    if (!verifyPassword(cur, me.passwordSalt, me.passwordHash)) {
      return { ok: false, error: "현재 비밀번호가 올바르지 않습니다." };
    }
    const { hash, salt } = hashPassword(next);
    me.passwordHash = hash;
    me.passwordSalt = salt;
    me.mustChangePassword = false;
    return { ok: true };
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
