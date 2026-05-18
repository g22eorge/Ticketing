"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { OrgPlan } from "@prisma/client";
import { setOrgAtSenderId } from "@/lib/org-whatsapp-config";
import { requirePlatformAdmin } from "@/lib/platform-admin";

export async function setPlanAction(formData: FormData) {
  await requirePlatformAdmin();
  const orgId = formData.get("orgId") as string;
  const plan = formData.get("plan") as OrgPlan;
  if (!orgId || !["STARTER", "STANDARD", "GROWTH", "PREMIUM", "ENTERPRISE"].includes(plan)) return;
  await prisma.organization.update({
    where: { id: orgId },
    data: { plan, billingStatus: plan === "STARTER" ? "TRIALING" : "ACTIVE" },
  });
  revalidatePath("/platform");
}

export async function toggleOrgActive(formData: FormData) {
  await requirePlatformAdmin();
  const orgId = formData.get("orgId") as string;
  const isActive = formData.get("isActive") === "true";
  if (!orgId) return;
  await prisma.organization.update({ where: { id: orgId }, data: { isActive: !isActive } });
  revalidatePath("/platform");
}

export async function extendTrialAction(formData: FormData) {
  await requirePlatformAdmin();
  const orgId = formData.get("orgId") as string;
  const days = parseInt(formData.get("days") as string, 10);
  if (!orgId || isNaN(days) || days <= 0) return;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { trialEndsAt: true, billingStatus: true },
  });
  if (!org) return;

  const base = org.trialEndsAt && org.trialEndsAt > new Date() ? org.trialEndsAt : new Date();
  const newDate = new Date(base);
  newDate.setDate(newDate.getDate() + days);

  await prisma.organization.update({
    where: { id: orgId },
    data: { trialEndsAt: newDate, billingStatus: "TRIALING" },
  });
  revalidatePath("/platform");
}

export async function runCommercialSeedAction() {
  await requirePlatformAdmin();
  try {
    const { seedCommercialData } = await import("@/prisma/seed-commercial");
    await seedCommercialData();
  } catch (err) {
    console.error("[seed:commercial]", err);
  }
  revalidatePath("/platform");
}

export async function setOrgSmsSenderAction(formData: FormData) {
  await requirePlatformAdmin();
  const orgId = formData.get("orgId") as string;
  const raw = (formData.get("senderId") as string | null)?.trim() ?? "";
  if (!orgId) return;
  // AT sender IDs: alphanumeric only, 1–11 chars (or empty to clear)
  const senderId = raw === "" ? null : raw;
  if (senderId && (senderId.length > 11 || !/^[A-Za-z0-9]+$/.test(senderId))) return;
  await setOrgAtSenderId(orgId, senderId);
  revalidatePath(`/platform/orgs/${orgId}`);
}

export async function setOrgAiModelAction(formData: FormData) {
  await requirePlatformAdmin();
  const orgId = formData.get("orgId") as string;
  const model = ((formData.get("aiModel") as string | null) ?? "").trim() || null;
  if (!orgId) return;
  await prisma.organization.update({ where: { id: orgId }, data: { aiModel: model } });
  revalidatePath(`/platform/orgs/${orgId}`);
}

export async function setBillingStatusAction(formData: FormData) {
  await requirePlatformAdmin();
  const orgId = formData.get("orgId") as string;
  const status = formData.get("status") as string;
  if (!orgId || !["TRIALING", "ACTIVE", "PAST_DUE", "CANCELLED"].includes(status)) return;
  await prisma.organization.update({
    where: { id: orgId },
    data: { billingStatus: status as never },
  });
  revalidatePath("/platform");
  revalidatePath(`/platform/orgs/${orgId}`);
}
