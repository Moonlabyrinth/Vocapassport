// 서버 전용 인증 유틸 (node crypto + fs). 클라이언트에서 import 금지.

import crypto from "crypto";
import { promises as fs } from "fs";
import fssync from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { Database } from "./types";
import { Action } from "./actions";

// guardian(보호자)은 STEP 1에서 로그인 UI 탭으로만 노출. 서버 인증·세션은 STEP 2에서 추가.
export type Role = "teacher" | "student" | "guardian";

export interface Session {
  role: Role;
  id: string; // teacher: "teacher", student: 학생 id
  name: string;
  exp: number; // 만료 (ms epoch)
}

export const COOKIE_NAME = "wtm_session";
const SESSION_DAYS = 30;
const SECRET_FILE = path.join(process.cwd(), "data", "secret.key");

// ---- 비밀번호 해시 ----
export function hashPassword(
  password: string,
  salt?: string
): { hash: string; salt: string } {
  const s = salt ?? crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, s, 64).toString("hex");
  return { hash, salt: s };
}

export function verifyPassword(
  password: string,
  salt: string,
  hash: string
): boolean {
  if (!salt || !hash) return false;
  const h = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(h, "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** 학생 초기 비밀번호: 0000 통일 (학생이 로그인 후 변경) */
export const INITIAL_PASSWORD = "0000";
export function generateInitialPassword(): string {
  return INITIAL_PASSWORD;
}

// ---- 세션 토큰 (HMAC 서명 쿠키, 무상태) ----
function getSecret(): string {
  // 클라우드: 환경변수 우선 (파일 쓰기 불가)
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  // 로컬: data/secret.key 파일 (없으면 생성)
  try {
    return fssync.readFileSync(SECRET_FILE, "utf8");
  } catch {
    const s = crypto.randomBytes(32).toString("hex");
    fssync.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
    fssync.writeFileSync(SECRET_FILE, s, "utf8");
    return s;
  }
}

export function signToken(sess: Omit<Session, "exp"> & { exp?: number }): string {
  const full: Session = {
    ...sess,
    exp: sess.exp ?? Date.now() + SESSION_DAYS * 24 * 3600 * 1000,
  };
  const payload = Buffer.from(JSON.stringify(full)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyToken(token: string | undefined | null): Session | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const sess = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as Session;
    if (sess.exp && sess.exp < Date.now()) return null;
    return sess;
  } catch {
    return null;
  }
}

export function getSession(req: NextRequest): Session | null {
  return verifyToken(req.cookies.get(COOKIE_NAME)?.value);
}

export function setSessionCookie(res: NextResponse, sess: Omit<Session, "exp">) {
  res.cookies.set(COOKIE_NAME, signToken(sess), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 3600,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
}

// 비밀번호 정책(최소 길이 등)
export function validateNewPassword(pw: string): string | null {
  if (!pw || pw.length < 4) return "비밀번호는 4자 이상이어야 합니다.";
  if (pw.length > 64) return "비밀번호가 너무 깁니다.";
  return null;
}

// secret 디렉터리 보장 (data 폴더)
export async function ensureDataDir() {
  await fs.mkdir(path.dirname(SECRET_FILE), { recursive: true });
}

/**
 * /api/command 액션 권한 검사. 허용이면 null, 거부면 오류 메시지.
 * - 선생님: 모든 액션 허용
 * - 학생: 본인 재시험 '예약/취소'만 허용 (점수 입력·관리 등 불가)
 */
export function authorizeAction(
  db: Database,
  sess: Session | null,
  action: Action
): string | null {
  if (!sess) return "로그인이 필요합니다.";
  if (sess.role === "teacher") return null;
  // 보호자: 조회 전용 — 모든 명령 거부
  if (sess.role === "guardian") return "보호자 계정은 조회만 가능합니다.";

  // 학생 권한
  switch (action.type) {
    case "scheduleRetest": {
      const rec = db.records.find((r) => r.id === action.scoreRecordId);
      if (!rec) return "기록을 찾을 수 없습니다.";
      if (rec.studentId !== sess.id) return "본인 기록만 예약할 수 있습니다.";
      return null;
    }
    case "rescheduleRetest": {
      const rt = db.retests.find((r) => r.id === action.id);
      if (!rt) return "예약을 찾을 수 없습니다.";
      if (rt.studentId !== sess.id) return "본인 예약만 변경할 수 있습니다.";
      return null;
    }
    case "cancelRetest": {
      const rt = db.retests.find((r) => r.id === action.id);
      if (!rt) return "예약을 찾을 수 없습니다.";
      if (rt.studentId !== sess.id) return "본인 예약만 취소할 수 있습니다.";
      return null;
    }
    default:
      return "권한이 없습니다.";
  }
}
