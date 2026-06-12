import * as XLSX from "xlsx";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const FILE = "C:\\Users\\LJ\\Downloads\\2026 M1 단어 시험 관리(봄+여름학기).xlsx";
const DB_PATH = path.join(process.cwd(), "data", "db.json");
const BACKUP_PATH = path.join(process.cwd(), "data", "db.backup-before-day-session-fix.json");

function parseDate(s) {
  const m = String(s).match(/(\d{1,2})\/(\d{1,2})/);
  return m ? { month: +m[1], day: +m[2] } : null;
}

function parseDayStart(s) {
  const m = String(s).match(/Day\s*(\d+)/i);
  return m ? +m[1] : null;
}

function bookLastDay(book) {
  if (/고난도/.test(book)) return 40;
  if (/필수/.test(book)) return 50;
  return 50;
}

const isoDate = (mo, d) => `2026-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const norm = (n) => Math.round(n * 10) / 10;

function parseClassHeader(s) {
  const m = String(s).match(/◆\s*(\S+)\s+교재:\s*(.+?)\s+만점\s*([\d.]+)점\s+재시험 기준:.*?\(([\d.]+)점\s*미만\)/);
  return m ? { className: m[1], book: m[2].trim(), total: +m[3], passMark: +m[4] } : null;
}

function workbookRecords() {
  const wb = XLSX.read(readFileSync(FILE), { type: "buffer" });
  const monthSheets = wb.SheetNames.filter((n) => /월 단어시험/.test(n));
  const roundCarry = {};
  const dayCarry = {};
  const out = [];

  for (const sheet of monthSheets) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, raw: false, defval: "" });
    let i = 0;
    while (i < rows.length) {
      const hdr = parseClassHeader((rows[i][0] ?? "").toString());
      if (!hdr) {
        i++;
        continue;
      }
      const { className, book, total } = hdr;
      const nameRow = rows[i + 1] || [];
      const dayRow = rows[i + 2] || [];
      const cols = [];
      let cur = roundCarry[className] || 1;
      let prevDay = dayCarry[className] ?? null;
      const maxDay = bookLastDay(book);

      for (let c = 1; c < nameRow.length; c++) {
        const d = parseDate(nameRow[c]);
        if (!d) continue;
        const dayCell = (dayRow[c] ?? "").toString();
        const parsedDay = parseDayStart(dayCell);
        let effectiveDay = parsedDay;

        if (parsedDay != null) {
          if (prevDay != null && parsedDay <= prevDay) {
            const expectedNext = prevDay + 2;
            if (expectedNext <= maxDay) {
              effectiveDay = expectedNext;
            } else {
              cur += 1;
            }
          } else if (prevDay == null) {
            const rm = dayCell.match(/(\d+)\s*회독/);
            if (rm) cur = +rm[1];
          }
          prevDay = effectiveDay;
        }

        cols.push({
          c,
          iso: isoDate(d.month, d.day),
          round: cur,
          session: effectiveDay == null ? null : Math.ceil(effectiveDay / 2),
          dayStart: effectiveDay,
        });
      }
      roundCarry[className] = cur;
      dayCarry[className] = prevDay;

      let r = i + 3;
      for (; r < rows.length; r++) {
        const name = (rows[r][0] ?? "").toString().trim();
        if (!name || name.startsWith("◆") || name === "반 평균") break;
        for (const col of cols) {
          const raw = (rows[r][col.c] ?? "").toString().trim();
          if (raw === "") continue;
          const score = Number(raw);
          if (!Number.isFinite(score)) continue;
          out.push({
            className,
            name,
            book,
            total: norm(total),
            score: norm(score),
            date: col.iso,
            round: col.round,
            session: col.session,
            dayStart: col.dayStart,
          });
        }
      }
      i = r;
    }
  }

  return out;
}

const dryRun = process.argv.includes("--dry-run");
const parsed = workbookRecords();
const index = new Map();
for (const r of parsed) {
  const key = `${r.name}|${r.date}|${r.book}|${r.total}|${r.score}`;
  if (!index.has(key)) index.set(key, []);
  index.get(key).push(r);
}

const db = JSON.parse(readFileSync(DB_PATH, "utf8"));
let matched = 0;
let changedRound = 0;
let changedSession = 0;
let unmatched = 0;
let ambiguous = 0;
const samples = [];

for (const rec of db.records) {
  if (rec.attemptType !== "first") continue;
  const student = db.students.find((s) => s.id === rec.studentId);
  const key = `${student?.name}|${rec.examDate}|${rec.bookTitle}|${norm(rec.totalScore)}|${norm(rec.actualScore)}`;
  const candidates = index.get(key) || [];

  if (candidates.length !== 1) {
    if (candidates.length > 1) ambiguous++;
    else unmatched++;
    continue;
  }

  const src = candidates[0];
  matched++;
  const before = { round: rec.round, session: rec.session };
  if (rec.round !== src.round) changedRound++;
  if (rec.session !== src.session) changedSession++;
  if ((rec.round !== src.round || rec.session !== src.session) && samples.length < 12) {
    samples.push({
      student: student?.name,
      date: rec.examDate,
      book: rec.bookTitle,
      from: before,
      to: { round: src.round, session: src.session, dayStart: src.dayStart },
    });
  }

  if (!dryRun) {
    rec.round = src.round;
    rec.session = src.session;
  }
}

const result = { dryRun, matched, unmatched, ambiguous, changedRound, changedSession, samples };
console.log(JSON.stringify(result, null, 2));

if (!dryRun) {
  if (!existsSync(BACKUP_PATH)) copyFileSync(DB_PATH, BACKUP_PATH);
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
  console.log(`updated ${DB_PATH}`);
  console.log(`backup ${BACKUP_PATH}`);
}

