// 통과 판정 · 통계 · 연속 횟수 계산

import { Book, ClassRoom, MonthlyTest, PassKind, ScoreRecord, Student } from "./types";

// ===================== 먼슬리 테스트 통계 =====================
/** 영역 점수 합계(총점) */
export function monthlyTotal(
  scores: Record<string, number>,
  test: Pick<MonthlyTest, "sections">
): number {
  return test.sections.reduce((sum, s) => sum + (Number(scores[s.key]) || 0), 0);
}

/** 먼슬리 만점 총합 */
export function monthlyMaxTotal(test: Pick<MonthlyTest, "sections">): number {
  return test.sections.reduce((sum, s) => sum + (s.maxScore || 0), 0);
}

/** 총점 백분율 */
export function monthlyPercent(
  scores: Record<string, number>,
  test: Pick<MonthlyTest, "sections">
): number {
  const max = monthlyMaxTotal(test);
  return max > 0 ? (monthlyTotal(scores, test) / max) * 100 : 0;
}

/** 통과 종류 한글 라벨 */
export function passKindLabel(kind: PassKind | null | undefined): string | null {
  switch (kind) {
    case "main": return "본시험 통과";
    case "retest": return "재시험 통과";
    case "exempt": return "면제";
    default: return null;
  }
}

/** 통과 종류 배지 색 */
export function passKindColor(kind: PassKind | null | undefined): "green" | "blue" | "gray" {
  switch (kind) {
    case "main": return "green";
    case "retest": return "blue";
    case "exempt": return "gray";
    default: return "gray";
  }
}

export const REWARD_START_DATE = "2026-06-10";
export const REWARD_DEFAULT_TEST_COUNT = 11;
export const REWARD_PASS_GOAL = 9;

export interface AchievementPeriod {
  key: string;
  seasonLabel: string;
  label: string;
  startDate: string;
  endDate: string;
  targetTests: number;
  passGoal: number;
}

// 학기별 월 단위 구간. 월 경계는 캘린더가 아니라 관리 화면의 개강일/종강일 기준.
// (방학·휴강으로 일정이 밀리면 관리에서 각 구간 날짜를 조정)
export const ACHIEVEMENT_PERIODS: AchievementPeriod[] = [
  // 봄학기 (3월~6/7)
  {
    key: "2026-spring-1",
    seasonLabel: "봄학기",
    label: "1개월차",
    startDate: "2026-03-01",
    endDate: "2026-03-31",
    targetTests: 8,
    passGoal: 6,
  },
  {
    key: "2026-spring-2",
    seasonLabel: "봄학기",
    label: "2개월차",
    startDate: "2026-04-01",
    endDate: "2026-04-30",
    targetTests: 8,
    passGoal: 6,
  },
  {
    key: "2026-spring-3",
    seasonLabel: "봄학기",
    label: "3개월차",
    startDate: "2026-05-01",
    endDate: "2026-06-07",
    targetTests: 8,
    passGoal: 6,
  },
  // 여름학기 성취 평가
  {
    key: "2026-summer-1",
    seasonLabel: "여름학기",
    label: "1개월차",
    startDate: "2026-06-08",
    endDate: "2026-07-03",
    targetTests: REWARD_DEFAULT_TEST_COUNT,
    passGoal: REWARD_PASS_GOAL,
  },
  {
    key: "2026-summer-2",
    seasonLabel: "여름학기",
    label: "2개월차",
    startDate: "2026-07-06",
    endDate: "2026-08-03",
    targetTests: REWARD_DEFAULT_TEST_COUNT,
    passGoal: REWARD_PASS_GOAL,
  },
  {
    key: "2026-summer-3",
    seasonLabel: "여름학기",
    label: "3개월차",
    startDate: "2026-08-05",
    endDate: "2026-08-31",
    targetTests: REWARD_DEFAULT_TEST_COUNT,
    passGoal: REWARD_PASS_GOAL,
  },
];

export function resolveAchievementPeriods(settings?: { achievementPeriods?: AchievementPeriod[] | null }): AchievementPeriod[] {
  const periods = settings?.achievementPeriods
    ?.filter((period) =>
      period.key &&
      period.label &&
      period.startDate &&
      period.endDate &&
      period.startDate <= period.endDate &&
      period.targetTests > 0 &&
      period.passGoal >= 0 &&
      period.passGoal <= period.targetTests
    )
    .map((period) => ({ ...period }));
  return periods?.length ? periods : ACHIEVEMENT_PERIODS.map((period) => ({ ...period }));
}

export function isDateInRange(date: string, startDate: string, endDate: string): boolean {
  return date >= startDate && date <= endDate;
}

export function achievementPeriodForDate(date: string): AchievementPeriod | null {
  return ACHIEVEMENT_PERIODS.find((period) => isDateInRange(date, period.startDate, period.endDate)) ?? null;
}

/** 어떤 구간에든 정규(first) 기록이 있는지 */
function periodHasRecords(period: AchievementPeriod, records: ScoreRecord[]): boolean {
  return records.some((r) => r.attemptType === "first" && isDateInRange(r.examDate, period.startDate, period.endDate));
}

/** 기록이 있는 구간만(없으면 오늘이 속한 구간 포함) — 학생/보호자 화면 구간 목록용 */
export function periodsWithData(
  periods: AchievementPeriod[],
  records: ScoreRecord[],
  today: string
): AchievementPeriod[] {
  const list = periods.filter(
    (p) => periodHasRecords(p, records) || isDateInRange(today, p.startDate, p.endDate)
  );
  return list.length ? list : periods.slice(0, 1);
}

/**
 * 화면 기본 선택 구간: 기록이 있으면 그 중 가장 최근, 없으면 오늘이 속한 구간, 없으면 마지막.
 * (예: 여름 기록이 있으면 여름, 봄 기록만 있으면 봄으로 자동 선택)
 */
export function defaultPeriodForView(
  periods: AchievementPeriod[],
  records: ScoreRecord[],
  today: string
): AchievementPeriod | null {
  if (!periods.length) return null;
  const withRecords = periods.filter((p) => periodHasRecords(p, records));
  if (withRecords.length) {
    return [...withRecords].sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  }
  return periods.find((p) => isDateInRange(today, p.startDate, p.endDate)) ?? periods[periods.length - 1];
}

// ===================== 학기(seasonLabel) 그룹핑 — 보호자/학생 조회용 =====================
export interface SeasonGroup {
  seasonLabel: string;
  periods: AchievementPeriod[];
}

/** 성취 구간을 학기(seasonLabel)별로 묶기. periods 배열 순서를 유지 */
export function groupBySeason(periods: AchievementPeriod[]): SeasonGroup[] {
  const order: string[] = [];
  const map = new Map<string, AchievementPeriod[]>();
  for (const p of periods) {
    if (!map.has(p.seasonLabel)) {
      map.set(p.seasonLabel, []);
      order.push(p.seasonLabel);
    }
    map.get(p.seasonLabel)!.push(p);
  }
  return order.map((label) => ({ seasonLabel: label, periods: map.get(label)! }));
}

/** 학기 그룹에 기록이 있거나 오늘이 속한 구간이 하나라도 있는지 */
export function seasonGroupHasData(group: SeasonGroup, records: ScoreRecord[], today: string): boolean {
  return group.periods.some(
    (p) => periodHasRecords(p, records) || isDateInRange(today, p.startDate, p.endDate)
  );
}

/** 학기 그룹 전체 범위(첫 개강일~마지막 종강일) */
export function seasonRange(group: SeasonGroup): { startDate: string; endDate: string } {
  const starts = group.periods.map((p) => p.startDate).sort();
  const ends = group.periods.map((p) => p.endDate).sort();
  return { startDate: starts[0] ?? "", endDate: ends[ends.length - 1] ?? "" };
}

export function achievementRangeLabel(period: AchievementPeriod): string {
  return `${shortDateLabel(period.startDate)}~${shortDateLabel(period.endDate)}`;
}

function shortDateLabel(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

export function isActiveStudent(student: Pick<Student, "status">): boolean {
  return student.status !== "withdrawn";
}

export function isRewardRecord(record: ScoreRecord): boolean {
  return record.examDate >= REWARD_START_DATE && record.attemptType === "first";
}

export function isAchievementPeriodRecord(record: ScoreRecord, period: AchievementPeriod): boolean {
  return record.attemptType === "first" && isDateInRange(record.examDate, period.startDate, period.endDate);
}

/** 적용할 통과 컷(%) — 책별 컷 우선, 없으면 반 컷 */
export function resolveThreshold(
  cls: ClassRoom | undefined,
  book: Book | null | undefined
): number {
  if (book && book.passThreshold != null) return book.passThreshold;
  if (cls) return cls.passThreshold;
  return 80; // 안전 기본값
}

/** 점수 백분율 (0~100) */
export function percentOf(actual: number, total: number): number {
  if (!total || total <= 0) return 0;
  return (actual / total) * 100;
}

/** 통과 여부: 백분율 >= 컷 */
export function isPassed(
  actual: number,
  total: number,
  threshold: number
): boolean {
  // 부동소수 오차 보정
  return percentOf(actual, total) + 1e-9 >= threshold;
}

export function isPerfect(actual: number, total: number): boolean {
  return total > 0 && actual >= total;
}

/** examDate(날짜) → createdAt(시각) 순 정렬용 키 */
function orderKey(r: ScoreRecord): string {
  return `${r.examDate}T${r.createdAt}`;
}

/** 시간순 정렬 (오래된 → 최신) */
export function sortChrono(records: ScoreRecord[]): ScoreRecord[] {
  return [...records].sort((a, b) => orderKey(a).localeCompare(orderKey(b)));
}

export interface StreakStats {
  total: number; // 응시 수
  absentCount: number; // 결석 수
  perfectCount: number; // 만점 횟수
  passCount: number; // 본시험/자동 통과 횟수 (재시험 통과 제외)
  retestPassCount: number; // 재시험으로 통과한 횟수 (별도 집계)
  currentPerfectStreak: number; // 현재 만점 연속
  bestPerfectStreak: number; // 최고 만점 연속
  currentPassStreak: number; // 현재 통과 연속
  bestPassStreak: number; // 최고 통과 연속
  avgPercent: number | null; // 평균 백분율
}

export interface RewardStats extends StreakStats {
  targetTests: number;
  passGoal: number;
  remainingTests: number;
  remainingPasses: number;
  projectedEligible: boolean;
  earnedReward: boolean;
}

/**
 * 연속/누적 통계 계산.
 * 입력 records 는 한 학생(또는 한 책 범위)의 승인된 기록이라고 가정.
 */
/** 면제(exempt)는 통계에서 중립 — 응시/통과/연속/평균 모두에서 건너뜀 */
export function isExempt(r: Pick<ScoreRecord, "passKind">): boolean {
  return r.passKind === "exempt";
}

export function isAbsent(r: Pick<ScoreRecord, "isAbsent">): boolean {
  return !!r.isAbsent;
}

type PassClassifiable = Pick<
  ScoreRecord,
  "passed" | "passKind" | "attemptType" | "isAbsent" | "actualScore" | "totalScore" | "passMarkUsed" | "thresholdUsed"
>;

/** 기록의 실제 점수가 통과 컷을 충족하는지 (절대 점수 컷 우선, 없으면 백분율 컷) */
export function scoreMeetsCut(r: Pick<ScoreRecord, "actualScore" | "totalScore" | "passMarkUsed" | "thresholdUsed">): boolean {
  if (r.passMarkUsed != null) return r.actualScore + 1e-9 >= r.passMarkUsed;
  return percentOf(r.actualScore, r.totalScore) + 1e-9 >= r.thresholdUsed;
}

/**
 * 본시험/자동 통과: '진짜' 본시험에서 통과한 경우만.
 * - 재시험 응시/‘재시험 통과’ 분류 → 제외
 * - 통과 종류를 '본시험'으로 명시했으면 인정
 * - 그 외에는 실제 점수가 컷을 충족한 통과만 인정(컷 미달인데 수동 통과 처리된 건 재시험/보정으로 봄)
 */
export function isMainPass(r: PassClassifiable): boolean {
  if (!r.passed || isAbsent(r) || isExempt(r)) return false;
  if (r.attemptType === "retest" || r.passKind === "retest") return false;
  return r.passKind === "main" || scoreMeetsCut(r);
}

/** 재시험/보정 통과: 통과했지만 본시험 통과가 아닌 것 (재시험·컷 미달 수동 통과 등) — 별도 집계 */
export function isRetestPass(r: PassClassifiable): boolean {
  if (!r.passed || isAbsent(r) || isExempt(r)) return false;
  return !isMainPass(r);
}

export function computeStreaks(records: ScoreRecord[]): StreakStats {
  const ordered = sortChrono(records);
  let total = 0;
  let absentCount = 0;
  let perfectCount = 0;
  let passCount = 0;
  let retestPassCount = 0;
  let curPerfect = 0;
  let bestPerfect = 0;
  let curPass = 0;
  let bestPass = 0;
  let percentSum = 0;
  let scoredTotal = 0;

  for (const r of ordered) {
    if (isExempt(r)) continue; // 면제: 연속을 끊지 않고 통째로 건너뜀
    total++;
    if (isAbsent(r)) {
      absentCount++;
      curPerfect = 0;
      curPass = 0;
      continue;
    }
    if (r.isPerfect) {
      perfectCount++;
      curPerfect++;
      if (curPerfect > bestPerfect) bestPerfect = curPerfect;
    } else {
      curPerfect = 0;
    }
    if (isRetestPass(r)) {
      // 재시험 통과: 별도 집계. 본시험 연속 통과(streak)는 끊되 미통과로 보지 않음
      retestPassCount++;
      curPass = 0;
    } else if (r.passed) {
      // 본시험/자동 통과
      passCount++;
      curPass++;
      if (curPass > bestPass) bestPass = curPass;
    } else {
      curPass = 0;
    }
    percentSum += percentOf(r.actualScore, r.totalScore);
    scoredTotal++;
  }

  return {
    total,
    absentCount,
    perfectCount,
    passCount,
    retestPassCount,
    currentPerfectStreak: curPerfect,
    bestPerfectStreak: bestPerfect,
    currentPassStreak: curPass,
    bestPassStreak: bestPass,
    avgPercent: scoredTotal ? percentSum / scoredTotal : null,
  };
}

export function computeRewardStats(
  records: ScoreRecord[],
  targetTests = REWARD_DEFAULT_TEST_COUNT,
  passGoal = REWARD_PASS_GOAL
): RewardStats {
  const rewardRecords = records.filter(isRewardRecord);
  const base = computeStreaks(rewardRecords);
  const remainingTests = Math.max(0, targetTests - base.total);
  const remainingPasses = Math.max(0, passGoal - base.passCount);
  return {
    ...base,
    targetTests,
    passGoal,
    remainingTests,
    remainingPasses,
    projectedEligible: base.passCount + remainingTests >= passGoal,
    earnedReward: base.passCount >= passGoal,
  };
}

export function computeAchievementPeriodStats(
  records: ScoreRecord[],
  period: AchievementPeriod
): RewardStats {
  const periodRecords = records.filter((record) => isAchievementPeriodRecord(record, period));
  const base = computeStreaks(periodRecords);
  const remainingTests = Math.max(0, period.targetTests - base.total);
  const remainingPasses = Math.max(0, period.passGoal - base.passCount);
  return {
    ...base,
    targetTests: period.targetTests,
    passGoal: period.passGoal,
    remainingTests,
    remainingPasses,
    projectedEligible: base.passCount + remainingTests >= period.passGoal,
    earnedReward: base.passCount >= period.passGoal,
  };
}

/** 평균 백분율 (소수1) — 면제 제외 */
export function avgPercent(records: ScoreRecord[]): number | null {
  const countable = records.filter((r) => !isExempt(r) && !isAbsent(r));
  if (!countable.length) return null;
  const sum = countable.reduce(
    (acc, r) => acc + percentOf(r.actualScore, r.totalScore),
    0
  );
  return sum / countable.length;
}

export function round1(n: number | null): number | null {
  if (n == null) return null;
  return Math.round(n * 10) / 10;
}

/**
 * RISING(성장왕) 성장폭 — 명세 §13.
 * 회차별 점수(%)를 시간순 정렬해 (뒤 절반 평균 − 앞 절반 평균)을 계산한다.
 * - 면제/결석은 제외, 응시 2회 이상만 대상(미만이면 null).
 * - 회차가 홀수면 가운데 1회는 앞/뒤 모두에서 빠진다(앞 half회 vs 뒤 half회).
 * 반환: growthDelta(점=백분율 포인트), recentAvg(뒤 절반 평균), attempts(대상 회차 수).
 */
export function computeGrowthDelta(records: ScoreRecord[]): {
  growthDelta: number;
  recentAvg: number;
  attempts: number;
} | null {
  const countable = sortChrono(records.filter((r) => !isExempt(r) && !isAbsent(r)));
  const n = countable.length;
  if (n < 2) return null;
  const scores = countable.map((r) => percentOf(r.actualScore, r.totalScore));
  const half = Math.floor(n / 2);
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const earlyAvg = avg(scores.slice(0, half));
  const recentAvg = avg(scores.slice(n - half));
  return {
    growthDelta: round1(recentAvg - earlyAvg) ?? 0,
    recentAvg: round1(recentAvg) ?? 0,
    attempts: n,
  };
}

/** 기록의 컷 표시 문자열 (절대 점수면 "51점", 백분율이면 "85%") */
export function cutLabel(r: { passMarkUsed?: number | null; thresholdUsed: number }): string {
  if (r.passMarkUsed != null) return `${r.passMarkUsed}점`;
  return `${r.thresholdUsed}%`;
}

/** 차트용 컷 백분율 (절대 점수 컷이면 점수/만점*100) */
export function cutPercent(r: {
  passMarkUsed?: number | null;
  thresholdUsed: number;
  totalScore: number;
}): number {
  if (r.passMarkUsed != null && r.totalScore > 0) {
    return Math.round((r.passMarkUsed / r.totalScore) * 1000) / 10;
  }
  return r.thresholdUsed;
}
