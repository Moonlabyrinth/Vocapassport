"use client";

import React, { useState } from "react";
import { AppStateHook } from "@/lib/client";
import { Button, Field, Select, Badge } from "./ui";
import DatePicker from "./DatePicker";
import { RetestSchedule } from "@/lib/types";
import { localToISO, timeOptions, todayStr, formatDateTime } from "@/lib/datetime";

/** 시각 옵션에 맞춰 ISO → "HH:MM" (10분 내림) */
function isoToParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(Math.floor(d.getMinutes() / 10) * 10).padStart(2, "0");
  return { date: `${y}-${m}-${day}`, time: `${hh}:${mm}` };
}

/** 기존 재시험 예약의 일정을 다시 잡는다 (변경 이력 자동 기록) */
export default function RetestReschedule({
  app,
  retest,
  onDone,
}: {
  app: AppStateHook;
  retest: RetestSchedule;
  onDone: () => void;
}) {
  const { run } = app;
  const initial = isoToParts(retest.scheduledAt);

  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [busy, setBusy] = useState(false);

  const [hh, mm] = time.split(":").map(Number);
  const iso = localToISO(date, hh, mm);
  const isPast = new Date(iso).getTime() < Date.now();
  const unchanged = iso === retest.scheduledAt;

  async function submit() {
    if (isPast && !confirm("지난 시각입니다. 그래도 변경할까요?")) return;
    setBusy(true);
    const r = await run({ type: "rescheduleRetest", id: retest.id, scheduledAt: iso });
    setBusy(false);
    if (!r.ok) return alert(r.error);
    onDone();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-[#f1ede2] p-3 text-sm text-lab-muted">
        기존 예약 <b className="text-lab-ink">{formatDateTime(retest.scheduledAt)}</b>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="새 날짜">
          <DatePicker value={date} min={todayStr()} onChange={setDate} />
        </Field>
        <Field label="새 시각 (10분 단위)">
          <Select value={time} onChange={(e) => setTime(e.target.value)}>
            {timeOptions().map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="text-sm text-lab-muted">
        변경 후: <b>{formatDateTime(iso)}</b>
        {isPast && <span className="ml-2 text-red-500">⚠ 지난 시각</span>}
        {unchanged && <span className="ml-2"><Badge color="gray">기존과 동일</Badge></span>}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>취소</Button>
        <Button onClick={submit} disabled={busy || unchanged}>{busy ? "변경 중…" : "일정 변경"}</Button>
      </div>
    </div>
  );
}

/** 재시험 변경 이력 표시 (변경 전 → 후, 주체). 이력 없으면 null */
export function RescheduleHistory({ retest }: { retest: RetestSchedule }) {
  const list = retest.reschedules ?? [];
  if (list.length === 0) return null;
  return (
    <div className="mt-1 space-y-0.5 text-xs text-lab-muted">
      {list.map((c, i) => (
        <div key={i}>
          일정 변경: <span className="line-through">{formatDateTime(c.from)}</span> →{" "}
          <b className="text-lab-ink">{formatDateTime(c.to)}</b>{" "}
          <Badge color={c.by === "student" ? "amber" : "blue"}>
            {c.by === "student" ? "학생 변경" : "선생님 변경"}
          </Badge>
        </div>
      ))}
    </div>
  );
}
