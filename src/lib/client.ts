"use client";

import { useCallback, useEffect, useState } from "react";
import { Database, emptyDatabase } from "./types";
import { Action, ActionResult } from "./actions";

// guardian(보호자)은 STEP 1에서 로그인 UI 탭으로만 사용. 서버 인증은 STEP 2.
export type Role = "teacher" | "student" | "guardian";

export interface CurrentUser {
  id: string;
  name: string;
  role: Role;
  loginId?: string;
  mustChangePassword?: boolean;
}

interface StateResponse {
  ok: boolean;
  role: Role;
  user: CurrentUser;
  db: Database;
}

// ---- 인증 API ----
export async function apiLogin(
  role: Role,
  password: string,
  loginId?: string
): Promise<{ ok: boolean; error?: string; setup?: boolean; user?: CurrentUser }> {
  // 네트워크 지연/무응답에도 버튼이 "확인 중…"으로 멈추지 않도록 타임아웃을 둔다.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, password, loginId }),
      signal: ctrl.signal,
    });
    // 서버 오류(500 등)로 JSON이 아닌 응답이 와도 throw 하지 않고 오류 메시지로 변환.
    try {
      return await res.json();
    } catch {
      return { ok: false, error: "서버 응답을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." };
    }
  } catch {
    return { ok: false, error: "네트워크 오류로 로그인하지 못했습니다. 인터넷 연결을 확인해 주세요." };
  } finally {
    clearTimeout(timer);
  }
}

export async function apiLogout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function apiMe(): Promise<{
  user: CurrentUser | null;
  teacherSetupNeeded: boolean;
}> {
  const res = await fetch("/api/auth/me", { cache: "no-store" });
  const json = await res.json();
  return { user: json.user ?? null, teacherSetupNeeded: !!json.teacherSetupNeeded };
}

export async function apiChangePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  return res.json();
}

// ---- 선생님 전용 관리(계정) API ----
export async function apiAdmin(body: unknown): Promise<any> {
  const res = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ---- 도메인 명령 ----
export async function runAction(action: Action): Promise<ActionResult & { status?: number }> {
  const res = await fetch("/api/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
  const json = await res.json();
  return { ...json, status: res.status };
}

/** 사진 업로드 → 저장 경로 반환 */
export async function uploadPhoto(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "업로드 실패");
  return json.path as string;
}

/** 공지 첨부파일 업로드(임의 형식·선생님 전용) → { path, name } */
export async function uploadFile(file: File): Promise<{ path: string; name: string }> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", "file");
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "업로드 실패");
  return { path: json.path as string, name: (json.name as string) || file.name };
}

export type AppStatus = "loading" | "unauth" | "ready" | "error";

export interface AppStateHook {
  status: AppStatus;
  role?: Role;
  user?: CurrentUser;
  db: Database;
  error: string | null;
  reload: () => Promise<void>;
  run: (action: Action) => Promise<ActionResult>;
}

export function useAppState(): AppStateHook {
  const [db, setDb] = useState<Database>(emptyDatabase());
  const [status, setStatus] = useState<AppStatus>("loading");
  const [role, setRole] = useState<Role | undefined>();
  const [user, setUser] = useState<CurrentUser | undefined>();
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (res.status === 401) {
        setStatus("unauth");
        setRole(undefined);
        setUser(undefined);
        setDb(emptyDatabase());
        return;
      }
      if (!res.ok) throw new Error("상태를 불러오지 못했습니다.");
      const json = (await res.json()) as StateResponse;
      setDb(json.db);
      setRole(json.role);
      setUser(json.user);
      setStatus("ready");
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const run = useCallback(
    async (action: Action): Promise<ActionResult> => {
      const result = await runAction(action);
      if (result.status === 401) {
        setStatus("unauth");
        return result;
      }
      if (result.ok) await reload();
      return result;
    },
    [reload]
  );

  return { status, role, user, db, error, reload, run };
}
