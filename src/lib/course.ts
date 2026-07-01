import { ScoreRecord } from "./types";

export function bookLastDay(bookTitle: string): number {
  if (/고난도/.test(bookTitle)) return 40;
  if (/필수/.test(bookTitle)) return 50;
  return 50;
}

export function maxSessionsForBook(bookTitle: string): number {
  return Math.ceil(bookLastDay(bookTitle) / 2);
}

export function sessionDayRange(session: number, bookTitle: string): string {
  const lastDay = bookLastDay(bookTitle);
  const start = (session - 1) * 2 + 1;
  const end = Math.min(start + 1, lastDay);
  return start === end ? `Day ${start}` : `Day ${start}&${end}`;
}

export function recordLessonLabel(record: Pick<ScoreRecord, "bookTitle" | "round" | "session">): string {
  if (record.session == null) return `${record.round}회독`;
  return `${record.round}회독 · ${record.session}회차 (${sessionDayRange(record.session, record.bookTitle)})`;
}

/** 시험지 파일/집계 공용 키 — (단어장·회독·회차) 하나를 식별 */
export function examPaperKey(bookTitle: string, round: number, session: number): string {
  return `${bookTitle}|${round}|${session}`;
}

