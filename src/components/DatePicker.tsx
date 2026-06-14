"use client";

import React, { useEffect, useRef, useState } from "react";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`;
function parse(v: string): { y: number; m: number; d: number } | null {
  if (!v) return null;
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m: m - 1, d };
}

/** 일요일 시작 커스텀 날짜 선택기 (네이티브 date 대체) */
export default function DatePicker({
  value,
  onChange,
  min,
  className = "",
  placeholder = "날짜 선택",
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const sel = parse(value);
  const now = new Date();
  const [viewY, setViewY] = useState(sel?.y ?? now.getFullYear());
  const [viewM, setViewM] = useState(sel?.m ?? now.getMonth());

  useEffect(() => {
    if (open) {
      const s = parse(value);
      if (s) { setViewY(s.y); setViewM(s.m); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const firstDow = new Date(viewY, viewM, 1).getDay(); // 0=일
  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const todayStr = fmt(now.getFullYear(), now.getMonth(), now.getDate());

  function shift(delta: number) {
    const d = new Date(viewY, viewM + delta, 1);
    setViewY(d.getFullYear());
    setViewM(d.getMonth());
  }
  function isDisabled(d: number) {
    return min ? fmt(viewY, viewM, d) < min : false;
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full rounded-xl border border-lab-line px-3 py-2.5 text-sm text-left bg-white focus:border-brand-600 focus:ring-2 focus:ring-brand-100 outline-none ${
          sel ? "text-lab-ink" : "text-lab-muted"
        } ${className}`}
      >
        {sel ? `${sel.y}-${pad(sel.m + 1)}-${pad(sel.d)}` : placeholder}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-72 bg-white rounded-xl border border-lab-line shadow-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => shift(-1)} className="w-8 h-8 rounded-lg hover:bg-[#e9e3d6] text-lab-muted text-lg leading-none">‹</button>
            <div className="font-medium text-lab-ink text-sm">{viewY}년 {viewM + 1}월</div>
            <button type="button" onClick={() => shift(1)} className="w-8 h-8 rounded-lg hover:bg-[#e9e3d6] text-lab-muted text-lg leading-none">›</button>
          </div>
          <div className="grid grid-cols-7 text-center text-xs mb-1">
            {WEEKDAYS.map((w, i) => (
              <div key={w} className={`py-1 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-lab-muted"}`}>{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              if (d === null) return <div key={i} />;
              const col = i % 7;
              const dateStr = fmt(viewY, viewM, d);
              const selected = !!sel && sel.y === viewY && sel.m === viewM && sel.d === d;
              const isToday = dateStr === todayStr;
              const disabled = isDisabled(d);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => { onChange(dateStr); setOpen(false); }}
                  className={`h-9 rounded-lg text-sm transition ${
                    selected
                      ? "bg-brand-600 text-white font-semibold"
                      : disabled
                      ? "text-[#d9d4c8] cursor-not-allowed"
                      : `hover:bg-brand-50 ${col === 0 ? "text-red-500" : col === 6 ? "text-blue-500" : "text-lab-ink"}`
                  } ${isToday && !selected ? "ring-1 ring-brand-300" : ""}`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
