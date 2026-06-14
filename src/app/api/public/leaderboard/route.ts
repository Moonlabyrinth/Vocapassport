import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import {
  achievementRangeLabel,
  computeAchievementPeriodStats,
  computeGrowthDelta,
  isActiveStudent,
  isDateInRange,
  resolveAchievementPeriods,
  round1,
  type AchievementPeriod,
  type RewardStats,
} from "@/lib/logic";
import { ScoreRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

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
  /** RISING(성장왕) 전용 — 성장폭(점). 성장왕 카드에서만 채워짐 */
  growthDelta?: number;
}

function seoulTodayKey(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function pickPeriod(periods: AchievementPeriod[], records: ScoreRecord[]): AchievementPeriod {
  const today = seoulTodayKey();
  const current = periods.find((period) => isDateInRange(today, period.startDate, period.endDate));
  if (current) return current;

  const latestRecord = [...records]
    .filter((record) => record.status === "approved" && record.attemptType === "first")
    .sort((a, b) => b.examDate.localeCompare(a.examDate) || b.createdAt.localeCompare(a.createdAt))[0];
  if (latestRecord) {
    const period = periods.find((item) => isDateInRange(latestRecord.examDate, item.startDate, item.endDate));
    if (period) return period;
  }

  return periods[0];
}

function byWordKing(a: LeaderboardEntry, b: LeaderboardEntry): number {
  return (
    b.passCount - a.passCount ||
    (b.avgPercent ?? -1) - (a.avgPercent ?? -1) ||
    b.currentPassStreak - a.currentPassStreak ||
    b.total - a.total ||
    a.studentName.localeCompare(b.studentName, "ko")
  );
}

function byStreak(a: LeaderboardEntry, b: LeaderboardEntry): number {
  return (
    b.currentPassStreak - a.currentPassStreak ||
    b.bestPassStreak - a.bestPassStreak ||
    b.passCount - a.passCount ||
    (b.avgPercent ?? -1) - (a.avgPercent ?? -1) ||
    a.studentName.localeCompare(b.studentName, "ko")
  );
}

function byPerfect(a: LeaderboardEntry, b: LeaderboardEntry): number {
  return (
    b.perfectCount - a.perfectCount ||
    b.currentPerfectStreak - a.currentPerfectStreak ||
    (b.avgPercent ?? -1) - (a.avgPercent ?? -1) ||
    a.studentName.localeCompare(b.studentName, "ko")
  );
}

function toEntry(
  studentName: string,
  className: string,
  stats: RewardStats
): LeaderboardEntry {
  return {
    studentName,
    className,
    passCount: stats.passCount,
    total: stats.total,
    targetTests: stats.targetTests,
    passGoal: stats.passGoal,
    avgPercent: round1(stats.avgPercent),
    currentPassStreak: stats.currentPassStreak,
    bestPassStreak: stats.bestPassStreak,
    perfectCount: stats.perfectCount,
    currentPerfectStreak: stats.currentPerfectStreak,
    allPassBonusEarned: stats.total >= stats.targetTests && stats.passCount >= stats.targetTests,
  };
}

export async function GET() {
  const db = await getDB();
  const periods = resolveAchievementPeriods(db.settings);
  const period = pickPeriod(periods, db.records);
  const activeStudents = db.students.filter(isActiveStudent);
  const rows = activeStudents
    .map((student) => {
      const cls = db.classes.find((item) => item.id === student.classId);
      const records = db.records.filter(
        (record) =>
          record.studentId === student.id &&
          record.status === "approved" &&
          record.attemptType === "first" &&
          isDateInRange(record.examDate, period.startDate, period.endDate)
      );
      const stats = computeAchievementPeriodStats(records, period);
      return { entry: toEntry(student.name, cls?.name ?? "", stats), growth: computeGrowthDelta(records) };
    })
    .filter((row) => row.entry.total > 0);

  const entries = rows.map((row) => row.entry);
  const ranked = [...entries].sort(byWordKing).slice(0, 5);
  const wordKing = ranked[0] ?? null;
  const streakKing = [...entries].sort(byStreak).find((entry) => entry.currentPassStreak > 0) ?? null;
  const perfectKing = [...entries].sort(byPerfect).find((entry) => entry.perfectCount > 0) ?? null;

  // RISING(성장왕): 성장폭 양수만 후보, growthDelta desc → 최근평균 desc → 응시수 desc
  const growthKing =
    rows
      .filter((row) => row.growth && row.growth.growthDelta > 0)
      .sort(
        (a, b) =>
          b.growth!.growthDelta - a.growth!.growthDelta ||
          b.growth!.recentAvg - a.growth!.recentAvg ||
          b.growth!.attempts - a.growth!.attempts
      )
      .map((row) => ({ ...row.entry, growthDelta: row.growth!.growthDelta }))[0] ?? null;

  return NextResponse.json({
    ok: true,
    period: {
      label: period.label,
      seasonLabel: period.seasonLabel,
      rangeLabel: achievementRangeLabel(period),
      targetTests: period.targetTests,
      passGoal: period.passGoal,
    },
    highlights: {
      wordKing,
      streakKing,
      perfectKing,
      growthKing,
    },
    ranked,
  });
}
