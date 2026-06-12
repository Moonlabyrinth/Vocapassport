import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getPhoto } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const safe = path.basename(name); // 경로 탈출 방지
  const photo = await getPhoto(safe);
  if (!photo) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(photo.buf), {
    headers: {
      "Content-Type": photo.mime || "application/octet-stream",
      "Cache-Control": "private, max-age=31536000",
    },
  });
}
