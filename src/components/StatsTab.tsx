"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AppStateHook } from "@/lib/client";
import { Card, Field, Select, Badge, EmptyState, Stat } from "./ui";
import DatePicker from "./DatePicker";
import { ScoreRecord } from "@/lib/types";
import {
  ACHIEVEMENT_PERIODS,
  achievementRangeLabel,
  avgPercent,
  computeAchievementPeriodStats,
  computeStreaks,
  cutPercent,
  isActiveStudent,
  isAbsent,
  isDateInRange,
  isExempt,
  percentOf,
  resolveAchievementPeriods,
  round1,
  sortChrono,
  type AchievementPeriod,
} from "@/lib/logic";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

const SPRING_END_DATE = "2026-06-05";
const TODAY_KEY = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();
// 통계 기본 구간: 오늘이 속한 구간(없으면 첫 구간). 봄학기 구간 추가로 [0]이 봄학기가 되어도 교사는 현재 구간을 기본 선택.
const DEFAULT_ACHIEVEMENT_PERIOD =
  ACHIEVEMENT_PERIODS.find((p) => isDateInRange(TODAY_KEY, p.startDate, p.endDate)) ?? ACHIEVEMENT_PERIODS[0];

type StatsPeriod = "achievement" | "spring" | "all" | "custom";

export default function StatsTab({ app }: { app: AppStateHook }) {
  const { db } = app;
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [roundFilter, setRoundFilter] = useState<number | 0>(0); // 0 = 전체
  const [period, setPeriod] = useState<StatsPeriod>("achievement");
  const [achievementPeriodKey, setAchievementPeriodKey] = useState(DEFAULT_ACHIEVEMENT_PERIOD?.key ?? "");
  const [customStart, setCustomStart] = useState(DEFAULT_ACHIEVEMENT_PERIOD?.startDate ?? "");
  const [customEnd, setCustomEnd] = useState("");
  const achievementPeriods = useMemo(() => resolveAchievementPeriods(db.settings), [db.settings]);
  const achievementPeriod =
    achievementPeriods.find((item) => item.key === achievementPeriodKey) ?? achievementPeriods[0] ?? DEFAULT_ACHIEVEMENT_PERIOD;

  useEffect(() => {
    if (!achievementPeriods.some((item) => item.key === achievementPeriodKey)) {
      setAchievementPeriodKey(achievementPeriods[0]?.key ?? "");
    }
  }, [achievementPeriodKey, achievementPeriods]);

  const classRecords = useMemo(
    () =>
      db.records.filter(
        (r) =>
          r.status === "approved" &&
          (!classId || r.classId === classId) &&
          (roundFilter === 0 || r.round === roundFilter) &&
          recordMatchesPeriod(r, period, achievementPeriod, customStart, customEnd)
      ),
    [db.records, classId, roundFilter, period, achievementPeriod, customStart, customEnd]
  );

  const students = db.students.filter((s) => isActiveStudent(s) && (!classId || s.classId === classId));
  const rewardMode = period === "achievement";

  // 반/전체 요약 (면제 제외)
  const countableRecords = classRecords.filter((r) => !isExempt(r) && !isAbsent(r));
  const absentRecords = classRecords.filter((r) => isAbsent(r));
  const classAvg = round1(avgPercent(classRecords));
  const roundAvgs = [1, 2, 3].map((rd) => ({
    round: rd,
    avg: round1(avgPercent(classRecords.filter((r) => r.round === rd))),
    count: countableRecords.filter((r) => r.round === rd).length,
  }));

  // 추이: 날짜별 평균 (회독별 라인)
  const trend = useMemo(() => buildTrend(classRecords), [classRecords]);

  return (
    <div className="space-y-4">
      <Card title="통계 필터">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <Field label="통계 기간">
            <Select value={period} onChange={(e) => setPeriod(e.target.value as StatsPeriod)}>
              <option value="achievement">여름학기 성취 평가</option>
              <option value="spring">봄학기 (6/5까지)</option>
              <option value="all">전체 기간</option>
              <option value="custom">직접 지정</option>
            </Select>
          </Field>
          {rewardMode && (
            <Field label="성취 구간">
              <Select value={achievementPeriodKey} onChange={(e) => setAchievementPeriodKey(e.target.value)}>
                {achievementPeriods.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label} ({achievementRangeLabel(item)})
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="반">
            <Select
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setStudentId("");
              }}
            >
              <option value="">전체 반</option>
              {db.classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="회독">
            <Select value={roundFilter} onChange={(e) => setRoundFilter(Number(e.target.value))}>
              <option value={0}>전체 회독</option>
              <option value={1}>1회독</option>
              <option value={2}>2회독</option>
              <option value={3}>3회독</option>
            </Select>
          </Field>
          <Field label="학생 (상세)">
            <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">학생 선택</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="기준">
            <div className="rounded-xl border border-lab-line px-3 py-2.5 text-sm text-lab-muted bg-[#f1ede2]">
              {periodLabel(period, achievementPeriod, customStart, customEnd)}
            </div>
          </Field>
        </div>
        {period === "custom" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <Field label="시작일">
              <DatePicker value={customStart} onChange={setCustomStart} placeholder="처음부터" />
            </Field>
            <Field label="종료일">
              <DatePicker value={customEnd} onChange={setCustomEnd} placeholder="현재까지" />
            </Field>
          </div>
        )}
      </Card>

      {rewardMode && (
        <Card title="여름학기 성취 평가 기준">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="시즌" value="3개월" accent="indigo" sub="1개월씩 집계" />
            <Stat label="현재 구간" value={achievementPeriod.label} sub={achievementRangeLabel(achievementPeriod)} />
            <Stat label="성취 기준" value={`${achievementPeriod.passGoal}/${achievementPeriod.targetTests}회`} accent="green" sub="정규 시험 통과" />
            <Stat label="특별 상품" value="All Pass" accent="amber" sub={`${achievementPeriod.targetTests}회 전부 통과`} />
          </div>
        </Card>
      )}

      {/* 반/전체 요약 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="응시 수" value={countableRecords.length} accent="indigo" />
        <Stat label="결석" value={absentRecords.length} />
        <Stat label="전체 평균" value={classAvg != null ? `${classAvg}%` : "-"} accent="green" />
        {roundAvgs.map((r) => (
          <Stat
            key={r.round}
            label={`${r.round}회독 평균`}
            value={r.avg != null ? `${r.avg}%` : "-"}
            sub={`${r.count}건`}
          />
        ))}
      </div>

      {/* 추이 그래프 */}
      <Card title="평균 점수 추이 (회독별)">
        {trend.data.length === 0 ? (
          <EmptyState>표시할 데이터가 없습니다.</EmptyState>
        ) : (
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={trend.data} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e2d6" />
                <XAxis dataKey="date" fontSize={12} tickMargin={6} />
                <YAxis domain={[0, 100]} fontSize={12} unit="%" />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Legend />
                {trend.hasRound[1] && <Line type="monotone" dataKey="r1" name="1회독" stroke="#2f4054" strokeWidth={2} connectNulls dot={false} />}
                {trend.hasRound[2] && <Line type="monotone" dataKey="r2" name="2회독" stroke="#10b981" strokeWidth={2} connectNulls dot={false} />}
                {trend.hasRound[3] && <Line type="monotone" dataKey="r3" name="3회독" stroke="#f59e0b" strokeWidth={2} connectNulls dot={false} />}
                <Line type="monotone" dataKey="all" name="전체" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" connectNulls dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* 선생님 대시보드: 학생별 만점/통과/연속 */}
      <Card title={rewardMode ? "학생별 여름학기 성취" : "학생별 현황 (선생님용)"}>
        {students.length === 0 ? (
          <EmptyState>반을 선택하거나 학생을 등록하세요.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-left text-lab-muted border-b border-lab-line">
                  <th className="py-2 pr-3 font-medium">학생</th>
                  <th className="py-2 pr-3 font-medium">응시</th>
                  <th className="py-2 pr-3 font-medium">결석</th>
                  <th className="py-2 pr-3 font-medium">평균</th>
                  <th className="py-2 pr-3 font-medium">만점</th>
                  <th className="py-2 pr-3 font-medium">통과</th>
                  <th className="py-2 pr-3 font-medium">만점 연속</th>
                  <th className="py-2 pr-3 font-medium">통과 연속</th>
                  {rewardMode && <th className="py-2 pr-3 font-medium">성취</th>}
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const recs = classRecords.filter((r) => r.studentId === s.id);
                  const rewardStats = computeAchievementPeriodStats(recs, achievementPeriod);
                  const st = rewardMode ? rewardStats : computeStreaks(recs);
                  return (
                    <tr key={s.id} className="border-b border-lab-line">
                      <td className="py-2 pr-3 font-medium text-lab-ink">{s.name}</td>
                      <td className="py-2 pr-3 text-lab-muted">
                        {st.total - st.absentCount}{rewardMode ? ` / ${achievementPeriod.targetTests}` : ""}
                      </td>
                      <td className="py-2 pr-3 text-lab-muted">{st.absentCount}</td>
                      <td className="py-2 pr-3 text-lab-ink">{st.avgPercent != null ? `${round1(st.avgPercent)}%` : "-"}</td>
                      <td className="py-2 pr-3">
                        <Badge color="amber">{st.perfectCount}</Badge>
                      </td>
                      <td className="py-2 pr-3">
                        <Badge color="green">{st.passCount}{rewardMode ? ` / ${achievementPeriod.passGoal}` : ""}</Badge>
                      </td>
                      <td className="py-2 pr-3">
                        <span className="font-semibold text-amber-600">{st.currentPerfectStreak}</span>
                        <span className="text-[#bdb7a9]"> / 최고 {st.bestPerfectStreak}</span>
                      </td>
                      <td className="py-2 pr-3">
                        <span className="font-semibold text-green-600">{st.currentPassStreak}</span>
                        <span className="text-[#bdb7a9]"> / 최고 {st.bestPassStreak}</span>
                      </td>
                      {rewardMode && <td className="py-2 pr-3">{rewardBadge(rewardStats)}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 학생 상세 */}
      {studentId && (
        <StudentDetail
          app={app}
          studentId={studentId}
          classId={classId}
          roundFilter={roundFilter}
          period={period}
          achievementPeriod={achievementPeriod}
          customStart={customStart}
          customEnd={customEnd}
        />
      )}
    </div>
  );
}

function StudentDetail({
  app,
  studentId,
  classId,
  roundFilter,
  period,
  achievementPeriod,
  customStart,
  customEnd,
}: {
  app: AppStateHook;
  studentId: string;
  classId: string;
  roundFilter: number;
  period: StatsPeriod;
  achievementPeriod: AchievementPeriod;
  customStart: string;
  customEnd: string;
}) {
  const { db } = app;
  const student = db.students.find((s) => s.id === studentId);
  const recs = sortChrono(
    db.records.filter(
      (r) =>
        r.studentId === studentId &&
        r.status === "approved" &&
        (!classId || r.classId === classId) &&
        (roundFilter === 0 || r.round === roundFilter) &&
        recordMatchesPeriod(r, period, achievementPeriod, customStart, customEnd)
    )
  );
  const rewardMode = period === "achievement";
  const rewardStats = computeAchievementPeriodStats(recs, achievementPeriod);
  const st = rewardMode ? rewardStats : computeStreaks(recs);
  const data = recs
    .filter((r) => !isAbsent(r))
    .map((r, i) => ({
      idx: i + 1,
      label: `${r.examDate.slice(5)}${r.retestNo > 0 ? "(재)" : ""}`,
      pct: round1(percentOf(r.actualScore, r.totalScore)),
      cut: cutPercent(r),
    }));

  return (
    <Card title={`${student?.name} 상세 추이`}>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        <Stat label="응시" value={rewardMode ? `${st.total}/${achievementPeriod.targetTests}` : st.total} />
        <Stat label="평균" value={st.avgPercent != null ? `${round1(st.avgPercent)}%` : "-"} accent="green" />
        <Stat label="만점 횟수" value={st.perfectCount} accent="amber" sub={`최고연속 ${st.bestPerfectStreak}`} />
        <Stat label="통과 횟수" value={rewardMode ? `${st.passCount}/${achievementPeriod.passGoal}` : st.passCount} accent="green" sub={`최고연속 ${st.bestPassStreak}`} />
        <Stat label={rewardMode ? "성취" : "현재 연속"} value={rewardMode ? rewardText(rewardStats) : `${st.currentPassStreak}`} accent="indigo" sub={rewardMode ? `연속통과 ${st.currentPassStreak}` : `만점연속 ${st.currentPerfectStreak}`} />
      </div>
      {data.length === 0 ? (
        <EmptyState>데이터가 없습니다.</EmptyState>
      ) : (
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e2d6" />
              <XAxis dataKey="label" fontSize={12} tickMargin={6} />
              <YAxis domain={[0, 100]} fontSize={12} unit="%" />
              <Tooltip formatter={(v: number) => `${v}%`} />
              <Line type="monotone" dataKey="pct" name="점수" stroke="#2f4054" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="cut" name="통과컷" stroke="#f43f5e" strokeWidth={1} strokeDasharray="4 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

interface TrendPoint {
  date: string;
  r1: number | null;
  r2: number | null;
  r3: number | null;
  all: number | null;
}

function recordMatchesPeriod(
  record: ScoreRecord,
  period: StatsPeriod,
  achievementPeriod: AchievementPeriod,
  customStart: string,
  customEnd: string
): boolean {
  if (period === "achievement") {
    return record.attemptType === "first" && isDateInRange(record.examDate, achievementPeriod.startDate, achievementPeriod.endDate);
  }
  if (period === "spring") {
    return record.examDate <= SPRING_END_DATE;
  }
  if (period === "custom") {
    return (!customStart || record.examDate >= customStart) && (!customEnd || record.examDate <= customEnd);
  }
  return true;
}

function periodLabel(
  period: StatsPeriod,
  achievementPeriod: AchievementPeriod,
  customStart: string,
  customEnd: string
): string {
  if (period === "achievement") {
    return `${achievementPeriod.seasonLabel} · ${achievementPeriod.label} · ${achievementRangeLabel(achievementPeriod)} · 정규 시험만`;
  }
  if (period === "spring") return "2026.06.05까지 · 기존 봄학기";
  if (period === "custom") {
    const start = customStart || "처음";
    const end = customEnd || "현재";
    return `${start} ~ ${end}`;
  }
  return "전체 기록";
}

function rewardText(st: ReturnType<typeof computeAchievementPeriodStats>): string {
  if (st.total >= st.targetTests && st.passCount >= st.targetTests) return "All Pass";
  if (st.earnedReward) return "달성";
  if (!st.projectedEligible) return "어려움";
  return `${st.remainingPasses}회 남음`;
}

function rewardBadge(st: ReturnType<typeof computeAchievementPeriodStats>) {
  if (st.total >= st.targetTests && st.passCount >= st.targetTests) {
    return <Badge color="amber">All Pass 특별 상품</Badge>;
  }
  if (st.earnedReward) return <Badge color="green">성취 달성</Badge>;
  if (!st.projectedEligible) return <Badge color="red">달성 어려움</Badge>;
  return <Badge color="indigo">통과 {st.remainingPasses}회 남음</Badge>;
}

function buildTrend(records: ScoreRecord[]): {
  data: TrendPoint[];
  hasRound: Record<number, boolean>;
} {
  const byDate = new Map<string, ScoreRecord[]>();
  for (const r of records) {
    if (!byDate.has(r.examDate)) byDate.set(r.examDate, []);
    byDate.get(r.examDate)!.push(r);
  }
  const dates = [...byDate.keys()].sort();
  const hasRound: Record<number, boolean> = { 1: false, 2: false, 3: false };
  const data: TrendPoint[] = dates.map((date) => {
    const recs = byDate.get(date)!;
    const roundAvg = (rd: number) => {
      const sub = recs.filter((r) => r.round === rd && !isAbsent(r));
      if (!sub.length) return null;
      hasRound[rd] = true;
      return round1(avgPercent(sub));
    };
    return {
      date: date.slice(5),
      r1: roundAvg(1),
      r2: roundAvg(2),
      r3: roundAvg(3),
      all: round1(avgPercent(recs)),
    };
  });
  return { data, hasRound };
}
