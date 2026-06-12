"use client";

import React, { useEffect, useState } from "react";
import { apiLogin, apiMe, Role } from "@/lib/client";
import { Button, Field, Input } from "./ui";

export default function Login({ onSuccess }: { onSuccess: () => void }) {
  const [role, setRole] = useState<Role>("student");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [teacherSetupNeeded, setTeacherSetupNeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiMe().then((r) => setTeacherSetupNeeded(r.teacherSetupNeeded));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (role === "student" && !loginId.trim()) return setError("아이디를 입력하세요.");
    if (!password) return setError("비밀번호를 입력하세요.");
    setBusy(true);
    const r = await apiLogin(role, password, loginId);
    setBusy(false);
    if (!r.ok) return setError(r.error || "로그인 실패");
    onSuccess();
  }

  const teacherSetup = role === "teacher" && teacherSetupNeeded;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">📚</div>
          <h1 className="text-xl font-bold text-gray-800">단어시험 관리</h1>
          <p className="text-sm text-gray-400 mt-1">로그인</p>
        </div>

        {/* 역할 선택 */}
        <div className="grid grid-cols-2 gap-2 mb-5 bg-gray-100 p-1 rounded-xl">
          {(["student", "teacher"] as Role[]).map((r) => (
            <button
              key={r}
              onClick={() => {
                setRole(r);
                setError(null);
              }}
              className={`py-2 rounded-lg text-sm font-medium transition ${
                role === r ? "bg-white shadow text-brand-700" : "text-gray-500"
              }`}
            >
              {r === "student" ? "🧑‍🎓 학생" : "🧑‍🏫 선생님"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
          {role === "student" && (
            <Field label="아이디 (이름)">
              <Input
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="이름을 입력하세요"
                autoComplete="username"
              />
            </Field>
          )}
          <Field
            label={teacherSetup ? "비밀번호 설정 (최초 1회)" : "비밀번호"}
            hint={teacherSetup ? "선생님 비밀번호를 새로 정합니다. 4자 이상." : undefined}
          >
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={teacherSetup ? "새 비밀번호" : "비밀번호"}
              autoComplete={teacherSetup ? "new-password" : "current-password"}
            />
          </Field>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "확인 중…" : teacherSetup ? "비밀번호 설정하고 시작" : "로그인"}
          </Button>

          {role === "teacher" && teacherSetupNeeded && (
            <p className="text-xs text-amber-600 text-center">
              선생님 계정이 아직 없습니다. 입력한 비밀번호로 처음 설정됩니다.
            </p>
          )}
          {role === "student" && (
            <p className="text-xs text-gray-400 text-center">
              아이디·비밀번호는 선생님께 문의하세요.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
