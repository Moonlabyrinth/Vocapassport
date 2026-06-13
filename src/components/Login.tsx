"use client";

import React, { useEffect, useState } from "react";
import { apiLogin, apiMe, Role } from "@/lib/client";
import { Button, Field, Input } from "./ui";
import { Crown, Flame, Sparkles, Trophy } from "lucide-react";
import CreatorFooter from "@/components/CreatorFooter";

interface LeaderboardEntry {
  studentName: string;
  className: string;
  passCount: number;
  total: number;
  targetTests: number;
  passGoal: number;
  avgPercent: number | null;
  currentPassStreak: number;
  bestPassStreak: number;
  perfectCount: number;
  currentPerfectStreak: number;
  allPassBonusEarned: boolean;
}

interface LeaderboardResponse {
  ok: boolean;
  period: {
    label: string;
    seasonLabel: string;
    rangeLabel: string;
    targetTests: number;
    passGoal: number;
  };
  highlights: {
    wordKing: LeaderboardEntry | null;
    streakKing: LeaderboardEntry | null;
    perfectKing: LeaderboardEntry | null;
  };
  ranked: LeaderboardEntry[];
}

export default function Login({ onSuccess }: { onSuccess: () => void }) {
  const [role, setRole] = useState<Role>("student");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [teacherSetupNeeded, setTeacherSetupNeeded] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiMe().then((r) => setTeacherSetupNeeded(r.teacherSetupNeeded));
    let alive = true;
    fetch("/api/public/leaderboard", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: LeaderboardResponse | null) => {
        if (alive && data?.ok) setLeaderboard(data);
      })
      .catch(() => {
        if (alive) setLeaderboard(null);
      });
    return () => {
      alive = false;
    };
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
    <div className="min-h-screen p-4 py-8 lg:flex lg:items-center lg:justify-center">
      <div className="w-full">
        <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)] lg:items-start">
          <div className="order-2 lg:order-1 lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto lg:pr-1">
            <HallOfFame data={leaderboard} />
          </div>

          <div className="order-1 w-full max-w-md justify-self-center lg:order-2 lg:sticky lg:top-8">
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
        <CreatorFooter className="mt-6" />
      </div>
    </div>
  );
}

function HallOfFame({ data }: { data: LeaderboardResponse | null }) {
  const periodText = data ? `${data.period.label} · ${data.period.rangeLabel}` : "집계 준비 중";

  return (
    <section className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-bold text-brand-700">
            <Trophy className="h-4 w-4" aria-hidden="true" />
            이달의 단어왕
          </div>
          <p className="mt-1 text-xs font-medium text-gray-400">{periodText}</p>
        </div>
        <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-brand-700">
          명예의 전당
        </span>
      </div>

      {!data ? (
        <div className="rounded-xl bg-gray-50 px-4 py-5 text-center text-sm text-gray-400">
          명예의 전당을 불러오는 중입니다.
        </div>
      ) : data.ranked.length === 0 ? (
        <div className="rounded-xl bg-gray-50 px-4 py-5 text-center text-sm text-gray-400">
          아직 이 구간에 집계된 정규 시험 기록이 없습니다.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2">
            <Highlight
              entry={data.highlights.wordKing}
              icon={<Crown className="h-4 w-4" aria-hidden="true" />}
              label="단어왕"
              value={(entry) => `${entry.passCount}/${entry.passGoal}회 통과`}
              tone="indigo"
            />
            <div className="grid grid-cols-2 gap-2">
              <Highlight
                entry={data.highlights.streakKing}
                icon={<Flame className="h-4 w-4" aria-hidden="true" />}
                label="연속 통과"
                value={(entry) => `${entry.currentPassStreak}회 연속`}
                tone="green"
              />
              <Highlight
                entry={data.highlights.perfectKing}
                icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
                label="만점"
                value={(entry) => `${entry.perfectCount}회`}
                tone="amber"
              />
            </div>
          </div>

          <ol className="space-y-2">
            {data.ranked.map((entry, index) => (
              <li
                key={`${entry.studentName}-${entry.className}-${index}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-black text-brand-700">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-gray-800">
                      {entry.studentName}
                      {entry.allPassBonusEarned && <span className="ml-1 text-amber-500">All Pass</span>}
                    </div>
                    <div className="truncate text-xs text-gray-400">{entry.className || "반 정보 없음"}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-gray-800">{entry.passCount}/{entry.passGoal}회</div>
                  <div className="text-xs text-gray-400">
                    평균 {entry.avgPercent != null ? `${entry.avgPercent}점` : "-"}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function Highlight({
  entry,
  icon,
  label,
  value,
  tone,
}: {
  entry: LeaderboardEntry | null;
  icon: React.ReactNode;
  label: string;
  value: (entry: LeaderboardEntry) => string;
  tone: "indigo" | "green" | "amber";
}) {
  const colors = {
    indigo: "border-indigo-100 bg-indigo-50 text-brand-700",
    green: "border-green-100 bg-green-50 text-green-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
  }[tone];

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${colors}`}>
      <div className="mb-1 flex items-center gap-1.5 text-xs font-bold">
        {icon}
        {label}
      </div>
      {entry ? (
        <>
          <div className="truncate text-sm font-black text-gray-800">{entry.studentName}</div>
          <div className="mt-0.5 text-xs font-semibold text-current">{value(entry)}</div>
        </>
      ) : (
        <div className="text-xs font-semibold text-current/70">집계 전</div>
      )}
    </div>
  );
}
