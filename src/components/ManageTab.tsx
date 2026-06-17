"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AppStateHook, apiAdmin, uploadPhoto, uploadFile } from "@/lib/client";
import { Button, Card, Field, Input, Select, Badge, EmptyState, Modal, DisclosureButton, TextInput, TextArea } from "./ui";
import DatePicker from "./DatePicker";
import { ScheduleType, PassKindChoice, ScoreRecord, NoticeAudience, Notice, NoticeAttachment, Database, StaffRole } from "@/lib/types";
import { todayStr } from "@/lib/datetime";
import {
  ACHIEVEMENT_PERIODS,
  achievementRangeLabel,
  isActiveStudent,
  percentOf,
  resolveAchievementPeriods,
  round1,
  type AchievementPeriod,
} from "@/lib/logic";
import { maxSessionsForBook, recordLessonLabel, sessionDayRange } from "@/lib/course";
import { NeedsRetestRow, RetestHistoryRow } from "./RetestTab";

interface IssuedCred { name: string; loginId: string; password: string }
const RECORD_PAGE_SIZE = 30;

type ManageSection = "student" | "exam" | "homework" | "notice" | "admin";

const MANAGE_SECTIONS: { id: ManageSection; label: string }[] = [
  { id: "student", label: "학생관리" },
  { id: "exam", label: "시험관리" },
  { id: "homework", label: "숙제" },
  { id: "notice", label: "공지사항" },
  { id: "admin", label: "관리자" },
];

const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  master: "마스터 관리자",
  director: "원장님",
  viceDirector: "부원장님",
  teacher: "선생님",
  viewer: "조회 전용",
};

const STAFF_ROLE_OPTIONS: StaffRole[] = ["master", "director", "viceDirector", "teacher", "viewer"];

/** 반 선택 버튼 그리드 — 학생관리/시험관리 공용 */
function ClassPicker({
  db,
  selectedId,
  onSelect,
}: {
  db: Database;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {db.classes.map((c) => {
        const activeCount = db.students.filter((s) => s.classId === c.id && isActiveStudent(s)).length;
        const withdrawnCount = db.students.filter((s) => s.classId === c.id && !isActiveStudent(s)).length;
        const active = c.id === selectedId;
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`text-left rounded-xl border px-4 py-2.5 transition ${
              active ? "border-brand-600 bg-brand-50" : "border-lab-line hover:border-lab-line"
            }`}
          >
            <div className="font-medium text-lab-ink">{c.name}</div>
            <div className="text-xs text-lab-muted mt-0.5 flex items-center gap-1">
              <Badge color="blue">{c.scheduleType}</Badge>
              <Badge color="indigo">컷 {c.passThreshold}%</Badge>
              <span>재원 {activeCount}명</span>
              {withdrawnCount > 0 && <span>퇴원 {withdrawnCount}명</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function ManageTab({ app }: { app: AppStateHook }) {
  const { db, run } = app;
  const [section, setSection] = useState<ManageSection>("student");
  const [selectedClass, setSelectedClass] = useState<string>("");

  // 반 추가 폼
  const [className, setClassName] = useState("");
  const [schedule, setSchedule] = useState<ScheduleType>("월수금");
  const [cut, setCut] = useState(80);

  const cls = db.classes.find((c) => c.id === selectedClass);
  // 학생관리 탭에서는 선택된 반이 없으면 첫 반을 기본 표시
  const studentCls = cls ?? db.classes[0];

  async function addClass() {
    if (!className.trim()) return alert("반 이름을 입력하세요.");
    const r = await run({ type: "createClass", name: className, scheduleType: schedule, passThreshold: cut });
    if (r.ok) {
      setClassName("");
      setSelectedClass(r.id!);
    } else alert(r.error);
  }

  return (
    <div className="space-y-4">
      {/* 관리 하위 탭 */}
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-lab-line bg-[#e9e3d6] p-1 sm:grid-cols-5">
        {MANAGE_SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              section === s.id ? "bg-lab-paper text-brand-700 shadow-lab-sm" : "text-lab-muted hover:text-lab-navy"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === "homework" && <HomeworkSection app={app} />}
      {section === "notice" && <NoticeManager app={app} />}
      {section === "admin" && <StaffAdminSection app={app} />}

      {section === "student" && (
        <>
          <Card title="반 선택">
            {db.classes.length === 0 ? (
              <EmptyState>아직 반이 없습니다. 「시험관리」 탭에서 먼저 반을 만들어 주세요.</EmptyState>
            ) : (
              <ClassPicker db={db} selectedId={studentCls?.id ?? ""} onSelect={(id) => setSelectedClass(id)} />
            )}
          </Card>

          {studentCls && <StudentRoster key={studentCls.id} app={app} classId={studentCls.id} />}
        </>
      )}

      {section === "exam" && (
        <>
      {/* 반 추가 */}
      <Card title="반 만들기">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Field label="반 이름">
            <Input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="예: 중1 A반" />
          </Field>
          <Field label="수업 요일">
            <Select value={schedule} onChange={(e) => setSchedule(e.target.value as ScheduleType)}>
              <option value="월수금">월수금</option>
              <option value="화목">화목</option>
            </Select>
          </Field>
          <Field label="통과 컷(%)" hint="이 반의 기본 통과 기준">
            <Input type="number" min={0} max={100} value={cut} onChange={(e) => setCut(Number(e.target.value))} />
          </Field>
          <div className="flex items-end">
            <Button onClick={addClass} className="w-full">+ 반 추가</Button>
          </div>
        </div>
      </Card>

      {/* 반 목록 */}
      <Card title="반 목록">
        {db.classes.length === 0 ? (
          <EmptyState>아직 반이 없습니다. 위에서 먼저 반을 만들어 주세요.</EmptyState>
        ) : (
          <ClassPicker
            db={db}
            selectedId={selectedClass}
            onSelect={(id) => setSelectedClass(selectedClass === id ? "" : id)}
          />
        )}
      </Card>

      <AchievementPeriodSettings app={app} />

      {cls && <ClassExamDetail key={cls.id} app={app} classId={cls.id} />}

      <ScoreRecordManager app={app} />
        </>
      )}
    </div>
  );
}

/** 숙제 탭 — 반 선택 후 반별 숙제 관리 */
function HomeworkSection({ app }: { app: AppStateHook }) {
  const { db } = app;
  const [classId, setClassId] = useState<string>("");
  const cls = db.classes.find((c) => c.id === classId) ?? db.classes[0];

  return (
    <div className="space-y-4">
      <Card title="반 선택">
        {db.classes.length === 0 ? (
          <EmptyState>먼저 시험관리 탭에서 반을 만들어 주세요.</EmptyState>
        ) : (
          <Select value={cls?.id ?? ""} onChange={(e) => setClassId(e.target.value)}>
            {db.classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        )}
      </Card>
      {cls && <HomeworkManager key={cls.id} app={app} classId={cls.id} />}
    </div>
  );
}

function StaffAdminSection({ app }: { app: AppStateHook }) {
  const { db, user } = app;
  const isMaster = user?.staffRole === "master";
  const [loginId, setLoginId] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<StaffRole>("teacher");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function createStaff() {
    if (!isMaster) return alert("마스터 관리자만 직원 계정을 관리할 수 있습니다.");
    if (!loginId.trim() || !name.trim() || !password) return alert("아이디, 이름, 임시 비밀번호를 모두 입력하세요.");
    setBusy(true);
    const r = await apiAdmin({ op: "createStaff", loginId, name, role, password, mustChangePassword: true });
    setBusy(false);
    if (!r.ok) return alert(r.error || "직원 계정 생성 실패");
    setLoginId("");
    setName("");
    setPassword("");
    setRole("teacher");
    await app.reload();
  }

  async function updateStaff(staffId: string, patch: Partial<{ loginId: string; name: string; role: StaffRole; active: boolean }>) {
    const r = await apiAdmin({ op: "updateStaff", staffId, patch });
    if (!r.ok) return alert(r.error || "직원 계정 수정 실패");
    await app.reload();
  }

  async function resetPassword(staffId: string, staffName: string) {
    const next = window.prompt(`${staffName}님의 새 임시 비밀번호를 입력하세요.`, "");
    if (next == null) return;
    if (next.length < 4) return alert("비밀번호는 4자 이상이어야 합니다.");
    const r = await apiAdmin({ op: "resetStaffPassword", staffId, password: next, mustChangePassword: true });
    if (!r.ok) return alert(r.error || "비밀번호 초기화 실패");
    alert("비밀번호를 초기화했습니다. 해당 직원에게 새 임시 비밀번호를 전달해 주세요.");
    await app.reload();
  }

  if (!isMaster) {
    return (
      <div className="space-y-4">
        <Card title="관리자 계정 관리">
          <EmptyState>관리자 계정 관리는 마스터 관리자만 사용할 수 있습니다.</EmptyState>
        </Card>
        <AuditLogList db={db} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card title="관리자 계정 만들기" right={<Badge color="amber">마스터 전용</Badge>}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
          <Field label="아이디">
            <Input value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="예: director" />
          </Field>
          <Field label="이름">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 원장님" />
          </Field>
          <Field label="권한">
            <Select value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
              {STAFF_ROLE_OPTIONS.map((item) => (
                <option key={item} value={item}>{STAFF_ROLE_LABELS[item]}</option>
              ))}
            </Select>
          </Field>
          <Field label="임시 비밀번호">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="4자 이상" />
          </Field>
          <div className="flex items-end">
            <Button onClick={createStaff} disabled={busy} className="w-full">{busy ? "생성 중…" : "계정 생성"}</Button>
          </div>
        </div>
      </Card>

      <Card title="관리자 계정 목록" right={<Badge color={db.staffUsers.length ? "indigo" : "gray"}>{db.staffUsers.length}명</Badge>}>
        {db.staffUsers.length === 0 ? (
          <EmptyState>등록된 관리자 계정이 없습니다.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-sm">
              <thead>
                <tr className="border-b border-lab-line text-left text-lab-muted">
                  <th className="py-2 pr-3 font-medium">이름</th>
                  <th className="py-2 pr-3 font-medium">아이디</th>
                  <th className="py-2 pr-3 font-medium">권한</th>
                  <th className="py-2 pr-3 font-medium">상태</th>
                  <th className="py-2 pr-3 font-medium">최근 로그인</th>
                  <th className="py-2 text-right font-medium">관리</th>
                </tr>
              </thead>
              <tbody>
                {db.staffUsers.map((staff) => (
                  <tr key={staff.id} className="border-b border-lab-line/70">
                    <td className="py-2 pr-3 font-semibold text-lab-ink">{staff.name}</td>
                    <td className="py-2 pr-3 font-mono text-lab-muted">{staff.loginId}</td>
                    <td className="py-2 pr-3">
                      <Select
                        value={staff.role}
                        onChange={(e) => updateStaff(staff.id, { role: e.target.value as StaffRole })}
                        disabled={staff.id === user?.id && staff.role === "master"}
                      >
                        {STAFF_ROLE_OPTIONS.map((item) => (
                          <option key={item} value={item}>{STAFF_ROLE_LABELS[item]}</option>
                        ))}
                      </Select>
                    </td>
                    <td className="py-2 pr-3">
                      <Badge color={staff.active ? "green" : "gray"}>{staff.active ? "활성" : "비활성"}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-lab-muted">{staff.lastLoginAt ? staff.lastLoginAt.slice(0, 10) : "-"}</td>
                    <td className="py-2">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="soft" onClick={() => resetPassword(staff.id, staff.name)}>비번 초기화</Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => updateStaff(staff.id, { active: !staff.active })}
                          disabled={staff.id === user?.id}
                        >
                          {staff.active ? "비활성화" : "활성화"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AuditLogList db={db} />
    </div>
  );
}

function AuditLogList({ db }: { db: Database }) {
  const logs = db.auditLogs ?? [];
  return (
    <Card title="감사 로그" right={<Badge color={logs.length ? "indigo" : "gray"}>{logs.length}건</Badge>}>
      {logs.length === 0 ? (
        <EmptyState>표시할 감사 로그가 없습니다.</EmptyState>
      ) : (
        <ul className="divide-y divide-lab-line">
          {logs.slice(0, 80).map((log) => (
            <li key={log.id} className="py-2.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold text-lab-ink">{log.summary}</div>
                <div className="text-xs text-lab-muted">{log.createdAt.slice(0, 16).replace("T", " ")}</div>
              </div>
              <div className="mt-0.5 text-xs text-lab-muted">
                {log.actorName} · {STAFF_ROLE_LABELS[log.actorRole as StaffRole] ?? log.actorRole} · {log.actionType}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AchievementPeriodSettings({ app }: { app: AppStateHook }) {
  const { db, run } = app;
  const savedPeriods = useMemo(() => resolveAchievementPeriods(db.settings), [db.settings]);
  const [drafts, setDrafts] = useState<AchievementPeriod[]>(() => savedPeriods.map((period) => ({ ...period })));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setDrafts(savedPeriods.map((period) => ({ ...period })));
  }, [savedPeriods]);

  function updatePeriod(index: number, patch: Partial<AchievementPeriod>) {
    setDrafts((prev) => prev.map((period, i) => (i === index ? { ...period, ...patch } : period)));
    setMessage(null);
  }

  function resetDefault() {
    setDrafts(ACHIEVEMENT_PERIODS.map((period) => ({ ...period })));
    setMessage(null);
  }

  async function save() {
    setBusy(true);
    const result = await run({ type: "updateAchievementPeriods", periods: drafts });
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error || "저장하지 못했습니다.");
      return;
    }
    setMessage("성취 평가 기간을 저장했습니다.");
  }

  return (
    <Card
      title="성취 평가 기간 설정"
      right={
        <div className="flex items-center gap-2">
          <Badge color="indigo">{savedPeriods.length}개 구간</Badge>
          <DisclosureButton expanded={expanded} onClick={() => setExpanded((value) => !value)} />
        </div>
      }
    >
      {!expanded ? (
        <div className="space-y-3">
          <p className="text-sm text-lab-muted">
            현재 성취 평가 기간입니다. 일정이 밀리면 열어서 개강일과 종강일을 수정하세요.
          </p>
          <div className="flex flex-wrap gap-2">
            {savedPeriods.map((period) => (
              <Badge key={period.key} color="gray">
                {period.label} {achievementRangeLabel(period)}
              </Badge>
            ))}
          </div>
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-lab-muted">
            방학, 휴강, 보강으로 일정이 밀리면 여기서 개강일과 종강일을 수정하세요.
            학생 리포트와 통계 화면이 이 날짜 기준으로 다시 계산됩니다.
          </p>
          <div className="space-y-3">
            {drafts.map((period, index) => (
              <div key={period.key} className="rounded-xl border border-lab-line bg-[#f1ede2] p-3">
                <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold text-lab-ink">{period.label}</div>
                    <div className="text-sm text-lab-muted">{achievementRangeLabel(period)}</div>
                  </div>
                  <Badge color={period.passGoal >= period.targetTests ? "amber" : "green"}>
                    {period.targetTests}회 중 {period.passGoal}회 통과
                  </Badge>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
                  <Field label="구간명">
                    <Input
                      value={period.label}
                      onChange={(e) => updatePeriod(index, { label: e.target.value })}
                      placeholder="예: 1개월차"
                    />
                  </Field>
                  <Field label="개강일">
                    <DatePicker
                      value={period.startDate}
                      onChange={(value) => updatePeriod(index, { startDate: value })}
                      placeholder="YYYY-MM-DD"
                    />
                  </Field>
                  <Field label="종강일">
                    <DatePicker
                      value={period.endDate}
                      onChange={(value) => updatePeriod(index, { endDate: value })}
                      placeholder="YYYY-MM-DD"
                    />
                  </Field>
                  <Field label="시험 횟수">
                    <Input
                      type="number"
                      min={1}
                      value={period.targetTests}
                      onChange={(e) => updatePeriod(index, { targetTests: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="상품 기준">
                    <Input
                      type="number"
                      min={0}
                      max={period.targetTests}
                      value={period.passGoal}
                      onChange={(e) => updatePeriod(index, { passGoal: Number(e.target.value) })}
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className={`text-sm ${message?.includes("저장했습니다") ? "text-green-600" : "text-red-600"}`}>
              {message}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={resetDefault} disabled={busy}>기본값</Button>
              <Button onClick={save} disabled={busy}>{busy ? "저장 중..." : "저장"}</Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function HomeworkManager({ app, classId }: { app: AppStateHook; classId: string }) {
  const { db, run } = app;
  const [dueDate, setDueDate] = useState(todayStr());
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);

  const list = db.homeworks
    .filter((h) => h.classId === classId)
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate) || b.createdAt.localeCompare(a.createdAt));

  async function add() {
    if (!content.trim()) return alert("숙제 내용을 입력하세요.");
    setBusy(true);
    const r = await run({ type: "createHomework", classId, dueDate, content });
    setBusy(false);
    if (!r.ok) return alert(r.error);
    setContent("");
  }

  return (
    <Card title="숙제" right={<Badge color={list.length ? "indigo" : "gray"}>{list.length}건</Badge>}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-44">
          <Field label="숙제 날짜">
            <DatePicker value={dueDate} onChange={setDueDate} />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="숙제 내용">
            <TextArea value={content} onChange={setContent} rows={2} placeholder="예: Day 12 단어 외우기 + 워크북 p.30" />
          </Field>
        </div>
        <Button onClick={add} disabled={busy}>{busy ? "등록 중…" : "숙제 추가"}</Button>
      </div>

      <div className="mt-4">
        {list.length === 0 ? (
          <EmptyState>등록된 숙제가 없습니다.</EmptyState>
        ) : (
          <ul className="divide-y divide-lab-line">
            {list.map((h) => (
              <li key={h.id} className="flex items-start justify-between gap-2 py-3">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-lab-gold">{h.dueDate}</div>
                  <div className="mt-0.5 whitespace-pre-wrap text-sm text-lab-ink">{h.content}</div>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    if (confirm("이 숙제를 삭제할까요?")) {
                      const r = await run({ type: "deleteHomework", id: h.id });
                      if (!r.ok) alert(r.error);
                    }
                  }}
                >
                  삭제
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

const AUDIENCE_LABEL: Record<NoticeAudience, string> = {
  all: "전체(보호자·학생)",
  guardian: "보호자만",
  student: "학생만",
};

interface NoticeDraftPayload {
  title: string;
  body: string;
  audience: NoticeAudience;
  pinned: boolean;
  imagePaths: string[];
  attachments: NoticeAttachment[];
}

/** 공지 작성/수정 공용 폼 — 제목·내용·대상·고정·이미지·첨부파일 */
function NoticeForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Notice;
  submitLabel: string;
  onSubmit: (p: NoticeDraftPayload) => Promise<{ ok: boolean; error?: string }>;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [audience, setAudience] = useState<NoticeAudience>(initial?.audience ?? "all");
  const [pinned, setPinned] = useState(!!initial?.pinned);
  const [imagePaths, setImagePaths] = useState<string[]>(initial?.imagePaths ?? []);
  const [attachments, setAttachments] = useState<NoticeAttachment[]>(initial?.attachments ?? []);
  const [imgBusy, setImgBusy] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onPickImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!files.length) return;
    setImgBusy(true);
    try {
      for (const f of files) {
        const p = await uploadPhoto(f);
        setImagePaths((prev) => [...prev, p]);
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setImgBusy(false);
    }
  }

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!files.length) return;
    setFileBusy(true);
    try {
      for (const f of files) {
        const att = await uploadFile(f);
        setAttachments((prev) => [...prev, att]);
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setFileBusy(false);
    }
  }

  async function submit() {
    if (!title.trim()) return alert("공지 제목을 입력하세요.");
    if (!body.trim()) return alert("공지 내용을 입력하세요.");
    setBusy(true);
    const r = await onSubmit({ title, body, audience, pinned, imagePaths, attachments });
    setBusy(false);
    if (!r.ok) alert(r.error);
  }

  return (
    <div className="space-y-3">
      <Field label="제목">
        <TextInput value={title} onChange={setTitle} placeholder="예: 6월 보강 안내" />
      </Field>
      <Field label="내용">
        <TextArea value={body} onChange={setBody} rows={3} placeholder="공지 내용을 입력하세요 (여러 줄 가능)" />
      </Field>

      {/* 이미지 (학생·보호자에게 함께 보임) */}
      <Field label="이미지" hint="공지에 함께 표시됩니다(학생·보호자에게도 보임).">
        <div className="space-y-2">
          {imagePaths.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {imagePaths.map((src, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="공지 이미지" className="h-20 w-20 rounded-lg border border-lab-line object-cover" />
                  <button
                    type="button"
                    onClick={() => setImagePaths((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-red-500 text-[11px] text-white"
                    aria-label="이미지 삭제"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <input type="file" accept="image/*" multiple onChange={onPickImages} className="text-sm" />
          {imgBusy && <Badge color="gray">이미지 업로드 중…</Badge>}
        </div>
      </Field>

      {/* 첨부파일 (관리자 전용 — 학생·보호자에겐 안 보임) */}
      <Field label="첨부파일 (관리자 전용)" hint="학생·보호자 화면에는 보이지 않습니다.">
        <div className="space-y-2">
          {attachments.length > 0 && (
            <ul className="space-y-1">
              {attachments.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-2 rounded-lg border border-lab-line bg-lab-paper px-3 py-1.5 text-sm">
                  <a href={a.path} target="_blank" rel="noreferrer" className="min-w-0 truncate text-brand-700 hover:underline">{a.name}</a>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                    className="shrink-0 text-xs text-red-600 hover:underline"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input type="file" multiple onChange={onPickFiles} className="text-sm" />
          {fileBusy && <Badge color="gray">파일 업로드 중…</Badge>}
        </div>
      </Field>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="노출 대상">
          <Select value={audience} onChange={(e) => setAudience(e.target.value as NoticeAudience)}>
            <option value="all">{AUDIENCE_LABEL.all}</option>
            <option value="guardian">{AUDIENCE_LABEL.guardian}</option>
            <option value="student">{AUDIENCE_LABEL.student}</option>
          </Select>
        </Field>
        <label className="flex h-[46px] items-center gap-2 rounded-xl border border-lab-line bg-lab-paper px-3 text-base text-lab-ink">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
            className="h-4 w-4 rounded border-lab-line text-brand-600"
          />
          상단 고정
        </label>
        <div className="ml-auto flex gap-2">
          {onCancel && <Button variant="ghost" onClick={onCancel} disabled={busy}>취소</Button>}
          <Button onClick={submit} disabled={busy || imgBusy || fileBusy}>{busy ? "저장 중…" : submitLabel}</Button>
        </div>
      </div>
    </div>
  );
}

function NoticeManager({ app }: { app: AppStateHook }) {
  const { db, run } = app;
  const [editing, setEditing] = useState<Notice | null>(null);
  const [formKey, setFormKey] = useState(0);

  const notices = [...db.notices].sort(
    (a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt.localeCompare(a.createdAt)
  );

  return (
    <Card title="공지사항" right={<Badge color={notices.length ? "indigo" : "gray"}>{notices.length}건</Badge>}>
      <NoticeForm
        key={formKey}
        submitLabel="공지 등록"
        onSubmit={async (p) => {
          const r = await run({ type: "createNotice", ...p });
          if (r.ok) setFormKey((k) => k + 1);
          return r;
        }}
      />

      <div className="mt-4">
        {notices.length === 0 ? (
          <EmptyState>등록된 공지가 없습니다.</EmptyState>
        ) : (
          <ul className="divide-y divide-lab-line">
            {notices.map((n) => (
              <li key={n.id} className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {n.pinned && <Badge color="amber">고정</Badge>}
                      <b className="text-sm text-lab-ink">{n.title}</b>
                      <Badge color="gray">{AUDIENCE_LABEL[n.audience]}</Badge>
                      <span className="text-xs text-lab-muted">{n.createdAt.slice(0, 10)}</span>
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-sm text-lab-muted">{n.body}</div>
                    {(n.imagePaths?.length ?? 0) > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {n.imagePaths!.map((src, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={i} src={src} alt="공지 이미지" className="h-16 w-16 rounded-lg border border-lab-line object-cover" />
                        ))}
                      </div>
                    )}
                    {(n.attachments?.length ?? 0) > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge color="gray">첨부 {n.attachments!.length} (관리자만)</Badge>
                        {n.attachments!.map((a, i) => (
                          <a key={i} href={a.path} target="_blank" rel="noreferrer" className="text-xs text-brand-700 hover:underline">{a.name}</a>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Button size="sm" variant="soft" onClick={() => setEditing(n)}>수정</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        const r = await run({ type: "updateNotice", id: n.id, patch: { pinned: !n.pinned } });
                        if (!r.ok) alert(r.error);
                      }}
                    >
                      {n.pinned ? "고정 해제" : "고정"}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={async () => {
                        if (confirm("이 공지를 삭제할까요?")) {
                          const r = await run({ type: "deleteNotice", id: n.id });
                          if (!r.ok) alert(r.error);
                        }
                      }}
                    >
                      삭제
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="공지 수정" width="max-w-2xl">
        {editing && (
          <NoticeForm
            initial={editing}
            submitLabel="수정 저장"
            onCancel={() => setEditing(null)}
            onSubmit={async (p) => {
              const r = await run({ type: "updateNotice", id: editing.id, patch: p });
              if (r.ok) setEditing(null);
              return r;
            }}
          />
        )}
      </Modal>
    </Card>
  );
}

function ScoreRecordManager({ app }: { app: AppStateHook }) {
  const { db, run } = app;
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [roundFilter, setRoundFilter] = useState<number | 0>(0);
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(RECORD_PAGE_SIZE);
  const [editingRecord, setEditingRecord] = useState<ScoreRecord | null>(null);
  const [bulkEditing, setBulkEditing] = useState(false);

  const students = useMemo(
    () =>
      db.students
        .filter((s) => !classId || s.classId === classId)
        .sort((a, b) => a.name.localeCompare(b.name, "ko")),
    [db.students, classId]
  );

  const records = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.records
      .filter((r) => {
        const student = db.students.find((s) => s.id === r.studentId);
        const cls = db.classes.find((c) => c.id === r.classId);
        if (classId && r.classId !== classId) return false;
        if (studentId && r.studentId !== studentId) return false;
        if (roundFilter && r.round !== roundFilter) return false;
        if (startDate && r.examDate < startDate) return false;
        if (endDate && r.examDate > endDate) return false;
        if (!q) return true;
        return [
          student?.name,
          cls?.name,
          r.bookTitle,
          r.examDate,
          recordLessonLabel(r),
          r.isAbsent ? "결석" : null,
          r.passed ? "통과" : "미통과",
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      })
      .sort((a, b) => b.examDate.localeCompare(a.examDate) || b.createdAt.localeCompare(a.createdAt));
  }, [db.records, db.students, db.classes, classId, studentId, roundFilter, startDate, endDate, query]);

  const visibleRecords = records.slice(0, visibleLimit);
  const visibleIds = visibleRecords.map((r) => r.id);
  const selectedVisibleIds = [...selectedIds].filter((id) => visibleIds.includes(id));
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleIds.length === visibleIds.length;

  function setClassFilter(id: string) {
    setClassId(id);
    setStudentId("");
    setSelectedIds(new Set());
    setVisibleLimit(RECORD_PAGE_SIZE);
  }

  function toggleRecord(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function deleteOne(record: ScoreRecord) {
    const student = db.students.find((s) => s.id === record.studentId);
    if (
      !confirm(
        `${student?.name ?? "학생"} ${record.examDate} ${record.bookTitle} ${recordLessonLabel(record)} 기록을 삭제할까요?\n연결된 재시험 예약/결과도 함께 삭제됩니다.`
      )
    ) return;
    setBusy(true);
    const result = await run({ type: "deleteRecord", id: record.id });
    setBusy(false);
    if (!result.ok) return alert(result.error);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(record.id);
      return next;
    });
  }

  async function deleteSelected() {
    if (!selectedVisibleIds.length) return;
    if (
      !confirm(
        `선택한 점수 기록 ${selectedVisibleIds.length}건을 삭제할까요?\n연결된 재시험 예약/결과도 함께 삭제됩니다.`
      )
    ) return;
    setBusy(true);
    const result = await run({ type: "deleteRecords", ids: selectedVisibleIds });
    setBusy(false);
    if (!result.ok) return alert(result.error);
    setSelectedIds(new Set());
  }

  return (
    <>
    <Card
      title="전체 성적 검색/수정/삭제"
      right={
        <div className="flex items-center gap-1">
          {expanded && (
            <>
              <Button size="sm" variant="soft" disabled={busy || !selectedVisibleIds.length} onClick={() => setBulkEditing(true)}>
                선택 수정
              </Button>
              <Button size="sm" variant="danger" disabled={busy || !selectedVisibleIds.length} onClick={deleteSelected}>
                선택 삭제
              </Button>
            </>
          )}
          <DisclosureButton expanded={expanded} onClick={() => setExpanded((v) => !v)} />
        </div>
      }
    >
      {!expanded ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-lab-muted">
            입력한 점수, 날짜, 책, 회독/회차, 판정을 찾아 수정하거나 삭제할 때 열어 사용하세요.
          </p>
          <Badge color={db.records.length ? "indigo" : "gray"}>전체 기록 {db.records.length}건</Badge>
        </div>
      ) : (
        <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 mb-3">
        <Field label="반">
          <Select value={classId} onChange={(e) => setClassFilter(e.target.value)}>
            <option value="">전체 반</option>
            {db.classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="학생">
          <Select value={studentId} onChange={(e) => { setStudentId(e.target.value); setSelectedIds(new Set()); setVisibleLimit(RECORD_PAGE_SIZE); }}>
            <option value="">전체 학생</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="회독">
          <Select value={roundFilter} onChange={(e) => { setRoundFilter(Number(e.target.value)); setSelectedIds(new Set()); setVisibleLimit(RECORD_PAGE_SIZE); }}>
            <option value={0}>전체 회독</option>
            <option value={1}>1회독</option>
            <option value={2}>2회독</option>
            <option value={3}>3회독</option>
          </Select>
        </Field>
        <Field label="시작일">
          <DatePicker value={startDate} onChange={(v) => { setStartDate(v); setSelectedIds(new Set()); setVisibleLimit(RECORD_PAGE_SIZE); }} placeholder="처음부터" />
        </Field>
        <Field label="종료일">
          <DatePicker value={endDate} onChange={(v) => { setEndDate(v); setSelectedIds(new Set()); setVisibleLimit(RECORD_PAGE_SIZE); }} placeholder="현재까지" />
        </Field>
        <Field label="검색어">
          <Input value={query} onChange={(e) => { setQuery(e.target.value); setSelectedIds(new Set()); setVisibleLimit(RECORD_PAGE_SIZE); }} placeholder="학생, 책, 날짜" />
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={records.length ? "indigo" : "gray"}>검색 결과 {records.length}건</Badge>
          {records.length > visibleRecords.length && <Badge color="gray">최근 {visibleRecords.length}건 표시</Badge>}
          <Badge color={selectedVisibleIds.length ? "blue" : "gray"}>선택 {selectedVisibleIds.length}건</Badge>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setClassId("");
            setStudentId("");
            setRoundFilter(0);
            setQuery("");
            setStartDate("");
            setEndDate("");
            setSelectedIds(new Set());
            setVisibleLimit(RECORD_PAGE_SIZE);
          }}
        >
          필터 초기화
        </Button>
      </div>

      {visibleRecords.length === 0 ? (
        <EmptyState>조건에 맞는 점수 기록이 없습니다.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-left text-lab-muted border-b border-lab-line">
                <th className="py-2 pr-3 font-medium">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(e) => setSelectedIds(e.target.checked ? new Set(visibleIds) : new Set())}
                    className="h-4 w-4 rounded border-lab-line text-brand-600"
                    aria-label="검색된 성적 전체 선택"
                  />
                </th>
                <th className="py-2 pr-3 font-medium">날짜</th>
                <th className="py-2 pr-3 font-medium">반</th>
                <th className="py-2 pr-3 font-medium">학생</th>
                <th className="py-2 pr-3 font-medium">책/회차</th>
                <th className="py-2 pr-3 font-medium">점수</th>
                <th className="py-2 pr-3 font-medium">판정</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {visibleRecords.map((r) => {
                const student = db.students.find((s) => s.id === r.studentId);
                const cls = db.classes.find((c) => c.id === r.classId);
                const pct = r.isAbsent ? null : round1(percentOf(r.actualScore, r.totalScore));
                return (
                  <tr key={r.id} className="border-b border-lab-line">
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={(e) => toggleRecord(r.id, e.target.checked)}
                        className="h-4 w-4 rounded border-lab-line text-brand-600"
                        aria-label="성적 기록 선택"
                      />
                    </td>
                    <td className="py-2 pr-3 text-lab-muted">{r.examDate}</td>
                    <td className="py-2 pr-3 text-lab-muted">{cls?.name ?? "-"}</td>
                    <td className="py-2 pr-3 text-lab-ink">{student?.name ?? "-"}</td>
                    <td className="py-2 pr-3 text-lab-muted">
                      <div>{r.bookTitle}</div>
                      <div className="text-xs text-lab-muted">{recordLessonLabel(r)}{r.retestNo > 0 ? ` · 재${r.retestNo}` : ""}</div>
                    </td>
                    <td className="py-2 pr-3 text-lab-ink">
                      {r.isAbsent ? "결석" : <>{r.actualScore}/{r.totalScore} <span className="text-xs text-lab-muted">({pct}%)</span></>}
                    </td>
                    <td className="py-2 pr-3">
                      {recordBadge(r)}
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditingRecord(r)}>수정</Button>
                        <Button size="sm" variant="danger" disabled={busy} onClick={() => deleteOne(r)}>삭제</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {records.length > visibleRecords.length && (
        <div className="mt-3 flex justify-center">
          <Button size="sm" variant="soft" onClick={() => setVisibleLimit((n) => n + RECORD_PAGE_SIZE)}>
            더 보기 ({visibleRecords.length}/{records.length})
          </Button>
        </div>
      )}
        </>
      )}
    </Card>
    {editingRecord && (
      <EditScoreRecordModal app={app} record={editingRecord} onClose={() => setEditingRecord(null)} />
    )}
    {bulkEditing && (
      <BulkEditScoreRecordsModal
        app={app}
        recordIds={selectedVisibleIds}
        onClose={() => setBulkEditing(false)}
        onDone={() => {
          setBulkEditing(false);
          setSelectedIds(new Set());
        }}
      />
    )}
    </>
  );
}

function passKindChoiceOf(record: ScoreRecord): PassKindChoice {
  if (record.passedOverride == null) return "auto";
  if (record.passedOverride === false) return "fail";
  return record.passKind ?? "main";
}

function EditScoreRecordModal({
  app,
  record,
  onClose,
}: {
  app: AppStateHook;
  record: ScoreRecord;
  onClose: () => void;
}) {
  const { db, run } = app;
  const student = db.students.find((s) => s.id === record.studentId);
  const cls = db.classes.find((c) => c.id === record.classId);
  const books = db.books.filter((b) => b.classId === record.classId);
  const matchedBook = record.bookId
    ? books.find((b) => b.id === record.bookId)
    : books.find((b) => b.title === record.bookTitle);

  const [bookId, setBookId] = useState(matchedBook?.id ?? "");
  const [bookTitle, setBookTitle] = useState(record.bookTitle);
  const [round, setRound] = useState(record.round);
  const [session, setSession] = useState<number | "">(record.session ?? "");
  const [totalScore, setTotalScore] = useState(String(record.totalScore));
  const [actualScore, setActualScore] = useState(String(record.actualScore));
  const [isAbsent, setIsAbsent] = useState(!!record.isAbsent);
  const [examDate, setExamDate] = useState(record.examDate);
  const [passChoice, setPassChoice] = useState<PassKindChoice>(passKindChoiceOf(record));
  const [busy, setBusy] = useState(false);

  const sessionOptions = bookTitle
    ? Array.from({ length: maxSessionsForBook(bookTitle) }, (_, i) => i + 1)
    : [];
  const selectedBook = bookId ? books.find((b) => b.id === bookId) : null;
  const previewActual = Number(actualScore);
  const previewTotal = Number(totalScore);
  const previewPercent =
    !isAbsent && Number.isFinite(previewActual) && Number.isFinite(previewTotal) && previewTotal > 0
      ? round1(percentOf(previewActual, previewTotal))
      : null;

  function pickBook(id: string) {
    setBookId(id);
    const b = books.find((x) => x.id === id);
    if (b) {
      setBookTitle(b.title);
      setTotalScore(String(b.defaultTotalScore));
      setSession("");
    }
  }

  async function save() {
    if (!bookTitle.trim()) return alert("책 제목을 입력하세요.");
    if (!totalScore || Number(totalScore) <= 0) return alert("만점을 입력하세요.");
    if (!isAbsent && actualScore === "") return alert("실제 성적을 입력하세요.");
    if (!isAbsent && Number(actualScore) > Number(totalScore)) return alert("실제 성적은 만점보다 클 수 없습니다.");

    setBusy(true);
    const updateResult = await run({
      type: "updateRecord",
      id: record.id,
      patch: {
        bookId: bookId || null,
        bookTitle: bookTitle.trim(),
        round,
        session: session === "" ? null : Number(session),
        totalScore: Number(totalScore),
        actualScore: isAbsent ? 0 : Number(actualScore),
        isAbsent,
        examDate,
      },
    });
    if (!updateResult.ok) {
      setBusy(false);
      return alert(updateResult.error);
    }

    const passResult = await run({
      type: "setRecordPassKind",
      recordId: record.id,
      kind: passChoice,
    });
    setBusy(false);
    if (!passResult.ok) return alert(passResult.error);
    onClose();
  }

  return (
    <Modal open={true} onClose={onClose} title="성적 기록 수정" width="max-w-2xl">
      <div className="space-y-4">
        <div className="rounded-xl border border-lab-line bg-[#f1ede2] px-4 py-3 text-sm text-lab-muted">
          <div className="font-semibold text-lab-ink">{student?.name ?? "학생 정보 없음"}</div>
          <div className="mt-0.5">{cls?.name ?? "반 정보 없음"} · 기존 {recordLessonLabel(record)}</div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="시험 날짜">
            <DatePicker value={examDate} onChange={setExamDate} />
          </Field>

          <Field label="등록 책 선택">
            <Select value={bookId} onChange={(e) => (e.target.value ? pickBook(e.target.value) : setBookId(""))}>
              <option value="">직접 입력</option>
              {books.map((book) => (
                <option key={book.id} value={book.id}>{book.title}</option>
              ))}
            </Select>
          </Field>

          <Field label="책 제목">
            <Input
              value={bookTitle}
              onChange={(e) => {
                setBookTitle(e.target.value);
                setBookId("");
              }}
              placeholder="책 제목"
            />
          </Field>

          <Field label="회독">
            <Select value={round} onChange={(e) => setRound(Number(e.target.value))}>
              <option value={1}>1회독</option>
              <option value={2}>2회독</option>
              <option value={3}>3회독</option>
            </Select>
          </Field>

          <Field label="회차(Day)" hint={bookTitle ? "책 제목 기준으로 Day 범위를 다시 계산합니다." : undefined}>
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

          <Field label="만점" hint={selectedBook?.passMark != null ? `등록 책 통과 컷 ${selectedBook.passMark}점` : undefined}>
            <Input type="number" min={1} step="0.1" value={totalScore} onChange={(e) => setTotalScore(e.target.value)} />
          </Field>

          <Field label="실제 성적">
            <Input
              type="number"
              min={0}
              step="0.1"
              value={actualScore}
              onChange={(e) => setActualScore(e.target.value)}
              disabled={isAbsent}
            />
          </Field>

          <Field label="결석 여부" hint="결석은 평균 점수 계산에서 제외됩니다.">
            <label className="flex h-[46px] items-center gap-2 rounded-xl border border-lab-line bg-lab-paper px-3 text-base text-lab-ink">
              <input
                type="checkbox"
                checked={isAbsent}
                onChange={(e) => {
                  setIsAbsent(e.target.checked);
                  if (e.target.checked) setActualScore("");
                }}
                className="h-4 w-4 rounded border-lab-line text-brand-600"
              />
              결석
            </label>
          </Field>

          <Field label="판정">
            <Select value={passChoice} onChange={(e) => setPassChoice(e.target.value as PassKindChoice)}>
              <option value="auto">자동 판정</option>
              <option value="main">본시험 통과</option>
              <option value="retest">재시험 통과</option>
              <option value="exempt">면제</option>
              <option value="fail">미통과</option>
            </Select>
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {previewPercent != null && <Badge color="gray">백점환산 {previewPercent}점</Badge>}
          {isAbsent && <Badge color="gray">결석으로 표시</Badge>}
          {passChoice === "auto" && <Badge color="indigo">저장 후 자동 재계산</Badge>}
          {passChoice !== "auto" && <Badge color="amber">선생님 수동 판정</Badge>}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>취소</Button>
          <Button onClick={save} disabled={busy}>{busy ? "저장 중..." : "저장"}</Button>
        </div>
      </div>
    </Modal>
  );
}

interface BulkRecordPatch {
  bookId?: string | null;
  bookTitle?: string;
  round?: number;
  session?: number | null;
  totalScore?: number;
  actualScore?: number;
  isAbsent?: boolean;
  examDate?: string;
}

function BulkEditScoreRecordsModal({
  app,
  recordIds,
  onClose,
  onDone,
}: {
  app: AppStateHook;
  recordIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { db, run } = app;
  const records = recordIds
    .map((id) => db.records.find((record) => record.id === id))
    .filter((record): record is ScoreRecord => !!record);
  const classIds = [...new Set(records.map((record) => record.classId))];
  const singleClassId = classIds.length === 1 ? classIds[0] : "";
  const books = singleClassId ? db.books.filter((book) => book.classId === singleClassId) : [];

  const [applyDate, setApplyDate] = useState(false);
  const [examDate, setExamDate] = useState(records[0]?.examDate ?? "");
  const [applyBook, setApplyBook] = useState(false);
  const [bookId, setBookId] = useState("");
  const [bookTitle, setBookTitle] = useState("");
  const [applyRound, setApplyRound] = useState(false);
  const [round, setRound] = useState(records[0]?.round ?? 1);
  const [applySession, setApplySession] = useState(false);
  const [session, setSession] = useState<number | "">(records[0]?.session ?? "");
  const [applyTotal, setApplyTotal] = useState(false);
  const [totalScore, setTotalScore] = useState(String(records[0]?.totalScore ?? ""));
  const [applyActual, setApplyActual] = useState(false);
  const [actualScore, setActualScore] = useState("");
  const [applyAbsent, setApplyAbsent] = useState(false);
  const [isAbsent, setIsAbsent] = useState(false);
  const [applyPass, setApplyPass] = useState(false);
  const [passChoice, setPassChoice] = useState<PassKindChoice>("auto");
  const [busy, setBusy] = useState(false);

  const sessionBookTitle = applyBook && bookTitle ? bookTitle : records[0]?.bookTitle ?? "";
  const sessionOptions = sessionBookTitle
    ? Array.from({ length: maxSessionsForBook(sessionBookTitle) }, (_, i) => i + 1)
    : [];

  function pickBook(id: string) {
    setBookId(id);
    const book = books.find((item) => item.id === id);
    if (book) {
      setBookTitle(book.title);
      setTotalScore(String(book.defaultTotalScore));
      setApplyTotal(true);
      setSession("");
    }
  }

  async function save() {
    if (!records.length) return alert("선택된 기록이 없습니다.");
    const patch: BulkRecordPatch = {};

    if (applyDate) {
      if (!examDate) return alert("적용할 시험 날짜를 선택하세요.");
      patch.examDate = examDate;
    }
    if (applyBook) {
      if (!bookTitle.trim()) return alert("적용할 책 제목을 입력하세요.");
      patch.bookId = bookId || null;
      patch.bookTitle = bookTitle.trim();
    }
    if (applyRound) patch.round = round;
    if (applySession) patch.session = session === "" ? null : Number(session);
    if (applyTotal) {
      if (!totalScore || Number(totalScore) <= 0) return alert("적용할 만점을 입력하세요.");
      patch.totalScore = Number(totalScore);
    }
    if (applyActual) {
      if (actualScore === "") return alert("적용할 실제 성적을 입력하세요.");
      patch.actualScore = Number(actualScore);
    }
    if (applyAbsent) patch.isAbsent = isAbsent;

    const hasPatch = Object.keys(patch).length > 0;
    if (!hasPatch && !applyPass) return alert("적용할 항목을 하나 이상 선택하세요.");

    setBusy(true);
    if (hasPatch) {
      const updateResult = await run({ type: "updateRecords", ids: recordIds, patch });
      if (!updateResult.ok) {
        setBusy(false);
        return alert(updateResult.error);
      }
    }
    if (applyPass) {
      const passResult = await run({ type: "setRecordsPassKind", recordIds, kind: passChoice });
      if (!passResult.ok) {
        setBusy(false);
        return alert(passResult.error);
      }
    }
    setBusy(false);
    onDone();
  }

  return (
    <Modal open={true} onClose={onClose} title={`선택 성적 일괄 수정 (${records.length}건)`} width="max-w-3xl">
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          체크한 항목만 선택된 기록 전체에 적용됩니다. 체크하지 않은 항목은 그대로 둡니다.
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <BulkField enabled={applyDate} onToggle={setApplyDate} label="시험 날짜">
            <DatePicker value={examDate} onChange={setExamDate} />
          </BulkField>

          <BulkField enabled={applyBook} onToggle={setApplyBook} label="책">
            <div className="space-y-2">
              <Select
                value={bookId}
                onChange={(e) => (e.target.value ? pickBook(e.target.value) : (setBookId(""), setBookTitle("")))}
                disabled={!singleClassId}
              >
                <option value="">{singleClassId ? "직접 입력" : "여러 반 선택 시 직접 입력만 가능"}</option>
                {books.map((book) => (
                  <option key={book.id} value={book.id}>{book.title}</option>
                ))}
              </Select>
              <Input
                value={bookTitle}
                onChange={(e) => {
                  setBookTitle(e.target.value);
                  setBookId("");
                }}
                placeholder="적용할 책 제목"
              />
            </div>
          </BulkField>

          <BulkField enabled={applyRound} onToggle={setApplyRound} label="회독">
            <Select value={round} onChange={(e) => setRound(Number(e.target.value))}>
              <option value={1}>1회독</option>
              <option value={2}>2회독</option>
              <option value={3}>3회독</option>
            </Select>
          </BulkField>

          <BulkField enabled={applySession} onToggle={setApplySession} label="회차(Day)">
            <Select value={session} onChange={(e) => setSession(e.target.value ? Number(e.target.value) : "")}>
              <option value="">선택 안 함</option>
              {sessionOptions.map((n) => (
                <option key={n} value={n}>
                  {n}회차 · {sessionDayRange(n, sessionBookTitle)}
                </option>
              ))}
            </Select>
          </BulkField>

          <BulkField enabled={applyTotal} onToggle={setApplyTotal} label="만점">
            <Input type="number" min={1} step="0.1" value={totalScore} onChange={(e) => setTotalScore(e.target.value)} />
          </BulkField>

          <BulkField enabled={applyActual} onToggle={setApplyActual} label="실제 성적">
            <Input
              type="number"
              min={0}
              step="0.1"
              value={actualScore}
              onChange={(e) => setActualScore(e.target.value)}
              disabled={applyAbsent && isAbsent}
              placeholder="선택 기록에 같은 점수 적용"
            />
          </BulkField>

          <BulkField enabled={applyAbsent} onToggle={setApplyAbsent} label="결석 표시">
            <Select value={isAbsent ? "absent" : "present"} onChange={(e) => setIsAbsent(e.target.value === "absent")}>
              <option value="absent">결석으로 표시</option>
              <option value="present">결석 해제</option>
            </Select>
          </BulkField>

          <BulkField enabled={applyPass} onToggle={setApplyPass} label="판정">
            <Select value={passChoice} onChange={(e) => setPassChoice(e.target.value as PassKindChoice)}>
              <option value="auto">자동 판정</option>
              <option value="main">본시험 통과</option>
              <option value="retest">재시험 통과</option>
              <option value="exempt">면제</option>
              <option value="fail">미통과</option>
            </Select>
          </BulkField>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>취소</Button>
          <Button onClick={save} disabled={busy}>{busy ? "적용 중..." : "선택 항목 적용"}</Button>
        </div>
      </div>
    </Modal>
  );
}

function BulkField({
  enabled,
  onToggle,
  label,
  children,
}: {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-3 ${enabled ? "border-brand-100 bg-brand-50/40" : "border-lab-line bg-[#f1ede2]"}`}>
      <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-lab-ink">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-4 w-4 rounded border-lab-line text-brand-600"
        />
        {label}
      </label>
      <div className={enabled ? "" : "pointer-events-none opacity-45"}>{children}</div>
    </div>
  );
}

function recordBadge(record: ScoreRecord) {
  if (record.isAbsent) return <Badge color="gray">결석</Badge>;
  if (!record.passed) return <Badge color="red">미통과</Badge>;
  if (record.passKind === "exempt") return <Badge color="gray">면제</Badge>;
  if (record.passKind === "retest" || record.attemptType === "retest") return <Badge color="blue">재시험 통과</Badge>;
  if (record.isPerfect) return <Badge color="amber">만점</Badge>;
  return <Badge color="green">통과</Badge>;
}

/** 학생관리 — 반별 학생 계정·보호자코드·재시험 결과 관리 */
function StudentRoster({ app, classId }: { app: AppStateHook; classId: string }) {
  const { db, run } = app;
  const students = db.students
    .filter((s) => s.classId === classId)
    .sort((a, b) => Number(isActiveStudent(b)) - Number(isActiveStudent(a)) || a.name.localeCompare(b.name, "ko"));
  const activeStudents = students.filter(isActiveStudent);
  const withdrawnStudents = students.filter((s) => !isActiveStudent(s));

  const [studentName, setStudentName] = useState("");
  const [retestStudentId, setRetestStudentId] = useState<string | null>(null);
  const [selectedRetestRecordIds, setSelectedRetestRecordIds] = useState<Set<string>>(new Set());

  // 발급된 계정 정보(1회성 표시)
  const [issued, setIssued] = useState<IssuedCred[] | null>(null);

  const retestStudent = retestStudentId ? db.students.find((s) => s.id === retestStudentId) : null;
  const byDateDesc = (a: { examDate: string; createdAt: string }, b: { examDate: string; createdAt: string }) =>
    b.examDate.localeCompare(a.examDate) || b.createdAt.localeCompare(a.createdAt);
  // 아직 판정 안 된 미통과 회차 (자동 미통과)
  const retestNeeded = retestStudent
    ? db.records
        .filter(
          (r) =>
            r.studentId === retestStudent.id &&
            r.status === "approved" &&
            !r.isAbsent &&
            !r.passed &&
            r.passedOverride == null &&
            !db.retests.some(
              (rt) =>
                rt.scoreRecordId === r.id &&
                (rt.status === "scheduled" || rt.status === "completed")
            )
        )
        .sort(byDateDesc)
    : [];
  // 선생님이 이미 처리한 회차 (통과/면제/수동 미통과 등 직접 판정)
  const retestProcessed = retestStudent
    ? db.records
        .filter((r) => r.studentId === retestStudent.id && r.status === "approved" && !r.isAbsent && r.passedOverride != null)
        .sort(byDateDesc)
    : [];
  const retestHistory = retestStudent
    ? db.retests
        .filter((rt) => rt.studentId === retestStudent.id && rt.status !== "scheduled")
        .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
    : [];
  const selectableRetestRecordIds = [
    ...retestNeeded.map((r) => r.id),
    ...retestProcessed.map((r) => r.id),
    ...retestHistory.flatMap((rt) => (rt.resultRecordId ? [rt.resultRecordId] : [])),
  ];
  const selectedRetestIds = [...selectedRetestRecordIds].filter((id) =>
    selectableRetestRecordIds.includes(id)
  );
  const allRetestSelected =
    selectableRetestRecordIds.length > 0 &&
    selectedRetestIds.length === selectableRetestRecordIds.length;

  function toggleRetestSelection(recordId: string, checked: boolean) {
    setSelectedRetestRecordIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(recordId);
      else next.delete(recordId);
      return next;
    });
  }

  async function setSelectedRetestKind(kind: PassKindChoice) {
    if (!selectedRetestIds.length) return;
    const r = await run({ type: "setRecordsPassKind", recordIds: selectedRetestIds, kind });
    if (!r.ok) return alert(r.error);
    setSelectedRetestRecordIds(new Set());
  }

  function closeRetestModal() {
    setSelectedRetestRecordIds(new Set());
    setRetestStudentId(null);
  }

  async function addStudent() {
    const names = studentName
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!names.length) return;
    const r = await apiAdmin({ op: "createStudentsWithCreds", classId, names });
    if (!r.ok) return alert(r.error || "추가 실패");
    setStudentName("");
    await app.reload();
    if (r.created?.length) setIssued(r.created);
  }

  async function resetPassword(studentId: string, name: string) {
    if (!confirm(`'${name}' 학생의 비밀번호를 새로 발급할까요? (기존 비번은 무효)`)) return;
    const r = await apiAdmin({ op: "issueCredentials", studentId });
    if (!r.ok) return alert(r.error || "발급 실패");
    await app.reload();
    setIssued([{ name, loginId: r.loginId, password: r.password }]);
  }

  async function issueGuardianCode(studentId: string, name: string, regen: boolean) {
    if (regen && !confirm(`'${name}' 학생의 보호자 접속 코드를 새로 발급할까요? (기존 코드는 무효)`)) return;
    const r = await apiAdmin({ op: "issueGuardianCode", studentId });
    if (!r.ok) return alert(r.error || "발급 실패");
    await app.reload();
    alert(
      `'${name}' 보호자 접속 코드: ${r.guardianCode}\n\n` +
        `학부모님께 로그인 화면 [보호자] 탭에서\n자녀 이름 「${name}」 + 위 코드로 접속하도록 안내하세요.`
    );
  }

  return (
    <div className="space-y-4">
        {/* 학생 */}
        <Card title={`학생 (재원 ${activeStudents.length}명${withdrawnStudents.length ? ` · 퇴원 ${withdrawnStudents.length}명` : ""})`}>
          <div className="flex gap-2 mb-1">
            <Input
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="이름 입력 (쉼표/줄바꿈으로 여러 명)"
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && addStudent()}
            />
            <Button onClick={addStudent}>추가</Button>
          </div>
          <p className="text-xs text-lab-muted mb-3">아이디는 <b>이름</b>, 초기 비밀번호는 <b>0000</b>으로 자동 발급됩니다. (이름이 겹치면 뒤에 숫자가 붙어요)</p>
          {students.length === 0 ? (
            <EmptyState>학생을 추가하세요.</EmptyState>
          ) : (
            <ul className="divide-y divide-lab-line">
              {students.map((s) => {
                const active = isActiveStudent(s);
                return (
                <li key={s.id} className="flex items-center justify-between py-2 gap-2">
                  <div className="min-w-0">
                    <div className="text-sm text-lab-ink flex items-center gap-2">
                      <span>{s.name}</span>
                      {!active && <Badge color="gray">퇴원</Badge>}
                    </div>
                    <div className="text-xs text-lab-muted">
                      {s.loginId ? <>아이디 <span className="font-mono text-lab-muted">{s.loginId}</span></> : <span className="text-amber-500">계정 미발급</span>}
                      {!active && s.withdrawnAt && <span className="ml-2">퇴원일 {s.withdrawnAt.slice(0, 10)}</span>}
                    </div>
                    {active && (
                      <div className="text-xs text-lab-muted mt-0.5">
                        보호자코드{" "}
                        {s.guardianCode ? (
                          <span className="font-mono font-bold tracking-wider text-lab-navy">{s.guardianCode}</span>
                        ) : (
                          <span className="text-amber-500">미발급</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedRetestRecordIds(new Set());
                        setRetestStudentId(s.id);
                      }}
                    >
                      재시험
                    </Button>
                    {active && <Button variant="soft" size="sm" onClick={() => resetPassword(s.id, s.name)}>비번 발급</Button>}
                    {active && (
                      <Button variant="ghost" size="sm" onClick={() => issueGuardianCode(s.id, s.name, !!s.guardianCode)}>
                        {s.guardianCode ? "코드 재발급" : "보호자코드"}
                      </Button>
                    )}
                    <Button
                      variant={active ? "ghost" : "soft"}
                      size="sm"
                      onClick={async () => {
                        if (active) {
                          if (confirm(`'${s.name}' 학생을 퇴원 처리할까요? 기존 점수 기록은 보존됩니다.`)) {
                            await run({ type: "updateStudent", id: s.id, patch: { status: "withdrawn" } });
                          }
                        } else {
                          if (confirm(`'${s.name}' 학생을 재원 상태로 복원할까요?`)) {
                            await run({ type: "updateStudent", id: s.id, patch: { status: "active", withdrawnAt: null } });
                          }
                        }
                      }}
                    >{active ? "퇴원" : "복원"}</Button>
                  </div>
                </li>
                );
              })}
            </ul>
          )}
        </Card>

      <Modal open={!!issued} onClose={() => setIssued(null)} title="학생 로그인 계정 발급됨">
        <div className="space-y-3">
          <p className="text-sm text-lab-muted">
            아래 <b>아이디</b>로 로그인합니다. 초기 비밀번호는 모두 <b>0000</b>이며,
            학생이 로그인 후 직접 변경하도록 안내하세요. (비번 분실 시 「비번 발급」으로 0000 재설정)
          </p>
          <div className="rounded-xl border border-lab-line overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f1ede2] text-left text-lab-muted">
                  <th className="py-2 px-3 font-medium">이름</th>
                  <th className="py-2 px-3 font-medium">아이디</th>
                  <th className="py-2 px-3 font-medium">비밀번호</th>
                </tr>
              </thead>
              <tbody>
                {(issued ?? []).map((c, i) => (
                  <tr key={i} className="border-t border-lab-line">
                    <td className="py-2 px-3 text-lab-ink">{c.name}</td>
                    <td className="py-2 px-3 font-mono text-lab-ink">{c.loginId}</td>
                    <td className="py-2 px-3 font-mono text-brand-700 font-semibold">{c.password}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="soft"
              onClick={() => {
                const text = (issued ?? []).map((c) => `${c.name}\t아이디:${c.loginId}\t비번:${c.password}`).join("\n");
                navigator.clipboard?.writeText(text);
                alert("복사되었습니다.");
              }}
            >복사</Button>
            <Button onClick={() => setIssued(null)}>확인</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!retestStudent}
        onClose={closeRetestModal}
        title={`${retestStudent?.name ?? ""} 재시험 결과 관리`}
        width="max-w-3xl"
      >
        <div className="space-y-5">
          {selectableRetestRecordIds.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-lab-line bg-[#f1ede2] px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-2 text-sm text-lab-ink">
                  <input
                    type="checkbox"
                    checked={allRetestSelected}
                    onChange={(e) => {
                      setSelectedRetestRecordIds(
                        e.target.checked ? new Set(selectableRetestRecordIds) : new Set()
                      );
                    }}
                    className="h-4 w-4 rounded border-lab-line text-brand-600"
                  />
                  전체 선택
                </label>
                <Badge color={selectedRetestIds.length ? "indigo" : "gray"}>
                  선택 {selectedRetestIds.length}건
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Button size="sm" variant="soft" disabled={!selectedRetestIds.length} onClick={() => setSelectedRetestKind("main")}>
                  본시험 통과
                </Button>
                <Button size="sm" variant="soft" disabled={!selectedRetestIds.length} onClick={() => setSelectedRetestKind("retest")}>
                  재시험 통과
                </Button>
                <Button size="sm" variant="soft" disabled={!selectedRetestIds.length} onClick={() => setSelectedRetestKind("exempt")}>
                  면제
                </Button>
                <Button size="sm" variant="danger" disabled={!selectedRetestIds.length} onClick={() => setSelectedRetestKind("fail")}>
                  미통과
                </Button>
                <Button size="sm" variant="ghost" disabled={!selectedRetestIds.length} onClick={() => setSelectedRetestKind("auto")}>
                  자동
                </Button>
              </div>
            </div>
          )}

          <section>
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-sm font-semibold text-lab-ink">재시험 필요 회차</h3>
              <Badge color={retestNeeded.length ? "red" : "gray"}>{retestNeeded.length}건</Badge>
            </div>
            {retestNeeded.length === 0 ? (
              <EmptyState>현재 재시험이 필요한 회차가 없습니다.</EmptyState>
            ) : (
              <ul className="divide-y divide-lab-line">
                {retestNeeded.map((record) => (
                  <NeedsRetestRow
                    key={record.id}
                    app={app}
                    record={record}
                    selection={{
                      checked: selectedRetestRecordIds.has(record.id),
                      onChange: (checked) => toggleRetestSelection(record.id, checked),
                    }}
                  />
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-sm font-semibold text-lab-ink">처리된 회차</h3>
              <Badge color={retestProcessed.length ? "green" : "gray"}>{retestProcessed.length}건</Badge>
            </div>
            {retestProcessed.length === 0 ? (
              <EmptyState>선생님이 직접 통과·면제·미통과로 처리한 회차가 여기 표시됩니다.</EmptyState>
            ) : (
              <ul className="divide-y divide-lab-line">
                {retestProcessed.map((record) => (
                  <NeedsRetestRow
                    key={record.id}
                    app={app}
                    record={record}
                    selection={{
                      checked: selectedRetestRecordIds.has(record.id),
                      onChange: (checked) => toggleRetestSelection(record.id, checked),
                    }}
                  />
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-sm font-semibold text-lab-ink">지난 재시험 결과</h3>
              <Badge color="gray">{retestHistory.length}건</Badge>
            </div>
            {retestHistory.length === 0 ? (
              <EmptyState>지난 재시험 결과가 없습니다.</EmptyState>
            ) : (
              <ul className="divide-y divide-lab-line">
                {retestHistory.map((rt) => (
                  <RetestHistoryRow
                    key={rt.id}
                    app={app}
                    rt={rt}
                    selection={
                      rt.resultRecordId
                        ? {
                            checked: selectedRetestRecordIds.has(rt.resultRecordId),
                            onChange: (checked) => toggleRetestSelection(rt.resultRecordId!, checked),
                          }
                        : undefined
                    }
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      </Modal>
    </div>
  );
}

/** 시험관리 — 반 설정(이름·요일·컷·삭제) + 반별 책/단어장 관리 */
function ClassExamDetail({ app, classId }: { app: AppStateHook; classId: string }) {
  const { db, run } = app;
  const cls = db.classes.find((c) => c.id === classId)!;
  const books = db.books.filter((b) => b.classId === classId);

  const [bookTitle, setBookTitle] = useState("");
  const [bookTotal, setBookTotal] = useState(20);
  const [bookCut, setBookCut] = useState<string>("");
  const [bookPassMark, setBookPassMark] = useState<string>("");

  // 반 설정 편집
  const [editCut, setEditCut] = useState(cls.passThreshold);
  const [editName, setEditName] = useState(cls.name);
  const [editSchedule, setEditSchedule] = useState<ScheduleType>(cls.scheduleType);

  async function addBook() {
    if (!bookTitle.trim()) return alert("책 제목을 입력하세요.");
    const r = await run({
      type: "createBook",
      classId,
      title: bookTitle,
      defaultTotalScore: bookTotal,
      passThreshold: bookCut === "" ? null : Number(bookCut),
      passMark: bookPassMark === "" ? null : Number(bookPassMark),
    });
    if (r.ok) {
      setBookTitle("");
      setBookPassMark("");
    } else alert(r.error);
  }

  async function saveClass() {
    const r = await run({
      type: "updateClass",
      id: classId,
      patch: { name: editName, passThreshold: editCut, scheduleType: editSchedule },
    });
    if (!r.ok) alert(r.error);
  }

  return (
    <div className="space-y-4">
      <Card
        title={`「${cls.name}」 설정`}
        right={
          <Button variant="danger" size="sm" onClick={async () => {
            if (confirm(`'${cls.name}' 반과 소속 학생·기록을 모두 삭제할까요?`)) {
              await run({ type: "deleteClass", id: classId });
            }
          }}>반 삭제</Button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Field label="반 이름">
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          </Field>
          <Field label="수업 요일">
            <Select value={editSchedule} onChange={(e) => setEditSchedule(e.target.value as ScheduleType)}>
              <option value="월수금">월수금</option>
              <option value="화목">화목</option>
            </Select>
          </Field>
          <Field label="통과 컷(%)">
            <Input type="number" min={0} max={100} value={editCut} onChange={(e) => setEditCut(Number(e.target.value))} />
          </Field>
          <div className="flex items-end">
            <Button onClick={saveClass} variant="soft" className="w-full">설정 저장</Button>
          </div>
        </div>
      </Card>

      {/* 책 */}
      <Card title={`책/단어장 (${books.length})`}>
        <div className="grid grid-cols-3 gap-2 mb-1">
          <Input value={bookTitle} onChange={(e) => setBookTitle(e.target.value)} placeholder="책 제목" className="col-span-3" />
          <Field label="기본 만점">
            <Input type="number" min={1} value={bookTotal} onChange={(e) => setBookTotal(Number(e.target.value))} />
          </Field>
          <Field label="통과 점수(컷)" hint="예: 51점 이상">
            <Input type="number" min={0} step={0.5} value={bookPassMark} onChange={(e) => setBookPassMark(e.target.value)} placeholder="절대 점수" />
          </Field>
          <Field label="또는 컷(%)" hint="비우면 반 컷">
            <Input type="number" min={0} max={100} value={bookCut} onChange={(e) => setBookCut(e.target.value)} placeholder={`${cls.passThreshold}`} disabled={bookPassMark !== ""} />
          </Field>
          <div className="col-span-3">
            <Button onClick={addBook} className="w-full">+ 책 추가</Button>
          </div>
        </div>
        <p className="text-xs text-lab-muted mb-3">통과 점수(절대)를 넣으면 그 점수 이상이면 통과합니다. (백분율 컷보다 우선)</p>
        {books.length === 0 ? (
          <EmptyState>책을 추가하면 점수 입력이 편해집니다.</EmptyState>
        ) : (
          <ul className="divide-y divide-lab-line">
            {books.map((b) => (
              <li key={b.id} className="flex items-center justify-between py-2">
                <span className="text-sm text-lab-ink">
                  {b.title}{" "}
                  <span className="text-xs text-lab-muted">
                    (만점 {b.defaultTotalScore} · 컷 {b.passMark != null ? `${b.passMark}점 이상` : `${b.passThreshold ?? cls.passThreshold}%`})
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    if (confirm(`'${b.title}' 책을 삭제할까요? (점수 기록은 유지됩니다)`)) {
                      await run({ type: "deleteBook", id: b.id });
                    }
                  }}
                >삭제</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
