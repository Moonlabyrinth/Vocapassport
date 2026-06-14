"use client";

import React, { useMemo, useState } from "react";
import { AppStateHook } from "@/lib/client";
import { Button, Card, Badge, EmptyState, Select, Field } from "./ui";
import DatePicker from "./DatePicker";
import { isActiveStudent } from "@/lib/logic";

function localToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function HomeworkTab({ app }: { app: AppStateHook }) {
  const { db, run } = app;
  const [classId, setClassId] = useState(db.classes[0]?.id ?? "");
  const [date, setDate] = useState(localToday);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const cls = db.classes.find((c) => c.id === classId);
  const activeStudents = useMemo(
    () =>
      db.students
        .filter((s) => s.classId === classId && isActiveStudent(s))
        .sort((a, b) => a.name.localeCompare(b.name, "ko")),
    [db.students, classId]
  );

  // 이 날짜·반의 기존 기록 로드
  const existingMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const h of db.homeworkRecords ?? []) {
      if (h.classId === classId && h.date === date) map.set(h.studentId, h.done);
    }
    return map;
  }, [db.homeworkRecords, classId, date]);

  // 로컬 상태 (체크박스)
  const [checks, setChecks] = useState<Map<string, boolean>>(() => new Map());

  // 날짜/반 바뀌면 로컬 상태 초기화
  const stateKey = `${classId}::${date}`;
  const [lastKey, setLastKey] = useState(stateKey);
  if (stateKey !== lastKey) {
    setLastKey(stateKey);
    setChecks(new Map());
    setSaved(false);
  }

  function getCheck(studentId: string): boolean {
    if (checks.has(studentId)) return checks.get(studentId)!;
    return existingMap.get(studentId) ?? false;
  }

  function toggle(studentId: string) {
    setChecks((prev) => {
      const next = new Map(prev);
      next.set(studentId, !getCheck(studentId));
      return next;
    });
    setSaved(false);
  }

  function toggleAll(value: boolean) {
    setChecks(() => {
      const next = new Map<string, boolean>();
      for (const s of activeStudents) next.set(s.id, value);
      return next;
    });
    setSaved(false);
  }

  async function save() {
    if (!classId || !date) return;
    setBusy(true);
    const entries = activeStudents.map((s) => {
      const currentBook = s.currentBookId
        ? db.books.find((b) => b.id === s.currentBookId) ?? null
        : null;
      return { studentId: s.id, done: getCheck(s.id), bookId: currentBook?.id ?? null };
    });
    const r = await run({ type: "setHomeworkRecords", classId, date, entries });
    setBusy(false);
    if (!r.ok) return alert(r.error);
    setSaved(true);
  }

  // 날짜별 통계 (최근 30일)
  const recentStats = useMemo(() => {
    if (!classId) return [];
    const hw = (db.homeworkRecords ?? []).filter((h) => h.classId === classId);
    const byDate = new Map<string, { done: number; total: number }>();
    for (const h of hw) {
      const entry = byDate.get(h.date) ?? { done: 0, total: 0 };
      entry.total++;
      if (h.done) entry.done++;
      byDate.set(h.date, entry);
    }
    return [...byDate.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 14)
      .map(([d, stat]) => ({ date: d, ...stat, rate: Math.round((stat.done / stat.total) * 100) }));
  }, [db.homeworkRecords, classId]);

  const allDone = activeStudents.length > 0 && activeStudents.every((s) => getCheck(s.id));
  const doneCount = activeStudents.filter((s) => getCheck(s.id)).length;

  if (db.classes.length === 0) {
    return (
      <Card title="숙제 체크">
        <EmptyState>반을 먼저 만들어 주세요.</EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* 날짜·반 선택 */}
      <Card title="숙제 출석부">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <Field label="날짜">
            <DatePicker value={date} onChange={(v) => { setDate(v); setSaved(false); }} />
          </Field>
          <Field label="반">
            <Select value={classId} onChange={(e) => { setClassId(e.target.value); setSaved(false); }}>
              {db.classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end gap-2">
            <Button onClick={save} disabled={busy || !classId || !date} className="flex-1">
              {busy ? "저장 중…" : "저장"}
            </Button>
            {saved && <span className="text-sm text-green-600 whitespace-nowrap">저장됨 ✓</span>}
          </div>
        </div>

        {activeStudents.length === 0 ? (
          <EmptyState>{cls ? `${cls.name}에 재원 학생이 없습니다.` : "반을 선택하세요."}</EmptyState>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Badge color={doneCount === activeStudents.length ? "green" : doneCount > 0 ? "amber" : "gray"}>
                  {doneCount}/{activeStudents.length}명 완료
                </Badge>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="soft" onClick={() => toggleAll(true)}>전체 O</Button>
                <Button size="sm" variant="ghost" onClick={() => toggleAll(false)}>전체 X</Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-100">
                    <th className="py-2 pr-4 font-medium">학생</th>
                    <th className="py-2 pr-4 font-medium">현재 공부 중인 책</th>
                    <th className="py-2 font-medium text-center">숙제</th>
                  </tr>
                </thead>
                <tbody>
                  {activeStudents.map((s) => {
                    const currentBook = s.currentBookId
                      ? db.books.find((b) => b.id === s.currentBookId)
                      : null;
                    const done = getCheck(s.id);
                    return (
                      <tr
                        key={s.id}
                        className="border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition"
                        onClick={() => toggle(s.id)}
                      >
                        <td className="py-2.5 pr-4 font-medium text-gray-800">{s.name}</td>
                        <td className="py-2.5 pr-4 text-gray-500">
                          {currentBook ? (
                            <span className="text-brand-700 font-medium">{currentBook.title}</span>
                          ) : (
                            <span className="text-gray-300">미지정</span>
                          )}
                        </td>
                        <td className="py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => toggle(s.id)}
                            className={`w-10 h-10 rounded-full text-lg font-bold transition ${
                              done
                                ? "bg-green-100 text-green-600 hover:bg-green-200"
                                : "bg-red-50 text-red-400 hover:bg-red-100"
                            }`}
                            aria-label={done ? "숙제 완료" : "숙제 미완료"}
                          >
                            {done ? "O" : "X"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 전체 완료 시 축하 메시지 */}
            {allDone && activeStudents.length > 0 && (
              <div className="mt-3 rounded-xl bg-green-50 border border-green-100 px-4 py-3 text-sm text-green-700">
                🎉 {cls?.name} 전원 숙제 완료!
              </div>
            )}
          </>
        )}
      </Card>

      {/* 최근 날짜별 통계 */}
      {recentStats.length > 0 && (
        <Card title="최근 숙제 현황">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-100">
                  <th className="py-2 pr-4 font-medium">날짜</th>
                  <th className="py-2 pr-4 font-medium">완료/전체</th>
                  <th className="py-2 font-medium">완료율</th>
                </tr>
              </thead>
              <tbody>
                {recentStats.map(({ date: d, done, total, rate }) => (
                  <tr
                    key={d}
                    className="border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition"
                    onClick={() => { setDate(d); setSaved(false); }}
                  >
                    <td className="py-2 pr-4 text-gray-600">{d}</td>
                    <td className="py-2 pr-4 text-gray-700">{done}/{total}명</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${rate >= 80 ? "bg-green-500" : rate >= 50 ? "bg-amber-400" : "bg-red-400"}`}
                            style={{ width: `${rate}%` }}
                          />
                        </div>
                        <span className={`font-medium ${rate >= 80 ? "text-green-600" : rate >= 50 ? "text-amber-600" : "text-red-500"}`}>
                          {rate}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-2">날짜를 클릭하면 해당 날짜 출석부로 이동합니다.</p>
        </Card>
      )}
    </div>
  );
}
