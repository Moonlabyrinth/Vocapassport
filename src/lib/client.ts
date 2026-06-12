"use client";

import { useCallback, useEffect, useState } from "react";
import { Database, emptyDatabase } from "./types";
import { Action, ActionResult } from "./actions";

export type Role = "teacher" | "student";

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
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, password, loginId }),
  });
  return res.json();
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
