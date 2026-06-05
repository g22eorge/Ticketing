import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { sanitizeText } from "@/lib/sanitize";
import { getUploadsRoot } from "@/lib/storage";
import { requireOrgSession } from "@/lib/org-context";
import { assertOrgCanMutate } from "@/lib/org-write";

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const ALLOWED_LABELS = new Set(["before", "during", "after", "other"]);

export async function POST(req: NextRequest) {
  const { session, user, orgId, org } = await requireOrgSession();
  try {
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workspace is read-only.";
    return NextResponse.json({ error: message }, { status: 403 });
  }

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
  const rawLabel = sanitizeText(String(formData.get("label") ?? "other")).toLowerCase();
  const label = ALLOWED_LABELS.has(rawLabel) ? rawLabel : "other";
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
    const arrayBuffer = await file.arrayBuffer();
    if (!hasValidImageSignature(file.type, new Uint8Array(arrayBuffer))) {
      return NextResponse.json({ error: "Invalid image file" }, { status: 400 });
    }
    const fileName = `${Date.now()}-${randomUUID()}.${ext}`;
    const absPath = path.join(uploadDir, fileName);
    await writeFile(absPath, Buffer.from(arrayBuffer));

    const url = `/api/uploads/jobs/${jobId}/${fileName}`;
    const photo = await prisma.photo.create({
      data: {
        jobId,
        url,
        label,
      },
    });
    await prisma.auditLog.create({
      data: {
        orgId,
        jobId,
        userId: session.user.id,
        action: "PHOTO_UPLOADED",
        detail: JSON.stringify({ photoId: photo.id, label }),
      },
    }).catch((err) => console.error("[upload] audit log (PHOTO_UPLOADED) failed:", err));
    created.push(photo);
  }

  return NextResponse.json(created);
}

export async function DELETE(req: NextRequest) {
  const { session, user, orgId, org } = await requireOrgSession();
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workspace is read-only.";
    return NextResponse.json({ error: message }, { status: 403 });
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

  const relative = photo.url.startsWith("/api/uploads/") ? photo.url.slice("/api/uploads/".length) : "";
  const uploadsRoot = getUploadsRoot();
  const absPath = path.resolve(uploadsRoot, relative);
  const safeToUnlink = absPath.startsWith(path.resolve(uploadsRoot) + path.sep);
  await prisma.photo.deleteMany({ where: { id, job: { orgId } } });
  await prisma.auditLog.create({
    data: {
      orgId,
      jobId: photo.jobId,
      userId: session.user.id,
      action: "PHOTO_DELETED",
      detail: JSON.stringify({ photoId: id }),
    },
  }).catch((err) => console.error("[upload] audit log (PHOTO_DELETED) failed:", err));

  if (safeToUnlink) {
    try {
      await unlink(absPath);
    } catch {
      // ignore missing file
    }
  }

  return NextResponse.json({ success: true });
}

function hasValidImageSignature(contentType: string, bytes: Uint8Array) {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  if (contentType === "image/webp") {
    return bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  }
  return false;
}
