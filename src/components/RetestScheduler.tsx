"use client";

import React, { useState } from "react";
import { AppStateHook } from "@/lib/client";
import { Button, Field, Select, Badge } from "./ui";
import DatePicker from "./DatePicker";
import { ScoreRecord } from "@/lib/types";
import { cutLabel } from "@/lib/logic";
import { recordLessonLabel } from "@/lib/course";
import { localToISO, timeOptions, todayStr, formatDateTime } from "@/lib/datetime";

/** 미통과 기록에 대해 재시험 일시(10분 단위)를 예약 */
export default function RetestScheduler({
  app,
  record,
  onDone,
}: {
  app: AppStateHook;
  record: ScoreRecord;
  onDone: () => void;
}) {
  const { db, run } = app;
  const student = db.students.find((s) => s.id === record.studentId);

  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState("18:00");
  const [busy, setBusy] = useState(false);

  const [hh, mm] = time.split(":").map(Number);
  const iso = localToISO(date, hh, mm);
  const isPast = new Date(iso).getTime() < Date.now();

  async function submit() {
    if (isPast && !confirm("지난 시각입니다. 그래도 예약할까요?")) return;
    setBusy(true);
    const r = await run({ type: "scheduleRetest", scoreRecordId: record.id, scheduledAt: iso });
    setBusy(false);
    if (!r.ok) return alert(r.error);
    onDone();
  }

  return (
    <div className="space-y-4">
      <div className="bg-red-50 rounded-xl p-3 text-sm">
        <span className="font-medium text-gray-800">{student?.name}</span> 님 ·{" "}
        {record.bookTitle} · {recordLessonLabel(record)}
        {record.retestNo > 0 && <> · 재시험 {record.retestNo}회차</>}
        <div className="mt-1 flex items-center gap-2">
          <Badge color="red">
            {record.actualScore}/{record.totalScore} · 통과 컷 {cutLabel(record)} 미달
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="재시험 날짜">
          <DatePicker value={date} min={todayStr()} onChange={setDate} />
        </Field>
        <Field label="시각 (10분 단위)">
          <Select value={time} onChange={(e) => setTime(e.target.value)}>
            {timeOptions().map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="text-sm text-gray-600">
        예약: <b>{formatDateTime(iso)}</b>
        {isPast && <span className="text-red-500 ml-2">⚠ 지난 시각</span>}
      </div>
      <div className="text-xs text-gray-400">
        ※ 예약 24시간 전·2시간 전 알림은 클라우드 배포(2단계) 후 휴대폰 푸시로 전송됩니다. 현재는 재시험 현황에서 일정과 남은 시간을 확인할 수 있습니다.
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onDone}>취소</Button>
        <Button onClick={submit} disabled={busy}>{busy ? "예약 중…" : "재시험 예약"}</Button>
      </div>
    </div>
  );
}
