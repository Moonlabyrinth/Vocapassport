import { NextRequest, NextResponse } from "next/server";
import { mutate } from "@/lib/db";
import { applyAction } from "@/lib/actions";
import {
  getSession,
  hashPassword,
  generateInitialPassword,
} from "@/lib/auth";
import { Database } from "@/lib/types";

export const dynamic = "force-dynamic";

type AdminOp =
  | { op: "createStudentsWithCreds"; classId: string; names: string[] }
  | { op: "issueCredentials"; studentId: string } // 비밀번호 초기화(재발급)
  | { op: "setLoginId"; studentId: string; loginId: string }
  | { op: "issueGuardianCode"; studentId: string }; // 보호자 접속 코드 발급/재발급

/** 헷갈리는 글자(0/O/1/I/L) 제외한 6자리 보호자 코드 (중복 회피) */
function generateGuardianCode(db: Database): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const used = new Set(db.students.map((s) => s.guardianCode).filter(Boolean));
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = "";
    for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    if (!used.has(code)) return code;
  }
  return `${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

/** 학생 이름 기반 고유 로그인 아이디 (중복 시 숫자 접미사) */
function uniqueLoginIdFromName(db: Database, name: string): string {
  const base = name.trim() || "student";
  const used = new Set(db.students.map((s) => s.loginId).filter(Boolean));
  if (!used.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const cand = `${base}${i}`;
    if (!used.has(cand)) return cand;
  }
  return `${base}_${Date.now().toString(36)}`;
}

export async function POST(req: NextRequest) {
  const sess = getSession(req);
  if (!sess || sess.role !== "teacher") {
    return NextResponse.json({ ok: false, error: "권한이 없습니다." }, { status: 403 });
  }
  let body: AdminOp;
  try {
    body = (await req.json()) as AdminOp;
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }

  const result = await mutate((db) => {
    switch (body.op) {
      case "createStudentsWithCreds": {
        const names = (body.names || [])
          .map((n) => n.trim())
          .filter(Boolean);
        const created: { id: string; name: string; loginId: string; password: string }[] = [];
        for (const name of names) {
          const r = applyAction(db, { type: "createStudent", classId: body.classId, name });
          if (!r.ok || !r.id) continue;
          const s = db.students.find((x) => x.id === r.id)!;
          const loginId = uniqueLoginIdFromName(db, s.name);
          const password = generateInitialPassword();
          const { hash, salt } = hashPassword(password);
          s.loginId = loginId;
          s.passwordHash = hash;
          s.passwordSalt = salt;
          s.mustChangePassword = true;
          created.push({ id: s.id, name: s.name, loginId, password });
        }
        return { ok: true, created };
      }
      case "issueCredentials": {
        const s = db.students.find((x) => x.id === body.studentId);
        if (!s) return { ok: false, error: "학생을 찾을 수 없습니다." };
        if (!s.loginId) s.loginId = uniqueLoginIdFromName(db, s.name);
        const password = generateInitialPassword();
        const { hash, salt } = hashPassword(password);
        s.passwordHash = hash;
        s.passwordSalt = salt;
        s.mustChangePassword = true;
        return { ok: true, loginId: s.loginId, password };
      }
      case "issueGuardianCode": {
        const s = db.students.find((x) => x.id === body.studentId);
        if (!s) return { ok: false, error: "학생을 찾을 수 없습니다." };
        const guardianCode = generateGuardianCode(db);
        s.guardianCode = guardianCode;
        return { ok: true, guardianCode };
      }
      case "setLoginId": {
        const s = db.students.find((x) => x.id === body.studentId);
        if (!s) return { ok: false, error: "학생을 찾을 수 없습니다." };
        const loginId = (body.loginId || "").trim();
        if (!loginId) return { ok: false, error: "아이디를 입력하세요." };
        if (db.students.some((x) => x.id !== s.id && x.loginId === loginId)) {
          return { ok: false, error: "이미 사용 중인 아이디입니다." };
        }
        s.loginId = loginId;
        return { ok: true, loginId };
      }
      default:
        return { ok: false, error: "알 수 없는 작업" };
    }
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
