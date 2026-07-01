// 시험지 PDF 묶음 생성 — 등록된 시험지들을 부수만큼 페이지 복제해 하나의 PDF로 병합.
// 브라우저(클라이언트)에서 실행. pdf-lib 사용.

import { PDFDocument } from "pdf-lib";

export interface BundleItem {
  /** 업로드된 PDF 경로 "/api/uploads/..." */
  path: string;
  /** 이 시험지를 몇 부 복제할지 */
  copies: number;
  /** 실패 안내용 라벨(선택) */
  label?: string;
}

export interface BundleResult {
  /** 병합된 PDF Blob (없으면 null) */
  blob: Blob | null;
  /** 총 페이지 수 */
  totalPages: number;
  /** 로드/병합에 실패한 항목 라벨들 */
  failed: string[];
}

/**
 * items를 순서대로, 각 항목을 copies 횟수만큼 복제해 한 PDF로 병합한다.
 * 개별 파일 로드 실패는 건너뛰고 failed에 기록한다.
 */
export async function buildBundle(items: BundleItem[]): Promise<BundleResult> {
  const master = await PDFDocument.create();
  const failed: string[] = [];

  for (const item of items) {
    const copies = Math.max(0, Math.floor(item.copies));
    if (copies === 0) continue;
    try {
      const res = await fetch(item.path, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = await res.arrayBuffer();
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pageIndices = src.getPageIndices();
      // 부수만큼 반복 복제 (매 반복마다 새로 copyPages 해야 독립 페이지가 됨)
      for (let n = 0; n < copies; n++) {
        const pages = await master.copyPages(src, pageIndices);
        pages.forEach((p) => master.addPage(p));
      }
    } catch {
      failed.push(item.label || item.path);
    }
  }

  const totalPages = master.getPageCount();
  if (totalPages === 0) {
    return { blob: null, totalPages: 0, failed };
  }
  const out = await master.save();
  // Uint8Array → Blob (뷰의 offset/length 정확히 반영해 복사)
  const buf = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  const blob = new Blob([buf], { type: "application/pdf" });
  return { blob, totalPages, failed };
}
