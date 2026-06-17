import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { genId, getDB, savePhoto } from "@/lib/db";
import { findSessionStaff, getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    // kind=file: 공지 첨부파일(임의 형식, 선생님 전용). 그 외(기본): 이미지.
    const kind = (form.get("kind") || "image").toString();
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "파일이 없습니다." }, { status: 400 });
    }
    const sess = getSession(req);
    const db = sess?.role === "teacher" ? await getDB() : null;
    const staff = db && sess ? findSessionStaff(db, sess) : null;
    if (!staff || staff.role === "viewer") {
      return NextResponse.json({ ok: false, error: "권한이 없습니다." }, { status: 403 });
    }

    if (kind === "file") {
      if (file.size > 20 * 1024 * 1024) {
        return NextResponse.json({ ok: false, error: "첨부파일은 20MB 이하여야 합니다." }, { status: 400 });
      }
      const ext = path.extname(file.name) || "";
      const name = `${genId("file")}${ext}`;
      const buf = Buffer.from(await file.arrayBuffer());
      await savePhoto(name, file.type || "application/octet-stream", buf);
      return NextResponse.json({ ok: true, path: `/api/uploads/${name}`, name: file.name || name });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: "사진은 10MB 이하여야 합니다." }, { status: 400 });
    }
    if (file.type && !ALLOWED.has(file.type)) {
      return NextResponse.json({ ok: false, error: "이미지 파일만 업로드할 수 있습니다." }, { status: 400 });
    }
    const ext = extFromType(file.type) || path.extname(file.name) || ".jpg";
    const name = `${genId("img")}${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    await savePhoto(name, file.type || "image/jpeg", buf);
    return NextResponse.json({ ok: true, path: `/api/uploads/${name}` });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

function extFromType(type: string): string | null {
  switch (type) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/heic":
      return ".heic";
    default:
      return null;
  }
}
