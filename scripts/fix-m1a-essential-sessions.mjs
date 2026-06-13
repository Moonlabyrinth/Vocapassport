import * as XLSX from "@e965/xlsx";
import { neon } from "@neondatabase/serverless";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import os from "os";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "db.json");
const BACKUP_DIR = path.join(process.cwd(), "data");
const APPLY = process.argv.includes("--apply");
const WORKBOOK_ARG = process.argv.find((arg) => arg.startsWith("--workbook="));
const WORKBOOK_PATH = WORKBOOK_ARG?.slice("--workbook=".length) || findWorkbook();

const REQUIRED = "\uD544\uC218";
const ADVANCED = "\uACE0\uB09C\uB3C4";
const TEXTBOOK = "\uAD50\uC7AC";
const PERFECT_SCORE = "\uB9CC\uC810";
const ROUND = "\uD68C\uB3C5";

function findWorkbook() {
  const downloads = path.join(os.homedir(), "Downloads");
  if (!existsSync(downloads)) return null;
  const candidates = readdirSync(downloads)
    .filter((name) => /^2026 M1.*\.xlsx$/i.test(name))
    .map((name) => path.join(downloads, name))
    .sort();
  return candidates.at(-1) || null;
}

function parseDate(value) {
  const match = String(value).match(/(\d{1,2})\/(\d{1,2})/);
  return match ? { month: Number(match[1]), day: Number(match[2]) } : null;
}

function parseDayStart(value) {
  const match = String(value).match(/Day\s*(\d+)/i);
  return match ? Number(match[1]) : null;
}

function parseRound(value) {
  const match = String(value).match(new RegExp(`(\\d+)\\s*${ROUND}`));
  return match ? Number(match[1]) : null;
}

function isoDate(month, day) {
  return `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function bookKind(bookTitle) {
  const text = String(bookTitle);
  if (text.includes(ADVANCED)) return "advanced";
  if (text.includes(REQUIRED)) return "required";
  return "unknown";
}

function bookLastDay(bookTitle) {
  return bookKind(bookTitle) === "advanced" ? 40 : 50;
}

function parseClassHeader(value) {
  const text = String(value);
  if (!text.includes(TEXTBOOK) || !text.includes(PERFECT_SCORE)) return null;
  const pattern = new RegExp(`(M1\\S*)\\s+${TEXTBOOK}:\\s*(.+?)\\s+${PERFECT_SCORE}\\s*([\\d.]+)`);
  const match = text.match(pattern);
  if (!match) return null;
  return {
    className: match[1],
    book: match[2].trim(),
    total: Number(match[3]),
  };
}

function buildM1SEssentialSchedule() {
  if (!WORKBOOK_PATH || !existsSync(WORKBOOK_PATH)) {
    throw new Error("M1 workbook was not found. Pass --workbook=C:\\path\\to\\file.xlsx");
  }

  const workbook = XLSX.read(readFileSync(WORKBOOK_PATH), { type: "buffer" });
  const roundCarry = new Map();
  const dayCarry = new Map();
  const schedule = new Map();

  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
      defval: "",
    });

    let rowIndex = 0;
    while (rowIndex < rows.length) {
      const header = parseClassHeader(rows[rowIndex]?.[0] ?? "");
      if (!header) {
        rowIndex++;
        continue;
      }

      const nameRow = rows[rowIndex + 1] || [];
      const dayRow = rows[rowIndex + 2] || [];
      const carryKey = `${header.className}|${bookKind(header.book)}`;
      let currentRound = roundCarry.get(carryKey) || 1;
      let previousDay = dayCarry.has(carryKey) ? dayCarry.get(carryKey) : null;
      const maxDay = bookLastDay(header.book);

      for (let column = 1; column < nameRow.length; column++) {
        const date = parseDate(nameRow[column]);
        if (!date) continue;

        const dayCell = String(dayRow[column] ?? "");
        const explicitRound = parseRound(dayCell);
        const parsedDay = parseDayStart(dayCell);
        let effectiveDay = parsedDay;

        if (parsedDay != null) {
          if (previousDay != null && parsedDay <= previousDay) {
            const expectedNext = previousDay + 2;
            if (expectedNext <= maxDay) {
              effectiveDay = expectedNext;
            } else {
              currentRound = explicitRound || currentRound + 1;
            }
          } else if (explicitRound) {
            currentRound = explicitRound;
          }
          previousDay = effectiveDay;
        }

        if (header.className === "M1S" && bookKind(header.book) === "required" && effectiveDay != null) {
          schedule.set(isoDate(date.month, date.day), {
            round: currentRound,
            session: Math.ceil(effectiveDay / 2),
            dayStart: effectiveDay,
          });
        }
      }

      roundCarry.set(carryKey, currentRound);
      dayCarry.set(carryKey, previousDay);

      rowIndex += 3;
      while (rowIndex < rows.length) {
        const name = String(rows[rowIndex]?.[0] ?? "").trim();
        if (!name || name.includes("평균") || name.includes("\uD3C9\uADE0")) break;
        rowIndex++;
      }
    }
  }

  if (schedule.size === 0) {
    throw new Error("Could not read the M1S required-vocabulary schedule from the workbook.");
  }

  return schedule;
}

function backupPath(prefix) {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(BACKUP_DIR, `${prefix}-${stamp}.json`);
}

function patchDatabase(db, schedule) {
  const classById = new Map((db.classes || []).map((classRoom) => [classRoom.id, classRoom]));
  const samples = [];
  let scanned = 0;
  let changed = 0;
  let missingSchedule = 0;

  for (const record of db.records || []) {
    const className = classById.get(record.classId)?.name;
    if (className !== "M1A") continue;
    if (bookKind(record.bookTitle) !== "required") continue;
    if (record.attemptType !== "first") continue;

    scanned++;
    const target = schedule.get(record.examDate);
    if (!target) {
      missingSchedule++;
      continue;
    }

    if (record.round === target.round && record.session === target.session) continue;

    if (samples.length < 15) {
      samples.push({
        date: record.examDate,
        from: `${record.round}r/${record.session}s`,
        to: `${target.round}r/${target.session}s`,
        dayStart: target.dayStart,
      });
    }

    record.round = target.round;
    record.session = target.session;
    changed++;
  }

  return { scanned, changed, missingSchedule, samples };
}

async function readDatabase() {
  if (!process.env.DATABASE_URL) {
    return { mode: "file", db: JSON.parse(readFileSync(DB_PATH, "utf8")) };
  }

  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`SELECT data, version FROM app_state WHERE id = 1`;
  if (!rows[0]) throw new Error("No app_state row was found in Neon.");
  return { mode: "neon", db: rows[0].data, version: Number(rows[0].version || 0), sql };
}

async function writeDatabase(state) {
  if (state.mode === "file") {
    const backup = backupPath("db-backup-before-m1a-essential-session-fix");
    copyFileSync(DB_PATH, backup);
    writeFileSync(DB_PATH, JSON.stringify(state.db, null, 2), "utf8");
    return backup;
  }

  const backup = backupPath("neon-backup-before-m1a-essential-session-fix");
  writeFileSync(backup, JSON.stringify(state.db, null, 2), "utf8");
  const updated = await state.sql`
    UPDATE app_state
    SET data = ${JSON.stringify(state.db)}::jsonb, version = version + 1
    WHERE id = 1 AND version = ${state.version}
    RETURNING version
  `;
  if (updated.length === 0) throw new Error("Neon data changed while patching. Run the script again.");
  return backup;
}

const schedule = buildM1SEssentialSchedule();
const state = await readDatabase();
const result = patchDatabase(state.db, schedule);

console.log(JSON.stringify({
  apply: APPLY,
  mode: state.mode,
  workbook: WORKBOOK_PATH,
  scheduleDates: schedule.size,
  ...result,
}, null, 2));

if (APPLY && result.changed > 0) {
  const backup = await writeDatabase(state);
  console.log(`updated ${state.mode} database`);
  console.log(`backup ${backup}`);
} else if (!APPLY) {
  console.log("dry run only. Re-run with --apply to write changes.");
} else {
  console.log("no database changes needed.");
}
