import { readFile } from "fs/promises";
import path from "path";

import { NextRequest, NextResponse } from "next/server";

import { requireOrgSession } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";
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
  const { session, user, orgId } = await requireOrgSession();
  const { segments } = await context.params;

  if (!segments || segments.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Only allow serving job photos stored under `uploads/jobs/<jobId>/<file>`.
  if (segments[0] !== "jobs" || segments.length !== 3) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const jobId = segments[1];
  const fileName = segments[2];

  const job = await prisma.job.findFirst({
    where: { id: jobId, orgId },
    select: { id: true, assignedToId: true },
  });
  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (
    (user.role === "TECHNICIAN_INTERNAL" || user.role === "TECHNICIAN_EXTERNAL") &&
    job.assignedToId !== session.user.id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Basic traversal hardening.
  const safeFileName = String(fileName).replace(/\.\./g, "").replaceAll("/", "");
  const baseDir = path.join(getUploadsRoot(), "jobs", jobId);
  const filePath = path.join(baseDir, safeFileName);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(baseDir) + path.sep)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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
