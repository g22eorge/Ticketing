"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUserRole } from "@/lib/session";
import { OrgPlan } from "@prisma/client";

async function requirePlatformAdmin() {
  const { user } = await getCurrentUserRole();
  const platformEmail = process.env.PLATFORM_ADMIN_EMAIL;
  if (!platformEmail || user!.email !== platformEmail) redirect("/dashboard");
  return user!;
}

export async function setPlanAction(formData: FormData) {
  await requirePlatformAdmin();
  const orgId = formData.get("orgId") as string;
  const plan = formData.get("plan") as OrgPlan;
  if (!orgId || !["STARTER", "GROWTH", "ENTERPRISE"].includes(plan)) return;
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
