import * as XLSX from "@e965/xlsx";
import { readFileSync } from "fs";

const FILE = "C:\\Users\\LJ\\Downloads\\2026 M1 단어 시험 관리(봄+여름학기).xlsx";
const wb = XLSX.read(readFileSync(FILE), { type: "buffer" });

console.log("=== 시트 목록 ===");
wb.SheetNames.forEach((n, i) => {
  const ws = wb.Sheets[n];
  const ref = ws["!ref"] || "(빈 시트)";
  console.log(`  [${i}] "${n}"  범위=${ref}`);
});

// 인자로 시트 인덱스 받으면 그 시트만, 없으면 첫 2개 시트 미리보기
const onlyIdx = process.argv[2] ? Number(process.argv[2]) : null;
const maxRows = process.argv[3] ? Number(process.argv[3]) : 25;

const targets = onlyIdx != null ? [onlyIdx] : wb.SheetNames.map((_, i) => i).slice(0, 2);

for (const idx of targets) {
  const name = wb.SheetNames[idx];
  const ws = wb.Sheets[name];
  console.log(`\n=== 시트 [${idx}] "${name}" (상위 ${maxRows}행) ===`);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
  rows.slice(0, maxRows).forEach((r, i) => {
    // 각 행을 | 로 구분, 빈 끝 셀 제거
    const cells = r.map((c) => (c === "" ? "" : String(c)));
    while (cells.length && cells[cells.length - 1] === "") cells.pop();
    console.log(`R${String(i + 1).padStart(3)}: ${cells.join(" | ")}`);
  });
  console.log(`  ... 총 ${rows.length}행`);
}
