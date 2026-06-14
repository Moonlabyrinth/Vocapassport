import { NextRequest, NextResponse } from "next/server";
import { getDB, mutate } from "@/lib/db";
import {
  hashPassword,
  verifyPassword,
  setSessionCookie,
  validateNewPassword,
} from "@/lib/auth";
import { isActiveStudent } from "@/lib/logic";

export const dynamic = "force-dynamic";

interface LoginBody {
  role: "teacher" | "student" | "guardian";
  loginId?: string;
  password?: string;
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
    const hasPw = !!db.settings.teacherPasswordHash;
    if (!hasPw) {
      // 최초 설정: 입력한 비밀번호로 선생님 계정 생성
      const err = validateNewPassword(password);
      if (err) return NextResponse.json({ ok: false, error: err }, { status: 400 });
      const { hash, salt } = hashPassword(password);
      await mutate((d) => {
        d.settings.teacherPasswordHash = hash;
        d.settings.teacherPasswordSalt = salt;
      });
      const res = NextResponse.json({
        ok: true,
        setup: true,
        user: { id: "teacher", name: "선생님", role: "teacher" },
      });
      setSessionCookie(res, { role: "teacher", id: "teacher", name: "선생님" });
      return res;
    }
    const ok = verifyPassword(
      password,
      db.settings.teacherPasswordSalt || "",
      db.settings.teacherPasswordHash || ""
    );
    if (!ok) {
      return NextResponse.json({ ok: false, error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
    }
    const res = NextResponse.json({
      ok: true,
      user: { id: "teacher", name: "선생님", role: "teacher" },
    });
    setSessionCookie(res, { role: "teacher", id: "teacher", name: "선생님" });
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
