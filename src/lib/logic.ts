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

export function isActiveStudent(student: Pick<Student, "status">): boolean {
  return student.status !== "withdrawn";
}

export function isRewardRecord(record: ScoreRecord): boolean {
  return record.examDate >= REWARD_START_DATE && record.attemptType === "first";
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
  perfectCount: number; // 만점 횟수
  passCount: number; // 통과 횟수
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

export function computeStreaks(records: ScoreRecord[]): StreakStats {
  const ordered = sortChrono(records);
  let total = 0;
  let perfectCount = 0;
  let passCount = 0;
  let curPerfect = 0;
  let bestPerfect = 0;
  let curPass = 0;
  let bestPass = 0;
  let percentSum = 0;

  for (const r of ordered) {
    if (isExempt(r)) continue; // 면제: 연속을 끊지 않고 통째로 건너뜀
    total++;
    if (r.isPerfect) {
      perfectCount++;
      curPerfect++;
      if (curPerfect > bestPerfect) bestPerfect = curPerfect;
    } else {
      curPerfect = 0;
    }
    if (r.passed) {
      passCount++;
      curPass++;
      if (curPass > bestPass) bestPass = curPass;
    } else {
      curPass = 0;
    }
    percentSum += percentOf(r.actualScore, r.totalScore);
  }

  return {
    total,
    perfectCount,
    passCount,
    currentPerfectStreak: curPerfect,
    bestPerfectStreak: bestPerfect,
    currentPassStreak: curPass,
    bestPassStreak: bestPass,
    avgPercent: total ? percentSum / total : null,
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

/** 평균 백분율 (소수1) — 면제 제외 */
export function avgPercent(records: ScoreRecord[]): number | null {
  const countable = records.filter((r) => !isExempt(r));
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
