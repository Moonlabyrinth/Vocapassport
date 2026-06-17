import { NextRequest, NextResponse } from "next/server";
import { genId, mutate } from "@/lib/db";
import { applyAction } from "@/lib/actions";
import {
  findSessionStaff,
  getSession,
  hashPassword,
  generateInitialPassword,
  validateNewPassword,
} from "@/lib/auth";
import { Database, StaffRole, StaffUser } from "@/lib/types";

export const dynamic = "force-dynamic";

type AdminOp =
  | { op: "createStudentsWithCreds"; classId: string; names: string[] }
  | { op: "issueCredentials"; studentId: string } // 비밀번호 초기화(재발급)
  | { op: "setLoginId"; studentId: string; loginId: string }
  | { op: "issueGuardianCode"; studentId: string } // 보호자 접속 코드 발급/재발급
  | { op: "createStaff"; loginId: string; name: string; role: StaffRole; password: string; mustChangePassword?: boolean }
  | { op: "updateStaff"; staffId: string; patch: Partial<{ loginId: string; name: string; role: StaffRole; active: boolean }> }
  | { op: "resetStaffPassword"; staffId: string; password: string; mustChangePassword?: boolean };

const STAFF_ROLES: StaffRole[] = ["master", "director", "viceDirector", "teacher", "viewer"];

function canManageStudentAccounts(role: StaffRole): boolean {
  return role === "master" || role === "director" || role === "viceDirector";
}

function canManageStaff(role: StaffRole): boolean {
  return role === "master";
}

function normStaffRole(role: StaffRole): StaffRole {
  return STAFF_ROLES.includes(role) ? role : "teacher";
}

function appendAudit(db: Database, staff: StaffUser, actionType: string, summary: string, targetId?: string | null) {
  db.auditLogs ??= [];
  db.auditLogs.push({
    id: genId("audit"),
    actorId: staff.id,
    actorName: staff.name,
    actorRole: staff.role,
    actionType,
    summary,
    targetId: targetId ?? null,
    createdAt: new Date().toISOString(),
  });
  if (db.auditLogs.length > 1000) db.auditLogs = db.auditLogs.slice(-1000);
}

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
    db.staffUsers ??= [];
    db.auditLogs ??= [];
    const staff = findSessionStaff(db, sess);
    if (!staff) return { ok: false, error: "관리자 계정을 찾을 수 없습니다. 다시 로그인해 주세요." };
    switch (body.op) {
      case "createStudentsWithCreds": {
        if (!canManageStudentAccounts(staff.role)) return { ok: false, error: "학생 계정 발급은 부원장 이상만 가능합니다." };
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
        appendAudit(db, staff, body.op, `학생 계정 ${created.length}명 생성`, body.classId);
        return { ok: true, created };
      }
      case "issueCredentials": {
        if (!canManageStudentAccounts(staff.role)) return { ok: false, error: "학생 비밀번호 재발급은 부원장 이상만 가능합니다." };
        const s = db.students.find((x) => x.id === body.studentId);
        if (!s) return { ok: false, error: "학생을 찾을 수 없습니다." };
        if (!s.loginId) s.loginId = uniqueLoginIdFromName(db, s.name);
        const password = generateInitialPassword();
        const { hash, salt } = hashPassword(password);
        s.passwordHash = hash;
        s.passwordSalt = salt;
        s.mustChangePassword = true;
        appendAudit(db, staff, body.op, `학생 비밀번호 재발급 (${s.name})`, s.id);
        return { ok: true, loginId: s.loginId, password };
      }
      case "issueGuardianCode": {
        if (!canManageStudentAccounts(staff.role)) return { ok: false, error: "보호자 코드 발급은 부원장 이상만 가능합니다." };
        const s = db.students.find((x) => x.id === body.studentId);
        if (!s) return { ok: false, error: "학생을 찾을 수 없습니다." };
        const guardianCode = generateGuardianCode(db);
        s.guardianCode = guardianCode;
        appendAudit(db, staff, body.op, `보호자 코드 발급 (${s.name})`, s.id);
        return { ok: true, guardianCode };
      }
      case "setLoginId": {
        if (!canManageStudentAccounts(staff.role)) return { ok: false, error: "학생 아이디 수정은 부원장 이상만 가능합니다." };
        const s = db.students.find((x) => x.id === body.studentId);
        if (!s) return { ok: false, error: "학생을 찾을 수 없습니다." };
        const loginId = (body.loginId || "").trim();
        if (!loginId) return { ok: false, error: "아이디를 입력하세요." };
        if (db.students.some((x) => x.id !== s.id && x.loginId === loginId)) {
          return { ok: false, error: "이미 사용 중인 아이디입니다." };
        }
        s.loginId = loginId;
        appendAudit(db, staff, body.op, `학생 아이디 수정 (${s.name})`, s.id);
        return { ok: true, loginId };
      }
      case "createStaff": {
        if (!canManageStaff(staff.role)) return { ok: false, error: "직원 계정 관리는 마스터 관리자만 가능합니다." };
        const loginId = body.loginId.trim();
        const name = body.name.trim();
        if (!loginId) return { ok: false, error: "직원 아이디를 입력하세요." };
        if (!name) return { ok: false, error: "직원 이름을 입력하세요." };
        if (db.staffUsers.some((item) => item.loginId === loginId)) return { ok: false, error: "이미 사용 중인 직원 아이디입니다." };
        const err = validateNewPassword(body.password);
        if (err) return { ok: false, error: err };
        const { hash, salt } = hashPassword(body.password);
        const now = new Date().toISOString();
        const created: StaffUser = {
          id: genId("staff"),
          loginId,
          name,
          role: normStaffRole(body.role),
          passwordHash: hash,
          passwordSalt: salt,
          active: true,
          mustChangePassword: body.mustChangePassword ?? true,
          createdAt: now,
          updatedAt: now,
          lastLoginAt: null,
        };
        db.staffUsers.push(created);
        appendAudit(db, staff, body.op, `직원 계정 생성 (${name} · ${created.role})`, created.id);
        return { ok: true, staffId: created.id };
      }
      case "updateStaff": {
        if (!canManageStaff(staff.role)) return { ok: false, error: "직원 계정 관리는 마스터 관리자만 가능합니다." };
        const target = db.staffUsers.find((item) => item.id === body.staffId);
        if (!target) return { ok: false, error: "직원 계정을 찾을 수 없습니다." };
        if (target.id === staff.id && body.patch.active === false) return { ok: false, error: "본인 계정은 비활성화할 수 없습니다." };
        if (body.patch.loginId != null) {
          const loginId = body.patch.loginId.trim();
          if (!loginId) return { ok: false, error: "직원 아이디를 입력하세요." };
          if (db.staffUsers.some((item) => item.id !== target.id && item.loginId === loginId)) {
            return { ok: false, error: "이미 사용 중인 직원 아이디입니다." };
          }
          target.loginId = loginId;
        }
        if (body.patch.name != null) {
          if (!body.patch.name.trim()) return { ok: false, error: "직원 이름을 입력하세요." };
          target.name = body.patch.name.trim();
        }
        if (body.patch.role != null) {
          if (target.id === staff.id && body.patch.role !== "master") return { ok: false, error: "본인 마스터 권한은 낮출 수 없습니다." };
          target.role = normStaffRole(body.patch.role);
        }
        if (body.patch.active != null) target.active = body.patch.active;
        target.updatedAt = new Date().toISOString();
        appendAudit(db, staff, body.op, `직원 계정 수정 (${target.name})`, target.id);
        return { ok: true, staffId: target.id };
      }
      case "resetStaffPassword": {
        if (!canManageStaff(staff.role)) return { ok: false, error: "직원 계정 관리는 마스터 관리자만 가능합니다." };
        const target = db.staffUsers.find((item) => item.id === body.staffId);
        if (!target) return { ok: false, error: "직원 계정을 찾을 수 없습니다." };
        const err = validateNewPassword(body.password);
        if (err) return { ok: false, error: err };
        const { hash, salt } = hashPassword(body.password);
        target.passwordHash = hash;
        target.passwordSalt = salt;
        target.mustChangePassword = body.mustChangePassword ?? true;
        target.updatedAt = new Date().toISOString();
        appendAudit(db, staff, body.op, `직원 비밀번호 초기화 (${target.name})`, target.id);
        return { ok: true, staffId: target.id };
      }
      default:
        return { ok: false, error: "알 수 없는 작업" };
    }
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
