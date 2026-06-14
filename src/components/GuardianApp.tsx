"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AppStateHook, apiLogout } from "@/lib/client";
import { Card, EmptyState } from "./ui";
import CreatorFooter from "@/components/CreatorFooter";
import {
  avgPercent,
  computeGrowthDelta,
  cutPercent,
  defaultSeason,
  isAbsent,
  isDateInRange,
  isExempt,
  monthsWithData,
  percentOf,
  round1,
  SEASONS,
  seasonsWithData,
  sortChrono,
} from "@/lib/logic";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";

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

  const firstRecords = useMemo(
    () => db.records.filter((r) => r.status === "approved" && r.attemptType === "first"),
    [db.records]
  );
  const today = localDateKey();

  // 학기 탭(봄/여름) — 기록 있는 학기만. 기본은 기록 있는 가장 최근 학기.
  const seasonTabs = useMemo(() => seasonsWithData(SEASONS, firstRecords, today), [firstRecords, today]);
  const [seasonKey, setSeasonKey] = useState<string>("");
  const [month, setMonth] = useState<string>("all"); // "all" | "YYYY-MM"
  useEffect(() => {
    if (!seasonTabs.some((s) => s.key === seasonKey)) {
      setSeasonKey(defaultSeason(SEASONS, firstRecords, today)?.key ?? seasonTabs[0]?.key ?? "");
      setMonth("all");
    }
  }, [seasonTabs, firstRecords, today, seasonKey]);
  const season = seasonTabs.find((s) => s.key === seasonKey) ?? seasonTabs[0] ?? null;

  // 선택 학기 안의 월(기록 있는 달) 드롭다운
  const months = useMemo(
    () => (season ? monthsWithData(firstRecords, season.startDate, season.endDate) : []),
    [firstRecords, season]
  );
  useEffect(() => {
    if (month !== "all" && !months.some((m) => m.key === month)) setMonth("all");
  }, [months, month]);

  // 현재 조회 라벨(전체=학기명, 아니면 N월)
  const scopeLabel = month === "all" ? season?.label ?? "이번 학기" : `${Number(month.slice(5, 7))}월`;

  const data = useMemo(() => {
    const periodRecords = sortChrono(
      firstRecords.filter((r) => {
        if (!season) return false;
        if (!isDateInRange(r.examDate, season.startDate, season.endDate)) return false;
        if (month !== "all" && r.examDate.slice(0, 7) !== month) return false;
        return true;
      })
    );
    const countable = periodRecords.filter((r) => !isAbsent(r) && !isExempt(r));
    const passCount = countable.filter((r) => r.passed).length;
    const retryCount = countable.length - passCount;
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
      passed: r.passed,
    }));

    return {
      avg: round1(avgPercent(periodRecords)),
      attemptCount: countable.length,
      passCount,
      retryCount,
      growthDelta: growth?.growthDelta ?? null,
      cut,
      chart,
      records,
    };
  }, [firstRecords, season, month]);

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
            {scopeLabel} · {season ? rangeText(season.startDate, season.endDate) : "기간 집계 중"} · 단어시험
            {myClass?.name && (
              <span className="ml-1.5 rounded-md bg-[#eef1f6] px-2 py-0.5 text-[11px] font-bold text-lab-navy">
                {myClass.name}
              </span>
            )}
          </div>
        </div>

        {/* 학기 탭(봄/여름) + 월 드롭다운 */}
        {(seasonTabs.length > 1 || months.length > 1) && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {seasonTabs.length > 1 && (
              <div className="flex gap-1 rounded-full border border-lab-line bg-lab-paper p-1 shadow-lab-sm">
                {seasonTabs.map((s) => {
                  const on = s.key === season?.key;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => {
                        setSeasonKey(s.key);
                        setMonth("all");
                      }}
                      className={`min-w-[84px] rounded-full px-4 py-2 text-[13px] font-bold transition ${
                        on ? "bg-lab-navy text-white shadow-lab-sm" : "text-lab-muted hover:text-lab-navy"
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            )}
            {months.length > 1 && (
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                aria-label="월 선택"
                className="rounded-full border border-lab-line bg-lab-paper px-3.5 py-2 text-[13px] font-bold text-lab-navy shadow-lab-sm outline-none focus:border-lab-gold"
              >
                <option value="all">전체 ({season?.label ?? "학기"})</option>
                {months.map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* 요약 3카드 */}
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryCard accent="#2f4054" label={`${scopeLabel} 평균`} value={data.avg != null ? `${data.avg}` : "-"} unit="점"
            note={hasData ? `${data.attemptCount}회 응시 기준` : "응시 기록 없음"} />
          <SummaryCard accent="#6f8f78" label="통과 현황" value={`${data.passCount}`} unit={`/ ${data.attemptCount}회`}
            note={data.retryCount > 0 ? `재시험 ${data.retryCount}회` : hasData ? "전부 통과 중" : "응시 기록 없음"} />
          <SummaryCard accent="#a98249" label={`${scopeLabel} 성장`}
            value={data.growthDelta != null && data.growthDelta > 0 ? `+${data.growthDelta}` : data.growthDelta != null ? `${data.growthDelta}` : "-"}
            unit="점"
            note={data.growthDelta != null && data.growthDelta > 0 ? "초반 대비 상승" : "2회 이상 응시 시 집계"}
            noteUp={data.growthDelta != null && data.growthDelta > 0} />
        </div>

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

        <CreatorFooter className="mt-6" />
      </div>
    </div>
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
