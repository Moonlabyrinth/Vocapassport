"use client";

import React, { useState } from "react";
import { Card, Badge, EmptyState, Button, Modal } from "./ui";
import { Homework, Notice } from "@/lib/types";

function dateLabel(d: string): string {
  const [, m, day] = d.split("-");
  if (!m || !day) return d;
  const wd = ["일", "월", "화", "수", "목", "금", "토"][new Date(d).getDay()] ?? "";
  return `${Number(m)}월 ${Number(day)}일${wd ? ` (${wd})` : ""}`;
}

/** 숙제 게시판 (반별, 날짜 내림차순). 학생·보호자 공용 */
export function HomeworkBoard({ homeworks }: { homeworks: Homework[] }) {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...homeworks].sort(
    (a, b) => b.dueDate.localeCompare(a.dueDate) || b.createdAt.localeCompare(a.createdAt)
  );
  const RECENT = 3;
  const visible = expanded ? sorted : sorted.slice(0, RECENT);
  const hidden = sorted.length - visible.length;

  return (
    <Card title="숙제" right={<Badge color={sorted.length ? "indigo" : "gray"}>{sorted.length}건</Badge>}>
      {sorted.length === 0 ? (
        <EmptyState>등록된 숙제가 없습니다.</EmptyState>
      ) : (
        <>
          <ul className="space-y-2.5">
            {visible.map((h) => (
              <li key={h.id} className="rounded-xl border border-lab-line bg-lab-paper px-4 py-3">
                <div className="mb-1 text-xs font-bold text-lab-gold">{dateLabel(h.dueDate)}</div>
                <div className="whitespace-pre-wrap text-sm text-lab-ink">{h.content}</div>
              </li>
            ))}
          </ul>
          {(hidden > 0 || expanded) && sorted.length > RECENT && (
            <div className="mt-3 flex justify-center">
              <Button size="sm" variant="soft" onClick={() => setExpanded((v) => !v)}>
                {expanded ? "접기" : `지난 숙제 ${hidden}건 더 보기`}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/** 읽은 공지 id 보관 키 (기기별 localStorage). 학생/보호자 공용 */
const READ_NOTICES_KEY = "wtm_read_notices";

function loadReadIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(READ_NOTICES_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function persistReadIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(READ_NOTICES_KEY, JSON.stringify([...ids]));
  } catch {
    /* 저장 실패는 무시 (시크릿 모드 등) */
  }
}

/** 공지 이미지 인라인 렌더 */
function NoticeImages({ srcs }: { srcs?: string[] }) {
  if (!srcs?.length) return null;
  return (
    <div className="mt-2 flex flex-col gap-2">
      {srcs.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={src}
          alt="공지 이미지"
          className="max-h-80 w-auto rounded-lg border border-lab-line object-contain"
        />
      ))}
    </div>
  );
}

/**
 * 학원 공지 게시판 (고정 우선, 최신순). 학생·보호자 공용
 * - 고정 공지: 클릭 없이 내용·이미지까지 펼쳐서 표시
 * - 나머지 공지: 제목 클릭 시 모달로 내용 표시 + 미확인 강조
 */
export function NoticeBoard({ notices }: { notices: Notice[] }) {
  const [expanded, setExpanded] = useState(false);
  const [openNotice, setOpenNotice] = useState<Notice | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(() => loadReadIds());

  const sorted = [...notices].sort(
    (a, b) =>
      Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt.localeCompare(a.createdAt)
  );
  const featuredPinned = sorted.find((n) => n.pinned) ?? null;
  const rest = sorted.filter((n) => n.id !== featuredPinned?.id);
  const RECENT = 3;
  const visibleRest = expanded ? rest : rest.slice(0, RECENT);
  const hidden = rest.length - visibleRest.length;
  // 미확인 강조는 클릭해서 봐야 하는 '나머지 공지'에만 적용 (고정 공지는 항상 펼쳐져 있음)
  const unreadCount = rest.filter((n) => !readIds.has(n.id)).length;

  function openDetail(n: Notice) {
    setOpenNotice(n);
    // 들어가서 본 순간 '확인함'으로 처리
    setReadIds((prev) => {
      if (prev.has(n.id)) return prev;
      const next = new Set(prev);
      next.add(n.id);
      persistReadIds(next);
      return next;
    });
  }

  return (
    <Card
      title="학원 공지"
      right={
        <div className="flex items-center gap-1.5">
          {unreadCount > 0 && <Badge color="amber">미확인 {unreadCount}</Badge>}
          <Badge color={sorted.length ? "indigo" : "gray"}>{sorted.length}건</Badge>
        </div>
      }
    >
      {sorted.length === 0 ? (
        <EmptyState>등록된 공지가 없습니다.</EmptyState>
      ) : (
        <div className="space-y-2.5">
          {/* 고정 공지 — 클릭 없이 내용·이미지까지 표시 */}
          {featuredPinned && (
            <div className="rounded-xl border border-lab-gold bg-lab-gold-soft px-4 py-3">
              <div className="mb-1.5 flex items-center gap-2">
                <Badge color="amber">고정</Badge>
                <b className="text-sm text-lab-navy">{featuredPinned.title}</b>
                <span className="ml-auto shrink-0 text-xs text-lab-muted">{featuredPinned.createdAt.slice(0, 10)}</span>
              </div>
              <div className="whitespace-pre-wrap text-sm text-lab-ink">{featuredPinned.body}</div>
              <NoticeImages srcs={featuredPinned.imagePaths} />
            </div>
          )}

          {/* 나머지 공지 — 제목 클릭 시 모달 */}
          {visibleRest.map((n) => {
            const unread = !readIds.has(n.id);
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => openDetail(n)}
                className={`flex w-full items-center gap-2 rounded-xl border px-4 py-3 text-left transition hover:shadow-lab-sm ${
                  unread ? "border-lab-gold bg-lab-gold-soft" : "border-lab-line bg-lab-paper"
                }`}
              >
                {unread && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-lab-gold" />}
                {n.pinned && <Badge color="amber">怨좎젙</Badge>}
                <b className={`truncate text-sm ${unread ? "text-lab-navy" : "text-lab-ink"}`}>{n.title}</b>
                {unread && <Badge color="amber">미확인</Badge>}
                <span className="ml-auto shrink-0 text-xs text-lab-muted">{n.createdAt.slice(0, 10)}</span>
                <span aria-hidden="true" className="shrink-0 text-lab-muted">›</span>
              </button>
            );
          })}

          {rest.length > RECENT && (
            <div className="flex justify-center pt-1">
              <Button size="sm" variant="soft" onClick={() => setExpanded((v) => !v)}>
                {expanded ? "접기" : `지난 공지 ${hidden}건 더 보기`}
              </Button>
            </div>
          )}
        </div>
      )}

      <Modal
        open={!!openNotice}
        onClose={() => setOpenNotice(null)}
        title={<span className="truncate">{openNotice?.title}</span>}
        width="max-w-2xl"
      >
        {openNotice && (
          <div className="space-y-3">
            <div className="text-xs text-lab-muted">{openNotice.createdAt.slice(0, 10)}</div>
            <div className="whitespace-pre-wrap text-sm text-lab-ink">{openNotice.body}</div>
            <NoticeImages srcs={openNotice.imagePaths} />
          </div>
        )}
      </Modal>
    </Card>
  );
}
