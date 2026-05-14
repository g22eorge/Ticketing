import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { sanitizeText } from "@/lib/sanitize";
import { getUploadsRoot } from "@/lib/storage";
import { requireOrgSession } from "@/lib/org-context";

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(req: NextRequest) {
  const { session, user, orgId } = await requireOrgSession();

  // Per-user upload rate limit (30 uploads / 10 min).
  const rl = rateLimit.upload(user.id);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many uploads. Please wait a moment." },
      { status: 429, headers: rateLimitHeaders(rl.retryAfterMs) },
    );
  }

  const formData = await req.formData();
  const jobId = String(formData.get("jobId") ?? "");
  const label = sanitizeText(String(formData.get("label") ?? "other"));
  const files = formData.getAll("files") as File[];

  if (!jobId || files.length === 0) {
    return NextResponse.json({ error: "Invalid upload payload" }, { status: 400 });
  }

  const job = await prisma.job.findFirst({
    where: { id: jobId, orgId },
    select: { id: true, assignedToId: true },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const roleAllowed = [
    "ADMIN",
    "OPS",
    "TECHNICIAN_INTERNAL",
    "TECHNICIAN_EXTERNAL",
  ].includes(user.role);
  if (!roleAllowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (
    (user.role === "TECHNICIAN_INTERNAL" || user.role === "TECHNICIAN_EXTERNAL") &&
    job.assignedToId !== session.user.id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const uploadDir = path.join(getUploadsRoot(), "jobs", jobId);
  await mkdir(uploadDir, { recursive: true });

  const created = [];
  for (const file of files) {
    if (!ALLOWED_TYPES.has(file.type) || file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Only jpeg/png/webp up to 5MB are allowed" }, { status: 400 });
    }

    const ext = MIME_TO_EXT[file.type];
    if (!ext) {
      return NextResponse.json({ error: "Only jpeg/png/webp up to 5MB are allowed" }, { status: 400 });
    }
    const fileName = `${Date.now()}-${randomUUID()}.${ext}`;
    const absPath = path.join(uploadDir, fileName);
    const arrayBuffer = await file.arrayBuffer();
    await writeFile(absPath, Buffer.from(arrayBuffer));

    const url = `/api/uploads/jobs/${jobId}/${fileName}`;
    const photo = await prisma.photo.create({
      data: {
        jobId,
        url,
        label,
      },
    });
    created.push(photo);
  }

  return NextResponse.json(created);
}

export async function DELETE(req: NextRequest) {
  const { user, orgId } = await requireOrgSession();
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const photo = await prisma.photo.findUnique({ where: { id } });
  if (!photo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Tenant isolation: ensure the photo belongs to a job in this org.
  const job = await prisma.job.findFirst({ where: { id: photo.jobId, orgId }, select: { id: true } });
  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const relative = photo.url.replace("/api/uploads/", "");
  const absPath = path.join(getUploadsRoot(), relative);
  await prisma.photo.delete({ where: { id } });

  try {
    await unlink(absPath);
  } catch {
    // ignore missing file
  }

  return NextResponse.json({ success: true });
}
