"use client";

import React, { useMemo, useState } from "react";
import { AppStateHook, apiAdmin } from "@/lib/client";
import { Button, Card, Field, Input, Select, Badge, EmptyState, Modal } from "./ui";
import DatePicker from "./DatePicker";
import { ScheduleType, PassKindChoice, ScoreRecord } from "@/lib/types";
import { isActiveStudent, percentOf, round1 } from "@/lib/logic";
import { recordLessonLabel } from "@/lib/course";
import { NeedsRetestRow, RetestHistoryRow } from "./RetestTab";

interface IssuedCred { name: string; loginId: string; password: string }

export default function ManageTab({ app }: { app: AppStateHook }) {
  const { db, run } = app;
  const [selectedClass, setSelectedClass] = useState<string>("");

  // 반 추가 폼
  const [className, setClassName] = useState("");
  const [schedule, setSchedule] = useState<ScheduleType>("월수금");
  const [cut, setCut] = useState(80);

  const cls = db.classes.find((c) => c.id === selectedClass);

  async function addClass() {
    if (!className.trim()) return alert("반 이름을 입력하세요.");
    const r = await run({ type: "createClass", name: className, scheduleType: schedule, passThreshold: cut });
    if (r.ok) {
      setClassName("");
      setSelectedClass(r.id!);
    } else alert(r.error);
  }

  return (
    <div className="space-y-4">
      {/* 반 추가 */}
      <Card title="반 만들기">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Field label="반 이름">
            <Input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="예: 중1 A반" />
          </Field>
          <Field label="수업 요일">
            <Select value={schedule} onChange={(e) => setSchedule(e.target.value as ScheduleType)}>
              <option value="월수금">월수금</option>
              <option value="화목">화목</option>
            </Select>
          </Field>
          <Field label="통과 컷(%)" hint="이 반의 기본 통과 기준">
            <Input type="number" min={0} max={100} value={cut} onChange={(e) => setCut(Number(e.target.value))} />
          </Field>
          <div className="flex items-end">
            <Button onClick={addClass} className="w-full">+ 반 추가</Button>
          </div>
        </div>
      </Card>

      {/* 반 목록 */}
      <Card title="반 목록">
        {db.classes.length === 0 ? (
          <EmptyState>아직 반이 없습니다. 위에서 먼저 반을 만들어 주세요.</EmptyState>
        ) : (
          <div className="flex flex-wrap gap-2">
            {db.classes.map((c) => {
              const activeCount = db.students.filter((s) => s.classId === c.id && isActiveStudent(s)).length;
              const withdrawnCount = db.students.filter((s) => s.classId === c.id && !isActiveStudent(s)).length;
              const active = c.id === selectedClass;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedClass(active ? "" : c.id)}
                  className={`text-left rounded-xl border px-4 py-2.5 transition ${
                    active ? "border-brand-600 bg-brand-50" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="font-medium text-gray-800">{c.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                    <Badge color="blue">{c.scheduleType}</Badge>
                    <Badge color="indigo">컷 {c.passThreshold}%</Badge>
                    <span>재원 {activeCount}명</span>
                    {withdrawnCount > 0 && <span>퇴원 {withdrawnCount}명</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <ScoreRecordManager app={app} />

      {cls && <ClassDetail key={cls.id} app={app} classId={cls.id} />}
    </div>
  );
}

function ScoreRecordManager({ app }: { app: AppStateHook }) {
  const { db, run } = app;
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [roundFilter, setRoundFilter] = useState<number | 0>(0);
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const students = useMemo(
    () =>
      db.students
        .filter((s) => !classId || s.classId === classId)
        .sort((a, b) => a.name.localeCompare(b.name, "ko")),
    [db.students, classId]
  );

  const records = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.records
      .filter((r) => {
        const student = db.students.find((s) => s.id === r.studentId);
        const cls = db.classes.find((c) => c.id === r.classId);
        if (classId && r.classId !== classId) return false;
        if (studentId && r.studentId !== studentId) return false;
        if (roundFilter && r.round !== roundFilter) return false;
        if (startDate && r.examDate < startDate) return false;
        if (endDate && r.examDate > endDate) return false;
        if (!q) return true;
        return [
          student?.name,
          cls?.name,
          r.bookTitle,
          r.examDate,
          recordLessonLabel(r),
          r.passed ? "통과" : "미통과",
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      })
      .sort((a, b) => b.examDate.localeCompare(a.examDate) || b.createdAt.localeCompare(a.createdAt));
  }, [db.records, db.students, db.classes, classId, studentId, roundFilter, startDate, endDate, query]);

  const visibleRecords = records.slice(0, 200);
  const visibleIds = visibleRecords.map((r) => r.id);
  const selectedVisibleIds = [...selectedIds].filter((id) => visibleIds.includes(id));
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleIds.length === visibleIds.length;

  function setClassFilter(id: string) {
    setClassId(id);
    setStudentId("");
    setSelectedIds(new Set());
  }

  function toggleRecord(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function deleteOne(record: ScoreRecord) {
    const student = db.students.find((s) => s.id === record.studentId);
    if (
      !confirm(
        `${student?.name ?? "학생"} ${record.examDate} ${record.bookTitle} ${recordLessonLabel(record)} 기록을 삭제할까요?\n연결된 재시험 예약/결과도 함께 삭제됩니다.`
      )
    ) return;
    setBusy(true);
    const result = await run({ type: "deleteRecord", id: record.id });
    setBusy(false);
    if (!result.ok) return alert(result.error);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(record.id);
      return next;
    });
  }

  async function deleteSelected() {
    if (!selectedVisibleIds.length) return;
    if (
      !confirm(
        `선택한 점수 기록 ${selectedVisibleIds.length}건을 삭제할까요?\n연결된 재시험 예약/결과도 함께 삭제됩니다.`
      )
    ) return;
    setBusy(true);
    const result = await run({ type: "deleteRecords", ids: selectedVisibleIds });
    setBusy(false);
    if (!result.ok) return alert(result.error);
    setSelectedIds(new Set());
  }

  return (
    <Card
      title="전체 성적 검색/삭제"
      right={
        <Button size="sm" variant="danger" disabled={busy || !selectedVisibleIds.length} onClick={deleteSelected}>
          선택 삭제
        </Button>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 mb-3">
        <Field label="반">
          <Select value={classId} onChange={(e) => setClassFilter(e.target.value)}>
            <option value="">전체 반</option>
            {db.classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="학생">
          <Select value={studentId} onChange={(e) => { setStudentId(e.target.value); setSelectedIds(new Set()); }}>
            <option value="">전체 학생</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="회독">
          <Select value={roundFilter} onChange={(e) => { setRoundFilter(Number(e.target.value)); setSelectedIds(new Set()); }}>
            <option value={0}>전체 회독</option>
            <option value={1}>1회독</option>
            <option value={2}>2회독</option>
            <option value={3}>3회독</option>
          </Select>
        </Field>
        <Field label="시작일">
          <DatePicker value={startDate} onChange={(v) => { setStartDate(v); setSelectedIds(new Set()); }} placeholder="처음부터" />
        </Field>
        <Field label="종료일">
          <DatePicker value={endDate} onChange={(v) => { setEndDate(v); setSelectedIds(new Set()); }} placeholder="현재까지" />
        </Field>
        <Field label="검색어">
          <Input value={query} onChange={(e) => { setQuery(e.target.value); setSelectedIds(new Set()); }} placeholder="학생, 책, 날짜" />
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={records.length ? "indigo" : "gray"}>검색 결과 {records.length}건</Badge>
          {records.length > visibleRecords.length && <Badge color="gray">최근 {visibleRecords.length}건 표시</Badge>}
          <Badge color={selectedVisibleIds.length ? "blue" : "gray"}>선택 {selectedVisibleIds.length}건</Badge>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setClassId("");
            setStudentId("");
            setRoundFilter(0);
            setQuery("");
            setStartDate("");
            setEndDate("");
            setSelectedIds(new Set());
          }}
        >
          필터 초기화
        </Button>
      </div>

      {visibleRecords.length === 0 ? (
        <EmptyState>조건에 맞는 점수 기록이 없습니다.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100">
                <th className="py-2 pr-3 font-medium">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(e) => setSelectedIds(e.target.checked ? new Set(visibleIds) : new Set())}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600"
                    aria-label="검색된 성적 전체 선택"
                  />
                </th>
                <th className="py-2 pr-3 font-medium">날짜</th>
                <th className="py-2 pr-3 font-medium">반</th>
                <th className="py-2 pr-3 font-medium">학생</th>
                <th className="py-2 pr-3 font-medium">책/회차</th>
                <th className="py-2 pr-3 font-medium">점수</th>
                <th className="py-2 pr-3 font-medium">판정</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {visibleRecords.map((r) => {
                const student = db.students.find((s) => s.id === r.studentId);
                const cls = db.classes.find((c) => c.id === r.classId);
                const pct = round1(percentOf(r.actualScore, r.totalScore));
                return (
                  <tr key={r.id} className="border-b border-gray-50">
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={(e) => toggleRecord(r.id, e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-brand-600"
                        aria-label="성적 기록 선택"
                      />
                    </td>
                    <td className="py-2 pr-3 text-gray-500">{r.examDate}</td>
                    <td className="py-2 pr-3 text-gray-500">{cls?.name ?? "-"}</td>
                    <td className="py-2 pr-3 text-gray-800">{student?.name ?? "-"}</td>
                    <td className="py-2 pr-3 text-gray-600">
                      <div>{r.bookTitle}</div>
                      <div className="text-xs text-gray-400">{recordLessonLabel(r)}{r.retestNo > 0 ? ` · 재${r.retestNo}` : ""}</div>
                    </td>
                    <td className="py-2 pr-3 text-gray-700">{r.actualScore}/{r.totalScore} <span className="text-xs text-gray-400">({pct}%)</span></td>
                    <td className="py-2 pr-3">
                      {recordBadge(r)}
                    </td>
                    <td className="py-2 text-right">
                      <Button size="sm" variant="danger" disabled={busy} onClick={() => deleteOne(r)}>삭제</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function recordBadge(record: ScoreRecord) {
  if (!record.passed) return <Badge color="red">미통과</Badge>;
  if (record.passKind === "exempt") return <Badge color="gray">면제</Badge>;
  if (record.passKind === "retest" || record.attemptType === "retest") return <Badge color="blue">재시험 통과</Badge>;
  if (record.isPerfect) return <Badge color="amber">만점</Badge>;
  return <Badge color="green">통과</Badge>;
}

function ClassDetail({ app, classId }: { app: AppStateHook; classId: string }) {
  const { db, run } = app;
  const cls = db.classes.find((c) => c.id === classId)!;
  const students = db.students
    .filter((s) => s.classId === classId)
    .sort((a, b) => Number(isActiveStudent(b)) - Number(isActiveStudent(a)) || a.name.localeCompare(b.name, "ko"));
  const activeStudents = students.filter(isActiveStudent);
  const withdrawnStudents = students.filter((s) => !isActiveStudent(s));
  const books = db.books.filter((b) => b.classId === classId);

  const [studentName, setStudentName] = useState("");
  const [bookTitle, setBookTitle] = useState("");
  const [bookTotal, setBookTotal] = useState(20);
  const [bookCut, setBookCut] = useState<string>("");
  const [bookPassMark, setBookPassMark] = useState<string>("");
  const [retestStudentId, setRetestStudentId] = useState<string | null>(null);
  const [selectedRetestRecordIds, setSelectedRetestRecordIds] = useState<Set<string>>(new Set());

  // 발급된 계정 정보(1회성 표시)
  const [issued, setIssued] = useState<IssuedCred[] | null>(null);

  // 반 설정 편집
  const [editCut, setEditCut] = useState(cls.passThreshold);
  const [editName, setEditName] = useState(cls.name);
  const [editSchedule, setEditSchedule] = useState<ScheduleType>(cls.scheduleType);
  const retestStudent = retestStudentId ? db.students.find((s) => s.id === retestStudentId) : null;
  const byDateDesc = (a: { examDate: string; createdAt: string }, b: { examDate: string; createdAt: string }) =>
    b.examDate.localeCompare(a.examDate) || b.createdAt.localeCompare(a.createdAt);
  // 아직 판정 안 된 미통과 회차 (자동 미통과)
  const retestNeeded = retestStudent
    ? db.records
        .filter(
          (r) =>
            r.studentId === retestStudent.id &&
            r.status === "approved" &&
            !r.passed &&
            r.passedOverride == null &&
            !db.retests.some(
              (rt) =>
                rt.scoreRecordId === r.id &&
                (rt.status === "scheduled" || rt.status === "completed")
            )
        )
        .sort(byDateDesc)
    : [];
  // 선생님이 이미 처리한 회차 (통과/면제/수동 미통과 등 직접 판정)
  const retestProcessed = retestStudent
    ? db.records
        .filter((r) => r.studentId === retestStudent.id && r.status === "approved" && r.passedOverride != null)
        .sort(byDateDesc)
    : [];
  const retestHistory = retestStudent
    ? db.retests
        .filter((rt) => rt.studentId === retestStudent.id && rt.status !== "scheduled")
        .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
    : [];
  const selectableRetestRecordIds = [
    ...retestNeeded.map((r) => r.id),
    ...retestProcessed.map((r) => r.id),
    ...retestHistory.flatMap((rt) => (rt.resultRecordId ? [rt.resultRecordId] : [])),
  ];
  const selectedRetestIds = [...selectedRetestRecordIds].filter((id) =>
    selectableRetestRecordIds.includes(id)
  );
  const allRetestSelected =
    selectableRetestRecordIds.length > 0 &&
    selectedRetestIds.length === selectableRetestRecordIds.length;

  function toggleRetestSelection(recordId: string, checked: boolean) {
    setSelectedRetestRecordIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(recordId);
      else next.delete(recordId);
      return next;
    });
  }

  async function setSelectedRetestKind(kind: PassKindChoice) {
    if (!selectedRetestIds.length) return;
    const r = await run({ type: "setRecordsPassKind", recordIds: selectedRetestIds, kind });
    if (!r.ok) return alert(r.error);
    setSelectedRetestRecordIds(new Set());
  }

  function closeRetestModal() {
    setSelectedRetestRecordIds(new Set());
    setRetestStudentId(null);
  }

  async function addStudent() {
    const names = studentName
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!names.length) return;
    const r = await apiAdmin({ op: "createStudentsWithCreds", classId, names });
    if (!r.ok) return alert(r.error || "추가 실패");
    setStudentName("");
    await app.reload();
    if (r.created?.length) setIssued(r.created);
  }

  async function resetPassword(studentId: string, name: string) {
    if (!confirm(`'${name}' 학생의 비밀번호를 새로 발급할까요? (기존 비번은 무효)`)) return;
    const r = await apiAdmin({ op: "issueCredentials", studentId });
    if (!r.ok) return alert(r.error || "발급 실패");
    await app.reload();
    setIssued([{ name, loginId: r.loginId, password: r.password }]);
  }

  async function addBook() {
    if (!bookTitle.trim()) return alert("책 제목을 입력하세요.");
    const r = await run({
      type: "createBook",
      classId,
      title: bookTitle,
      defaultTotalScore: bookTotal,
      passThreshold: bookCut === "" ? null : Number(bookCut),
      passMark: bookPassMark === "" ? null : Number(bookPassMark),
    });
    if (r.ok) {
      setBookTitle("");
      setBookPassMark("");
    } else alert(r.error);
  }

  async function saveClass() {
    const r = await run({
      type: "updateClass",
      id: classId,
      patch: { name: editName, passThreshold: editCut, scheduleType: editSchedule },
    });
    if (!r.ok) alert(r.error);
  }

  return (
    <div className="space-y-4">
      <Card
        title={`「${cls.name}」 설정`}
        right={
          <Button variant="danger" size="sm" onClick={async () => {
            if (confirm(`'${cls.name}' 반과 소속 학생·기록을 모두 삭제할까요?`)) {
              await run({ type: "deleteClass", id: classId });
            }
          }}>반 삭제</Button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Field label="반 이름">
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          </Field>
          <Field label="수업 요일">
            <Select value={editSchedule} onChange={(e) => setEditSchedule(e.target.value as ScheduleType)}>
              <option value="월수금">월수금</option>
              <option value="화목">화목</option>
            </Select>
          </Field>
          <Field label="통과 컷(%)">
            <Input type="number" min={0} max={100} value={editCut} onChange={(e) => setEditCut(Number(e.target.value))} />
          </Field>
          <div className="flex items-end">
            <Button onClick={saveClass} variant="soft" className="w-full">설정 저장</Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 학생 */}
        <Card title={`학생 (재원 ${activeStudents.length}명${withdrawnStudents.length ? ` · 퇴원 ${withdrawnStudents.length}명` : ""})`}>
          <div className="flex gap-2 mb-1">
            <Input
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="이름 입력 (쉼표/줄바꿈으로 여러 명)"
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && addStudent()}
            />
            <Button onClick={addStudent}>추가</Button>
          </div>
          <p className="text-xs text-gray-400 mb-3">아이디는 <b>이름</b>, 초기 비밀번호는 <b>0000</b>으로 자동 발급됩니다. (이름이 겹치면 뒤에 숫자가 붙어요)</p>
          {students.length === 0 ? (
            <EmptyState>학생을 추가하세요.</EmptyState>
          ) : (
            <ul className="divide-y divide-gray-100">
              {students.map((s) => {
                const active = isActiveStudent(s);
                return (
                <li key={s.id} className="flex items-center justify-between py-2 gap-2">
                  <div className="min-w-0">
                    <div className="text-sm text-gray-800 flex items-center gap-2">
                      <span>{s.name}</span>
                      {!active && <Badge color="gray">퇴원</Badge>}
                    </div>
                    <div className="text-xs text-gray-400">
                      {s.loginId ? <>아이디 <span className="font-mono text-gray-600">{s.loginId}</span></> : <span className="text-amber-500">계정 미발급</span>}
                      {!active && s.withdrawnAt && <span className="ml-2">퇴원일 {s.withdrawnAt.slice(0, 10)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedRetestRecordIds(new Set());
                        setRetestStudentId(s.id);
                      }}
                    >
                      재시험
                    </Button>
                    {active && <Button variant="soft" size="sm" onClick={() => resetPassword(s.id, s.name)}>비번 발급</Button>}
                    <Button
                      variant={active ? "ghost" : "soft"}
                      size="sm"
                      onClick={async () => {
                        if (active) {
                          if (confirm(`'${s.name}' 학생을 퇴원 처리할까요? 기존 점수 기록은 보존됩니다.`)) {
                            await run({ type: "updateStudent", id: s.id, patch: { status: "withdrawn" } });
                          }
                        } else {
                          if (confirm(`'${s.name}' 학생을 재원 상태로 복원할까요?`)) {
                            await run({ type: "updateStudent", id: s.id, patch: { status: "active", withdrawnAt: null } });
                          }
                        }
                      }}
                    >{active ? "퇴원" : "복원"}</Button>
                  </div>
                </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* 책 */}
        <Card title={`책/단어장 (${books.length})`}>
          <div className="grid grid-cols-3 gap-2 mb-1">
            <Input value={bookTitle} onChange={(e) => setBookTitle(e.target.value)} placeholder="책 제목" className="col-span-3" />
            <Field label="기본 만점">
              <Input type="number" min={1} value={bookTotal} onChange={(e) => setBookTotal(Number(e.target.value))} />
            </Field>
            <Field label="통과 점수(컷)" hint="예: 51점 이상">
              <Input type="number" min={0} step={0.5} value={bookPassMark} onChange={(e) => setBookPassMark(e.target.value)} placeholder="절대 점수" />
            </Field>
            <Field label="또는 컷(%)" hint="비우면 반 컷">
              <Input type="number" min={0} max={100} value={bookCut} onChange={(e) => setBookCut(e.target.value)} placeholder={`${cls.passThreshold}`} disabled={bookPassMark !== ""} />
            </Field>
            <div className="col-span-3">
              <Button onClick={addBook} className="w-full">+ 책 추가</Button>
            </div>
          </div>
          <p className="text-xs text-gray-400 mb-3">통과 점수(절대)를 넣으면 그 점수 이상이면 통과합니다. (백분율 컷보다 우선)</p>
          {books.length === 0 ? (
            <EmptyState>책을 추가하면 점수 입력이 편해집니다.</EmptyState>
          ) : (
            <ul className="divide-y divide-gray-100">
              {books.map((b) => (
                <li key={b.id} className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-800">
                    {b.title}{" "}
                    <span className="text-xs text-gray-400">
                      (만점 {b.defaultTotalScore} · 컷 {b.passMark != null ? `${b.passMark}점 이상` : `${b.passThreshold ?? cls.passThreshold}%`})
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      if (confirm(`'${b.title}' 책을 삭제할까요? (점수 기록은 유지됩니다)`)) {
                        await run({ type: "deleteBook", id: b.id });
                      }
                    }}
                  >삭제</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal open={!!issued} onClose={() => setIssued(null)} title="학생 로그인 계정 발급됨">
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            아래 <b>아이디</b>로 로그인합니다. 초기 비밀번호는 모두 <b>0000</b>이며,
            학생이 로그인 후 직접 변경하도록 안내하세요. (비번 분실 시 「비번 발급」으로 0000 재설정)
          </p>
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-500">
                  <th className="py-2 px-3 font-medium">이름</th>
                  <th className="py-2 px-3 font-medium">아이디</th>
                  <th className="py-2 px-3 font-medium">비밀번호</th>
                </tr>
              </thead>
              <tbody>
                {(issued ?? []).map((c, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="py-2 px-3 text-gray-800">{c.name}</td>
                    <td className="py-2 px-3 font-mono text-gray-700">{c.loginId}</td>
                    <td className="py-2 px-3 font-mono text-brand-700 font-semibold">{c.password}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="soft"
              onClick={() => {
                const text = (issued ?? []).map((c) => `${c.name}\t아이디:${c.loginId}\t비번:${c.password}`).join("\n");
                navigator.clipboard?.writeText(text);
                alert("복사되었습니다.");
              }}
            >복사</Button>
            <Button onClick={() => setIssued(null)}>확인</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!retestStudent}
        onClose={closeRetestModal}
        title={`${retestStudent?.name ?? ""} 재시험 결과 관리`}
        width="max-w-3xl"
      >
        <div className="space-y-5">
          {selectableRetestRecordIds.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={allRetestSelected}
                    onChange={(e) => {
                      setSelectedRetestRecordIds(
                        e.target.checked ? new Set(selectableRetestRecordIds) : new Set()
                      );
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600"
                  />
                  전체 선택
                </label>
                <Badge color={selectedRetestIds.length ? "indigo" : "gray"}>
                  선택 {selectedRetestIds.length}건
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Button size="sm" variant="soft" disabled={!selectedRetestIds.length} onClick={() => setSelectedRetestKind("main")}>
                  본시험 통과
                </Button>
                <Button size="sm" variant="soft" disabled={!selectedRetestIds.length} onClick={() => setSelectedRetestKind("retest")}>
                  재시험 통과
                </Button>
                <Button size="sm" variant="soft" disabled={!selectedRetestIds.length} onClick={() => setSelectedRetestKind("exempt")}>
                  면제
                </Button>
                <Button size="sm" variant="danger" disabled={!selectedRetestIds.length} onClick={() => setSelectedRetestKind("fail")}>
                  미통과
                </Button>
                <Button size="sm" variant="ghost" disabled={!selectedRetestIds.length} onClick={() => setSelectedRetestKind("auto")}>
                  자동
                </Button>
              </div>
            </div>
          )}

          <section>
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-sm font-semibold text-gray-800">재시험 필요 회차</h3>
              <Badge color={retestNeeded.length ? "red" : "gray"}>{retestNeeded.length}건</Badge>
            </div>
            {retestNeeded.length === 0 ? (
              <EmptyState>현재 재시험이 필요한 회차가 없습니다.</EmptyState>
            ) : (
              <ul className="divide-y divide-gray-100">
                {retestNeeded.map((record) => (
                  <NeedsRetestRow
                    key={record.id}
                    app={app}
                    record={record}
                    selection={{
                      checked: selectedRetestRecordIds.has(record.id),
                      onChange: (checked) => toggleRetestSelection(record.id, checked),
                    }}
                  />
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-sm font-semibold text-gray-800">처리된 회차</h3>
              <Badge color={retestProcessed.length ? "green" : "gray"}>{retestProcessed.length}건</Badge>
            </div>
            {retestProcessed.length === 0 ? (
              <EmptyState>선생님이 직접 통과·면제·미통과로 처리한 회차가 여기 표시됩니다.</EmptyState>
            ) : (
              <ul className="divide-y divide-gray-100">
                {retestProcessed.map((record) => (
                  <NeedsRetestRow
                    key={record.id}
                    app={app}
                    record={record}
                    selection={{
                      checked: selectedRetestRecordIds.has(record.id),
                      onChange: (checked) => toggleRetestSelection(record.id, checked),
                    }}
                  />
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-sm font-semibold text-gray-800">지난 재시험 결과</h3>
              <Badge color="gray">{retestHistory.length}건</Badge>
            </div>
            {retestHistory.length === 0 ? (
              <EmptyState>지난 재시험 결과가 없습니다.</EmptyState>
            ) : (
              <ul className="divide-y divide-gray-100">
                {retestHistory.map((rt) => (
                  <RetestHistoryRow
                    key={rt.id}
                    app={app}
                    rt={rt}
                    selection={
                      rt.resultRecordId
                        ? {
                            checked: selectedRetestRecordIds.has(rt.resultRecordId),
                            onChange: (checked) => toggleRetestSelection(rt.resultRecordId!, checked),
                          }
                        : undefined
                    }
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      </Modal>
    </div>
  );
}
