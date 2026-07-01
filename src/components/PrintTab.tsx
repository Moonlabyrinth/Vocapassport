"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppStateHook } from "@/lib/client";
import { Button, Card, Field, Input, Select, Badge, EmptyState, TextInput } from "./ui";
import DatePicker from "./DatePicker";
import { isActiveStudent } from "@/lib/logic";
import { maxSessionsForBook, sessionDayRange, recordLessonLabel } from "@/lib/course";
import { todayStr } from "@/lib/datetime";
import { ScheduleType } from "@/lib/types";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const LS_KEY = "vp-print-plan-v1";

/** 인쇄 명단 한 줄 = 한 반의 그날 정규 진도 */
interface PrintRow {
  id: string;
  classId: string;
  bookId: string; // "" = 직접 입력 / 미선택
  bookTitle: string;
  round: number;
  session: number | "";
  /** 여분 부수 개별 지정. null이면 공통 여분 사용 */
  spareOverride: number | null;
}

function makeRow(patch: Partial<PrintRow> = {}): PrintRow {
  return {
    id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    classId: "",
    bookId: "",
    bookTitle: "",
    round: 1,
    session: "",
    spareOverride: null,
    ...patch,
  };
}

/** 선택한 날짜(YYYY-MM-DD)의 요일 인덱스(0=일). 로컬 기준 수동 파싱(TZ 이슈 회피) */
function weekdayOf(dateStr: string): number | null {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).getDay();
}

/** 요일 → 수업 요일제 */
function scheduleTypeForWeekday(wd: number): ScheduleType | null {
  if (wd === 1 || wd === 3 || wd === 5) return "월수금";
  if (wd === 2 || wd === 4) return "화목";
  return null;
}

export default function PrintTab({ app }: { app: AppStateHook }) {
  const { db } = app;

  const [date, setDate] = useState(todayStr());
  const [spare, setSpare] = useState(2);
  const [rows, setRows] = useState<PrintRow[]>([]);

  // 마지막 명단·여분 로컬 복원 (없어진 반은 제외). DB 로드 후 한 번만.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    if (db.classes.length === 0) return;
    restored.current = true;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { spare?: number; rows?: PrintRow[] };
      if (typeof saved.spare === "number" && saved.spare >= 0) setSpare(saved.spare);
      if (Array.isArray(saved.rows)) {
        const valid = new Set(db.classes.map((c) => c.id));
        setRows(
          saved.rows
            .filter((r) => r && valid.has(r.classId))
            .map((r) => ({ ...makeRow(), ...r }))
        );
      }
    } catch {
      /* 파싱 실패 시 무시 */
    }
  }, [db.classes]);

  // 명단·여분 변경 시 로컬 저장 (복원 이후에만)
  useEffect(() => {
    if (!restored.current) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ spare, rows }));
    } catch {
      /* 저장 실패 시 무시 */
    }
  }, [spare, rows]);

  function updateRow(id: string, patch: Partial<PrintRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function removeRow(id: string) {
    setRows((rs) => rs.filter((r) => r.id !== id));
  }
  function setRowClass(id: string, classId: string) {
    updateRow(id, { classId, bookId: "", bookTitle: "", session: "" });
  }
  function setRowBook(id: string, bookId: string) {
    const b = db.books.find((x) => x.id === bookId);
    updateRow(id, { bookId, bookTitle: b ? b.title : "", session: "" });
  }

  function activeCount(classId: string): number {
    return db.students.filter((s) => s.classId === classId && isActiveStudent(s)).length;
  }

  const wd = weekdayOf(date);
  const todaySchedule = wd == null ? null : scheduleTypeForWeekday(wd);
  const todayClasses = todaySchedule
    ? db.classes.filter((c) => c.scheduleType === todaySchedule)
    : [];

  function loadScheduledClasses() {
    if (todayClasses.length === 0) return;
    setRows((rs) => {
      const existing = new Set(rs.map((r) => r.classId));
      const additions = todayClasses
        .filter((c) => !existing.has(c.id))
        .map((c) => makeRow({ classId: c.id }));
      return [...rs, ...additions];
    });
  }

  // 집계: 같은 책·회독·회차는 한 줄로 합산, 반별 내역 보관
  const { aggregates, totalCopies, kinds, incompleteRows } = useMemo(() => {
    interface AggClass {
      className: string;
      active: number;
      spare: number;
      copies: number;
    }
    interface Agg {
      key: string;
      label: string;
      bookTitle: string;
      copies: number;
      classes: AggClass[];
    }
    const map = new Map<string, Agg>();
    let total = 0;
    let incomplete = 0;
    for (const r of rows) {
      const complete = r.classId && r.bookTitle.trim() !== "" && r.session !== "";
      if (!complete) {
        if (r.classId || r.bookTitle.trim() || r.session !== "") incomplete += 1;
        continue;
      }
      const active = activeCount(r.classId);
      const eff = r.spareOverride ?? spare;
      const copies = active + eff;
      total += copies;
      const key = `${r.bookTitle}|${r.round}|${r.session}`;
      const label = recordLessonLabel({
        bookTitle: r.bookTitle,
        round: r.round,
        session: r.session as number,
      });
      const cls = db.classes.find((c) => c.id === r.classId);
      const entry =
        map.get(key) ?? { key, label, bookTitle: r.bookTitle, copies: 0, classes: [] };
      entry.copies += copies;
      entry.classes.push({ className: cls?.name ?? "?", active, spare: eff, copies });
      map.set(key, entry);
    }
    const list = [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "ko"));
    return {
      aggregates: list,
      totalCopies: total,
      kinds: list.length,
      incompleteRows: incomplete,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, spare, db.students, db.classes]);

  const dateLabel = wd == null ? date : `${date} (${WEEKDAYS[wd]})`;

  return (
    <div className="space-y-4">
      {db.classes.length === 0 && (
        <Card>
          <EmptyState>
            먼저 <b>관리</b> 탭에서 반·학생·책을 등록하세요.
          </EmptyState>
        </Card>
      )}

      {/* 컨트롤 */}
      <Card title="오늘 뽑을 정규 시험지" className="no-print">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="날짜" hint="요일 표시용(부수 계산엔 영향 없음)">
            <DatePicker value={date} onChange={setDate} />
          </Field>
          <Field label="공통 여분(부)" hint="모든 반에 더할 여유분">
            <Input
              type="number"
              min={0}
              value={spare}
              onChange={(e) => setSpare(Math.max(0, Number(e.target.value) || 0))}
            />
          </Field>
          <div className="flex items-end">
            <div className="text-sm text-lab-muted">
              {todaySchedule
                ? `${dateLabel} · ${todaySchedule} 수업일`
                : `${dateLabel} · 정규 수업 없는 요일`}
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => setRows((rs) => [...rs, makeRow()])}>+ 반 추가</Button>
          <Button
            variant="soft"
            onClick={loadScheduledClasses}
            disabled={todayClasses.length === 0}
          >
            {todaySchedule
              ? `${todaySchedule} 반 불러오기 (${todayClasses.length})`
              : "수업 반 불러오기"}
          </Button>
          {rows.length > 0 && (
            <Button
              variant="ghost"
              onClick={() => {
                if (confirm("작성한 명단을 모두 지울까요?")) setRows([]);
              }}
            >
              전체 지우기
            </Button>
          )}
        </div>
      </Card>

      {/* 반별 진도 입력 */}
      <Card title="반별 진도 선택" className="no-print">
        {rows.length === 0 ? (
          <EmptyState>
            <b>+ 반 추가</b>로 반을 넣고 단어장·회독·회차를 고르면 부수가 자동 계산됩니다.
          </EmptyState>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const books = db.books.filter((b) => b.classId === r.classId);
              const eff = r.spareOverride ?? spare;
              const active = r.classId ? activeCount(r.classId) : 0;
              const copies = r.classId ? active + eff : 0;
              const sessionOptions = r.bookTitle
                ? Array.from({ length: maxSessionsForBook(r.bookTitle) }, (_, i) => i + 1)
                : [];
              return (
                <div
                  key={r.id}
                  className="rounded-xl border border-lab-line bg-[#faf8f2] p-3"
                >
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                    <Field label="반">
                      <Select
                        value={r.classId}
                        onChange={(e) => setRowClass(r.id, e.target.value)}
                      >
                        <option value="">반 선택</option>
                        {db.classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </Field>

                    <Field label="단어장">
                      {books.length > 0 ? (
                        <Select
                          value={r.bookId}
                          onChange={(e) =>
                            e.target.value
                              ? setRowBook(r.id, e.target.value)
                              : updateRow(r.id, { bookId: "", bookTitle: "", session: "" })
                          }
                          disabled={!r.classId}
                        >
                          <option value="">직접 입력</option>
                          {books.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.title}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <TextInput
                          value={r.bookTitle}
                          onChange={(v) => updateRow(r.id, { bookTitle: v, session: "" })}
                          placeholder="단어장 제목"
                          disabled={!r.classId}
                        />
                      )}
                    </Field>

                    <Field label="회독">
                      <Select
                        value={r.round}
                        onChange={(e) => updateRow(r.id, { round: Number(e.target.value) })}
                      >
                        <option value={1}>1회독</option>
                        <option value={2}>2회독</option>
                        <option value={3}>3회독</option>
                      </Select>
                    </Field>

                    <Field label="회차(Day)">
                      <Select
                        value={r.session}
                        onChange={(e) =>
                          updateRow(r.id, {
                            session: e.target.value ? Number(e.target.value) : "",
                          })
                        }
                        disabled={!r.bookTitle}
                      >
                        <option value="">선택</option>
                        {sessionOptions.map((n) => (
                          <option key={n} value={n}>
                            {n}회차 · {sessionDayRange(n, r.bookTitle)}
                          </option>
                        ))}
                      </Select>
                    </Field>

                    <Field label="여분(부)">
                      <Input
                        type="number"
                        min={0}
                        value={eff}
                        onChange={(e) =>
                          updateRow(r.id, {
                            spareOverride: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        disabled={!r.classId}
                      />
                    </Field>

                    <div className="flex items-end justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="text-base font-medium text-lab-navy mb-1">부수</span>
                        {r.classId ? (
                          <Badge color={copies > 0 ? "indigo" : "gray"} size="lg">
                            {copies}부
                          </Badge>
                        ) : (
                          <Badge color="gray">—</Badge>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => removeRow(r.id)}
                      >
                        삭제
                      </Button>
                    </div>
                  </div>
                  {r.classId && (
                    <div className="mt-2 text-xs text-lab-muted">
                      재원생 {active}명 + 여분 {eff}부
                      {r.classId && r.bookTitle && r.session === "" && (
                        <span className="ml-2 text-amber-600">· 회차를 선택하세요</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* 인쇄 명단 */}
      <Card
        title="인쇄 명단"
        className="no-print"
        right={
          <Button
            variant="navy"
            onClick={() => window.print()}
            disabled={aggregates.length === 0}
          >
            🖨️ 인쇄
          </Button>
        }
      >
        {aggregates.length === 0 ? (
          <EmptyState>선택한 진도가 없습니다. 위에서 반·단어장·회차를 채워주세요.</EmptyState>
        ) : (
          <p className="text-sm text-lab-muted">
            아래 명단이 그대로 인쇄됩니다. 총 <b>{kinds}</b>종 · <b>{totalCopies}</b>부.
            {incompleteRows > 0 && (
              <span className="text-amber-600"> (미완성 {incompleteRows}행 제외)</span>
            )}
          </p>
        )}
      </Card>

      {aggregates.length > 0 && (
        <div className="print-area">
          <div className="rounded-2xl border border-lab-line bg-white p-6">
            <div className="flex items-baseline justify-between border-b border-lab-line pb-3">
              <h2 className="text-xl font-bold text-lab-navy">정규 단어시험지 출력 명단</h2>
              <span className="text-sm text-lab-muted">{dateLabel}</span>
            </div>

            <table className="w-full text-sm mt-3">
              <thead>
                <tr className="text-left text-lab-muted border-b border-lab-line">
                  <th className="py-2 pr-3 font-medium">단어장 · 진도</th>
                  <th className="py-2 pr-3 font-medium">해당 반</th>
                  <th className="py-2 pr-3 font-medium text-right whitespace-nowrap">부수</th>
                </tr>
              </thead>
              <tbody>
                {aggregates.map((a) => (
                  <tr key={a.key} className="border-b border-lab-line align-top">
                    <td className="py-2 pr-3 text-lab-ink">
                      <div className="font-medium">{a.bookTitle}</div>
                      <div className="text-lab-muted">{a.label}</div>
                    </td>
                    <td className="py-2 pr-3 text-lab-muted">
                      {a.classes.map((c, i) => (
                        <div key={i}>
                          {c.className} — {c.copies}부{" "}
                          <span className="text-xs">(재원 {c.active}+여분 {c.spare})</span>
                        </div>
                      ))}
                    </td>
                    <td className="py-2 pr-3 text-right align-middle">
                      <span className="text-2xl font-bold text-lab-navy whitespace-nowrap">
                        {a.copies}부
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="py-3 pr-3 font-semibold text-lab-navy" colSpan={2}>
                    총 {kinds}종
                  </td>
                  <td className="py-3 pr-3 text-right font-bold text-lab-navy whitespace-nowrap">
                    총 {totalCopies}부
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
