// 역할별 데이터 스코핑 + 민감정보 제거 (순수 함수)

import { Database, Student, SafeStudent, Settings } from "./types";

/** 학생에서 비밀번호 해시/솔트 제거 (loginId 는 유지 — 선생님이 배포에 필요) */
export function sanitizeStudent(s: Student): SafeStudent {
  const { passwordHash, passwordSalt, ...rest } = s;
  void passwordHash;
  void passwordSalt;
  return rest;
}

function publicSettings(settings: Settings | undefined): Settings {
  return {
    achievementPeriods: settings?.achievementPeriods,
  };
}

/** 선생님용: 전체 데이터 (비밀번호 필드만 제거) */
export function teacherView(db: Database): Database {
  return {
    ...db,
    students: db.students.map(sanitizeStudent) as unknown as Student[],
    homeworkRecords: db.homeworkRecords ?? [],
    settings: publicSettings(db.settings), // 선생님 비번 해시 등은 내보내지 않음
  };
}

/** 학생용: 본인 데이터만 담은 Database (다른 학생/반/설정 미포함) */
export function studentView(db: Database, studentId: string): Database {
  const me = db.students.find((s) => s.id === studentId);
  if (!me) {
    return {
      classes: [],
      students: [],
      books: [],
      records: [],
      retests: [],
      monthlyTests: [],
      monthlyResults: [],
      homeworkRecords: [],
      settings: publicSettings(db.settings),
    };
  }
  const myClass = db.classes.find((c) => c.id === me.classId);
  // 본인이 결과가 있는 먼슬리 테스트만 (정의 표시용)
  const myMonthlyResults = db.monthlyResults.filter((r) => r.studentId === studentId);
  const myTestIds = new Set(myMonthlyResults.map((r) => r.monthlyTestId));
  return {
    classes: myClass ? [myClass] : [],
    students: [sanitizeStudent(me) as unknown as Student],
    books: db.books.filter((b) => b.classId === me.classId),
    records: db.records.filter((r) => r.studentId === studentId),
    retests: db.retests.filter((r) => r.studentId === studentId),
    monthlyTests: db.monthlyTests.filter((t) => myTestIds.has(t.id)),
    monthlyResults: myMonthlyResults,
    homeworkRecords: (db.homeworkRecords ?? []).filter((h) => h.studentId === studentId),
    settings: publicSettings(db.settings),
  };
}
