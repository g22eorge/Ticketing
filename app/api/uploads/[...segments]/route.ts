import { readFile } from "fs/promises";
import path from "path";

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUserRole } from "@/lib/session";
import { getUploadsRoot } from "@/lib/storage";

const contentTypeByExt: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ segments: string[] }> },
) {
  await getCurrentUserRole();
  const { segments } = await context.params;

  if (!segments || segments.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const safeSegments = segments.map((segment) => segment.replace(/\.\./g, ""));
  const filePath = path.join(getUploadsRoot(), ...safeSegments);

  try {
    const file = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    return new NextResponse(file, {
      headers: {
        "content-type": contentTypeByExt[ext] ?? "application/octet-stream",
        "cache-control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
