"use client";

import React, { useMemo, useState } from "react";
import { AppStateHook, apiChangePassword, apiLogout } from "@/lib/client";
import { Button, Card, Badge, EmptyState, Stat, Modal, Field, Input } from "./ui";
import {
  achievementRangeLabel,
  computeAchievementPeriodStats,
  computeStreaks,
  isDateInRange,
  percentOf,
  round1,
  sortChrono,
  cutLabel,
  cutPercent,
  monthlyTotal,
  monthlyMaxTotal,
  monthlyPercent,
  resolveAchievementPeriods,
  type AchievementPeriod,
} from "@/lib/logic";
import { formatDateTime, relativeFromNow } from "@/lib/datetime";
import { recordLessonLabel } from "@/lib/course";
import { ScoreRecord } from "@/lib/types";
import RetestScheduler from "./RetestScheduler";
import StudentReport, { StudentReportMonth } from "./StudentReport";
import CreatorFooter from "@/components/CreatorFooter";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

function formatKoreanDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
}

function convertedScore(record: ScoreRecord): number {
  return round1(percentOf(record.actualScore, record.totalScore)) ?? 0;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return round1(values.reduce((sum, value) => sum + value, 0) / values.length) ?? 0;
}

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function periodsForReports(records: ScoreRecord[], periods: AchievementPeriod[]): AchievementPeriod[] {
  const today = localDateKey();
  const activePeriods = periods.filter(
    (period) =>
      isDateInRange(today, period.startDate, period.endDate) ||
      records.some((record) => isDateInRange(record.examDate, period.startDate, period.endDate))
  );
  return activePeriods.length ? activePeriods : periods.slice(0, 1);
}

export default function StudentApp({ app }: { app: AppStateHook }) {
  const { db, user } = app;
  const me = db.students[0];
  const myClass = db.classes[0];

  const [retestFor, setRetestFor] = useState<ScoreRecord | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [activeTab, setActiveTab] = useState<"word" | "monthly">("word");

  const records = db.records;
  const monthlyResults = [...db.monthlyTests]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((t) => {
      const res = db.monthlyResults.find((r) => r.monthlyTestId === t.id);
      return res ? { test: t, result: res } : null;
    })
    .filter((item): item is NonNullable<typeof item> => !!item);
  const stats = computeStreaks(records);
  const ordered = sortChrono(records);
  const achievementPeriods = useMemo(() => resolveAchievementPeriods(db.settings), [db.settings]);
  const wordReports = useMemo<StudentReportMonth[]>(() => {
    const approvedRegularRecords = records.filter(
      (record) => record.status === "approved" && record.attemptType === "first"
    );
    const reportPeriods = periodsForReports(approvedRegularRecords, achievementPeriods);
    const averageByPeriod = new Map<string, number>();

    for (const period of reportPeriods) {
      const periodRecords = approvedRegularRecords.filter((record) =>
        isDateInRange(record.examDate, period.startDate, period.endDate)
      );
      averageByPeriod.set(period.key, average(periodRecords.filter((record) => !record.isAbsent).map(convertedScore)));
    }

    return reportPeriods.map((period, index) => {
        const periodRecords = approvedRegularRecords
          .filter((record) => isDateInRange(record.examDate, period.startDate, period.endDate))
          .sort(
          (a, b) => a.examDate.localeCompare(b.examDate) || a.createdAt.localeCompare(b.createdAt)
        );
        const previousPeriod = reportPeriods[index - 1];
        const previousPeriodHasRecords = previousPeriod
          ? approvedRegularRecords.some((record) => isDateInRange(record.examDate, previousPeriod.startDate, previousPeriod.endDate))
          : false;
        const reward = computeAchievementPeriodStats(approvedRegularRecords, period);
        const avg = average(periodRecords.filter((record) => !record.isAbsent).map(convertedScore));

        return {
          key: period.key,
          label: period.label,
          studentName: me?.name ?? "학생",
          seasonLabel: period.seasonLabel,
          rangeLabel: achievementRangeLabel(period),
          passRate: reward.total ? Math.round((reward.passCount / reward.total) * 100) : 0,
          averageScore: avg,
          previousAverageScore: previousPeriod && previousPeriodHasRecords ? averageByPeriod.get(previousPeriod.key) ?? avg : avg,
          targetTests: reward.targetTests,
          passGoal: reward.passGoal,
          totalTests: reward.total,
          passCount: reward.passCount,
          remainingPasses: reward.remainingPasses,
          currentPassStreak: reward.currentPassStreak,
          bestPassStreak: reward.bestPassStreak,
          currentPerfectStreak: reward.currentPerfectStreak,
          bestPerfectStreak: reward.bestPerfectStreak,
          earnedReward: reward.earnedReward,
          projectedEligible: reward.projectedEligible,
          allPassBonusEarned: reward.total >= reward.targetTests && reward.passCount >= reward.targetTests,
          trend: periodRecords
            .filter((record) => !record.isAbsent)
            .map((record) => ({
              label: record.examDate.slice(5).replace("-", "/"),
              score: convertedScore(record),
            })),
          history: [...periodRecords]
            .reverse()
            .map((record) => ({
              id: record.id,
              title: `${record.bookTitle} · ${recordLessonLabel(record)}`,
              date: formatKoreanDate(record.examDate),
              score: convertedScore(record),
              maxScore: 100,
              status: record.isAbsent ? "absent" : record.passed ? "pass" : "retest",
            })),
        };
      });
  }, [achievementPeriods, me?.name, records]);

  // 재시험 관련 분류
  const scheduledRetests = db.retests
    .filter((r) => r.status === "scheduled")
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  const needScheduling = records.filter(
    (r) =>
      !r.isAbsent &&
      !r.passed &&
      !db.retests.some(
        (rt) =>
          rt.scoreRecordId === r.id &&
          (rt.status === "scheduled" || rt.status === "completed")
      )
  );

  const trend = ordered
    .filter((r) => !r.isAbsent)
    .map((r) => ({
      label: `${r.examDate.slice(5)}${r.retestNo > 0 ? "(재)" : ""}`,
      pct: round1(percentOf(r.actualScore, r.totalScore)),
      cut: cutPercent(r),
    }));

  return (
    <div className="min-h-screen pb-10">
      <header className="bg-lab-paper border-b border-lab-line sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🧑‍🎓</span>
            <div>
              <h1 className="font-serif font-bold text-lab-navy leading-tight">{me?.name} 님</h1>
              <p className="text-xs text-lab-muted">{myClass?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setShowPw(true)}>비밀번호 변경</Button>
            <Button size="sm" variant="ghost" onClick={async () => { await apiLogout(); app.reload(); }}>로그아웃</Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        {user?.mustChangePassword && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3 flex items-center justify-between">
            <span>보안을 위해 비밀번호를 변경해 주세요.</span>
            <Button size="sm" variant="soft" onClick={() => setShowPw(true)}>변경하기</Button>
          </div>
        )}

        <div className="grid grid-cols-2 rounded-xl border border-lab-line bg-[#e9e3d6] p-1">
          <button
            type="button"
            onClick={() => setActiveTab("word")}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              activeTab === "word" ? "bg-lab-paper text-brand-700 shadow-lab-sm" : "text-lab-muted hover:text-lab-navy"
            }`}
          >
            단어시험
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("monthly")}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              activeTab === "monthly" ? "bg-lab-paper text-brand-700 shadow-lab-sm" : "text-lab-muted hover:text-lab-navy"
            }`}
          >
            먼슬리
          </button>
        </div>

        {activeTab === "word" && (
          <>
            {wordReports.length > 0 && (
              <StudentReport
                reports={wordReports}
                embedded
                className="rounded-3xl border border-lab-line bg-lab-page px-3 py-4 shadow-lab-sm"
              />
            )}

            {/* 요약 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="응시" value={stats.total} accent="indigo" />
              <Stat label="평균" value={stats.avgPercent != null ? `${round1(stats.avgPercent)}%` : "-"} accent="green" />
              <Stat label="통과" value={stats.passCount} accent="green" sub={`연속 ${stats.currentPassStreak}`} />
              <Stat label="만점" value={stats.perfectCount} accent="amber" sub={`연속 ${stats.currentPerfectStreak}`} />
            </div>

            {/* 재시험 필요 */}
            {needScheduling.length > 0 && (
              <Card title="재시험을 예약하세요">
                <ul className="space-y-2">
                  {needScheduling.map((r) => (
                    <li key={r.id} className="flex items-center justify-between rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                      <div className="text-sm">
                        <div className="font-medium text-gray-800">{r.bookTitle}</div>
                        <div className="text-gray-500">
                          {recordLessonLabel(r)} · {r.actualScore}/{r.totalScore} · 컷 {cutLabel(r)} 미달
                        </div>
                      </div>
                      <Button size="sm" onClick={() => setRetestFor(r)}>재시험 예약</Button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* 예약된 재시험 */}
            <Card title={`예약된 재시험 (${scheduledRetests.length})`}>
              {scheduledRetests.length === 0 ? (
                <EmptyState>예약된 재시험이 없습니다.</EmptyState>
              ) : (
                <ul className="space-y-2">
                  {scheduledRetests.map((rt) => {
                    const origin = db.records.find((r) => r.id === rt.scoreRecordId);
                    const soon = new Date(rt.scheduledAt).getTime() - Date.now() < 2 * 3600 * 1000;
                    const past = new Date(rt.scheduledAt).getTime() < Date.now();
                    return (
                      <li key={rt.id} className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3">
                        <div className="text-sm">
                          <div className="font-medium text-gray-800">{formatDateTime(rt.scheduledAt)}</div>
                          <div className="text-gray-500">{origin ? `${origin.bookTitle} · ${recordLessonLabel(origin)}` : ""}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge color={past ? "red" : soon ? "amber" : "blue"}>{relativeFromNow(rt.scheduledAt)}</Badge>
                          <Button size="sm" variant="ghost" onClick={async () => {
                            if (confirm("이 재시험 예약을 취소할까요?")) await app.run({ type: "cancelRetest", id: rt.id });
                          }}>취소</Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="text-xs text-gray-400 mt-3">
                ※ 예약 24시간 전·2시간 전 알림은 추후 휴대폰 푸시로 제공됩니다. (현재는 일정·남은시간 표시)
              </p>
            </Card>

            {/* 추이 */}
            {trend.length > 0 && (
              <Card title="내 점수 추이">
                <div style={{ width: "100%", height: 240 }}>
                  <ResponsiveContainer>
                    <LineChart data={trend} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" />
                      <XAxis dataKey="label" fontSize={12} tickMargin={6} />
                      <YAxis domain={[0, 100]} fontSize={12} unit="%" />
                      <Tooltip formatter={(v: number) => `${v}%`} />
                      <Line type="monotone" dataKey="pct" name="점수" stroke="#4f46e5" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="cut" name="통과컷" stroke="#f43f5e" strokeWidth={1} strokeDasharray="4 4" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}

            {/* 내 성적 */}
            <Card title="내 성적">
              {records.length === 0 ? (
                <EmptyState>아직 등록된 성적이 없습니다.</EmptyState>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-400 border-b border-gray-100">
                        <th className="py-2 pr-3 font-medium">날짜</th>
                        <th className="py-2 pr-3 font-medium">책</th>
                        <th className="py-2 pr-3 font-medium">회독</th>
                        <th className="py-2 pr-3 font-medium">점수</th>
                        <th className="py-2 font-medium">판정</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...records].sort((a, b) => `${b.examDate}${b.createdAt}`.localeCompare(`${a.examDate}${a.createdAt}`)).map((r) => (
                        <tr key={r.id} className="border-b border-gray-50">
                          <td className="py-2 pr-3 text-gray-500">{r.examDate.slice(5)}</td>
                          <td className="py-2 pr-3 text-gray-700">{r.bookTitle}</td>
                          <td className="py-2 pr-3 text-gray-500">{recordLessonLabel(r)}{r.retestNo > 0 ? ` · 재${r.retestNo}` : ""}</td>
                          <td className="py-2 pr-3 text-gray-700">{r.isAbsent ? "결석" : `${r.actualScore}/${r.totalScore}`}</td>
                          <td className="py-2">
                            {r.isAbsent ? (
                              <Badge color="gray">결석</Badge>
                            ) : !r.passed ? (
                              <Badge color="red">미통과</Badge>
                            ) : r.passKind === "exempt" ? (
                              <Badge color="gray">면제</Badge>
                            ) : r.passKind === "retest" ? (
                              <Badge color="blue">재시험 통과</Badge>
                            ) : r.passKind === "main" ? (
                              <Badge color="green">본시험 통과</Badge>
                            ) : r.isPerfect ? (
                              <Badge color="amber">만점</Badge>
                            ) : (
                              <Badge color="green">통과</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}

        {activeTab === "monthly" && (
          <Card title="먼슬리 테스트 결과">
            {monthlyResults.length === 0 ? (
              <EmptyState>아직 등록된 먼슬리 결과가 없습니다.</EmptyState>
            ) : (
              <div className="space-y-3">
                {monthlyResults.map(({ test: t, result: res }) => {
                  const total = monthlyTotal(res.scores, t);
                  const max = monthlyMaxTotal(t);
                  const pct = round1(monthlyPercent(res.scores, t));
                  return (
                    <div key={t.id} className="rounded-xl border border-gray-100 p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
                        <div className="text-lg font-semibold text-gray-800">
                          {t.name} <span className="text-sm font-normal text-gray-400">· {t.date}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge color="indigo" size="lg">총점 {round1(total)} / {max}</Badge>
                          <Badge color="green" size="lg">백점환산 {pct}점</Badge>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {t.sections.map((s) => (
                          <span key={s.key} className="text-sm bg-gray-50 rounded-lg px-3 py-1.5 text-gray-600">
                            {s.label} <b className="text-base text-gray-800">{res.scores[s.key] ?? "-"}</b>/{s.maxScore}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}
      </main>

      <CreatorFooter className="px-4 pb-6" />

      <Modal open={!!retestFor} onClose={() => setRetestFor(null)} title="재시험 일정 예약">
        {retestFor && (
          <RetestScheduler app={app} record={retestFor} onDone={() => setRetestFor(null)} />
        )}
      </Modal>

      <Modal open={showPw} onClose={() => setShowPw(false)} title="비밀번호 변경">
        <ChangePassword onDone={() => { setShowPw(false); app.reload(); }} />
      </Modal>
    </div>
  );
}

function ChangePassword({ onDone }: { onDone: () => void }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [next2, setNext2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (next !== next2) return setError("새 비밀번호가 일치하지 않습니다.");
    if (next.length < 4) return setError("새 비밀번호는 4자 이상이어야 합니다.");
    setBusy(true);
    const r = await apiChangePassword(cur, next);
    setBusy(false);
    if (!r.ok) return setError(r.error || "변경 실패");
    alert("비밀번호가 변경되었습니다.");
    onDone();
  }

  return (
    <div className="space-y-3">
      <Field label="현재 비밀번호">
        <Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
      </Field>
      <Field label="새 비밀번호">
        <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      </Field>
      <Field label="새 비밀번호 확인">
        <Input type="password" value={next2} onChange={(e) => setNext2(e.target.value)} autoComplete="new-password" />
      </Field>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>취소</Button>
        <Button onClick={submit} disabled={busy}>{busy ? "변경 중…" : "변경"}</Button>
      </div>
    </div>
  );
}
