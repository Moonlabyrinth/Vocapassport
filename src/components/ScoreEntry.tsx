"use client";

import React, { useMemo, useState } from "react";
import { AppStateHook, uploadPhoto } from "@/lib/client";
import { Button, Card, Field, Input, Select, Badge, EmptyState, Modal } from "./ui";
import DatePicker from "./DatePicker";
import { isActiveStudent, percentOf, resolveThreshold } from "@/lib/logic";
import { maxSessionsForBook, recordLessonLabel, sessionDayRange } from "@/lib/course";
import { todayStr } from "@/lib/datetime";
import RetestScheduler from "./RetestScheduler";
import { ScoreRecord } from "@/lib/types";

export default function ScoreEntry({ app }: { app: AppStateHook }) {
  const { db, run } = app;

  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [bookId, setBookId] = useState("");
  const [bookTitle, setBookTitle] = useState("");
  const [total, setTotal] = useState<number>(20);
  const [actual, setActual] = useState<string>("");
  const [isAbsent, setIsAbsent] = useState(false);
  const [round, setRound] = useState(1);
  const [session, setSession] = useState<number | "">("");
  const [examDate, setExamDate] = useState(todayStr());
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  // 이동/지난 반 성적 입력 모드: 반이 바뀐 학생의 과거 반 성적 입력용
  const [pastClassMode, setPastClassMode] = useState(false);

  // 방금 만든 미통과 기록 → 재시험 예약 모달
  const [retestFor, setRetestFor] = useState<ScoreRecord | null>(null);

  const students = useMemo(() => {
    if (pastClassMode) {
      // 반 무관 전체 학생(퇴원 포함). 위에서 고른 반이 기록의 '지난 반'이 된다.
      return [...db.students].sort((a, b) => a.name.localeCompare(b.name, "ko"));
    }
    return db.students.filter((s) => s.classId === classId && isActiveStudent(s));
  }, [db.students, classId, pastClassMode]);
  const books = db.books.filter((b) => b.classId === classId);
  const cls = db.classes.find((c) => c.id === classId);
  const book = db.books.find((b) => b.id === bookId) || null;
  const usePassMark = book && book.passMark != null;
  const threshold = cls ? resolveThreshold(cls, book) : null;
  const cutText = usePassMark ? `${book!.passMark}점` : threshold != null ? `${threshold}%` : null;
  const sessionOptions = bookTitle
    ? Array.from({ length: maxSessionsForBook(bookTitle) }, (_, i) => i + 1)
    : [];

  // 실시간 미리보기
  const preview = useMemo(() => {
    if (isAbsent) return null;
    const a = Number(actual);
    if (!actual || !total || Number.isNaN(a)) return null;
    const pct = percentOf(a, total);
    const passed = usePassMark
      ? a + 1e-9 >= book!.passMark!
      : threshold != null && pct + 1e-9 >= threshold;
    return { pct, passed, perfect: a >= total };
  }, [actual, total, threshold, usePassMark, book, isAbsent]);

  function pickBook(id: string) {
    setBookId(id);
    const b = db.books.find((x) => x.id === id);
    if (b) {
      setBookTitle(b.title);
      setTotal(b.defaultTotalScore);
      setSession("");
    }
  }

  function resetClass(id: string) {
    setClassId(id);
    setStudentId("");
    setBookId("");
    setBookTitle("");
    setSession("");
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const path = await uploadPhoto(f);
      setPhotoPath(path);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!classId) return alert("반을 선택하세요.");
    if (!studentId) return alert("학생을 선택하세요.");
    if (!bookTitle.trim()) return alert("책 제목을 입력/선택하세요.");
    if (!isAbsent && actual === "") return alert("실제 성적을 입력하세요.");
    setBusy(true);
    const r = await run({
      type: "createRecord",
      classId,
      studentId,
      bookId: bookId || null,
      bookTitle,
      round,
      session: session === "" ? null : session,
      totalScore: total,
      actualScore: isAbsent ? 0 : Number(actual),
      isAbsent,
      examDate,
      photoPath,
    });
    setBusy(false);
    if (!r.ok) return alert(r.error);
    // 입력 초기화 (반/책/회독/날짜는 유지)
    setActual("");
    setIsAbsent(false);
    setPhotoPath(null);
    if (r.needsRetest && r.recordId) {
      // 방금 만든 기록을 다시 찾아 재시험 예약 모달
      const fresh = await fetch("/api/state", { cache: "no-store" }).then((x) => x.json());
      const rec = fresh.records.find((x: ScoreRecord) => x.id === r.recordId);
      if (rec) setRetestFor(rec);
    }
  }

  const recent = [...db.records]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12);

  return (
    <div className="space-y-4">
      {db.classes.length === 0 && (
        <Card>
          <EmptyState>
            먼저 <b>관리</b> 탭에서 반·학생·책을 등록하세요.
          </EmptyState>
        </Card>
      )}

      <Card title="점수 입력">
        <label className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-lab-line bg-[#f1ede2] px-3 py-2 text-sm text-lab-ink">
          <input
            type="checkbox"
            checked={pastClassMode}
            onChange={(e) => {
              setPastClassMode(e.target.checked);
              setStudentId("");
            }}
            className="h-4 w-4 rounded border-lab-line text-brand-600"
          />
          <span className="font-medium">이동·지난 반 성적 입력</span>
          <span className="text-xs text-lab-muted">
            반이 바뀐 학생의 <b>지난 반(위에서 고른 반)</b> 성적을 입력할 때 켜세요. 선택한 반의 책·통과컷이 적용됩니다.
          </span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="반">
            <Select value={classId} onChange={(e) => resetClass(e.target.value)}>
              <option value="">반 선택</option>
              {db.classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="이름" hint={pastClassMode ? "전체 학생 중 선택 (괄호는 현재 반)" : undefined}>
            <Select value={studentId} onChange={(e) => setStudentId(e.target.value)} disabled={!classId}>
              <option value="">학생 선택</option>
              {students.map((s) => {
                const sc = pastClassMode ? db.classes.find((c) => c.id === s.classId) : null;
                const label = pastClassMode
                  ? `${s.name}${sc ? ` (현재 ${sc.name})` : ""}${isActiveStudent(s) ? "" : " · 퇴원"}`
                  : s.name;
                return (
                  <option key={s.id} value={s.id}>{label}</option>
                );
              })}
            </Select>
          </Field>
          <Field label="회독">
            <Select value={round} onChange={(e) => setRound(Number(e.target.value))}>
              <option value={1}>1회독</option>
              <option value={2}>2회독</option>
              <option value={3}>3회독</option>
            </Select>
          </Field>

          <Field label="책 제목">
            {books.length > 0 ? (
              <Select
                value={bookId}
                onChange={(e) => (e.target.value ? pickBook(e.target.value) : (setBookId(""), setBookTitle(""), setSession("")))}
                disabled={!classId}
              >
                <option value="">직접 입력</option>
                {books.map((b) => (
                  <option key={b.id} value={b.id}>{b.title}</option>
                ))}
              </Select>
            ) : (
              <Input value={bookTitle} onChange={(e) => setBookTitle(e.target.value)} placeholder="책 제목" disabled={!classId} />
            )}
          </Field>
          {books.length > 0 && !bookId && (
            <Field label="책 제목 직접 입력">
              <Input value={bookTitle} onChange={(e) => setBookTitle(e.target.value)} placeholder="책 제목" />
            </Field>
          )}

          <Field label="회차(Day)" hint={bookTitle ? "고난도 Day40, 필수 Day50 기준" : "책을 먼저 선택하세요"}>
            <Select
              value={session}
              onChange={(e) => setSession(e.target.value ? Number(e.target.value) : "")}
              disabled={!bookTitle}
            >
              <option value="">선택 안 함</option>
              {sessionOptions.map((n) => (
                <option key={n} value={n}>
                  {n}회차 · {sessionDayRange(n, bookTitle)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="만점">
            <Input type="number" min={1} value={total} onChange={(e) => setTotal(Number(e.target.value))} />
          </Field>
          <Field label="실제 성적">
            <Input
              type="number"
              min={0}
              max={total}
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              placeholder="점수 입력"
              disabled={isAbsent}
            />
          </Field>
          <Field label="결석 여부" hint="점수 대신 결석으로 기록합니다.">
            <label className="flex h-[46px] items-center gap-2 rounded-xl border border-lab-line bg-lab-paper px-3 text-base text-lab-ink">
              <input
                type="checkbox"
                checked={isAbsent}
                onChange={(e) => {
                  setIsAbsent(e.target.checked);
                  if (e.target.checked) setActual("");
                }}
                className="h-4 w-4 rounded border-lab-line text-brand-600"
              />
              결석
            </label>
          </Field>
          <Field label="시험 날짜">
            <DatePicker value={examDate} onChange={setExamDate} />
          </Field>
          <Field label="사진 (선택)" hint="시험지 촬영본">
            <input type="file" accept="image/*" capture="environment" onChange={onPhoto} className="text-sm" />
          </Field>
        </div>

        {/* 실시간 판정 미리보기 */}
        <div className="mt-4 flex flex-wrap items-center gap-2 min-h-[2rem]">
          {cutText && <Badge color="indigo">통과 컷 {cutText}</Badge>}
          {uploading && <Badge color="gray">사진 업로드 중…</Badge>}
          {photoPath && <Badge color="green">사진 첨부됨</Badge>}
          {isAbsent && <Badge color="gray">결석으로 기록</Badge>}
          {preview && (
            <>
              <Badge color="gray">{Math.round(preview.pct * 10) / 10}%</Badge>
              {preview.perfect ? (
                <Badge color="amber">만점! 🎉</Badge>
              ) : preview.passed ? (
                <Badge color="green">통과</Badge>
              ) : (
                <Badge color="red">재시험 대상</Badge>
              )}
            </>
          )}
        </div>

        <div className="mt-4">
          <Button onClick={submit} disabled={busy} className="w-full sm:w-auto">
            {busy ? "저장 중…" : "점수 저장 + 자동 판정"}
          </Button>
        </div>
      </Card>

      {/* 최근 입력 */}
      <Card title="최근 입력">
        {recent.length === 0 ? (
          <EmptyState>아직 입력된 점수가 없습니다.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-lab-muted border-b border-lab-line">
                  <th className="py-2 pr-3 font-medium">학생</th>
                  <th className="py-2 pr-3 font-medium">책</th>
                  <th className="py-2 pr-3 font-medium">회독</th>
                  <th className="py-2 pr-3 font-medium">점수</th>
                  <th className="py-2 pr-3 font-medium">판정</th>
                  <th className="py-2 pr-3 font-medium">날짜</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => {
                  const st = db.students.find((s) => s.id === r.studentId);
                  const hasRetest = db.retests.some(
                    (rt) => rt.scoreRecordId === r.id && rt.status === "scheduled"
                  );
                  return (
                    <tr key={r.id} className="border-b border-lab-line">
                      <td className="py-2 pr-3 text-lab-ink">{st?.name ?? "?"}</td>
                      <td className="py-2 pr-3 text-lab-muted">{r.bookTitle}</td>
                      <td className="py-2 pr-3 text-lab-muted">{recordLessonLabel(r)}{r.retestNo > 0 ? ` · 재${r.retestNo}` : ""}</td>
                      <td className="py-2 pr-3 text-lab-ink">{r.isAbsent ? "결석" : `${r.actualScore}/${r.totalScore}`}</td>
                      <td className="py-2 pr-3">
                        {r.isAbsent ? <Badge color="gray">결석</Badge> : r.isPerfect ? <Badge color="amber">만점</Badge> : r.passed ? <Badge color="green">통과</Badge> : <Badge color="red">미통과</Badge>}
                      </td>
                      <td className="py-2 pr-3 text-lab-muted">{r.examDate.slice(5)}</td>
                      <td className="py-2">
                        <div className="flex justify-end gap-1">
                        {!r.isAbsent && !r.passed && !hasRetest && (
                          <Button size="sm" variant="soft" onClick={() => setRetestFor(r)}>재시험 예약</Button>
                        )}
                        {!r.isAbsent && !r.passed && hasRetest && <Badge color="blue">예약됨</Badge>}
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={async () => {
                              if (!confirm("이 점수 기록을 삭제할까요? 연결된 재시험 예약/결과도 함께 삭제됩니다.")) return;
                              const result = await app.run({ type: "deleteRecord", id: r.id });
                              if (!result.ok) alert(result.error);
                            }}
                          >
                            삭제
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!retestFor} onClose={() => setRetestFor(null)} title="재시험 일정 예약">
        {retestFor && (
          <RetestScheduler
            app={app}
            record={retestFor}
            onDone={() => setRetestFor(null)}
          />
        )}
      </Modal>
    </div>
  );
}
