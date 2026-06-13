import * as XLSX from "@e965/xlsx";
import { readFileSync } from "fs";

const FILE = "C:\\Users\\LJ\\Downloads\\2026 M1 단어 시험 관리(봄+여름학기).xlsx";
const wb = XLSX.read(readFileSync(FILE), { type: "buffer" });

const MONTH_SHEETS = wb.SheetNames.filter((n) => /월 단어시험/.test(n));

function rowsOf(name) {
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: "" });
}

// "3/18(수)" → {month, day}
function parseDate(s) {
  const m = String(s).match(/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  return { month: Number(m[1]), day: Number(m[2]) };
}
function parseDayStart(s) {
  const m = String(s).match(/Day\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}
function bookLastDay(book) {
  if (/고난도/.test(book)) return 40;
  if (/필수/.test(book)) return 50;
  return 50;
}
function isoDate(month, day) {
  return `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// 헤더: ◆ M1TOP   교재: 능률VOCA중학 고난도   만점 60점   재시험 기준: 10개 이상 틀림 (51점 미만)
function parseClassHeader(s) {
  const m = String(s).match(/◆\s*(\S+)\s+교재:\s*(.+?)\s+만점\s*([\d.]+)점\s+재시험 기준:.*?\(([\d.]+)점\s*미만\)/);
  if (!m) return null;
  return { className: m[1], book: m[2].trim(), total: Number(m[3]), passMark: Number(m[4]) };
}

const roundCarry = {}; // className -> 현재 회독
const dayCarry = {}; // className -> 직전 유효 Day 시작 번호
const classMeta = {}; // className -> {book,total,passMark, variants:Set}
const studentsByClass = {}; // className -> Set(name)
let totalScoreCells = 0;
const roundDist = {};
const records = []; // {className, name, date, round, total, score}

for (const sheet of MONTH_SHEETS) {
  const rows = rowsOf(sheet);
  let i = 0;
  while (i < rows.length) {
    const first = (rows[i][0] ?? "").toString(); // 첫 셀(B열=index0)
    const hdr = parseClassHeader(first);
    if (!hdr) { i++; continue; }

    const { className, book, total, passMark } = hdr;
    classMeta[className] = classMeta[className] || { variants: new Set() };
    classMeta[className].variants.add(`${book} | 만점${total} | 컷${passMark}`);
    classMeta[className].book = book;
    classMeta[className].total = total;
    classMeta[className].passMark = passMark;
    studentsByClass[className] = studentsByClass[className] || new Set();

    // 다음 행: 이름 + 날짜들
    const nameRow = rows[i + 1] || [];
    const dayRow = rows[i + 2] || [];
    // 열 인덱스별 날짜/회독 파악 (B열=1 부터)
    const cols = []; // {c, date, round}
    let cur = roundCarry[className] || 1;
    let prevDay = dayCarry[className] ?? null;
    const maxDay = bookLastDay(book);
    for (let c = 1; c < nameRow.length; c++) {
      const d = parseDate(nameRow[c]);
      if (!d) continue; // 평균/재시험횟수 등
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
          if (rm) cur = Number(rm[1]);
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

    // 학생 행들
    let r = i + 3;
    for (; r < rows.length; r++) {
      const nm = (rows[r][0] ?? "").toString().trim();
      if (!nm) break;
      if (nm.startsWith("◆")) break;
      if (nm === "반 평균") break;
      studentsByClass[className].add(nm);
      for (const col of cols) {
        const raw = (rows[r][col.c] ?? "").toString().trim();
        if (raw === "") continue;
        const score = Number(raw);
        if (!Number.isFinite(score)) continue;
        totalScoreCells++;
        roundDist[col.round] = (roundDist[col.round] || 0) + 1;
        records.push({ className, name: nm, date: col.iso, round: col.round, session: col.session, total, score });
      }
    }
    i = r;
  }
}

console.log("=== 반/책/컷 (월별 일관성 점검) ===");
for (const [cn, m] of Object.entries(classMeta)) {
  console.log(`◆ ${cn}: 교재="${m.book}" 만점=${m.total} 통과컷=${m.passMark}점 이상  | 학생 ${studentsByClass[cn].size}명`);
  if (m.variants.size > 1) {
    console.log("   ⚠ 월별 변형:");
    [...m.variants].forEach((v) => console.log("     - " + v));
  }
}

console.log("\n=== 반별 학생 ===");
for (const [cn, set] of Object.entries(studentsByClass)) {
  console.log(`  ${cn} (${set.size}): ${[...set].join(", ")}`);
}

console.log("\n=== 회독 분포(점수 개수) ===", roundDist);
console.log("총 점수 셀:", totalScoreCells, " / 총 기록:", records.length);
console.log("반 수:", Object.keys(classMeta).length, " / 학생 총합:", Object.values(studentsByClass).reduce((a, s) => a + s.size, 0));

// 날짜 범위
const dates = [...new Set(records.map((r) => r.date))].sort();
console.log("날짜 수:", dates.length, " 범위:", dates[0], "~", dates[dates.length - 1]);

// 표본
console.log("\n=== 기록 표본(앞 8) ===");
records.slice(0, 8).forEach((r) => console.log(`  ${r.className} | ${r.name} | ${r.date} | ${r.round}회독 ${r.session ?? "-"}회차 | ${r.score}/${r.total}`));
