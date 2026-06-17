"use client";

import React, { useState } from "react";
import { AppStateHook, uploadPhoto } from "@/lib/client";
import { Button, Card, Field, Input, Badge, EmptyState, Modal } from "./ui";
import { RetestSchedule, ScoreRecord, PassKindChoice } from "@/lib/types";
import { formatDateTime, relativeFromNow, todayStr } from "@/lib/datetime";
import { cutLabel, isActiveStudent, passKindLabel, passKindColor } from "@/lib/logic";
import { recordLessonLabel } from "@/lib/course";
import DatePicker from "./DatePicker";
import RetestScheduler from "./RetestScheduler";
import RetestReschedule, { RescheduleHistory } from "./RetestReschedule";

interface RowSelection {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** 기록의 현재 통과 판정 선택값 */
export function currentPassChoice(r: ScoreRecord): PassKindChoice | "passgeneric" {
  if (r.passedOverride == null) return "auto";
  if (r.passedOverride === false) return "fail";
  return r.passKind ?? "passgeneric";
}

/** 통과 종류 선택 드롭다운 (본시험/재시험/면제/미통과/자동) */
export function PassKindSelect({
  record,
  busy,
  onChoose,
}: {
  record: ScoreRecord;
  busy?: boolean;
  onChoose: (choice: PassKindChoice) => void;
}) {
  const value = currentPassChoice(record);
  return (
    <select
      value={value}
      disabled={busy}
      onChange={(e) => {
        const v = e.target.value;
        if (v !== "passgeneric") onChoose(v as PassKindChoice);
      }}
      className="rounded-lg border border-lab-line px-2 py-1.5 text-xs bg-lab-paper focus:border-brand-600 outline-none"
      aria-label="통과 판정 선택"
    >
      <option value="auto">자동 판정</option>
      <option value="main">본시험 통과</option>
      <option value="retest">재시험 통과</option>
      <option value="exempt">면제</option>
      <option value="fail">미통과</option>
      {value === "passgeneric" && (
        <option value="passgeneric" disabled>
          통과(종류 선택)
        </option>
      )}
    </select>
  );
}

/** 통과 종류 배지 (통과이고 종류가 지정된 경우만) */
export function PassKindBadge({ record }: { record: ScoreRecord }) {
  if (!record.passed) return null;
  const label = passKindLabel(record.passKind);
  if (!label) return null;
  return <Badge color={passKindColor(record.passKind)}>{label}</Badge>;
}

export default function RetestTab({ app }: { app: AppStateHook }) {
  const { db, run } = app;

  const scheduled = db.retests
    .filter((r) => {
      const student = db.students.find((s) => s.id === r.studentId);
      return r.status === "scheduled" && !!student && isActiveStudent(student);
    })
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const history = db.retests
    .filter((r) => r.status !== "scheduled")
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
    .slice(0, 50);

  const [resultFor, setResultFor] = useState<RetestSchedule | null>(null);
  const [rescheduleFor, setRescheduleFor] = useState<RetestSchedule | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 결과 기록이 있는(= 판정 변경 가능한) 지난 재시험만 선택 대상
  const selectableIds = history.flatMap((rt) => (rt.resultRecordId ? [rt.resultRecordId] : []));
  const selected = [...selectedIds].filter((id) => selectableIds.includes(id));
  const allSelected = selectableIds.length > 0 && selected.length === selectableIds.length;

  function toggle(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  async function bulk(kind: PassKindChoice) {
    if (!selected.length) return;
    const r = await run({ type: "setRecordsPassKind", recordIds: selected, kind });
    if (!r.ok) return alert(r.error);
    setSelectedIds(new Set());
  }

  return (
    <div className="space-y-4">
      <Card title={`예약된 재시험 (${scheduled.length})`}>
        {scheduled.length === 0 ? (
          <EmptyState>예약된 재시험이 없습니다.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {scheduled.map((rt) => (
              <RetestRow
                key={rt.id}
                app={app}
                rt={rt}
                onEnter={() => setResultFor(rt)}
                onReschedule={() => setRescheduleFor(rt)}
              />
            ))}
          </ul>
        )}
      </Card>

      {history.length > 0 && (
        <Card title="지난 재시험">
          {selectableIds.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 rounded-xl bg-[#f1ede2] px-3 py-2">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-sm text-lab-muted">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => setSelectedIds(e.target.checked ? new Set(selectableIds) : new Set())}
                    className="h-4 w-4 rounded border-lab-line text-brand-600"
                  />
                  전체 선택
                </label>
                <Badge color={selected.length ? "indigo" : "gray"}>선택 {selected.length}건</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Button size="sm" variant="soft" disabled={!selected.length} onClick={() => bulk("main")}>본시험 통과</Button>
                <Button size="sm" variant="soft" disabled={!selected.length} onClick={() => bulk("retest")}>재시험 통과</Button>
                <Button size="sm" variant="soft" disabled={!selected.length} onClick={() => bulk("exempt")}>면제</Button>
                <Button size="sm" variant="danger" disabled={!selected.length} onClick={() => bulk("fail")}>미통과</Button>
                <Button size="sm" variant="ghost" disabled={!selected.length} onClick={() => bulk("auto")}>자동</Button>
              </div>
            </div>
          )}
          <ul className="divide-y divide-lab-line">
            {history.map((rt) => (
              <RetestHistoryRow
                key={rt.id}
                app={app}
                rt={rt}
                selection={
                  rt.resultRecordId
                    ? {
                        checked: selectedIds.has(rt.resultRecordId),
                        onChange: (checked) => toggle(rt.resultRecordId!, checked),
                      }
                    : undefined
                }
              />
            ))}
          </ul>
        </Card>
      )}

      <Modal open={!!resultFor} onClose={() => setResultFor(null)} title="재시험 결과 입력">
        {resultFor && (
          <ResultEntry app={app} rt={resultFor} onClose={() => setResultFor(null)} />
        )}
      </Modal>

      <Modal open={!!rescheduleFor} onClose={() => setRescheduleFor(null)} title="재시험 일정 변경">
        {rescheduleFor && (
          <RetestReschedule app={app} retest={rescheduleFor} onDone={() => setRescheduleFor(null)} />
        )}
      </Modal>
    </div>
  );
}

export function RetestHistoryRow({
  app,
  rt,
  selection,
}: {
  app: AppStateHook;
  rt: RetestSchedule;
  selection?: RowSelection;
}) {
  const { db, run } = app;
  const st = db.students.find((s) => s.id === rt.studentId);
  const origin = db.records.find((r) => r.id === rt.scoreRecordId);
  const result = rt.resultRecordId ? db.records.find((r) => r.id === rt.resultRecordId) : null;
  const [busy, setBusy] = useState(false);

  async function choose(kind: PassKindChoice) {
    if (!result) return;
    setBusy(true);
    const res = await run({ type: "setRecordPassKind", recordId: result.id, kind });
    setBusy(false);
    if (!res.ok) alert(res.error);
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
      {selection && result && (
        <input
          type="checkbox"
          checked={selection.checked}
          onChange={(e) => selection.onChange(e.target.checked)}
          className="h-4 w-4 rounded border-lab-line text-brand-600"
          aria-label="재시험 결과 선택"
        />
      )}
      <div className="min-w-0">
        <div className="font-medium text-lab-ink">
          {st?.name} <span className="text-xs text-lab-muted">· {formatDateTime(rt.scheduledAt)}</span>
        </div>
        <div className="text-xs text-lab-muted mt-0.5">
          {origin ? `${origin.bookTitle} · ${recordLessonLabel(origin)}` : "재시험"}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {rt.status === "canceled" && <Badge color="gray">취소</Badge>}
        {rt.status === "missed" && <Badge color="amber">미응시</Badge>}
        {rt.status === "completed" && result && (
          <>
            {result.passed ? (
              <Badge color="green">통과 {result.actualScore}/{result.totalScore}</Badge>
            ) : (
              <Badge color="red">미통과 {result.actualScore}/{result.totalScore}</Badge>
            )}
            <PassKindBadge record={result} />
            <PassKindSelect record={result} busy={busy} onChoose={choose} />
          </>
        )}
      </div>
    </li>
  );
}

export function NeedsRetestRow({
  app,
  record,
  selection,
}: {
  app: AppStateHook;
  record: ScoreRecord;
  selection?: RowSelection;
}) {
  const { db, run } = app;
  const st = db.students.find((s) => s.id === record.studentId);
  const cls = db.classes.find((c) => c.id === record.classId);
  const [busy, setBusy] = useState(false);

  async function choose(kind: PassKindChoice) {
    setBusy(true);
    const res = await run({ type: "setRecordPassKind", recordId: record.id, kind });
    setBusy(false);
    if (!res.ok) alert(res.error);
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
      {selection && (
        <input
          type="checkbox"
          checked={selection.checked}
          onChange={(e) => selection.onChange(e.target.checked)}
          className="h-4 w-4 rounded border-lab-line text-brand-600"
          aria-label="재시험 필요 회차 선택"
        />
      )}
      <div className="min-w-0">
        <div className="font-medium text-lab-ink">
          {st?.name} <span className="text-xs text-lab-muted">· {cls?.name} · {record.examDate}</span>
        </div>
        <div className="text-xs text-lab-muted mt-0.5">
          {record.bookTitle} · {recordLessonLabel(record)}
          {record.retestNo > 0 ? ` · 재시험 ${record.retestNo + 1}회차 필요` : ""}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {record.passed ? (
          <Badge color="green">통과 {record.actualScore}/{record.totalScore}</Badge>
        ) : (
          <Badge color="red">재시험 필요 {record.actualScore}/{record.totalScore}</Badge>
        )}
        <Badge color="gray">컷 {cutLabel(record)}</Badge>
        <PassKindBadge record={record} />
        <PassKindSelect record={record} busy={busy} onChoose={choose} />
      </div>
    </li>
  );
}

function RetestRow({
  app,
  rt,
  onEnter,
  onReschedule,
}: {
  app: AppStateHook;
  rt: RetestSchedule;
  onEnter: () => void;
  onReschedule: () => void;
}) {
  const { db, run } = app;
  const st = db.students.find((s) => s.id === rt.studentId);
  const cls = db.classes.find((c) => c.id === rt.classId);
  const origin = db.records.find((r) => r.id === rt.scoreRecordId);
  const soon = new Date(rt.scheduledAt).getTime() - Date.now() < 2 * 3600 * 1000;
  const past = new Date(rt.scheduledAt).getTime() < Date.now();

  return (
    <li className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 ${past ? "border-red-200 bg-red-50" : "border-lab-line"}`}>
      <div>
        <div className="font-medium text-lab-ink">
          {st?.name} <span className="text-xs text-lab-muted">· {cls?.name}</span>
        </div>
        <div className="text-sm text-lab-muted">
          {origin ? `${origin.bookTitle} · ${recordLessonLabel(origin)}` : ""}
          {origin && origin.retestNo > 0 ? ` · 재시험 ${origin.retestNo + 1}회차` : ""}
        </div>
        <div className="text-sm mt-1 flex items-center gap-2">
          <span className="text-lab-ink">{formatDateTime(rt.scheduledAt)}</span>
          <Badge color={past ? "red" : soon ? "amber" : "blue"}>{relativeFromNow(rt.scheduledAt)}</Badge>
        </div>
        <RescheduleHistory retest={rt} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={onEnter}>결과 입력</Button>
        <Button size="sm" variant="soft" onClick={onReschedule}>일정 변경</Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            if (confirm("이 재시험 예약을 취소할까요?")) await run({ type: "cancelRetest", id: rt.id });
          }}
        >취소</Button>
      </div>
    </li>
  );
}

function ResultEntry({
  app,
  rt,
  onClose,
}: {
  app: AppStateHook;
  rt: RetestSchedule;
  onClose: () => void;
}) {
  const { db, run } = app;
  const origin = db.records.find((r) => r.id === rt.scoreRecordId);
  const st = db.students.find((s) => s.id === rt.studentId);

  const [total, setTotal] = useState<number>(origin?.totalScore ?? 20);
  const [actual, setActual] = useState<string>("");
  const [examDate, setExamDate] = useState(todayStr());
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 재시험 후 미통과 → 재재시험 예약 화면 전환
  const [needNext, setNeedNext] = useState<ScoreRecord | null>(null);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      setPhotoPath(await uploadPhoto(f));
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function submit() {
    if (actual === "") return alert("점수를 입력하세요.");
    setBusy(true);
    const r = await run({
      type: "completeRetest",
      retestId: rt.id,
      actualScore: Number(actual),
      totalScore: total,
      examDate,
      photoPath,
    });
    setBusy(false);
    if (!r.ok) return alert(r.error);
    if (r.passed) {
      onClose();
    } else if (r.recordId) {
      // 재재시험 필요 → 새 기록으로 다시 예약
      const fresh = await fetch("/api/state", { cache: "no-store" }).then((x) => x.json());
      const rec = fresh.records.find((x: ScoreRecord) => x.id === r.recordId);
      if (rec) setNeedNext(rec);
      else onClose();
    }
  }

  if (needNext) {
    return (
      <div className="space-y-3">
        <div className="bg-red-50 rounded-xl p-3 text-sm text-red-700">
          재시험도 통과하지 못했습니다. 재재시험 일정을 예약하세요.
        </div>
        <RetestScheduler app={app} record={needNext} onDone={onClose} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-lab-muted">
        <b>{st?.name}</b> · {origin ? `${origin.bookTitle} · ${recordLessonLabel(origin)}` : ""}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="만점">
          <Input type="number" min={1} value={total} onChange={(e) => setTotal(Number(e.target.value))} />
        </Field>
        <Field label="실제 성적">
          <Input type="number" min={0} max={total} value={actual} onChange={(e) => setActual(e.target.value)} />
        </Field>
        <Field label="시험 날짜">
          <DatePicker value={examDate} onChange={setExamDate} />
        </Field>
        <Field label="사진 (선택)">
          <input type="file" accept="image/*" capture="environment" onChange={onPhoto} className="text-sm" />
        </Field>
      </div>
      {photoPath && <Badge color="green">사진 첨부됨</Badge>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>닫기</Button>
        <Button onClick={submit} disabled={busy}>{busy ? "처리 중…" : "결과 저장 + 재판정"}</Button>
      </div>
    </div>
  );
}
