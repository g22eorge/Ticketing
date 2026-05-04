"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { sanitizeOptionalText, sanitizeText } from "@/lib/sanitize";
import { getCurrentUserRole } from "@/lib/session";

const editSchema = z.object({
  id: z.string().min(1),
  brand: z.string().min(1),
  model: z.string().min(1),
  serialOrImei: z.string().optional(),
  issueDescription: z.string().min(5),
  technicianNotes: z.string().optional(),
  returnTo: z.string().optional(),
});

export async function updateJobEditAction(formData: FormData) {
  const { session: currentSession, user: currentUser } = await getCurrentUserRole();
  if (currentUser.role === "TECHNICIAN_EXTERNAL" || currentUser.role === "FRONT_DESK") {
    return { error: "Forbidden" };
  }

  const parsed = editSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    brand: String(formData.get("brand") ?? ""),
    model: String(formData.get("model") ?? ""),
    serialOrImei: String(formData.get("serialOrImei") ?? ""),
    issueDescription: String(formData.get("issueDescription") ?? ""),
    technicianNotes: String(formData.get("technicianNotes") ?? ""),
    returnTo: String(formData.get("returnTo") ?? ""),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values" };
  }

  const existing = await prisma.job.findUnique({ where: { id: parsed.data.id } });
  if (!existing) {
    return { error: "Job not found" };
  }

  if (currentUser.role === "TECHNICIAN_INTERNAL" && existing.assignedToId !== currentSession.user.id) {
    return { error: "Forbidden" };
  }

  await prisma.job.update({
    where: { id: parsed.data.id },
    data: {
      brand: sanitizeText(parsed.data.brand),
      model: sanitizeText(parsed.data.model),
      serialOrImei: sanitizeOptionalText(parsed.data.serialOrImei),
      issueDescription: sanitizeText(parsed.data.issueDescription),
      technicianNotes: sanitizeOptionalText(parsed.data.technicianNotes),
    },
  });

  await prisma.auditLog.create({
    data: {
      jobId: parsed.data.id,
      userId: currentSession.user.id,
      action: "JOB_EDITED",
      detail: JSON.stringify({
        brand: parsed.data.brand,
        model: parsed.data.model,
        serialOrImei: parsed.data.serialOrImei,
      }),
    },
  });

  revalidatePath(`/jobs/${parsed.data.id}`);
  revalidatePath("/jobs");

  const safeReturnTo =
    parsed.data.returnTo &&
    parsed.data.returnTo.startsWith("/") &&
    !parsed.data.returnTo.startsWith("//")
      ? parsed.data.returnTo
      : `/jobs/${parsed.data.id}`;

  return { success: true, redirectTo: safeReturnTo };
}
