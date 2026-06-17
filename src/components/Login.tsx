"use client";

import React, { useEffect, useState } from "react";
import { apiLogin, apiMe, Role } from "@/lib/client";
import { Button, Input } from "./ui";
import { User, Lock, ShieldCheck, ArrowRight } from "lucide-react";
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
  growthDelta?: number;
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
    // RISING(성장왕)은 STEP 3에서 서버가 채워줌. 그 전까진 undefined → "집계 전".
    growthKing?: LeaderboardEntry | null;
  };
  ranked: LeaderboardEntry[];
}

const ROLE_TABS: { id: Role; main: string; sub: string }[] = [
  { id: "student", main: "학생", sub: "Student" },
  { id: "guardian", main: "보호자", sub: "Parent" },
  { id: "teacher", main: "선생님", sub: "Teacher" },
];

export default function Login({ onSuccess }: { onSuccess: () => void }) {
  const [role, setRole] = useState<Role>("student");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
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

  const teacherSetup = role === "teacher" && teacherSetupNeeded;
  const showIdField = role === "student" || role === "guardian";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (role === "guardian" && !loginId.trim()) return setError("자녀 이름을 입력하세요.");
    if (role === "student" && !loginId.trim()) return setError("아이디를 입력하세요.");
    if (!password) return setError(role === "guardian" ? "인증코드를 입력하세요." : "비밀번호를 입력하세요.");
    setBusy(true);
    try {
      const r = await apiLogin(role, password, loginId);
      if (!r.ok) {
        setError(r.error || "로그인 실패");
        return;
      }
      onSuccess();
    } catch {
      // apiLogin 은 자체적으로 오류를 흡수하지만, 예기치 못한 예외에도 버튼이 멈추지 않도록 방어.
      setError("로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  function selectRole(next: Role) {
    setRole(next);
    setError(null);
    setShowPw(false);
  }

  return (
    <div className="min-h-screen bg-lab-page px-5 py-8 sm:flex sm:items-center sm:justify-center">
      <div className="w-full">
        <div className="mx-auto grid w-full max-w-[1140px] grid-cols-1 overflow-hidden rounded-[26px] border border-[#efeadd] bg-lab-paper shadow-lab lg:grid-cols-[1.18fr_0.82fr]">
          {/* ===== 좌측: 이번 달 학습 현황 (모바일에서는 로그인 아래) ===== */}
          <section className="order-2 flex flex-col bg-[linear-gradient(180deg,#fffdf8,#f6f2e9)] p-7 lg:order-1 lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto lg:p-[42px]">
            <LeftPanel data={leaderboard} />
          </section>

          {/* ===== 우측: 로그인 카드 (모바일에서는 맨 위) ===== */}
          <section className="order-1 flex flex-col justify-center bg-lab-panel p-7 lg:order-2 lg:p-[42px]">
            <div className="rounded-[20px] bg-lab-paper p-7 shadow-lab-card sm:px-7">
              <h2 className="text-center font-serif text-[20px] font-bold text-lab-navy">로그인</h2>
              <p className="mb-5 mt-1.5 text-center text-[12px] text-lab-muted">
                계정 유형을 선택해 입장하세요
              </p>

              {/* 역할 탭 (3) */}
              <div role="tablist" aria-label="계정 유형" className="mb-5 flex gap-1.5 rounded-[13px] bg-[#e5ded1] p-1.5">
                {ROLE_TABS.map((tab) => {
                  const on = role === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => selectRole(tab.id)}
                      className={`flex flex-1 flex-col items-center gap-0.5 rounded-[9px] px-1 py-2.5 transition ${
                        on ? "bg-white shadow-lab-sm" : ""
                      }`}
                    >
                      <span className={`text-[13px] font-bold ${on ? "text-lab-navy" : "text-lab-muted"}`}>
                        {tab.main}
                      </span>
                      <span className={`text-[9px] font-bold uppercase tracking-[0.12em] ${on ? "text-lab-gold" : "text-lab-muted"}`}>
                        {tab.sub}
                      </span>
                    </button>
                  );
                })}
              </div>

              <form onSubmit={submit} noValidate>
                {showIdField && (
                  <div className="mb-3.5">
                    <label htmlFor="login-id" className="mb-1.5 block text-[12px] font-bold text-lab-navy">
                      {role === "guardian" ? "자녀 이름" : "아이디 (이름)"}
                    </label>
                    <div className="relative">
                      <User aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[#b6b1a3]" />
                      <Input
                        id="login-id"
                        variant="lab"
                        className="pl-[42px]"
                        value={loginId}
                        onChange={(e) => setLoginId(e.target.value)}
                        placeholder={role === "guardian" ? "자녀 이름을 입력하세요" : "이름을 입력하세요"}
                        autoComplete="username"
                      />
                    </div>
                  </div>
                )}

                <div className="mb-3.5">
                  <label htmlFor="login-pw" className="mb-1.5 block text-[12px] font-bold text-lab-navy">
                    {role === "guardian" ? "인증코드" : teacherSetup ? "비밀번호 설정 (최초 1회)" : "비밀번호"}
                  </label>
                  <div className="relative">
                    <Lock aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[#b6b1a3]" />
                    <Input
                      id="login-pw"
                      variant="lab"
                      className="pl-[42px] pr-[58px]"
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={role === "guardian" ? "인증코드" : teacherSetup ? "새 비밀번호" : "비밀번호"}
                      autoComplete={teacherSetup ? "new-password" : "current-password"}
                    />
                    <button
                      type="button"
                      aria-pressed={showPw}
                      aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 표시"}
                      onClick={() => setShowPw((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md px-2 py-1.5 text-[11.5px] text-[#a9a496] hover:text-lab-navy"
                    >
                      {showPw ? "숨김" : "표시"}
                    </button>
                  </div>
                  {teacherSetup && (
                    <span className="mt-1 block text-[11px] text-lab-muted">
                      선생님 비밀번호를 새로 정합니다. 4자 이상.
                    </span>
                  )}
                </div>

                {error && (
                  <div role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-600">
                    {error}
                  </div>
                )}

                <Button type="submit" variant="navy" disabled={busy} className="w-full">
                  {busy ? "확인 중…" : teacherSetup ? "비밀번호 설정하고 시작" : "로그인"}
                  {!busy && <ArrowRight aria-hidden="true" className="h-4 w-4 text-lab-gold" />}
                </Button>
              </form>

              <p className="mt-3.5 text-center text-[12px] text-lab-muted">
                아이디·비밀번호는{" "}
                <span className="font-bold text-lab-gold">선생님께 문의</span>하세요
              </p>
              <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-lab-muted">
                <ShieldCheck aria-hidden="true" className="h-[13px] w-[13px] text-lab-green" />
                안전한 보안 로그인 · 보호자 함께 보기
              </div>

              {role === "teacher" && teacherSetupNeeded && (
                <p className="mt-3 text-center text-[11.5px] text-amber-600">
                  선생님 계정이 아직 없습니다. 입력한 비밀번호로 처음 설정됩니다.
                </p>
              )}
            </div>
          </section>
        </div>

        <CreatorFooter className="mt-6" />
      </div>
    </div>
  );
}

/* ===================== 좌측 패널: TOP RANKER BOARD ===================== */

function LeftPanel({ data }: { data: LeaderboardResponse | null }) {
  const periodLabel = data?.period.label ?? "이번 달";
  const rangeLabel = data?.period.rangeLabel ?? "집계 준비 중";
  const targetTests = data?.period.targetTests ?? 0;
  const top3 = data?.ranked.slice(0, 3) ?? [];

  return (
    <>
      {/* 학습 현황 헤더 */}
      <div className="flex items-start justify-between gap-3.5">
        <div>
          <div className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-lab-gold">
            이번 달 학습 현황
          </div>
          <h1 className="mt-2 font-serif text-[25px] font-bold text-lab-navy">
            {periodLabel} 학습 리포트
          </h1>
          <div className="mt-1.5 text-[12.5px] text-lab-muted">
            <b className="font-bold text-lab-navy">{rangeLabel}</b> · 단어시험 · 월말평가
          </div>
        </div>
        <span className="whitespace-nowrap rounded-[20px] bg-lab-gold-soft px-3 py-1.5 text-[10.5px] font-extrabold tracking-[0.12em] text-lab-navy">
          MONTHLY TOP RANKERS
        </span>
      </div>

      {/* TOP RANKER BOARD (4 카드) */}
      <SectionTitle>TOP RANKER BOARD</SectionTitle>
      <p className="-mt-1 mb-4 text-[12px] leading-relaxed text-lab-muted">
        이번 달 단어시험에서 눈에 띄는 기록을 만든 학생들이 표시됩니다.
      </p>
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        <RankerCard
          accent="#9b7a4a"
          code="VOCAB"
          no="01"
          label="VOCAB TOP RANKER"
          entry={data?.highlights.wordKing}
          sub={(e) =>
            `${e.passCount}/${e.targetTests || targetTests}회 통과 · 평균 ${e.avgPercent ?? "-"}점`
          }
          pendingSub="이번 주 시험 후 업데이트"
        />
        <RankerCard
          accent="#6f7f70"
          code="STREAK"
          no="02"
          label="STREAK RANKER"
          entry={data?.highlights.streakKing}
          sub={(e) => `${e.currentPassStreak}회 연속 통과 중`}
          pendingSub="연속 통과 기록이 쌓이면 표시"
        />
        <RankerCard
          accent="#6f7480"
          code="PERFECT"
          no="03"
          label="PERFECT SCORE"
          entry={data?.highlights.perfectKing}
          sub={(e) => `${e.perfectCount}회 만점 달성`}
          pendingSub="이번 주 시험 후 업데이트"
        />
        <RankerCard
          accent="#8b765e"
          code="RISING"
          no="04"
          label="RISING RANKER"
          entry={data?.highlights.growthKing}
          sub={(e) => `이번 달 +${e.growthDelta ?? 0}점 상승`}
          pendingSub="점수 상승폭 기준 선정"
        />
      </div>

      {/* 이번 달 성취 학생 (상위 3) */}
      <SectionTitle>이번 달 성취 학생</SectionTitle>
      <div className="rounded-2xl border border-lab-line bg-[#fffdfa] px-4 py-1.5 shadow-lab-sm">
        {top3.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-lab-muted">
            이번 달 첫 성취를 기다리고 있어요.
          </div>
        ) : (
          top3.map((e, i) => (
            <div
              key={`${e.studentName}-${e.className}-${i}`}
              className="flex items-center gap-3.5 border-b border-[#f1ede2] py-3.5 last:border-b-0"
            >
              <span className="flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-[9px] bg-[#3b4654] text-[13px] font-bold text-white">
                {i + 1}
              </span>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#7a817c] text-[14px] font-bold text-white">
                {e.studentName.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <b className="truncate text-[14.5px] text-lab-ink">{e.studentName}</b>
                  {e.className && (
                    <span className="shrink-0 rounded-md bg-[#f1ede2] px-1.5 py-px text-[10px] font-bold text-lab-muted">
                      {e.className}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[11.5px] text-lab-muted">
                  {e.passCount}/{e.targetTests || targetTests}회 통과
                </div>
              </div>
              <div className="text-right">
                <b className="text-[15px] text-lab-navy">{e.avgPercent ?? "-"}</b>
                <span className="block text-[10.5px] text-lab-muted">평균점</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 로그인 안내 */}
      <div className="mt-auto flex items-center gap-2 pt-6 text-[12.5px] text-lab-muted">
        <Lock aria-hidden="true" className="h-4 w-4 shrink-0 text-lab-gold" />
        <span>
          로그인 후 <b className="font-bold text-lab-ink">내 성적 · 재시험 여부 · 숙제</b>를 확인할 수 있어요.
        </span>
      </div>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3.5 mt-7 flex items-center gap-2 text-[13px] font-bold text-lab-navy">
      {children}
      <span className="h-px flex-1 bg-lab-line" />
    </div>
  );
}

function RankerCard({
  accent,
  code,
  no,
  label,
  entry,
  sub,
  pendingSub,
}: {
  accent: string;
  code: string;
  no: string;
  label: string;
  entry: LeaderboardEntry | null | undefined;
  sub: (e: LeaderboardEntry) => string;
  pendingSub: string;
}) {
  const pending = !entry;
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-lab-line p-4 shadow-lab-sm ${
        pending ? "bg-lab-paper" : "bg-[#fffdfa]"
      }`}
    >
      <span className="absolute left-0 top-0 h-full w-1 opacity-75" style={{ background: accent }} />
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-extrabold tracking-[0.16em]" style={{ color: accent }}>
          {code}
        </span>
        <span className="font-serif text-[18px] leading-none text-[#d4cbbd]">{no}</span>
      </div>
      <div className="text-[12px] font-bold text-lab-muted">{label}</div>
      {entry ? (
        <>
          <div className="mt-1 text-[16px] font-bold text-lab-ink">
            {entry.studentName}
            {entry.className && (
              <span className="ml-1.5 align-middle rounded-md bg-[#eef1f8] px-1.5 py-0.5 text-[10px] font-bold tracking-[0.05em] text-lab-navy">
                {entry.className}
              </span>
            )}
          </div>
          <div className="mt-1.5 text-[11.5px] text-lab-muted">{sub(entry)}</div>
        </>
      ) : (
        <>
          <div className="mt-1 text-[14px] font-bold text-lab-muted">집계 전</div>
          <div className="mt-1.5 text-[11.5px] text-lab-muted">{pendingSub}</div>
        </>
      )}
    </div>
  );
}
