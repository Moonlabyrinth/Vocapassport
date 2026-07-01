// 단어시험 관리 프로그램 — 도메인 타입 정의

export type ScheduleType = "월수금" | "화목";

/** 반 */
export interface ClassRoom {
  id: string;
  name: string;
  scheduleType: ScheduleType;
  /** 통과 컷(%) — 선생님이 반별로 설정. 책별 컷이 없으면 이 값을 사용 */
  passThreshold: number;
  createdAt: string; // ISO
}

/** 학생 */
export type StudentStatus = "active" | "withdrawn";

export interface Student {
  id: string;
  classId: string;
  name: string;
  createdAt: string;
  /** 재원/퇴원 상태. 기존 데이터 호환을 위해 없으면 재원으로 처리 */
  status?: StudentStatus;
  withdrawnAt?: string | null;
  /** 로그인 아이디 (고유). 미발급 시 빈 문자열 */
  loginId: string;
  /** 비밀번호 해시/솔트 (서버 전용 — 클라이언트로 절대 전송 안 함) */
  passwordHash: string;
  passwordSalt: string;
  /** 최초 로그인 시 비밀번호 변경 권장 플래그 */
  mustChangePassword: boolean;
  /**
   * 보호자 접속 코드 — 선생님이 학생별로 발급해 학부모에게 전달.
   * 보호자는 [자녀 이름 + 이 코드]로 로그인해 자녀 데이터만 조회한다.
   * 공유 목적의 저민감 코드라 평문 저장(학생 비밀번호와 별개). 미발급 시 빈 문자열/undefined.
   */
  guardianCode?: string;
}

/** 클라이언트로 보낼 때 비밀번호 필드를 제거한 학생 */
export type SafeStudent = Omit<Student, "passwordHash" | "passwordSalt">;

// ===================== 직원 / 관리자 계정 =====================
export type StaffRole = "master" | "director" | "viceDirector" | "teacher" | "viewer";

export interface StaffUser {
  id: string;
  loginId: string;
  name: string;
  role: StaffRole;
  passwordHash: string;
  passwordSalt: string;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
}

export type SafeStaffUser = Omit<StaffUser, "passwordHash" | "passwordSalt">;

export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: StaffRole | "student" | "guardian" | "legacyTeacher";
  actionType: string;
  summary: string;
  targetId?: string | null;
  createdAt: string;
}

/** 책(단어장) — 점수 입력 시 만점/컷 기본값 제공 */
export interface Book {
  id: string;
  classId: string;
  title: string;
  /** 기본 만점 */
  defaultTotalScore: number;
  /** 책별 통과 컷(%) — 없으면(null) 반 컷 사용 */
  passThreshold: number | null;
  /** 절대 점수 컷 — 설정 시 이 점수 이상이면 통과(백분율 컷보다 우선) */
  passMark: number | null;
  createdAt: string;
}

export type RecordStatus = "pending" | "approved" | "rejected";
/** first = 정규 시험, retest = 재시험/재재시험 */
export type AttemptType = "first" | "retest";

/** 통과 종류 — 선생님이 통과로 판정할 때 선택. main=본시험 통과, retest=재시험 통과, exempt=면제 */
export type PassKind = "main" | "retest" | "exempt";
/** 통과 판정 선택지 (UI/액션용): 통과 종류 + 미통과(fail) + 자동판정(auto) */
export type PassKindChoice = PassKind | "fail" | "auto";

/** 점수 기록 — 한 번의 시험 응시 */
export interface ScoreRecord {
  id: string;
  classId: string;
  studentId: string;
  bookId: string | null;
  bookTitle: string; // 표시용(비정규화)
  /** 회독: 1~3 */
  round: number;
  /** Day 묶음 회차. 고난도 1~20(Day 1~40), 필수 1~25(Day 1~50) */
  session: number | null;
  totalScore: number; // 만점
  actualScore: number; // 실제성적
  /** 결석 기록. 0점 미통과와 구분해 표시하고 평균 점수 계산에서는 제외 */
  isAbsent?: boolean;
  examDate: string; // 시험 본 날짜 (YYYY-MM-DD)
  attemptType: AttemptType;
  /** 재시험인 경우 원본(직전) 기록 id */
  parentRecordId: string | null;
  /** 0 = 정규, 1 = 재시험, 2 = 재재시험 ... */
  retestNo: number;
  photoPath: string | null;
  status: RecordStatus;
  /** 판정에 적용된 컷(%) */
  thresholdUsed: number;
  /** 절대 점수 컷이 적용된 경우 그 점수(없으면 null = 백분율 컷 사용) */
  passMarkUsed: number | null;
  /** 선생님이 통과/미통과를 수동으로 바로잡은 값. 없으면 점수 기준 자동 판정 */
  passedOverride?: boolean | null;
  /** 통과 종류(선생님 선택): main=본시험·retest=재시험·exempt=면제. 통과일 때만 의미 */
  passKind?: PassKind | null;
  passed: boolean;
  isPerfect: boolean;
  createdAt: string;
  approvedAt: string | null;
}

export type RetestStatus = "scheduled" | "completed" | "missed" | "canceled";

/** 재시험 일정 변경 1건 (변경 전/후 일시 + 변경 주체) */
export interface RetestChange {
  from: string; // 변경 전 ISO
  to: string; // 변경 후 ISO
  by: "teacher" | "student"; // 변경 주체 — 서버에서 세션 기준으로 주입
  at: string; // 변경 시각 ISO
}

/** 재시험 예약 */
export interface RetestSchedule {
  id: string;
  scoreRecordId: string; // 통과 못한 기록
  studentId: string;
  classId: string;
  /** 예약 일시 (10분 단위) ISO */
  scheduledAt: string;
  status: RetestStatus;
  /** 재시험 응시 후 생성된 기록 id */
  resultRecordId: string | null;
  notify24Sent: boolean;
  notify2Sent: boolean;
  /** 일정 변경 이력 (오래된 순). 변경이 없으면 없음/빈 배열 */
  reschedules?: RetestChange[];
  createdAt: string;
}

// ===================== 숙제 / 공지사항 =====================
/** 숙제 — 반별, 날짜별로 누적 */
export interface Homework {
  id: string;
  classId: string;
  dueDate: string; // YYYY-MM-DD
  content: string; // 여러 줄 가능
  createdAt: string;
  updatedAt: string;
}

/** 공지 노출 대상 */
export type NoticeAudience = "all" | "guardian" | "student";

/** 공지 첨부파일 (관리자 전용 — 학생/보호자 화면엔 노출 안 함) */
export interface NoticeAttachment {
  name: string; // 원본 파일명 (표시용)
  path: string; // 저장 경로 (/api/uploads/...)
}

/** 학원 공지사항 (반 무관, 전체) */
export interface Notice {
  id: string;
  title: string;
  body: string;
  audience: NoticeAudience; // 기본 "all"
  pinned?: boolean;
  /** 모두에게(학생·보호자 포함) 인라인으로 보여줄 이미지 경로들 */
  imagePaths?: string[];
  /** 관리자 전용 첨부파일 — 스코프에서 학생/보호자 뷰에는 제거됨 */
  attachments?: NoticeAttachment[];
  createdAt: string;
  updatedAt: string;
}

// ===================== 먼슬리 테스트 (단어시험과 별개) =====================
/** 먼슬리 테스트 영역(섹션) — 예: 듣기/독해/문법 */
export interface MonthlySection {
  key: string; // 고유 키
  label: string; // 표시명
  maxScore: number; // 영역 만점
}

/** 먼슬리 테스트 1회 (classIds가 비어 있으면 전체 공통, 있으면 해당 반들 전용) */
export interface MonthlyTest {
  id: string;
  classId?: string | null; // 이전 데이터 호환용. 새 데이터는 classIds를 사용.
  classIds?: string[] | null; // null/undefined/빈 배열 = 전체 공통
  name: string; // 예: "6월 먼슬리"
  date: string; // YYYY-MM-DD
  sections: MonthlySection[];
  createdAt: string;
  /** (스코프 뷰 전용) 학생 본인 반 평균. 학생/보호자 화면에서만 채워짐 */
  classStat?: MonthlyClassStat | null;
}

/** (스코프 뷰 전용·서버 계산) 먼슬리 1회의 '본인 반' 평균 — 원본 DB엔 저장하지 않음 */
export interface MonthlyClassStat {
  classId: string;
  avgTotal: number; // 반 평균 총점
  avgPercent: number; // 반 평균 백점환산
  count: number; // 집계에 포함된 학생 수
  sectionAverages?: MonthlySectionAverage[];
}

export interface MonthlySectionAverage {
  key: string;
  label: string;
  maxScore: number;
  avgScore: number | null;
  avgPercent: number | null;
  count: number;
}

/** 먼슬리 결과 — 학생별 영역 점수 */
export interface MonthlyResult {
  id: string;
  monthlyTestId: string;
  studentId: string;
  /** sectionKey -> 점수 */
  scores: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

// ===================== 시험지 파일 (정규 단어시험지 PDF) =====================
/**
 * 정규 시험지 PDF 등록 — (단어장 제목·회독·회차) 하나당 한 파일.
 * 시험지 탭에서 부수만큼 묶음 인쇄할 때 사용. 학생/보호자 뷰에는 노출하지 않는다.
 */
export interface ExamPaper {
  id: string;
  bookTitle: string; // 집계 키의 단어장 축 (PrintTab과 동일)
  round: number; // 회독 1~3
  session: number; // 회차
  path: string; // 업로드 경로 "/api/uploads/..."
  fileName: string; // 원본 파일명 (표시용)
  createdAt: string;
  updatedAt: string;
}

/** 앱 설정 (인증 등) */
export interface Settings {
  /** 선생님 비밀번호 해시/솔트 (서버 전용) */
  teacherPasswordHash?: string;
  teacherPasswordSalt?: string;
  /** 성취 평가 기간 설정 (클라이언트 공개 가능) */
  achievementPeriods?: {
    key: string;
    seasonLabel: string;
    label: string;
    startDate: string;
    endDate: string;
    targetTests: number;
    passGoal: number;
  }[];
}

/** 전체 DB 스키마 (JSON 파일) */
export interface Database {
  classes: ClassRoom[];
  students: Student[];
  staffUsers: StaffUser[];
  books: Book[];
  records: ScoreRecord[];
  retests: RetestSchedule[];
  monthlyTests: MonthlyTest[];
  monthlyResults: MonthlyResult[];
  homeworks: Homework[];
  notices: Notice[];
  examPapers: ExamPaper[];
  auditLogs: AuditLog[];
  settings: Settings;
}

export const emptyDatabase = (): Database => ({
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
  settings: {},
});
