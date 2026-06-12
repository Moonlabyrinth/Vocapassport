// 엑셀 → data/db.json 직접 생성 (반/책/절대컷/학생계정/점수/회독)
import * as XLSX from "xlsx";
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "fs";
import crypto from "crypto";
import path from "path";

const FILE = "C:\\Users\\LJ\\Downloads\\2026 M1 단어 시험 관리(봄+여름학기).xlsx";
const DB_PATH = path.join(process.cwd(), "data", "db.json");

const wb = XLSX.read(readFileSync(FILE), { type: "buffer" });
const MONTH_SHEETS = wb.SheetNames.filter((n) => /월 단어시험/.test(n));
const rowsOf = (name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: "" });

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
function parseClassHeader(s) {
  const m = String(s).match(/◆\s*(\S+)\s+교재:\s*(.+?)\s+만점\s*([\d.]+)점\s+재시험 기준:.*?\(([\d.]+)점\s*미만\)/);
  return m ? { className: m[1], book: m[2].trim(), total: +m[3], passMark: +m[4] } : null;
}

// ---- 파싱 ----
const roundCarry = {};
const dayCarry = {};
const classMeta = {}; // className -> {book,total,passMark}
const studentsByClass = {}; // className -> [names in order]
const parsedRecords = []; // {className, name, iso, round, session, total, score, passMark}

for (const sheet of MONTH_SHEETS) {
  const rows = rowsOf(sheet);
  let i = 0;
  while (i < rows.length) {
    const hdr = parseClassHeader((rows[i][0] ?? "").toString());
    if (!hdr) { i++; continue; }
    const { className, book, total, passMark } = hdr;
    classMeta[className] = { book, total, passMark };
    studentsByClass[className] = studentsByClass[className] || [];

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
      });
    }
    roundCarry[className] = cur;
    dayCarry[className] = prevDay;

    let r = i + 3;
    for (; r < rows.length; r++) {
      const nm = (rows[r][0] ?? "").toString().trim();
      if (!nm || nm.startsWith("◆") || nm === "반 평균") break;
      if (!studentsByClass[className].includes(nm)) studentsByClass[className].push(nm);
      for (const col of cols) {
        const raw = (rows[r][col.c] ?? "").toString().trim();
        if (raw === "") continue;
        const score = Number(raw);
        if (!Number.isFinite(score)) continue;
        parsedRecords.push({ className, name: nm, iso: col.iso, round: col.round, session: col.session, total, score, passMark });
      }
    }
    i = r;
  }
}

// ---- DB 빌드 ----
let seq = 0;
const gid = (p) => `${p}_imp${(seq++).toString(36)}`;
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}
const norm = (n) => Math.round(n * 10) / 10;
const nowBase = Date.parse("2026-06-01T00:00:00Z");

const db = { classes: [], students: [], books: [], records: [], retests: [], settings: {} };
const classIdByName = {};
const bookIdByClass = {};
const studentIdByKey = {}; // `${className}|${name}` -> id
const usedLoginIds = new Set();

for (const [cn, meta] of Object.entries(classMeta)) {
  const cid = gid("c");
  classIdByName[cn] = cid;
  const pctFallback = Math.round((meta.passMark / meta.total) * 100);
  db.classes.push({
    id: cid, name: cn, scheduleType: "월수금", passThreshold: pctFallback,
    createdAt: new Date(nowBase).toISOString(),
  });
  const bid = gid("b");
  bookIdByClass[cn] = bid;
  db.books.push({
    id: bid, classId: cid, title: meta.book, defaultTotalScore: meta.total,
    passThreshold: null, passMark: meta.passMark, createdAt: new Date(nowBase).toISOString(),
  });
  for (const name of studentsByClass[cn]) {
    const sid = gid("s");
    studentIdByKey[`${cn}|${name}`] = sid;
    let loginId = name;
    let k = 2;
    while (usedLoginIds.has(loginId)) loginId = `${name}${k++}`;
    usedLoginIds.add(loginId);
    const { hash, salt } = hashPassword("0000");
    db.students.push({
      id: sid, classId: cid, name, createdAt: new Date(nowBase).toISOString(),
      loginId, passwordHash: hash, passwordSalt: salt, mustChangePassword: true,
    });
  }
}

let rseq = 0;
for (const pr of parsedRecords) {
  const cid = classIdByName[pr.className];
  const sid = studentIdByKey[`${pr.className}|${pr.name}`];
  const bid = bookIdByClass[pr.className];
  const actual = norm(pr.score);
  const totalScore = norm(pr.total);
  const passed = actual + 1e-9 >= pr.passMark;
  const createdAt = new Date(nowBase + rseq++ * 1000).toISOString();
  db.records.push({
    id: gid("r"), classId: cid, studentId: sid, bookId: bid,
    bookTitle: classMeta[pr.className].book,
    round: Math.min(3, Math.max(1, pr.round)), session: pr.session ?? null,
    totalScore, actualScore: actual, examDate: pr.iso,
    attemptType: "first", parentRecordId: null, retestNo: 0,
    photoPath: null, status: "approved",
    thresholdUsed: 0, passMarkUsed: pr.passMark,
    passed, isPerfect: actual >= totalScore,
    createdAt, approvedAt: createdAt,
  });
}

// ---- 백업 후 저장 ----
if (existsSync(DB_PATH)) {
  copyFileSync(DB_PATH, DB_PATH + ".backup");
  console.log("기존 db.json → db.json.backup 백업");
}
writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");

console.log("\n=== 임포트 완료 ===");
console.log("반:", db.classes.length, "책:", db.books.length, "학생:", db.students.length, "점수기록:", db.records.length);
const passN = db.records.filter((r) => r.passed).length;
console.log("통과:", passN, " 미통과:", db.records.length - passN);
console.log("\n반별 학생/계정:");
for (const c of db.classes) {
  const studs = db.students.filter((s) => s.classId === c.id);
  console.log(`  ${c.name} (컷 ${db.books.find((b) => b.classId === c.id).passMark}점): ${studs.map((s) => s.loginId).join(", ")}`);
}
