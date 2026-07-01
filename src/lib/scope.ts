// 역할별 데이터 스코핑 + 민감정보 제거 (순수 함수)

import { Database, Student, SafeStudent, Settings, MonthlyTest, StaffRole } from "./types";
import { monthlyTotal, monthlyPercent } from "./logic";
import { sanitizeStaffUser } from "./auth";

const round1 = (n: number) => Math.round(n * 10) / 10;

/** 한 먼슬리에 대한 '본인 반' 평균 (집계만, 개별 데이터 없음) */
function classStatForTest(db: Database, test: MonthlyTest, classId: string) {
  const classStudentIds = new Set(db.students.filter((s) => s.classId === classId).map((s) => s.id));
  const results = db.monthlyResults.filter((r) => r.monthlyTestId === test.id && classStudentIds.has(r.studentId));
  if (results.length === 0) return null;
  const avgTotal = results.reduce((a, r) => a + monthlyTotal(r.scores, test), 0) / results.length;
  const avgPercent = results.reduce((a, r) => a + monthlyPercent(r.scores, test), 0) / results.length;
  const sectionAverages = test.sections.map((section) => {
    const values = results
      .map((r) => r.scores[section.key])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const avgScore = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    return {
      key: section.key,
      label: section.label,
      maxScore: section.maxScore,
      avgScore: avgScore == null ? null : round1(avgScore),
      avgPercent: avgScore == null || section.maxScore <= 0 ? null : round1((avgScore / section.maxScore) * 100),
      count: values.length,
    };
  });
  return { classId, avgTotal: round1(avgTotal), avgPercent: round1(avgPercent), count: results.length, sectionAverages };
}

/** 공지를 시청자 역할에 맞게 필터 + 관리자 전용 첨부파일 제거 */
function visibleNoticesFor(db: Database, viewerRole: "student" | "guardian") {
  return db.notices
    .filter((n) => n.audience === "all" || n.audience === viewerRole)
    .map(({ attachments, ...rest }) => {
      void attachments; // 학생/보호자 화면엔 첨부파일 노출 안 함
      return rest;
    });
}

/** 학생에서 비밀번호 해시/솔트 제거 (loginId 는 유지 — 선생님이 배포에 필요) */
export function sanitizeStudent(s: Student): SafeStudent {
  const { passwordHash, passwordSalt, ...rest } = s;
  void passwordHash;
  void passwordSalt;
  return rest;
}

/** 본인/보호자 화면용: 비밀번호 + 보호자 코드까지 제거 (코드는 선생님만 봄) */
function selfStudent(s: Student): SafeStudent {
  const { guardianCode, ...rest } = sanitizeStudent(s);
  void guardianCode;
  return rest;
}

function publicSettings(settings: Settings | undefined): Settings {
  return {
    achievementPeriods: settings?.achievementPeriods,
  };
}

/** 선생님용: 전체 데이터 (비밀번호 필드만 제거) */
export function teacherView(db: Database, staffRole: StaffRole | undefined = "viewer"): Database {
  const canViewStaff = staffRole === "master";
  const canViewAudit = staffRole === "master" || staffRole === "director";
  return {
    ...db,
    students: db.students.map(sanitizeStudent) as unknown as Student[],
    staffUsers: canViewStaff ? (db.staffUsers ?? []).map(sanitizeStaffUser) as unknown as Database["staffUsers"] : [],
    auditLogs: canViewAudit ? [...(db.auditLogs ?? [])].slice(-300).reverse() : [],
    settings: publicSettings(db.settings), // 선생님 비번 해시 등은 내보내지 않음
  };
}

/** 학생용: 본인 데이터만 담은 Database (다른 학생/반/설정 미포함) */
export function studentView(
  db: Database,
  studentId: string,
  viewerRole: "student" | "guardian" = "student"
): Database {
  const me = db.students.find((s) => s.id === studentId);
  if (!me) {
    return {
      classes: [],
      students: [],
      staffUsers: [],
      books: [],
      records: [],
      retests: [],
      monthlyTests: [],
      monthlyResults: [],
      homeworks: [],
      notices: [],
      examPapers: [],
      auditLogs: [],
      settings: publicSettings(db.settings),
    };
  }
  const myClass = db.classes.find((c) => c.id === me.classId);
  // 본인이 결과가 있는 먼슬리 테스트만 (정의 표시용) + 본인 반 평균 첨부
  const myMonthlyResults = db.monthlyResults.filter((r) => r.studentId === studentId);
  const myTestIds = new Set(myMonthlyResults.map((r) => r.monthlyTestId));
  const monthlyTests = db.monthlyTests
    .filter((t) => myTestIds.has(t.id))
    .map((t) => ({ ...t, classStat: classStatForTest(db, t, me.classId) }));
  return {
    classes: myClass ? [myClass] : [],
    students: [selfStudent(me) as unknown as Student],
    staffUsers: [],
    books: db.books.filter((b) => b.classId === me.classId),
    records: db.records.filter((r) => r.studentId === studentId),
    retests: db.retests.filter((r) => r.studentId === studentId),
    monthlyTests,
    monthlyResults: myMonthlyResults,
    homeworks: db.homeworks.filter((h) => h.classId === me.classId),
    notices: visibleNoticesFor(db, viewerRole),
    examPapers: [], // 시험지 파일 경로는 학생/보호자에게 노출하지 않음
    auditLogs: [],
    settings: publicSettings(db.settings),
  };
}

/**
 * 보호자용: 연결된 자녀 1명의 데이터만. 스코핑 자체는 studentView와 동일하지만
 * (다른 학생/반/설정 미포함) 의미를 분명히 하려고 별도 함수로 노출한다.
 * 보호자 화면은 자동 집계 데이터만 표시(복습 단어·코멘트 없음).
 */
export function guardianView(db: Database, studentId: string): Database {
  return studentView(db, studentId, "guardian");
}
