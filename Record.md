# Vocapassport 개발 기록 (Input / Output Log)

코드 작업 요청(Input)과 그 결과(Output)를 날짜순으로 기록합니다.
코드·프로그램과 무관한 대화는 기록하지 않습니다.

---

## 2026-06-13

### [1] 프로젝트 초기 세팅

**Input:** 단어시험 관리 웹앱 초기 구축 요청  
**Output:**
- Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 3 기반 프로젝트 생성
- 이중 스토리지 아키텍처: `DATABASE_URL` 유무에 따라 Neon Postgres ↔ 로컬 JSON 자동 전환 (`src/lib/db.ts`)
- 명령/액션 패턴: 모든 쓰기는 `POST /api/command` → `applyAction()` 경유 (`src/lib/actions.ts`)
- HMAC 서명 stateless 쿠키 인증 (`src/lib/auth.ts`)
- 역할: `teacher` (전체 권한) / `student` (본인 재시험 신청만)
- 범위 제어: `/api/state` → `teacherView` / `studentView` 분리 (`src/lib/scope.ts`)
- 도메인 모델: 단어시험(`ScoreRecord`, `RetestSchedule`) + 먼슬리(`MonthlyTest`, `MonthlyResult`) 분리
- 통과 판정 로직 (`src/lib/logic.ts`): 절댓값 `passMark` 우선, 없으면 `passThreshold` 퍼센트
- 스크립트: `smoke-test.mjs`, `auth-smoke.mjs`, `monthly-test.mjs`, `passkind-test.mjs`, `neon-mode-test.mjs`, `xlsx-import.mjs` 등
- **변경 파일:** 프로젝트 전체 초기 파일 (28개+)

---

### [2] 먼슬리 반 타겟팅 + 관리 탭 업데이트

**Input:** 먼슬리 시험에서 특정 반만 대상으로 지정하는 기능 + 관리 탭 개선 요청  
**Output:**
- `MonthlyTab.tsx`: 반 타겟팅(반별 먼슬리 시험 배정) UI 추가
- `ManageTab.tsx`: 관리 기능 확장 (249줄 추가)
- `ScoreEntry.tsx`: 점수 입력 개선
- `StudentApp.tsx`: 학생 화면 리팩터링 (318줄 수정)
- `src/lib/actions.ts`: 새 액션 추가 (75줄)
- `src/lib/types.ts`: 타입 확장
- **변경 파일:** 9개 (`globals.css`, `layout.tsx`, `ManageTab.tsx`, `MonthlyTab.tsx`, `ScoreEntry.tsx`, `StudentApp.tsx`, `ui.tsx`, `actions.ts`, `types.ts`)

---

### [3] 리더보드 + 학생 리포트 + 제작자 푸터 추가

**Input:** 공개 리더보드 페이지, 학생 리포트 인쇄 화면, 제작자 로고 푸터 추가 요청  
**Output:**
- `src/app/api/public/leaderboard/route.ts` (신규): 공개 리더보드 API
- `src/app/report/page.tsx` (신규): 학생 리포트 인쇄 전용 페이지
- `src/components/StudentReport.tsx` (신규): 리포트 컴포넌트 (550줄)
- `src/components/CreatorFooter.tsx` (신규): "Designed by. Lindsay Lab" 푸터
- `CLAUDE.md` (신규): 프로젝트 가이드 문서
- `public/creator-logo.png` (신규): 제작자 로고 이미지
- `src/lib/logic.ts`: 통계 로직 확장 (96줄 추가)
- `StatsTab.tsx`: 통계 탭 개선 (103줄 추가)
- `Login.tsx`: 로그인 화면 업데이트 (298줄 수정)
- **변경 파일:** 27개

---

### [4] 대량 점수 수정 + 결석 추적

**Input:** 여러 학생 점수를 한 번에 수정하는 기능 + 결석(absence) 추적 기능 요청  
**Output:**
- `ManageTab.tsx`: 대량 점수 편집 UI 추가 (305줄 추가)
- `ScoreEntry.tsx`: 결석 처리 UI 추가
- `StatsTab.tsx`: 결석 표시 업데이트
- `StudentApp.tsx`: 학생 화면 결석 반영
- `StudentReport.tsx`: 리포트에 결석 포함
- `src/lib/actions.ts`: `bulkEditScore`, 결석 관련 액션 추가 (103줄)
- `src/lib/logic.ts`: 결석 처리 로직 추가
- `src/lib/types.ts`: 결석 필드 추가
- **변경 파일:** 8개

---

### [5] 제작자 로고 업데이트 + 리더보드에 반 이름 표시

**Input:** 로고 이미지 교체, 리더보드 하이라이트에 반 이름 추가 요청  
**Output:**
- `public/creator-logo.png`: 이미지 교체 (130KB로 최적화)
- `CreatorFooter.tsx`: 카드 배경 제거 (텍스트만 표시)
- `Login.tsx`: 리더보드 하이라이트에 반 이름 표시 추가 (13줄 추가)
- **변경 파일:** 3개

---

## 2026-06-14

### [6] 로그인 화면 v2 리디자인 — 디자인 토큰 + Guardian 역할 타입 추가

**Input:** 로그인 화면 전면 리디자인 요청 (navy/gold/paper 컬러 테마)  
**Output:**
- `tailwind.config.ts`: navy, gold, paper 등 디자인 토큰 추가
- `src/app/globals.css`: 테마 변수 추가
- `src/lib/types.ts`: `Role` 타입에 `"guardian"` 추가
- `Login.tsx`: v2 리디자인 (마크업·스타일 전면 교체)
- **변경 파일:** 5개 (디자인 토큰화 + 타입 정의)

---

### [7] 디자인 통일 — 전체 화면에 로그인 톤 적용

**Input:** 로그인 화면 스타일을 교사·학생·공통 컴포넌트 전체에 일관 적용 요청  
**Output:**
- `ui.tsx`: 공통 UI 컴포넌트(Card, Button, Field 등) navy/gold 테마 적용
- `StudentApp.tsx`: 학생 화면 테마 적용
- `StudentReport.tsx`: 리포트 테마 적용
- `TeacherApp.tsx`: 교사 앱 테마 적용
- `ManageTab.tsx`, `MonthlyTab.tsx`, `RetestTab.tsx`, `RetestScheduler.tsx`, `ScoreEntry.tsx`, `StatsTab.tsx`, `DatePicker.tsx`: 전체 화면 테마 통일
- **변경 파일:** 10개

---

### [8] 푸터 정리

**Input:** 제작자 로고 제거, 푸터 텍스트를 "System by LINDSAY LAB" 한 줄로 통일 요청  
**Output:**
- `CreatorFooter.tsx`: 로고 이미지 제거, 텍스트만 남김 → `"System by LINDSAY LAB"` 한 줄
- `Login.tsx`: 로그인 화면 중복 푸터 제거
- **변경 파일:** 2개

---

### [9] RISING(성장왕) 집계 + 보호자(Guardian) 화면 신규 개발

**Input:** 성장왕(RISING) 학생 산정 기능 + 보호자 전용 로그인/화면 신규 개발 요청  
**Output:**
- `src/components/GuardianApp.tsx` (신규, 280줄): 보호자 전용 화면 (자녀 성적 열람)
- `src/app/api/auth/login/route.ts`: guardian 역할 로그인 처리 추가
- `src/app/api/public/leaderboard/route.ts`: RISING 순위 계산 추가
- `src/app/api/admin/route.ts`: guardian 계정 발급 추가
- `src/app/api/state/route.ts`: guardian 뷰 분기
- `src/app/page.tsx`: GuardianApp 라우팅 추가
- `src/lib/auth.ts`: guardian 역할 인증 추가
- `src/lib/logic.ts`: `computeRisingStats()` 함수 추가
- `src/lib/scope.ts`: `guardianView()` 추가
- `src/lib/types.ts`: guardian 관련 타입 추가
- `Login.tsx`, `ManageTab.tsx`: guardian 지원 UI 업데이트
- **변경 파일:** 12개

---

### [10] 봄학기(3월~6월) 기록 조회 추가

**Input:** 학생·보호자 화면에서 봄학기(3월~6/7월) 전체 기록을 조회하는 탭 추가 요청  
**Output:**
- `src/lib/logic.ts`: `getSpringTermRecords()` 등 봄학기 날짜 범위 필터 함수 추가
- `GuardianApp.tsx`: 봄학기 탭 추가
- `StudentApp.tsx`: 봄학기 탭 추가
- `StatsTab.tsx`: 봄학기 통계 뷰 추가
- **변경 파일:** 4개

---

### [11] 보호자 화면 — 학기 탭(봄/여름) + 월 드롭다운 개편

**Input:** 보호자 화면을 "봄학기 / 여름학기" 탭 + 월별 드롭다운 구조로 개편 요청  
**Output:**
- `GuardianApp.tsx`: 학기 탭 + 월 드롭다운 UI로 전면 개편 (122줄 추가)
- `src/lib/logic.ts`: 학기별 월 목록 산출 함수 추가 (49줄)
- **변경 파일:** 2개

---

### [12] 월 구간을 개강일/종강일 기준으로 변경 + 학생 화면 학기 탭

**Input:** "이번 달"을 캘린더 기준 대신 관리 탭의 개강일·종강일 기준으로 계산하도록 변경 + 학생 화면에도 학기 탭 추가 요청  
**Output:**
- `src/lib/logic.ts`: 월 구간 계산을 개강일/종강일 기반으로 전면 교체 (104줄 수정)
- `GuardianApp.tsx`: 개강일 기반 월 구간 반영 (102줄 수정)
- `StudentApp.tsx`: 학기 탭(봄/여름) 추가 (62줄 추가)
- **변경 파일:** 3개

---

### [13] 재시험 통과를 본시험 통과와 분리 집계 (보상 꼬임 수정)

**Input:** 보상 집계 시 재시험 통과가 본시험 통과 카운트에 섞이는 버그 수정 요청  
**Output:**
- `src/lib/logic.ts`: `computeRewardStats()` 내 `mainPassCount` / `retestPassCount` 분리 (22줄 추가)
- `GuardianApp.tsx`: 분리된 통계 표시 (37줄 수정)
- `StatsTab.tsx`: 분리 집계 반영
- `StudentApp.tsx`: 학생 화면 반영
- `StudentReport.tsx`: 리포트 반영
- **변경 파일:** 5개

---

### [14] 본시험 통과 판정 강화 (컷 미달 수동 통과 제외)

**Input:** 컷(passMark)에 미달하더라도 교사가 수동으로 통과 처리한 경우, 본시험 통과 카운트에서 제외하도록 로직 강화 요청  
**Output:**
- `src/lib/logic.ts`: `isMainPassStrict()` 함수 추가 — 수동 통과(`passedOverride`)이더라도 컷 미달이면 본시험 통과에서 제외 (31줄 수정)
- **변경 파일:** 1개 (`logic.ts`)

---

## 2026-06-18

### [15] 보호자 화면 — 먼슬리 리포트 + 부모 알림 업데이트

**Input:** 보호자 화면에 먼슬리 시험 결과 리포트 추가 + 부모 알림/메시지 기능 업데이트 요청  
**Output:**
- `GuardianApp.tsx`: 먼슬리 리포트 섹션 추가 (331줄 → 대폭 확장)
- `ManageTab.tsx`: 보호자 메시지/알림 관리 UI 추가 (719줄 확장)
- `src/components/BoardCards.tsx` (신규, 200줄): 게시판형 카드 컴포넌트
- `src/components/RetestReschedule.tsx` (신규, 102줄): 재시험 일정 재조정 컴포넌트
- `RetestTab.tsx`: 재시험 탭 업데이트
- `ScoreEntry.tsx`: 점수 입력 업데이트
- `StudentApp.tsx`: 학생 화면 업데이트 (146줄)
- `src/lib/actions.ts`: 새 액션 추가 (115줄)
- `src/lib/types.ts`: 타입 확장 (69줄)
- `src/lib/scope.ts`: 보호자 뷰 범위 확장 (58줄)
- `src/lib/client.ts`: 클라이언트 훅 업데이트 (38줄)
- `ui.tsx`: 공통 UI 컴포넌트 추가 (44줄)
- `Login.tsx`: 보호자 로그인 업데이트 (19줄)
- `src/app/api/upload/route.ts`: 파일 업로드 지원 추가
- **변경 파일:** 17개

---

### [16] 스태프 역할 + 감사 로그(Audit Logging)

**Input:** 교사 외에 스태프(staff) 역할 추가 + 모든 쓰기 작업에 감사 로그 기록 기능 요청  
**Output:**
- `src/lib/types.ts`: `StaffMember` 타입, `AuditLog` 타입 추가 (34줄)
- `src/lib/auth.ts`: staff 역할 인증 처리 추가 (109줄 확장)
- `src/app/api/admin/route.ts`: staff 계정 발급 API 추가 (120줄 확장)
- `src/app/api/auth/login/route.ts`: staff 로그인 처리 (77줄 확장)
- `src/app/api/auth/me/route.ts`: staff 세션 반환 (27줄 수정)
- `src/app/api/auth/change-password/route.ts`: staff 비밀번호 변경 (26줄 수정)
- `src/app/api/command/route.ts`: 모든 명령에 감사 로그 기록 (74줄 확장)
- `src/app/api/state/route.ts`: staff 뷰 분기 (17줄)
- `src/app/api/upload/route.ts`: staff 권한 체크 추가
- `src/lib/scope.ts`: `staffView()` 추가 (13줄)
- `src/lib/client.ts`: staff 역할 클라이언트 지원 (9줄)
- `Login.tsx`: staff 로그인 UI 추가 (52줄)
- `ManageTab.tsx`: 감사 로그 조회 UI 추가 (181줄 확장)
- `TeacherApp.tsx`: staff 분기 처리 (20줄)
- **변경 파일:** 15개

---

## 2026-06-21

### [17] Record.md 생성

**Input:** 그동안의 코드 작업 Input/Output 기록 파일 생성 요청, 앞으로도 코드 관련 작업 시 지속 기록  
**Output:**
- `Record.md` (이 파일) 생성 — 2026-06-13 ~ 2026-06-21 작업 내역 정리
- 향후 코드·프로그램 관련 Input/Output 발생 시 이 파일에 계속 추가

---

*코드·프로그램과 무관한 대화는 기록하지 않습니다.*
