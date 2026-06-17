import { NextRequest, NextResponse } from "next/server";
import { getDB, mutate, genId } from "@/lib/db";
import {
  hashPassword,
  verifyPassword,
  setSessionCookie,
  validateNewPassword,
} from "@/lib/auth";
import { isActiveStudent } from "@/lib/logic";
import { StaffUser } from "@/lib/types";

export const dynamic = "force-dynamic";

interface LoginBody {
  role: "teacher" | "student" | "guardian";
  loginId?: string;
  password?: string;
  legacyPassword?: string;
}

/** 이름/코드 비교용 정규화 (공백 제거 + 소문자) */
function norm(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

export async function POST(req: NextRequest) {
  let body: LoginBody;
  try {
    body = (await req.json()) as LoginBody;
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }
  const password = body.password ?? "";

  if (body.role === "teacher") {
    const db = await getDB();
    const staffUsers = db.staffUsers ?? [];
    const loginId = (body.loginId ?? "").trim();
    if (staffUsers.length === 0) {
      if (!loginId) return NextResponse.json({ ok: false, error: "마스터 아이디를 입력하세요." }, { status: 400 });
      const legacyHash = db.settings.teacherPasswordHash;
      const legacySalt = db.settings.teacherPasswordSalt;
      if (legacyHash && legacySalt && !verifyPassword(body.legacyPassword ?? "", legacySalt, legacyHash)) {
        return NextResponse.json({ ok: false, error: "기존 공용 관리자 비밀번호가 올바르지 않습니다." }, { status: 401 });
      }
      const err = validateNewPassword(password);
      if (err) return NextResponse.json({ ok: false, error: err }, { status: 400 });
      const { hash, salt } = hashPassword(password);
      const created = await mutate((d): StaffUser | null => {
        d.staffUsers ??= [];
        if (d.staffUsers.length > 0) return null;
        const now = new Date().toISOString();
        const staff: StaffUser = {
          id: genId("staff"),
          loginId,
          name: "마스터 관리자",
          role: "master",
          passwordHash: hash,
          passwordSalt: salt,
          active: true,
          mustChangePassword: false,
          createdAt: now,
          updatedAt: now,
          lastLoginAt: now,
        };
        d.staffUsers.push(staff);
        d.auditLogs ??= [];
        d.auditLogs.push({
          id: genId("audit"),
          actorId: staff.id,
          actorName: staff.name,
          actorRole: "master",
          actionType: "createMasterStaff",
          summary: `마스터 관리자 계정 생성 (${loginId})`,
          targetId: staff.id,
          createdAt: now,
        });
        return staff;
      });
      if (!created) {
        return NextResponse.json({ ok: false, error: "이미 관리자 계정이 생성되었습니다. 다시 로그인해 주세요." }, { status: 409 });
      }
      const res = NextResponse.json({
        ok: true,
        setup: true,
        user: { id: created.id, name: created.name, role: "teacher", staffRole: "master", mustChangePassword: false },
      });
      setSessionCookie(res, { role: "teacher", id: created.id, name: created.name, staffRole: "master" });
      return res;
    }

    if (!loginId) return NextResponse.json({ ok: false, error: "직원 아이디를 입력하세요." }, { status: 400 });
    const staff = staffUsers.find((item) => item.loginId === loginId && item.active);
    const ok = !!staff && verifyPassword(password, staff.passwordSalt, staff.passwordHash);
    if (!staff || !ok) {
      return NextResponse.json({ ok: false, error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }
    await mutate((d) => {
      const found = (d.staffUsers ?? []).find((item) => item.id === staff.id);
      if (found) found.lastLoginAt = new Date().toISOString();
    });
    const res = NextResponse.json({
      ok: true,
      user: { id: staff.id, name: staff.name, role: "teacher", staffRole: staff.role, mustChangePassword: staff.mustChangePassword },
    });
    setSessionCookie(res, { role: "teacher", id: staff.id, name: staff.name, staffRole: staff.role });
    return res;
  }

  // 보호자 로그인: [자녀 이름 + 인증코드] → 자녀 데이터만 조회
  if (body.role === "guardian") {
    const childName = (body.loginId ?? "").trim();
    const code = (body.password ?? "").trim();
    if (!childName) {
      return NextResponse.json({ ok: false, error: "자녀 이름을 입력하세요." }, { status: 400 });
    }
    if (!code) {
      return NextResponse.json({ ok: false, error: "인증코드를 입력하세요." }, { status: 400 });
    }
    const db = await getDB();
    const codeUp = code.toUpperCase();
    const student = db.students.find(
      (s) =>
        !!s.guardianCode &&
        s.guardianCode.toUpperCase() === codeUp &&
        (norm(s.name) === norm(childName) || (!!s.loginId && norm(s.loginId) === norm(childName)))
    );
    if (!student) {
      return NextResponse.json(
        { ok: false, error: "자녀 이름 또는 인증코드가 올바르지 않습니다." },
        { status: 401 }
      );
    }
    if (!isActiveStudent(student)) {
      return NextResponse.json(
        { ok: false, error: "퇴원 처리된 학생 계정입니다." },
        { status: 403 }
      );
    }
    const res = NextResponse.json({
      ok: true,
      user: { id: student.id, name: student.name, role: "guardian" },
    });
    setSessionCookie(res, { role: "guardian", id: student.id, name: student.name });
    return res;
  }

  // 학생 로그인
  const loginId = (body.loginId ?? "").trim();
  if (!loginId) {
    return NextResponse.json({ ok: false, error: "아이디를 입력하세요." }, { status: 400 });
  }
  const db = await getDB();
  const student = db.students.find((s) => s.loginId && s.loginId === loginId);
  const ok =
    !!student &&
    verifyPassword(password, student.passwordSalt, student.passwordHash);
  if (!student || !ok) {
    return NextResponse.json(
      { ok: false, error: "아이디 또는 비밀번호가 올바르지 않습니다." },
      { status: 401 }
    );
  }
  if (!isActiveStudent(student)) {
    return NextResponse.json(
      { ok: false, error: "퇴원 처리된 학생 계정입니다." },
      { status: 403 }
    );
  }
  const res = NextResponse.json({
    ok: true,
    user: {
      id: student.id,
      name: student.name,
      role: "student",
      mustChangePassword: student.mustChangePassword,
    },
  });
  setSessionCookie(res, { role: "student", id: student.id, name: student.name });
  return res;
}
