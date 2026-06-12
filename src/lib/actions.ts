// 서버 액션(명령) 리듀서
// 클라이언트는 { type, payload } 를 POST /api/command 로 보내고,
// 서버는 mutate() 안에서 applyAction(db, action) 을 실행한다.
// ⚠️ 이 파일은 node 전용 모듈(fs 등)을 import 하지 않는다 → 타입을 클라이언트와 공유 가능.

import {
  Database,
  ScheduleType,
  ScoreRecord,
  RetestSchedule,
  PassKindChoice,
  MonthlySection,
} from "./types";
import { isPassed, isPerfect, resolveThreshold } from "./logic";

// 순수 id 생성기 (fs 의존 없음)
function genId(prefix = ""): string {
  const s = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  return prefix ? `${prefix}_${s}` : s;
}

export type Action =
  | { type: "createClass"; name: string; scheduleType: ScheduleType; passThreshold: number }
  | { type: "updateClass"; id: string; patch: Partial<{ name: string; scheduleType: ScheduleType; passThreshold: number }> }
  | { type: "deleteClass"; id: string }
  | { type: "createStudent"; classId: string; name: string }
  | { type: "updateStudent"; id: string; patch: Partial<{ classId: string; name: string; status: "active" | "withdrawn"; withdrawnAt: string | null }> }
  | { type: "deleteStudent"; id: string }
  | { type: "createBook"; classId: string; title: string; defaultTotalScore: number; passThreshold: number | null; passMark?: number | null }
  | { type: "updateBook"; id: string; patch: Partial<{ title: string; defaultTotalScore: number; passThreshold: number | null; passMark: number | null }> }
  | { type: "deleteBook"; id: string }
  | {
      type: "createRecord";
      classId: string;
      studentId: string;
      bookId: string | null;
      bookTitle: string;
      round: number;
      session: number | null;
      totalScore: number;
      actualScore: number;
      examDate: string;
      photoPath?: string | null;
    }
  | { type: "updateRecord"; id: string; patch: Partial<{ totalScore: number; actualScore: number; round: number; session: number | null; bookTitle: string; examDate: string; status: ScoreRecord["status"]; photoPath: string | null; passedOverride: boolean | null }> }
  | { type: "deleteRecord"; id: string }
  | { type: "scheduleRetest"; scoreRecordId: string; scheduledAt: string }
  | { type: "cancelRetest"; id: string }
  | { type: "setRecordPassStatus"; recordId: string; passed: boolean | null }
  | { type: "setRecordsPassStatus"; recordIds: string[]; passed: boolean | null }
  | { type: "setRetestPassStatus"; recordId: string; passed: boolean | null }
  | { type: "setRecordPassKind"; recordId: string; kind: PassKindChoice }
  | { type: "setRecordsPassKind"; recordIds: string[]; kind: PassKindChoice }
  | { type: "createMonthlyTest"; name: string; date: string; sections: MonthlySection[] }
  | { type: "updateMonthlyTest"; id: string; patch: Partial<{ name: string; date: string; sections: MonthlySection[] }> }
  | { type: "deleteMonthlyTest"; id: string }
  | { type: "setMonthlyResults"; monthlyTestId: string; entries: { studentId: string; scores: Record<string, number> }[] }
  | {
      type: "completeRetest";
      retestId: string;
      actualScore: number;
      totalScore?: number;
      examDate: string;
      photoPath?: string | null;
    };

export interface ActionResult {
  ok: boolean;
  error?: string;
  // 생성된 엔티티 id 등 부가정보
  id?: string;
  // createRecord/completeRetest 결과: 통과 여부 & 재시험 필요 여부
  passed?: boolean;
  needsRetest?: boolean;
  recordId?: string;
}

function findClass(db: Database, id: string) {
  return db.classes.find((c) => c.id === id);
}
function findBook(db: Database, id: string | null) {
  return id ? db.books.find((b) => b.id === id) ?? null : null;
}

/** 점수 기록의 판정값(컷/통과/만점) 재계산 */
function recompute(db: Database, r: ScoreRecord) {
  const cls = findClass(db, r.classId);
  const book = findBook(db, r.bookId);
  let computedPassed: boolean;
  if (book && book.passMark != null) {
    // 절대 점수 컷: 점수 >= 컷 이면 통과
    r.passMarkUsed = book.passMark;
    r.thresholdUsed = 0;
    computedPassed = r.actualScore + 1e-9 >= book.passMark;
  } else {
    const threshold = resolveThreshold(cls, book);
    r.passMarkUsed = null;
    r.thresholdUsed = threshold;
    computedPassed = isPassed(r.actualScore, r.totalScore, threshold);
  }
  r.passed = r.passedOverride ?? computedPassed;
  r.isPerfect = isPerfect(r.actualScore, r.totalScore);
}

/** 소수 1자리까지 허용하는 점수 정규화 */
function normScore(n: number): number {
  return Math.round(n * 10) / 10;
}

/** 통과 종류 선택(main/retest/exempt/fail/auto)을 기록에 적용 + 재판정 + 통과 시 예약 취소 */
function applyPassKindChoice(db: Database, r: ScoreRecord, choice: PassKindChoice) {
  if (choice === "auto") {
    r.passedOverride = null;
    r.passKind = null;
  } else if (choice === "fail") {
    r.passedOverride = false;
    r.passKind = null;
  } else {
    // main | retest | exempt → 통과 처리 + 종류 기록
    r.passedOverride = true;
    r.passKind = choice;
  }
  recompute(db, r);
  if (r.passed) {
    db.retests
      .filter((rt) => rt.scoreRecordId === r.id && rt.status === "scheduled")
      .forEach((rt) => {
        rt.status = "canceled";
      });
  }
}

export function applyAction(db: Database, a: Action): ActionResult {
  const now = new Date().toISOString();

  switch (a.type) {
    case "createClass": {
      if (!a.name?.trim()) return { ok: false, error: "반 이름을 입력하세요." };
      const id = genId("c");
      db.classes.push({
        id,
        name: a.name.trim(),
        scheduleType: a.scheduleType,
        passThreshold: clampPct(a.passThreshold),
        createdAt: now,
      });
      return { ok: true, id };
    }
    case "updateClass": {
      const c = findClass(db, a.id);
      if (!c) return { ok: false, error: "반을 찾을 수 없습니다." };
      if (a.patch.name != null) c.name = a.patch.name.trim();
      if (a.patch.scheduleType != null) c.scheduleType = a.patch.scheduleType;
      if (a.patch.passThreshold != null) c.passThreshold = clampPct(a.patch.passThreshold);
      return { ok: true, id: c.id };
    }
    case "deleteClass": {
      const studs = db.students.filter((s) => s.classId === a.id).map((s) => s.id);
      db.students = db.students.filter((s) => s.classId !== a.id);
      db.books = db.books.filter((b) => b.classId !== a.id);
      db.records = db.records.filter((r) => r.classId !== a.id);
      db.retests = db.retests.filter((rt) => rt.classId !== a.id && !studs.includes(rt.studentId));
      db.classes = db.classes.filter((c) => c.id !== a.id);
      return { ok: true };
    }

    case "createStudent": {
      if (!findClass(db, a.classId)) return { ok: false, error: "반을 먼저 선택하세요." };
      if (!a.name?.trim()) return { ok: false, error: "학생 이름을 입력하세요." };
      const id = genId("s");
      db.students.push({
        id,
        classId: a.classId,
        name: a.name.trim(),
        createdAt: now,
        status: "active",
        withdrawnAt: null,
        loginId: "",
        passwordHash: "",
        passwordSalt: "",
        mustChangePassword: false,
      });
      return { ok: true, id };
    }
    case "updateStudent": {
      const s = db.students.find((x) => x.id === a.id);
      if (!s) return { ok: false, error: "학생을 찾을 수 없습니다." };
      if (a.patch.name != null) s.name = a.patch.name.trim();
      if (a.patch.classId != null) s.classId = a.patch.classId;
      if (a.patch.status != null) {
        s.status = a.patch.status;
        s.withdrawnAt = a.patch.status === "withdrawn" ? (a.patch.withdrawnAt ?? now) : null;
      } else if (a.patch.withdrawnAt !== undefined) {
        s.withdrawnAt = a.patch.withdrawnAt;
      }
      return { ok: true, id: s.id };
    }
    case "deleteStudent": {
      db.records = db.records.filter((r) => r.studentId !== a.id);
      db.retests = db.retests.filter((rt) => rt.studentId !== a.id);
      db.students = db.students.filter((s) => s.id !== a.id);
      return { ok: true };
    }

    case "createBook": {
      if (!findClass(db, a.classId)) return { ok: false, error: "반을 먼저 선택하세요." };
      if (!a.title?.trim()) return { ok: false, error: "책 제목을 입력하세요." };
      const id = genId("b");
      db.books.push({
        id,
        classId: a.classId,
        title: a.title.trim(),
        defaultTotalScore: Math.max(1, Math.round(a.defaultTotalScore || 0)),
        passThreshold: a.passThreshold == null ? null : clampPct(a.passThreshold),
        passMark: a.passMark == null ? null : normScore(a.passMark),
        createdAt: now,
      });
      return { ok: true, id };
    }
    case "updateBook": {
      const b = db.books.find((x) => x.id === a.id);
      if (!b) return { ok: false, error: "책을 찾을 수 없습니다." };
      if (a.patch.title != null) b.title = a.patch.title.trim();
      if (a.patch.defaultTotalScore != null) b.defaultTotalScore = Math.max(1, Math.round(a.patch.defaultTotalScore));
      if (a.patch.passThreshold !== undefined) b.passThreshold = a.patch.passThreshold == null ? null : clampPct(a.patch.passThreshold);
      if (a.patch.passMark !== undefined) b.passMark = a.patch.passMark == null ? null : normScore(a.patch.passMark);
      // 책 컷 변경 시 해당 책 기록 재판정
      db.records.filter((r) => r.bookId === b.id).forEach((r) => recompute(db, r));
      return { ok: true, id: b.id };
    }
    case "deleteBook": {
      // 기록은 보존하되 bookId 연결만 해제
      db.records.filter((r) => r.bookId === a.id).forEach((r) => (r.bookId = null));
      db.books = db.books.filter((b) => b.id !== a.id);
      return { ok: true };
    }

    case "createRecord": {
      const err = validateScore(a.actualScore, a.totalScore);
      if (err) return { ok: false, error: err };
      const id = genId("r");
      const rec: ScoreRecord = {
        id,
        classId: a.classId,
        studentId: a.studentId,
        bookId: a.bookId,
        bookTitle: a.bookTitle.trim(),
        round: clampRound(a.round),
        session: a.session ?? null,
        totalScore: normScore(a.totalScore),
        actualScore: normScore(a.actualScore),
        examDate: a.examDate,
        attemptType: "first",
        parentRecordId: null,
        retestNo: 0,
        photoPath: a.photoPath ?? null,
        status: "approved", // 1단계: 자동 승인 (검수는 이후 단계)
        thresholdUsed: 0,
        passMarkUsed: null,
        passedOverride: null,
        passKind: null,
        passed: false,
        isPerfect: false,
        createdAt: now,
        approvedAt: now,
      };
      recompute(db, rec);
      db.records.push(rec);
      return { ok: true, id, recordId: id, passed: rec.passed, needsRetest: !rec.passed };
    }
    case "updateRecord": {
      const r = db.records.find((x) => x.id === a.id);
      if (!r) return { ok: false, error: "기록을 찾을 수 없습니다." };
      const p = a.patch;
      if (p.totalScore != null) r.totalScore = normScore(p.totalScore);
      if (p.actualScore != null) r.actualScore = normScore(p.actualScore);
      if (p.round != null) r.round = clampRound(p.round);
      if (p.session !== undefined) r.session = p.session;
      if (p.bookTitle != null) r.bookTitle = p.bookTitle.trim();
      if (p.examDate != null) r.examDate = p.examDate;
      if (p.photoPath !== undefined) r.photoPath = p.photoPath;
      if (p.passedOverride !== undefined) r.passedOverride = p.passedOverride;
      if (p.status != null) {
        r.status = p.status;
        r.approvedAt = p.status === "approved" ? now : r.approvedAt;
      }
      const err = validateScore(r.actualScore, r.totalScore);
      if (err) return { ok: false, error: err };
      recompute(db, r);
      return { ok: true, id: r.id, passed: r.passed, needsRetest: !r.passed };
    }
    case "deleteRecord": {
      db.retests = db.retests.filter((rt) => rt.scoreRecordId !== a.id && rt.resultRecordId !== a.id);
      db.records = db.records.filter((r) => r.id !== a.id);
      return { ok: true };
    }

    case "scheduleRetest": {
      const r = db.records.find((x) => x.id === a.scoreRecordId);
      if (!r) return { ok: false, error: "기록을 찾을 수 없습니다." };
      const minErr = validate10min(a.scheduledAt);
      if (minErr) return { ok: false, error: minErr };
      // 같은 기록에 대해 진행중(scheduled) 예약이 있으면 교체
      db.retests = db.retests.filter(
        (rt) => !(rt.scoreRecordId === a.scoreRecordId && rt.status === "scheduled")
      );
      const id = genId("rt");
      const rt: RetestSchedule = {
        id,
        scoreRecordId: a.scoreRecordId,
        studentId: r.studentId,
        classId: r.classId,
        scheduledAt: a.scheduledAt,
        status: "scheduled",
        resultRecordId: null,
        notify24Sent: false,
        notify2Sent: false,
        createdAt: now,
      };
      db.retests.push(rt);
      return { ok: true, id };
    }
    case "cancelRetest": {
      const rt = db.retests.find((x) => x.id === a.id);
      if (!rt) return { ok: false, error: "예약을 찾을 수 없습니다." };
      rt.status = "canceled";
      return { ok: true };
    }
    case "setRecordPassStatus":
    case "setRetestPassStatus": {
      const r = db.records.find((x) => x.id === a.recordId);
      if (!r) return { ok: false, error: "점수 기록을 찾을 수 없습니다." };
      r.passedOverride = a.passed;
      if (a.passed !== true) r.passKind = null; // 종류는 통과일 때만 의미
      recompute(db, r);
      if (r.passed) {
        db.retests
          .filter((rt) => rt.scoreRecordId === r.id && rt.status === "scheduled")
          .forEach((rt) => {
            rt.status = "canceled";
          });
      }
      return { ok: true, id: r.id, passed: r.passed, needsRetest: !r.passed };
    }
    case "setRecordsPassStatus": {
      const ids = [...new Set(a.recordIds)].filter(Boolean);
      if (!ids.length) return { ok: false, error: "선택된 기록이 없습니다." };
      const records = ids.map((id) => db.records.find((x) => x.id === id));
      if (records.some((r) => !r)) return { ok: false, error: "일부 점수 기록을 찾을 수 없습니다." };
      for (const r of records as ScoreRecord[]) {
        r.passedOverride = a.passed;
        if (a.passed !== true) r.passKind = null;
        recompute(db, r);
        if (r.passed) {
          db.retests
            .filter((rt) => rt.scoreRecordId === r.id && rt.status === "scheduled")
            .forEach((rt) => {
              rt.status = "canceled";
            });
        }
      }
      return { ok: true };
    }
    case "setRecordPassKind": {
      const r = db.records.find((x) => x.id === a.recordId);
      if (!r) return { ok: false, error: "점수 기록을 찾을 수 없습니다." };
      applyPassKindChoice(db, r, a.kind);
      return { ok: true, id: r.id, passed: r.passed, needsRetest: !r.passed };
    }
    case "setRecordsPassKind": {
      const ids = [...new Set(a.recordIds)].filter(Boolean);
      if (!ids.length) return { ok: false, error: "선택된 기록이 없습니다." };
      const records = ids.map((id) => db.records.find((x) => x.id === id));
      if (records.some((r) => !r)) return { ok: false, error: "일부 점수 기록을 찾을 수 없습니다." };
      for (const r of records as ScoreRecord[]) applyPassKindChoice(db, r, a.kind);
      return { ok: true };
    }
    case "completeRetest": {
      const rt = db.retests.find((x) => x.id === a.retestId);
      if (!rt) return { ok: false, error: "예약을 찾을 수 없습니다." };
      const origin = db.records.find((x) => x.id === rt.scoreRecordId);
      if (!origin) return { ok: false, error: "원본 기록을 찾을 수 없습니다." };
      const total = a.totalScore ?? origin.totalScore;
      const err = validateScore(a.actualScore, total);
      if (err) return { ok: false, error: err };
      const id = genId("r");
      const rec: ScoreRecord = {
        id,
        classId: origin.classId,
        studentId: origin.studentId,
        bookId: origin.bookId,
        bookTitle: origin.bookTitle,
        round: origin.round,
        session: origin.session,
        totalScore: normScore(total),
        actualScore: normScore(a.actualScore),
        examDate: a.examDate,
        attemptType: "retest",
        parentRecordId: origin.id,
        retestNo: origin.retestNo + 1,
        photoPath: a.photoPath ?? null,
        status: "approved",
        thresholdUsed: 0,
        passMarkUsed: null,
        passedOverride: null,
        passKind: null,
        passed: false,
        isPerfect: false,
        createdAt: now,
        approvedAt: now,
      };
      recompute(db, rec);
      db.records.push(rec);
      rt.status = "completed";
      rt.resultRecordId = id;
      return { ok: true, id, recordId: id, passed: rec.passed, needsRetest: !rec.passed };
    }

    case "createMonthlyTest": {
      if (!a.name?.trim()) return { ok: false, error: "먼슬리 이름을 입력하세요." };
      const sections = normSections(a.sections);
      if (!sections.length) return { ok: false, error: "영역을 1개 이상 추가하세요." };
      const id = genId("mt");
      db.monthlyTests.push({ id, name: a.name.trim(), date: a.date, sections, createdAt: now });
      return { ok: true, id };
    }
    case "updateMonthlyTest": {
      const t = db.monthlyTests.find((x) => x.id === a.id);
      if (!t) return { ok: false, error: "먼슬리 테스트를 찾을 수 없습니다." };
      if (a.patch.name != null) t.name = a.patch.name.trim();
      if (a.patch.date != null) t.date = a.patch.date;
      if (a.patch.sections != null) {
        const sections = normSections(a.patch.sections);
        if (!sections.length) return { ok: false, error: "영역을 1개 이상 두세요." };
        t.sections = sections;
        const keys = new Set(sections.map((s) => s.key));
        db.monthlyResults
          .filter((r) => r.monthlyTestId === t.id)
          .forEach((r) => {
            for (const k of Object.keys(r.scores)) if (!keys.has(k)) delete r.scores[k];
          });
      }
      return { ok: true, id: t.id };
    }
    case "deleteMonthlyTest": {
      db.monthlyResults = db.monthlyResults.filter((r) => r.monthlyTestId !== a.id);
      db.monthlyTests = db.monthlyTests.filter((t) => t.id !== a.id);
      return { ok: true };
    }
    case "setMonthlyResults": {
      const t = db.monthlyTests.find((x) => x.id === a.monthlyTestId);
      if (!t) return { ok: false, error: "먼슬리 테스트를 찾을 수 없습니다." };
      const keys = new Set(t.sections.map((s) => s.key));
      for (const entry of a.entries) {
        const cleanScores: Record<string, number> = {};
        for (const [k, v] of Object.entries(entry.scores)) {
          if (keys.has(k) && Number.isFinite(v)) cleanScores[k] = normScore(v);
        }
        const existing = db.monthlyResults.find(
          (r) => r.monthlyTestId === t.id && r.studentId === entry.studentId
        );
        if (Object.keys(cleanScores).length === 0) {
          if (existing) db.monthlyResults = db.monthlyResults.filter((r) => r.id !== existing.id);
          continue;
        }
        if (existing) {
          existing.scores = cleanScores;
          existing.updatedAt = now;
        } else {
          db.monthlyResults.push({
            id: genId("mr"),
            monthlyTestId: t.id,
            studentId: entry.studentId,
            scores: cleanScores,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
      return { ok: true };
    }

    default:
      return { ok: false, error: "알 수 없는 명령" };
  }
}

function normSections(sections: MonthlySection[]): MonthlySection[] {
  const out: MonthlySection[] = [];
  const seen = new Set<string>();
  for (const s of sections || []) {
    const label = (s.label || "").trim();
    if (!label) continue;
    let key = (s.key || label).trim() || `s${out.length}`;
    while (seen.has(key)) key = key + "_";
    seen.add(key);
    out.push({ key, label, maxScore: Math.max(1, normScore(s.maxScore || 0)) });
  }
  return out;
}

function clampPct(n: number): number {
  if (Number.isNaN(n)) return 80;
  return Math.min(100, Math.max(0, Math.round(n)));
}
function clampRound(n: number): number {
  return Math.min(3, Math.max(1, Math.round(n || 1)));
}
function validateScore(actual: number, total: number): string | null {
  if (!Number.isFinite(actual) || !Number.isFinite(total)) return "점수를 숫자로 입력하세요.";
  if (total <= 0) return "만점은 1 이상이어야 합니다.";
  if (actual < 0) return "실제 성적은 0 이상이어야 합니다.";
  if (actual > total) return "실제 성적이 만점보다 클 수 없습니다.";
  return null;
}
function validate10min(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "예약 일시가 올바르지 않습니다.";
  if (d.getMinutes() % 10 !== 0) return "예약은 10분 단위로만 가능합니다.";
  return null;
}
