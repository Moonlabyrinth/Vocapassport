"use client";

import React from "react";
import { useAppState } from "@/lib/client";
import Login from "@/components/Login";
import TeacherApp from "@/components/TeacherApp";
import StudentApp from "@/components/StudentApp";

export default function Home() {
  const app = useAppState();

  if (app.status === "loading") {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">불러오는 중…</div>;
  }
  if (app.status === "unauth") {
    return <Login onSuccess={() => app.reload()} />;
  }
  if (app.status === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center px-4">
        <p className="text-red-600 text-sm">{app.error}</p>
        <button onClick={() => app.reload()} className="text-brand-600 text-sm underline">다시 시도</button>
      </div>
    );
  }
  // ready
  if (app.role === "teacher") return <TeacherApp app={app} />;
  return <StudentApp app={app} />;
}
