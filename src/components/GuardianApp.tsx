"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AppStateHook, apiLogout } from "@/lib/client";
import type { MonthlyResult, MonthlyTest } from "@/lib/types";
import { Card, EmptyState } from "./ui";
import { NoticeBoard, HomeworkBoard } from "./BoardCards";
import CreatorFooter from "@/components/CreatorFooter";
import {
  avgPercent,
  computeGrowthDelta,
  cutPercent,
  defaultPeriodForView,
  groupBySeason,
  isAbsent,
  isDateInRange,
  isExempt,
  isMainPass,
  isRetestPass,
  monthlyMaxTotal,
  monthlyPercent,
  monthlyTotal,
  percentOf,
  resolveAchievementPeriods,
  round1,
  seasonGroupHasData,
  seasonRange,
  sortChrono,
} from "@/lib/logic";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";

type GuardianMonthlyReport = { test: MonthlyTest; result: MonthlyResult };

function localDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function rangeText(start: string, end: string): string {
  const f = (d: string) => {
    const [, m, day] = d.split("-");
    return `${Number(m)}/${Number(day)}`;
  };
  return `${f(start)}~${f(end)}`;
}

export default function GuardianApp({ app }: { app: AppStateHook }) {
  const { db } = app;
  const child = db.students[0];
  const myClass = db.classes[0];

  const periods = useMemo(() => resolveAchievementPeriods(db.settings), [db.settings]);
  const firstRecords = useMemo(
    () => db.records.filter((r) => r.status === "approved" && r.attemptType === "first"),
    [db.records]
  );
  const today = localDateKey();

  // 학기 그룹(봄/여름) — 기록 있는 학기만. 월 경계는 관리의 개강일/종강일(성취 구간) 기준.
  const allGroups = useMemo(() => groupBySeason(periods), [periods]);
  const groups = useMemo(() => {
    const withData = allGroups.filter((g) => seasonGroupHasData(g, firstRecords, today));
    return withData.length ? withData : allGroups.slice(0, 1);
  }, [allGroups, firstRecords, today]);
  const defaultPeriod = useMemo(
    () => defaultPeriodForView(periods, firstRecords, today),
    [periods, firstRecords, today]
  );

  const [seasonLabel, setSeasonLabel] = useState<string>("");
  const [periodKey, setPeriodKey] = useState<string>("all"); // "all" | period.key
  const [scoreView, setScoreView] = useState<"word" | "monthly">("word");
  useEffect(() => {
    if (!groups.some((g) => g.seasonLabel === seasonLabel)) {
      setSeasonLabel(defaultPeriod?.seasonLabel ?? groups[0]?.seasonLabel ?? "");
      setPeriodKey("all");
    }
  }, [groups, defaultPeriod, seasonLabel]);
  const group = groups.find((g) => g.seasonLabel === seasonLabel) ?? groups[0] ?? null;

  // periodKey가 현재 학기에 없으면 전체로
  useEffect(() => {
    if (periodKey !== "all" && group && !group.periods.some((p) => p.key === periodKey)) setPeriodKey("all");
  }, [group, periodKey]);

  // 조회 대상 구간(전체=학기 내 모든 구간, 아니면 선택 구간 1개)
  const activePeriods = useMemo(() => {
    if (!group) return [];
    return periodKey === "all" ? group.periods : group.periods.filter((p) => p.key === periodKey);
  }, [group, periodKey]);

  const monthlyReports = useMemo(() => {
    const inScope = (date: string) => activePeriods.some((p) => isDateInRange(date, p.startDate, p.endDate));
    return [...db.monthlyTests]
      .filter((test) => inScope(test.date))
      .map((test) => ({
        test,
        result: db.monthlyResults.find((result) => result.monthlyTestId === test.id) ?? null,
      }))
      .filter((item): item is GuardianMonthlyReport => item.result !== null)
      .sort((a, b) => b.test.date.localeCompare(a.test.date));
  }, [activePeriods, db.monthlyResults, db.monthlyTests]);

  const selectedPeriod = group?.periods.find((p) => p.key === periodKey) ?? null;
  const scopeLabel = periodKey === "all" ? group?.seasonLabel ?? "이번 학기" : selectedPeriod?.label ?? "";
  const metaRange =
    group && (periodKey === "all" ? seasonRange(group) : selectedPeriod ?? seasonRange(group));

  const data = useMemo(() => {
    const inScope = (r: { examDate: string }) =>
      activePeriods.some((p) => isDateInRange(r.examDate, p.startDate, p.endDate));
    const periodRecords = sortChrono(firstRecords.filter(inScope));
    const countable = periodRecords.filter((r) => !isAbsent(r) && !isExempt(r));
    const mainPassCount = countable.filter((r) => isMainPass(r)).length;
    const failCount = countable.length - mainPassCount; // 본시험 미통과(응시 기준)
    // 재시험 통과: 재시험 응시 기록 포함, 구간 내 전체 승인 기록 기준
    const retestPassCount = db.records.filter(
      (r) => r.status === "approved" && inScope(r) && isRetestPass(r)
    ).length;
    const growth = computeGrowthDelta(periodRecords);
    const cut = countable.length ? Math.round(cutPercent(countable[countable.length - 1])) : 80;

    const chart = countable.map((r, i) => ({
      label: `${i + 1}회`,
      score: round1(percentOf(r.actualScore, r.totalScore)) ?? 0,
    }));
    const records = [...countable].reverse().map((r, idx) => ({
      id: r.id,
      round: countable.length - idx,
      score: round1(percentOf(r.actualScore, r.totalScore)) ?? 0,
      passed: isMainPass(r),
    }));

    return {
      avg: round1(avgPercent(periodRecords)),
      attemptCount: countable.length,
      mainPassCount,
      failCount,
      retestPassCount,
      growthDelta: growth?.growthDelta ?? null,
      cut,
      chart,
      records,
    };
  }, [firstRecords, activePeriods, db.records]);

  async function logout() {
    await apiLogout();
    app.reload();
  }

  const hasData = data.attemptCount > 0;
  const headline =
    !hasData
      ? `${child?.name ?? "자녀"} 학생, 아직 이 기간 기록이 없어요`
      : data.growthDelta && data.growthDelta > 0
      ? `${child?.name ?? "자녀"} 학생, 꾸준히 성장하고 있어요`
      : `${child?.name ?? "자녀"} 학생, 잘 따라오고 있어요`;

  return (
    <div className="min-h-screen bg-lab-page px-4 pb-12 pt-6 sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        {/* 상단바 */}
        <div className="mb-6 flex items-center gap-3">
          <div className="text-[11px] font-bold tracking-[0.16em] text-lab-muted">
            SYSTEM BY <b className="font-serif text-lab-navy">LINDSAY LAB</b>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-lab-line bg-lab-paper px-3.5 py-1.5 text-[13px] font-bold text-lab-navy shadow-lab-sm">
              <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-[#7a817c] text-[11px] font-bold text-white">
                {child?.name?.slice(0, 1) ?? "?"}
              </span>
              {child?.name ?? "자녀"}
              {myClass?.name && <span className="text-[11px] font-medium text-lab-muted">{myClass.name}</span>}
            </span>
            <button
              onClick={logout}
              className="rounded-full border border-lab-line px-3.5 py-2 text-[12.5px] font-medium text-lab-muted transition hover:text-lab-navy"
            >
              로그아웃
            </button>
          </div>
        </div>

        {/* 인사 */}
        <div className="mb-5">
          <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-lab-gold">보호자 리포트</div>
          <h1 className="mt-2 font-serif text-[24px] font-bold leading-snug text-lab-navy">{headline}</h1>
          <div className="mt-1.5 text-[13px] text-lab-muted">
            {scopeLabel} · {metaRange ? rangeText(metaRange.startDate, metaRange.endDate) : "기간 집계 중"} · 단어시험
            {myClass?.name && (
              <span className="ml-1.5 rounded-md bg-[#eef1f6] px-2 py-0.5 text-[11px] font-bold text-lab-navy">
                {myClass.name}
              </span>
            )}
          </div>
        </div>

        {/* 학기 탭(봄/여름) + 구간(개월차) 드롭다운 */}
        {(groups.length > 1 || (group?.periods.length ?? 0) > 1) && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {groups.length > 1 && (
              <div className="flex gap-1 rounded-full border border-lab-line bg-lab-paper p-1 shadow-lab-sm">
                {groups.map((g) => {
                  const on = g.seasonLabel === group?.seasonLabel;
                  return (
                    <button
                      key={g.seasonLabel}
                      type="button"
                      onClick={() => {
                        setSeasonLabel(g.seasonLabel);
                        setPeriodKey("all");
                      }}
                      className={`min-w-[84px] rounded-full px-4 py-2 text-[13px] font-bold transition ${
                        on ? "bg-lab-navy text-white shadow-lab-sm" : "text-lab-muted hover:text-lab-navy"
                      }`}
                    >
                      {g.seasonLabel}
                    </button>
                  );
                })}
              </div>
            )}
            {(group?.periods.length ?? 0) > 1 && (
              <select
                value={periodKey}
                onChange={(e) => setPeriodKey(e.target.value)}
                aria-label="구간 선택"
                className="rounded-full border border-lab-line bg-lab-paper px-3.5 py-2 text-[13px] font-bold text-lab-navy shadow-lab-sm outline-none focus:border-lab-gold"
              >
                <option value="all">전체 ({group?.seasonLabel ?? "학기"})</option>
                {group?.periods.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            )}
          </div>
        )}

        <div className="mb-4 grid grid-cols-2 gap-1 rounded-full border border-lab-line bg-lab-paper p-1 shadow-lab-sm">
          {[
            { key: "word", label: "단어 성적" },
            { key: "monthly", label: "먼슬리 성적" },
          ].map((item) => {
            const on = scoreView === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setScoreView(item.key as "word" | "monthly")}
                className={`rounded-full px-4 py-2.5 text-[13px] font-bold transition ${
                  on ? "bg-lab-navy text-white shadow-lab-sm" : "text-lab-muted hover:text-lab-navy"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* 요약 3카드 */}
        {scoreView === "word" && (
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SummaryCard accent="#2f4054" label={`${scopeLabel} 평균`} value={data.avg != null ? `${data.avg}` : "-"} unit="점"
              note={hasData ? `${data.attemptCount}회 응시 기준` : "응시 기록 없음"} />
            <SummaryCard accent="#6f8f78" label="본시험 통과" value={`${data.mainPassCount}`} unit={`/ ${data.attemptCount}회`}
              note={
                !hasData
                  ? "응시 기록 없음"
                  : data.retestPassCount > 0
                  ? `재시험 통과 ${data.retestPassCount}회`
                  : data.failCount > 0
                  ? `미통과 ${data.failCount}회`
                  : "전부 통과"
              } />
            <SummaryCard accent="#a98249" label={`${scopeLabel} 성장`}
              value={data.growthDelta != null && data.growthDelta > 0 ? `+${data.growthDelta}` : data.growthDelta != null ? `${data.growthDelta}` : "-"}
              unit="점"
              note={data.growthDelta != null && data.growthDelta > 0 ? "초반 대비 상승" : "2회 이상 응시 시 집계"}
              noteUp={data.growthDelta != null && data.growthDelta > 0} />
          </div>
        )}

        {scoreView === "monthly" && (
          <GuardianMonthlyResults reports={monthlyReports} />
        )}

        {/* 학원 공지 · 숙제 */}
        {db.notices.length > 0 && (
          <div className="mb-4">
            <NoticeBoard notices={db.notices} />
          </div>
        )}
        <div className="mb-4">
          <HomeworkBoard homeworks={db.homeworks} />
        </div>

        {scoreView === "word" && (
          <>
            {/* 성장 추이 */}
            <Card
              title="성장 추이"
              right={<span className="text-[11.5px] text-lab-muted">단어시험 회차별 점수</span>}
            >
              {data.chart.length === 0 ? (
                <EmptyState>아직 이번 달 시험 기록이 없어요.</EmptyState>
              ) : (
                <>
                  <div style={{ width: "100%", height: 260 }}>
                    <ResponsiveContainer>
                      <LineChart data={data.chart} margin={{ top: 12, right: 18, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e8e2d6" />
                        <XAxis dataKey="label" fontSize={11} tickMargin={6} stroke="#9b9486" />
                        <YAxis domain={[0, 100]} fontSize={11} unit="점" stroke="#9b9486" />
                        <Tooltip
                          formatter={(v: number) => [`${v}점`, "점수"]}
                          contentStyle={{ borderRadius: 12, border: "1px solid #e3ded3", fontSize: 12 }}
                        />
                        <ReferenceLine
                          y={data.cut}
                          stroke="#a98249"
                          strokeDasharray="5 5"
                          strokeWidth={1.5}
                          label={{ value: `통과 기준 ${data.cut}점`, position: "insideTopRight", fontSize: 10, fill: "#a98249" }}
                        />
                        <Line
                          type="monotone"
                          dataKey="score"
                          stroke="#2f4054"
                          strokeWidth={2.5}
                          dot={{ r: 3.5, fill: "#fff", stroke: "#2f4054", strokeWidth: 2 }}
                          activeDot={{ r: 5, fill: "#a98249", stroke: "#a98249" }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 flex gap-4 text-[11px] text-lab-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-0 w-4 border-t-2 border-lab-navy" /> 회차별 점수
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-0 w-4 border-t-2 border-dashed border-lab-gold" /> 통과 기준선
                    </span>
                  </div>
                </>
              )}
            </Card>

            {/* 회차별 기록 */}
            <Card title="회차별 기록" right={<span className="text-[11.5px] text-lab-muted">최근 → 과거</span>}>
              {data.records.length === 0 ? (
                <EmptyState>표시할 기록이 없어요.</EmptyState>
              ) : (
                <ul>
                  {data.records.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 border-b border-[#f1ede2] py-3 last:border-b-0">
                      <div className="w-11 shrink-0 text-[11.5px] font-bold text-lab-muted">{r.round}회</div>
                      <div className="flex-1">
                        <div className="flex items-baseline justify-between">
                          <b className="text-[14px] text-lab-ink">{r.score}점</b>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ${
                              r.passed ? "bg-lab-green-soft text-lab-green" : "bg-[#f6efe0] text-[#b08a4f]"
                            }`}
                          >
                            {r.passed ? "통과" : "재시험"}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-[#efeadd]">
                          <span
                            className="block h-full rounded"
                            style={{ width: `${Math.max(0, Math.min(100, r.score))}%`, background: r.passed ? "#6f8f78" : "#b08a4f" }}
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}

        <CreatorFooter className="mt-6" />
      </div>
    </div>
  );
}

function GuardianMonthlyResults({ reports }: { reports: GuardianMonthlyReport[] }) {
  return (
    <Card title="먼슬리 성적" right={<span className="text-[11.5px] text-lab-muted">과목별 점수 · 반 평균</span>}>
      {reports.length === 0 ? (
        <EmptyState>선택한 기간에 표시할 먼슬리 성적이 없어요.</EmptyState>
      ) : (
        <div className="space-y-3">
          {reports.map(({ test, result }) => {
            const total = monthlyTotal(result.scores, test);
            const max = monthlyMaxTotal(test);
            const pct = round1(monthlyPercent(result.scores, test));
            const averages = new Map((test.classStat?.sectionAverages ?? []).map((avg) => [avg.key, avg]));

            return (
              <div key={test.id} className="rounded-2xl border border-lab-line bg-lab-paper px-4 py-3 shadow-lab-sm">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-[15px] font-extrabold text-lab-ink">{test.name}</div>
                    <div className="mt-0.5 text-[12px] font-medium text-lab-muted">{test.date}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-[#eef1f6] px-3 py-1 text-[12px] font-bold text-lab-navy">
                      총점 {round1(total)} / {max}
                    </span>
                    <span className="rounded-full bg-lab-green-soft px-3 py-1 text-[12px] font-bold text-lab-green">
                      백점환산 {pct}점
                    </span>
                    {test.classStat && (
                      <span className="rounded-full bg-[#f1ede2] px-3 py-1 text-[12px] font-bold text-lab-muted">
                        반 평균 {test.classStat.avgPercent}점
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {test.sections.map((section) => {
                    const score = result.scores[section.key];
                    const avg = averages.get(section.key);
                    return (
                      <div key={section.key} className="rounded-xl border border-[#e8e2d6] bg-white/65 px-3 py-2.5">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="truncate text-[12px] font-bold text-lab-muted">{section.label}</span>
                          <span className="shrink-0 text-[11px] text-lab-muted">/{section.maxScore}</span>
                        </div>
                        <div className="flex items-end justify-between gap-3">
                          <div>
                            <div className="font-serif text-[24px] font-bold leading-none text-lab-ink">
                              {typeof score === "number" ? round1(score) : "-"}
                            </div>
                            <div className="mt-1 text-[11px] font-medium text-lab-muted">학생 점수</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[13px] font-extrabold text-lab-navy">
                              {avg?.avgScore != null ? `${avg.avgScore}점` : "-"}
                            </div>
                            <div className="mt-1 text-[11px] font-medium text-lab-muted">
                              반 평균{avg?.count ? ` · ${avg.count}명` : ""}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function SummaryCard({
  accent,
  label,
  value,
  unit,
  note,
  noteUp,
}: {
  accent: string;
  label: string;
  value: string;
  unit?: string;
  note: string;
  noteUp?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-lab-line bg-lab-paper p-[18px] shadow-lab-sm">
      <span className="absolute left-0 top-0 h-full w-1 opacity-80" style={{ background: accent }} />
      <div className="text-[11.5px] font-bold text-lab-muted">{label}</div>
      <div className="mt-2 font-serif text-[27px] font-bold leading-none text-lab-ink">
        {value}
        {unit && <small className="ml-1 text-[14px] font-medium text-lab-muted">{unit}</small>}
      </div>
      <div className={`mt-2 text-[11.5px] ${noteUp ? "font-bold text-lab-green" : "text-lab-muted"}`}>
        {noteUp && "▲ "}
        {note}
      </div>
    </div>
  );
}
