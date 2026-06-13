"use client";

import React, { useState } from "react";
import { AppStateHook, apiLogout, apiChangePassword } from "@/lib/client";
import ScoreEntry from "@/components/ScoreEntry";
import RetestTab from "@/components/RetestTab";
import StatsTab from "@/components/StatsTab";
import ManageTab from "@/components/ManageTab";
import MonthlyTab from "@/components/MonthlyTab";
import { Button, Modal, Field, Input } from "@/components/ui";
import CreatorFooter from "@/components/CreatorFooter";

type Tab = "score" | "retest" | "stats" | "monthly" | "manage";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "score", label: "점수 입력", icon: "✏️" },
  { id: "retest", label: "재시험", icon: "🔁" },
  { id: "stats", label: "통계", icon: "📊" },
  { id: "monthly", label: "먼슬리", icon: "🗓️" },
  { id: "manage", label: "관리", icon: "⚙️" },
];

export default function TeacherApp({ app }: { app: AppStateHook }) {
  const [tab, setTab] = useState<Tab>("score");
  const [showPw, setShowPw] = useState(false);
  const scheduledCount = app.db.retests.filter((r) => r.status === "scheduled").length;

  return (
    <div className="min-h-screen pb-24 sm:pb-8">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📚</span>
            <div>
              <h1 className="font-serif font-bold text-gray-800 leading-tight">통합 시험 관리</h1>
              <p className="text-xs text-gray-400">선생님 화면</p>
            </div>
          </div>
          <nav className="hidden sm:flex gap-1 items-center">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative px-4 py-2 rounded-xl text-sm font-medium transition ${
                  tab === t.id ? "bg-brand-50 text-brand-700" : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                {t.label}
                {t.id === "retest" && scheduledCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                    {scheduledCount}
                  </span>
                )}
              </button>
            ))}
            <span className="w-px h-6 bg-gray-200 mx-1" />
            <Button size="sm" variant="ghost" onClick={() => setShowPw(true)}>비밀번호</Button>
            <Button size="sm" variant="ghost" onClick={async () => { await apiLogout(); app.reload(); }}>로그아웃</Button>
          </nav>
          <div className="sm:hidden">
            <Button size="sm" variant="ghost" onClick={async () => { await apiLogout(); app.reload(); }}>로그아웃</Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5">
        {app.error && (
          <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">{app.error}</div>
        )}
        {tab === "score" && <ScoreEntry app={app} />}
        {tab === "retest" && <RetestTab app={app} />}
        {tab === "stats" && <StatsTab app={app} />}
        {tab === "monthly" && <MonthlyTab app={app} />}
        {tab === "manage" && <ManageTab app={app} />}
      </main>

      <CreatorFooter className="px-4 pb-6" />

      <nav className="sm:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 z-30">
        <div className="grid grid-cols-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex flex-col items-center py-2.5 text-xs ${
                tab === t.id ? "text-brand-700" : "text-gray-400"
              }`}
            >
              <span className="text-lg leading-none">{t.icon}</span>
              <span className="mt-0.5">{t.label}</span>
              {t.id === "retest" && scheduledCount > 0 && (
                <span className="absolute top-1 right-1/4 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                  {scheduledCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      <Modal open={showPw} onClose={() => setShowPw(false)} title="선생님 비밀번호 변경">
        <TeacherChangePassword onDone={() => setShowPw(false)} />
      </Modal>
    </div>
  );
}

function TeacherChangePassword({ onDone }: { onDone: () => void }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [next2, setNext2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (next !== next2) return setError("새 비밀번호가 일치하지 않습니다.");
    if (next.length < 4) return setError("새 비밀번호는 4자 이상이어야 합니다.");
    setBusy(true);
    const r = await apiChangePassword(cur, next);
    setBusy(false);
    if (!r.ok) return setError(r.error || "변경 실패");
    alert("비밀번호가 변경되었습니다.");
    onDone();
  }

  return (
    <div className="space-y-3">
      <Field label="현재 비밀번호">
        <Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} />
      </Field>
      <Field label="새 비밀번호">
        <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <Field label="새 비밀번호 확인">
        <Input type="password" value={next2} onChange={(e) => setNext2(e.target.value)} />
      </Field>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>취소</Button>
        <Button onClick={submit} disabled={busy}>{busy ? "변경 중…" : "변경"}</Button>
      </div>
    </div>
  );
}
