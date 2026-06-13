"use client";

import React, { useEffect, useState } from "react";
import { motion, type Variants } from "framer-motion";
import { Award, BadgeCheck, MessageCircle, Share2, TrendingUp } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

export type StudentReportStatus = "pass" | "retest" | "absent";

export interface StudentReportTrendPoint {
  label: string;
  score: number;
}

export interface StudentReportHistoryItem {
  id: string;
  title: string;
  date: string;
  score: number;
  maxScore: number;
  status: StudentReportStatus;
}

export interface StudentReportMonth {
  key: string;
  label: string;
  studentName: string;
  passRate: number;
  averageScore: number;
  previousAverageScore: number;
  trend: StudentReportTrendPoint[];
  history: StudentReportHistoryItem[];
  seasonLabel?: string;
  rangeLabel?: string;
  targetTests?: number;
  passGoal?: number;
  totalTests?: number;
  passCount?: number;
  remainingPasses?: number;
  currentPassStreak?: number;
  bestPassStreak?: number;
  currentPerfectStreak?: number;
  bestPerfectStreak?: number;
  earnedReward?: boolean;
  projectedEligible?: boolean;
  allPassBonusEarned?: boolean;
}

interface StudentReportProps {
  reports?: StudentReportMonth[];
  initialReportKey?: string;
  embedded?: boolean;
  className?: string;
}

const mockReports: StudentReportMonth[] = [
  {
    key: "2026-summer-1",
    label: "1개월차",
    seasonLabel: "여름학기 성취 평가",
    rangeLabel: "6/8~7/3",
    studentName: "이소영",
    passRate: 82,
    averageScore: 91,
    previousAverageScore: 88,
    targetTests: 11,
    passGoal: 9,
    totalTests: 6,
    passCount: 5,
    remainingPasses: 4,
    currentPassStreak: 3,
    bestPassStreak: 3,
    currentPerfectStreak: 1,
    bestPerfectStreak: 2,
    earnedReward: false,
    projectedEligible: true,
    allPassBonusEarned: false,
    trend: [
      { label: "6/10", score: 86 },
      { label: "6/12", score: 90 },
      { label: "6/17", score: 95 },
      { label: "6/19", score: 97 },
    ],
    history: [
      { id: "jun-1", title: "필수 단어 · Day 9-10", date: "6월 10일", score: 88, maxScore: 100, status: "pass" },
      { id: "jun-2", title: "필수 단어 · Day 11-12", date: "6월 12일", score: 95, maxScore: 100, status: "pass" },
      { id: "jun-3", title: "고난도 단어 · Day 13-14", date: "6월 17일", score: 72, maxScore: 100, status: "retest" },
    ],
  },
  {
    key: "2026-summer-2",
    label: "2개월차",
    seasonLabel: "여름학기 성취 평가",
    rangeLabel: "7/6~8/3",
    studentName: "이소영",
    passRate: 91,
    averageScore: 94,
    previousAverageScore: 91,
    targetTests: 11,
    passGoal: 9,
    totalTests: 11,
    passCount: 10,
    remainingPasses: 0,
    currentPassStreak: 5,
    bestPassStreak: 7,
    currentPerfectStreak: 2,
    bestPerfectStreak: 3,
    earnedReward: true,
    projectedEligible: true,
    allPassBonusEarned: false,
    trend: [
      { label: "7/10", score: 92 },
      { label: "7/14", score: 94 },
      { label: "7/17", score: 93 },
      { label: "7/21", score: 97 },
    ],
    history: [
      { id: "jul-1", title: "필수 단어 · Day 15-16", date: "7월 10일", score: 94, maxScore: 100, status: "pass" },
      { id: "jul-2", title: "고난도 단어 · Day 17-18", date: "7월 14일", score: 96, maxScore: 100, status: "pass" },
    ],
  },
];

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.36, ease: "easeOut" },
  },
};

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function StatusBadge({ status }: { status: StudentReportStatus }) {
  const label = status === "pass" ? "통과" : status === "absent" ? "결석" : "재시험 대상";
  const className =
    status === "pass"
      ? "bg-[#DEF7EC] text-[#03543F]"
      : status === "absent"
        ? "bg-slate-100 text-slate-500"
      : "bg-[#FDF6B2] text-[#723B10]";

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}

function CircularProgress({ value }: { value: number }) {
  const safeValue = clampPercent(value);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safeValue / 100) * circumference;

  return (
    <div className="relative h-32 w-32">
      <svg viewBox="0 0 112 112" className="h-full w-full -rotate-90">
        <circle
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke="#EEF2FF"
          strokeWidth="10"
        />
        <motion.circle
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke="#4F46E5"
          strokeLinecap="round"
          strokeWidth="10"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-3xl font-bold tracking-tight text-[#1F2937]">{safeValue}%</span>
      </div>
    </div>
  );
}

function TrendTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;

  const score = payload[0]?.value;
  if (typeof score !== "number") return null;

  return (
    <div className="rounded-xl border border-slate-100 bg-white/95 px-3 py-2 text-sm shadow-lg shadow-slate-200/60 backdrop-blur">
      <div className="text-xs font-medium text-slate-400">{label}</div>
      <div className="mt-0.5 font-semibold text-[#1F2937]">{formatNumber(score)} / 100</div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  sub,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  sub: string;
  tone?: "slate" | "green" | "amber";
}) {
  const toneClass = {
    slate: "text-slate-800 bg-slate-50",
    green: "text-emerald-700 bg-emerald-50",
    amber: "text-amber-700 bg-amber-50",
  }[tone];

  return (
    <div className={`rounded-2xl px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-bold text-current/65">{label}</p>
      <p className="mt-1 text-3xl font-black tracking-tight">{value}</p>
      <p className="mt-1 text-xs font-semibold text-current/60">{sub}</p>
    </div>
  );
}

export default function StudentReport({
  reports = mockReports,
  initialReportKey,
  embedded = false,
  className = "",
}: StudentReportProps) {
  const firstKey = reports[0]?.key ?? "";
  const [selectedMonth, setSelectedMonth] = useState<string>(initialReportKey ?? firstKey);
  const [shareLabel, setShareLabel] = useState("카카오톡으로 리포트 공유");
  const report = reports.find((item) => item.key === selectedMonth) ?? reports[0];

  useEffect(() => {
    if (!reports.some((item) => item.key === selectedMonth)) {
      setSelectedMonth(initialReportKey ?? firstKey);
    }
  }, [firstKey, initialReportKey, reports, selectedMonth]);

  if (!report) return null;

  const historyPassCount = report.history.filter((item) => item.status === "pass").length;
  const passCount = report.passCount ?? historyPassCount;
  const totalTests = report.totalTests ?? report.history.length;
  const targetTests = report.targetTests ?? Math.max(totalTests, report.history.length);
  const passGoal = report.passGoal ?? Math.min(9, Math.max(1, targetTests));
  const remainingPasses = report.remainingPasses ?? Math.max(0, passGoal - passCount);
  const currentPassStreak = report.currentPassStreak ?? 0;
  const bestPassStreak = report.bestPassStreak ?? currentPassStreak;
  const currentPerfectStreak = report.currentPerfectStreak ?? 0;
  const bestPerfectStreak = report.bestPerfectStreak ?? currentPerfectStreak;
  const earnedReward = report.earnedReward ?? passCount >= passGoal;
  const projectedEligible = report.projectedEligible ?? passCount + Math.max(0, targetTests - totalTests) >= passGoal;
  const allPassBonusEarned = report.allPassBonusEarned ?? (targetTests > 0 && totalTests >= targetTests && passCount >= targetTests);
  const scoreDelta = report.averageScore - report.previousAverageScore;
  const goalProgress = clampPercent(passGoal > 0 ? Math.round((passCount / passGoal) * 100) : 0);
  const seasonLabel = report.seasonLabel ?? "성취 평가";
  const rangeLabel = report.rangeLabel ? ` · ${report.rangeLabel}` : "";
  const statusText = allPassBonusEarned
    ? `${targetTests}회 All Pass 특별 상품 대상`
    : earnedReward
      ? "상품 기준 달성"
      : projectedEligible
        ? `통과 ${remainingPasses}회 남음`
        : "남은 시험을 모두 통과해도 기준 미달";

  async function shareReport(): Promise<void> {
    const text = `${report.studentName} ${report.label} 보카패스포트 리포트: 통과 ${passCount}/${targetTests}회, 연속 통과 ${currentPassStreak}회.`;
    const nav = typeof window !== "undefined" ? window.navigator : null;

    try {
      if (nav && "share" in nav && typeof nav.share === "function") {
        await nav.share({ title: "보카패스포트 리포트", text });
      } else if (nav?.clipboard) {
        await nav.clipboard.writeText(text);
      }
      setShareLabel("리포트 공유 준비 완료");
      window.setTimeout(() => setShareLabel("카카오톡으로 리포트 공유"), 1800);
    } catch {
      setShareLabel("공유가 취소되었습니다");
      window.setTimeout(() => setShareLabel("카카오톡으로 리포트 공유"), 1800);
    }
  }

  const Root: React.ElementType = embedded ? "section" : "main";

  return (
    <Root className={`${embedded ? "text-[#1F2937]" : "min-h-screen bg-[#F9FAFB] px-4 py-6 text-[#1F2937]"} ${className}`}>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="mx-auto flex w-full max-w-[420px] flex-col gap-4"
      >
        <motion.header variants={itemVariants} className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-500">보카패스포트 리포트</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#1F2937]">
                {report.studentName} 학생의 {report.label} 학습 리포트
              </h1>
              <p className="mt-1 text-sm font-medium text-slate-400">
                {seasonLabel}{rangeLabel}
              </p>
            </div>
            <div className="rounded-full border border-indigo-100 bg-white p-2 text-[#4F46E5] shadow-sm">
              <Award className="h-5 w-5" aria-hidden="true" />
            </div>
          </div>

          <div className="flex gap-1 overflow-x-auto rounded-full border border-slate-200 bg-white p-1 shadow-sm shadow-slate-200/60">
            {reports.map((month) => {
              const active = month.key === selectedMonth;
              return (
                <button
                  key={month.key}
                  type="button"
                  onClick={() => setSelectedMonth(month.key)}
                  className={`min-w-24 flex-1 shrink-0 rounded-full px-3 py-2 text-sm font-semibold transition-all ${
                    active
                      ? "bg-[#4F46E5] text-white shadow-sm"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                  }`}
                >
                  {month.label}
                  {active && <span className="sr-only"> active</span>}
                </button>
              );
            })}
          </div>
        </motion.header>

        <motion.section
          variants={itemVariants}
          className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-[0_18px_44px_rgba(79,70,229,0.10)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-[#4F46E5]">보카패스포트 성취</p>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-5xl font-black tracking-tight text-[#1F2937]">{passCount}</span>
                <span className="pb-2 text-lg font-bold text-slate-400">/ {targetTests}회</span>
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {targetTests}회 중 {passGoal}회 이상 통과 시 상품
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${
                allPassBonusEarned || earnedReward
                  ? "bg-[#DEF7EC] text-[#03543F]"
                  : projectedEligible
                    ? "bg-indigo-50 text-[#4F46E5]"
                    : "bg-red-50 text-red-700"
              }`}
            >
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {statusText}
            </span>
          </div>

          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <motion.div
              className="h-full rounded-full bg-[#4F46E5]"
              initial={{ width: 0 }}
              animate={{ width: `${goalProgress}%` }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <MetricTile
              label="현재 연속 통과"
              value={`${currentPassStreak}회`}
              sub={`최고 ${bestPassStreak}회`}
              tone="green"
            />
            <MetricTile
              label="현재 연속 만점"
              value={`${currentPerfectStreak}회`}
              sub={`최고 ${bestPerfectStreak}회`}
              tone="amber"
            />
          </div>
        </motion.section>

        <motion.section variants={itemVariants} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500">통과율</p>
                <p className="mt-1 text-xs text-slate-400">
                  정규 시험 {totalTests}회 기준
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-center">
              <CircularProgress value={report.passRate} />
            </div>
            <p className="mt-3 text-center text-sm font-medium text-slate-500">
              재시험 기록은 성취 횟수에서 제외됩니다.
            </p>
          </div>

          <div className="flex rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
            <div className="flex flex-1 flex-col justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500">평균 백점환산</p>
                <div className="mt-3 flex items-end gap-2">
                  <span className="text-5xl font-bold tracking-tight text-[#1F2937]">
                    {formatNumber(report.averageScore)}
                  </span>
                  <span className="pb-1 text-sm font-semibold text-slate-400">/ 100</span>
                </div>
              </div>
              <div className="mt-5 inline-flex w-fit items-center gap-1 rounded-full bg-[#DEF7EC] px-3 py-1 text-xs font-semibold text-[#03543F]">
                <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                이전 구간 대비 {scoreDelta >= 0 ? "↑" : "↓"} {formatNumber(Math.abs(scoreDelta))}점
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section
          variants={itemVariants}
          className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)]"
        >
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[#1F2937]">점수 추이</h2>
              <p className="text-sm text-slate-400">시험별 백점환산 흐름</p>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-[#4F46E5]">
              {report.label}
            </span>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={report.trend} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid stroke="#EEF2F7" strokeDasharray="4 4" vertical={false} />
                <XAxis
                  axisLine={false}
                  dataKey="label"
                  tick={{ fill: "#94A3B8", fontSize: 12, fontWeight: 600 }}
                  tickLine={false}
                />
                <YAxis
                  axisLine={false}
                  domain={[0, 100]}
                  tick={{ fill: "#94A3B8", fontSize: 12, fontWeight: 600 }}
                  tickLine={false}
                  width={36}
                />
                <Tooltip content={<TrendTooltip />} cursor={{ stroke: "#C7D2FE", strokeWidth: 1 }} />
                <Line
                  activeDot={{ r: 6, stroke: "#FFFFFF", strokeWidth: 3 }}
                  dataKey="score"
                  dot={{ r: 4, fill: "#4F46E5", stroke: "#FFFFFF", strokeWidth: 2 }}
                  stroke="#4F46E5"
                  strokeLinecap="round"
                  strokeWidth={3}
                  type="monotone"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.section>

        <motion.section variants={itemVariants} className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-base font-bold text-[#1F2937]">시험 기록</h2>
            <span className="text-sm font-medium text-slate-400">{report.history.length}회</span>
          </div>

          <div className="space-y-3">
            {report.history.map((item) => (
              <motion.article
                key={item.id}
                whileHover={{ scale: 1.01 }}
                className={`rounded-2xl border bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.05)] transition-all ${
                  item.status === "retest"
                    ? "border-amber-100 border-l-4 border-l-[#F59E0B]"
                    : "border-slate-100"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-[#1F2937]">{item.title}</h3>
                    <p className="mt-1 text-sm text-slate-400">{item.date}</p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-400">백점환산</p>
                    <p className="mt-1 text-2xl font-bold tracking-tight text-[#1F2937]">
                    {item.status === "absent" ? "결석" : <>{formatNumber(item.score)} <span className="text-sm font-semibold text-slate-400">/ {item.maxScore}</span></>}
                  </p>
                </div>
                  {item.status !== "absent" && (
                    <div className="rounded-full bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-500">
                      {Math.round((item.score / item.maxScore) * 100)}%
                    </div>
                  )}
                </div>
              </motion.article>
            ))}
          </div>
        </motion.section>

        <motion.footer variants={itemVariants} className="pb-2 pt-1">
          <button
            type="button"
            onClick={shareReport}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#4F46E5] px-4 py-3.5 text-sm font-bold text-white shadow-[0_18px_40px_rgba(79,70,229,0.28)] transition-all hover:scale-[1.01] hover:bg-[#4338CA] active:scale-[0.99]"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            {shareLabel}
            <Share2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </motion.footer>
      </motion.div>
    </Root>
  );
}
