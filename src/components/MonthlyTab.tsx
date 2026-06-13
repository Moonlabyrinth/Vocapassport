"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AppStateHook } from "@/lib/client";
import { Button, Card, Field, Input, TextInput, Select, Badge, EmptyState, Stat } from "./ui";
import DatePicker from "./DatePicker";
import { MonthlySection, MonthlyTest } from "@/lib/types";
import { monthlyTotal, monthlyMaxTotal, monthlyPercent, round1, isActiveStudent } from "@/lib/logic";
import { todayStr } from "@/lib/datetime";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

type Draft = { key: string; label: string; max: string };
type ClassOption = { id: string; name: string };
type MonthlyClassTarget = Pick<MonthlyTest, "classId" | "classIds">;
const MONTHLY_SECTION_PRESETS = [
  "Reading(독해)",
  "Grammar(문법)",
  "Speaking(말하기)",
  "Writing(쓰기)",
  "Phonics(파닉스)",
];

function monthlyClassIds(test: MonthlyClassTarget): string[] {
  const ids = test.classIds !== undefined && test.classIds !== null ? test.classIds : test.classId ? [test.classId] : [];
  return [...new Set(ids.filter(Boolean))];
}

function monthlyClassLabel(test: MonthlyClassTarget, classes: ClassOption[]): string {
  const ids = monthlyClassIds(test);
  if (!ids.length) return "전체 공통";
  const names = ids.map((id) => classes.find((c) => c.id === id)?.name ?? "삭제된 반");
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} 외 ${names.length - 3}개`;
}

function monthlyClasses(test: MonthlyClassTarget, classes: ClassOption[]): ClassOption[] {
  const ids = monthlyClassIds(test);
  return ids.length ? classes.filter((c) => ids.includes(c.id)) : classes;
}

function isMonthlyForClass(test: MonthlyClassTarget, classId: string): boolean {
  const ids = monthlyClassIds(test);
  return !ids.length || !classId || ids.includes(classId);
}

export default function MonthlyTab({ app }: { app: AppStateHook }) {
  const { db, run } = app;
  const tests = [...db.monthlyTests].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  const [selectedId, setSelectedId] = useState<string>("");
  const [editing, setEditing] = useState(false);

  const selected = tests.find((t) => t.id === selectedId) || null;

  return (
    <div className="space-y-4">
      <Card
        title="먼슬리 테스트"
        right={
          <Button size="sm" onClick={() => { setSelectedId(""); setEditing(true); }}>+ 새 먼슬리</Button>
        }
      >
        {tests.length === 0 && !editing ? (
          <EmptyState>아직 먼슬리 테스트가 없습니다. 「+ 새 먼슬리」로 만들어 주세요.</EmptyState>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tests.map((t) => (
              <button
                key={t.id}
                onClick={() => { setSelectedId(t.id === selectedId ? "" : t.id); setEditing(false); }}
                className={`text-left rounded-xl border px-4 py-2.5 transition ${
                  t.id === selectedId ? "border-brand-600 bg-brand-50" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="font-medium text-gray-800">{t.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {t.date} · {monthlyClassLabel(t, db.classes)} · 영역 {t.sections.length} · 만점 {monthlyMaxTotal(t)}
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {editing && (
        <TestEditor
          app={app}
          test={selected}
          onDone={(id) => { setEditing(false); if (id) setSelectedId(id); }}
        />
      )}

      {selected && !editing && (
        <>
          <Card
            title={`「${selected.name}」`}
            right={
              <div className="flex gap-1">
                <Button size="sm" variant="soft" onClick={() => setEditing(true)}>영역/이름 수정</Button>
                <Button size="sm" variant="danger" onClick={async () => {
                  if (confirm(`'${selected.name}' 먼슬리와 입력된 점수를 모두 삭제할까요?`)) {
                    await run({ type: "deleteMonthlyTest", id: selected.id });
                    setSelectedId("");
                  }
                }}>삭제</Button>
              </div>
            }
          >
            <div className="flex flex-wrap gap-2">
              <Badge color={monthlyClassIds(selected).length ? "blue" : "gray"}>적용 반 {monthlyClassLabel(selected, db.classes)}</Badge>
              {selected.sections.map((s) => (
                <Badge key={s.key} color="indigo">{s.label} /{s.maxScore}</Badge>
              ))}
              <Badge color="gray">만점 합계 {monthlyMaxTotal(selected)}</Badge>
            </div>
          </Card>

          <ScoreGrid app={app} test={selected} />
          <MonthlyStats app={app} test={selected} />
        </>
      )}

      {!editing && <TrendCard app={app} />}
    </div>
  );
}

/** 먼슬리 생성/수정 (이름·날짜·영역) */
function TestEditor({ app, test, onDone }: { app: AppStateHook; test: MonthlyTest | null; onDone: (id?: string) => void }) {
  const { db, run } = app;
  const [name, setName] = useState(test?.name ?? "");
  const [date, setDate] = useState(test?.date ?? todayStr());
  const [classIds, setClassIds] = useState<string[]>(test ? monthlyClassIds(test) : (db.classes[0]?.id ? [db.classes[0].id] : []));
  const sectionPresetListId = React.useId();
  const [drafts, setDrafts] = useState<Draft[]>(
    test ? test.sections.map((s) => ({ key: s.key, label: s.label, max: String(s.maxScore) }))
         : [{ key: "", label: "Reading(독해)", max: "" }, { key: "", label: "Grammar(문법)", max: "" }]
  );
  const [busy, setBusy] = useState(false);

  function setRow(i: number, patch: Partial<Draft>) {
    setDrafts((d) => d.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function addRow() { setDrafts((d) => [...d, { key: "", label: "", max: "" }]); }
  function removeRow(i: number) { setDrafts((d) => d.filter((_, idx) => idx !== i)); }
  function toggleClass(id: string, checked: boolean) {
    setClassIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return [...next];
    });
  }

  async function save() {
    if (!name.trim()) return alert("먼슬리 이름을 입력하세요.");
    const sections: MonthlySection[] = drafts
      .filter((d) => d.label.trim())
      .map((d) => ({ key: d.key || d.label.trim(), label: d.label.trim(), maxScore: Number(d.max) || 0 }));
    if (!sections.length) return alert("영역을 1개 이상 입력하세요.");
    if (sections.some((s) => s.maxScore <= 0)) return alert("각 영역의 만점을 입력하세요.");
    setBusy(true);
    const r = test
      ? await run({ type: "updateMonthlyTest", id: test.id, patch: { name, date, classIds, sections } })
      : await run({ type: "createMonthlyTest", name, date, classIds, sections });
    setBusy(false);
    if (!r.ok) return alert(r.error);
    onDone(r.id);
  }

  return (
    <Card title={test ? "먼슬리 수정" : "새 먼슬리 만들기"}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <Field label="이름"><TextInput value={name} onChange={setName} placeholder="예: 6월 먼슬리" /></Field>
        <Field label="날짜"><DatePicker value={date} onChange={setDate} /></Field>
      </div>
      <Field label="적용 반" hint="여러 반이 같은 영역을 보면 함께 선택하세요. 아무 반도 선택하지 않으면 전체 공통입니다.">
        <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={classIds.length === 0}
                onChange={(e) => {
                  if (e.target.checked) setClassIds([]);
                }}
                className="h-4 w-4 rounded border-gray-300 text-brand-600"
              />
              전체 공통
            </label>
            {db.classes.map((c) => (
              <label key={c.id} className="inline-flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={classIds.includes(c.id)}
                  onChange={(e) => toggleClass(c.id, e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600"
                />
                {c.name}
              </label>
            ))}
          </div>
        </div>
      </Field>
      <div className="text-sm font-medium text-gray-600 mb-2">영역 (이름 · 만점)</div>
      <div className="space-y-2">
        {drafts.map((d, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-[minmax(16rem,1fr)_7rem_auto] gap-2 items-center">
            <TextInput
              className="min-w-0"
              list={sectionPresetListId}
              value={d.label}
              onChange={(v) => setRow(i, { label: v })}
              placeholder="영역명 선택 또는 직접 입력"
            />
            <Input
              type="number"
              min={1}
              className="sm:w-28"
              value={d.max}
              onChange={(e) => setRow(i, { max: e.target.value })}
              placeholder="만점"
            />
            <Button size="sm" variant="ghost" className="justify-self-start sm:justify-self-auto" onClick={() => removeRow(i)}>
              ✕
            </Button>
          </div>
        ))}
        <datalist id={sectionPresetListId}>
          {MONTHLY_SECTION_PRESETS.map((preset) => (
            <option key={preset} value={preset} />
          ))}
        </datalist>
      </div>
      <div className="flex justify-between mt-3">
        <Button size="sm" variant="soft" onClick={addRow}>+ 영역 추가</Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => onDone()}>취소</Button>
          <Button onClick={save} disabled={busy}>{busy ? "저장 중…" : "저장"}</Button>
        </div>
      </div>
    </Card>
  );
}

/** 학생별 영역 점수 입력 그리드 */
function ScoreGrid({ app, test }: { app: AppStateHook; test: MonthlyTest }) {
  const { db, run } = app;
  const classes = db.classes;
  const availableClasses = monthlyClasses(test, classes);
  const testClassIds = monthlyClassIds(test);
  const [classId, setClassId] = useState<string>(testClassIds[0] ?? classes[0]?.id ?? "");
  const students = db.students.filter((s) => s.classId === classId && isActiveStudent(s));
  const [draft, setDraft] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const currentAllowed = availableClasses.some((c) => c.id === classId);
    const nextClassId = currentAllowed ? classId : availableClasses[0]?.id ?? "";
    if (nextClassId !== classId) setClassId(nextClassId);
  }, [test.id, test.classIds, test.classId, availableClasses, classId]);

  // 선택된 반/테스트의 기존 결과로 초기화
  useEffect(() => {
    const next: Record<string, Record<string, string>> = {};
    for (const s of students) {
      const res = db.monthlyResults.find((r) => r.monthlyTestId === test.id && r.studentId === s.id);
      next[s.id] = {};
      for (const sec of test.sections) {
        const v = res?.scores[sec.key];
        next[s.id][sec.key] = v == null ? "" : String(v);
      }
    }
    setDraft(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, test.id, db.monthlyResults]);

  function setCell(sid: string, key: string, val: string) {
    setDraft((d) => ({ ...d, [sid]: { ...d[sid], [key]: val } }));
  }
  function rowTotal(sid: string): number {
    return test.sections.reduce((sum, sec) => sum + (Number(draft[sid]?.[sec.key]) || 0), 0);
  }
  function rowConvertedScore(sid: string): number | null {
    const max = monthlyMaxTotal(test);
    return max > 0 ? round1((rowTotal(sid) / max) * 100) : null;
  }

  async function save() {
    setBusy(true);
    const entries = students.map((s) => {
      const scores: Record<string, number> = {};
      for (const sec of test.sections) {
        const raw = draft[s.id]?.[sec.key];
        if (raw !== "" && raw != null && Number.isFinite(Number(raw))) scores[sec.key] = Number(raw);
      }
      return { studentId: s.id, scores };
    });
    const r = await run({ type: "setMonthlyResults", monthlyTestId: test.id, entries });
    setBusy(false);
    if (!r.ok) return alert(r.error);
  }

  return (
    <Card title="점수 입력" right={<Button size="sm" onClick={save} disabled={busy || !students.length}>{busy ? "저장 중…" : "저장"}</Button>}>
      <div className="mb-3 max-w-xs">
        <Field label="반">
          <Select value={classId} onChange={(e) => setClassId(e.target.value)} disabled={availableClasses.length <= 1}>
            {availableClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      </div>
      {students.length === 0 ? (
        <EmptyState>이 반에 학생이 없습니다.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100">
                <th className="py-2 pr-3 font-medium sticky left-0 bg-white">학생</th>
                {test.sections.map((s) => (
                  <th key={s.key} className="py-2 px-2 font-medium text-center">{s.label}<div className="text-[10px] text-gray-300">/{s.maxScore}</div></th>
                ))}
                <th className="py-2 pl-3 font-medium text-center">총점<div className="text-[10px] text-gray-300">/{monthlyMaxTotal(test)} · 백점환산</div></th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="border-b border-gray-50">
                  <td className="py-1.5 pr-3 font-medium text-gray-800 sticky left-0 bg-white">{s.name}</td>
                  {test.sections.map((sec) => (
                    <td key={sec.key} className="py-1.5 px-1.5 text-center">
                      <input
                        type="number" min={0} max={sec.maxScore} step={0.5}
                        value={draft[s.id]?.[sec.key] ?? ""}
                        onChange={(e) => setCell(s.id, sec.key, e.target.value)}
                        className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-center text-sm focus:border-brand-600 outline-none"
                      />
                    </td>
                  ))}
                  <td className="py-1.5 pl-3 text-center font-semibold text-brand-700">
                    <div>{round1(rowTotal(s.id))} / {monthlyMaxTotal(test)}</div>
                    <div className="text-xs font-medium text-gray-400">백점환산 {rowConvertedScore(s.id) ?? "-"}점</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-400 mt-2">빈 칸은 미입력으로 저장됩니다. 입력 후 「저장」을 눌러주세요.</p>
    </Card>
  );
}

/** 선택한 먼슬리의 반/영역별 평균 */
function MonthlyStats({ app, test }: { app: AppStateHook; test: MonthlyTest }) {
  const { db } = app;
  const testClassIds = monthlyClassIds(test);
  const allowedClassIds = new Set(testClassIds);
  const availableClasses = monthlyClasses(test, db.classes);
  const [classId, setClassId] = useState<string>("");
  useEffect(() => {
    if (classId && !availableClasses.some((c) => c.id === classId)) setClassId("");
  }, [test.id, test.classIds, test.classId, availableClasses, classId]);
  const studentIds = new Set(
    db.students
      .filter((s) => isActiveStudent(s) && (!classId || s.classId === classId) && (!allowedClassIds.size || allowedClassIds.has(s.classId)))
      .map((s) => s.id)
  );
  const results = db.monthlyResults.filter((r) => r.monthlyTestId === test.id && studentIds.has(r.studentId));

  const avg = (vals: number[]) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null);
  const sectionAvgs = test.sections.map((sec) => ({
    sec,
    avg: round1(avg(results.map((r) => Number(r.scores[sec.key]) || 0))),
  }));
  const totalAvg = round1(avg(results.map((r) => monthlyTotal(r.scores, test))));
  const pctAvg = round1(avg(results.map((r) => monthlyPercent(r.scores, test))));

  return (
    <Card title="먼슬리 통계">
      <div className="mb-3 max-w-xs">
        <Field label="반">
          <Select value={classId} onChange={(e) => setClassId(e.target.value)} disabled={availableClasses.length <= 1}>
            <option value="">{testClassIds.length ? "전체 적용 반" : "전체 반"}</option>
            {availableClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Stat label="응시" value={results.length} accent="indigo" />
        <Stat label="평균 총점" value={totalAvg != null ? `${totalAvg}` : "-"} accent="green" sub={`만점 ${monthlyMaxTotal(test)}`} />
        <Stat label="평균 백점환산" value={pctAvg != null ? `${pctAvg}점` : "-"} accent="green" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-100">
              <th className="py-2 pr-3 font-medium">영역</th>
              <th className="py-2 pr-3 font-medium">평균</th>
              <th className="py-2 pr-3 font-medium">만점</th>
            </tr>
          </thead>
          <tbody>
            {sectionAvgs.map(({ sec, avg }) => (
              <tr key={sec.key} className="border-b border-gray-50">
                <td className="py-2 pr-3 text-gray-800">{sec.label}</td>
                <td className="py-2 pr-3 font-medium text-gray-700">{avg != null ? avg : "-"}</td>
                <td className="py-2 pr-3 text-gray-400">{sec.maxScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** 먼슬리 추이 (테스트별 백점환산 — 반 평균 또는 학생) */
function TrendCard({ app }: { app: AppStateHook }) {
  const { db } = app;
  const tests = [...db.monthlyTests].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const [classId, setClassId] = useState<string>("");
  const [studentId, setStudentId] = useState<string>("");

  const students = db.students.filter((s) => isActiveStudent(s) && (!classId || s.classId === classId));
  const selectedStudent = students.find((s) => s.id === studentId);
  const targetClassId = selectedStudent?.classId ?? classId;
  const visibleTests = tests.filter((t) => isMonthlyForClass(t, targetClassId));

  const data = useMemo(() => {
    return visibleTests.map((t) => {
      let pct: number | null;
      if (studentId) {
        const res = db.monthlyResults.find((r) => r.monthlyTestId === t.id && r.studentId === studentId);
        pct = res ? round1(monthlyPercent(res.scores, t)) : null;
      } else {
        const ids = new Set(students.map((s) => s.id));
        const rs = db.monthlyResults.filter((r) => r.monthlyTestId === t.id && ids.has(r.studentId));
        pct = rs.length ? round1(rs.reduce((a, r) => a + monthlyPercent(r.scores, t), 0) / rs.length) : null;
      }
      return { name: monthlyClassIds(t).length ? `${t.name} (${monthlyClassLabel(t, db.classes)})` : t.name, pct };
    });
  }, [visibleTests, db.monthlyResults, db.classes, studentId, students]);

  if (tests.length === 0) return null;

  return (
    <Card title="먼슬리 추이 (백점환산)">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <Field label="반">
          <Select value={classId} onChange={(e) => { setClassId(e.target.value); setStudentId(""); }}>
            <option value="">전체 반(평균)</option>
            {db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="학생 (선택)">
          <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">반 평균</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
      </div>
      <div style={{ width: "100%", height: 240 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" />
            <XAxis dataKey="name" fontSize={12} tickMargin={6} />
            <YAxis domain={[0, 100]} fontSize={12} unit="점" />
            <Tooltip formatter={(v: number) => `${v}점`} />
            <Line type="monotone" dataKey="pct" name="백점환산" stroke="#7c3aed" strokeWidth={2} connectNulls dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
