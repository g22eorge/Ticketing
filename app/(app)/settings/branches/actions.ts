"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { assertOrgCanMutate } from "@/lib/org-write";

async function requireAdmin() {
  const ctx = await requireOrgSession();
  if (!can.manageUsers(ctx.user)) redirect("/inventory");
  assertOrgCanMutate({ access: ctx.org.access, userRole: ctx.user.role, userAccessMode: ctx.user.accessMode, kind: "GENERAL" });
  return ctx;
}

export async function createBranchAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const { orgId } = await requireAdmin();

  const name = (formData.get("name") as string).trim();
  if (!name) return { error: "Branch name is required" };

  const isDefault = formData.get("isDefault") === "1";

  await prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.branch.updateMany({ where: { orgId }, data: { isDefault: false } });
    }
    await tx.branch.create({
      data: {
        orgId,
        name,
        address: (formData.get("address") as string).trim() || null,
        phone: (formData.get("phone") as string).trim() || null,
        isDefault,
      },
    });
  });

  revalidatePath("/settings/branches");
  return {};
}

export async function updateBranchAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const { orgId } = await requireAdmin();

  const id = formData.get("id") as string;
  const branch = await prisma.branch.findUnique({ where: { id }, select: { orgId: true } });
  if (!branch || branch.orgId !== orgId) return { error: "Not found" };

  const name = (formData.get("name") as string).trim();
  if (!name) return { error: "Branch name is required" };

  const isDefault = formData.get("isDefault") === "1";
  const isActive = formData.get("isActive") === "1";

  await prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.branch.updateMany({ where: { orgId, NOT: { id } }, data: { isDefault: false } });
    }
    await tx.branch.update({
      where: { id },
      data: {
        name,
        address: (formData.get("address") as string).trim() || null,
        phone: (formData.get("phone") as string).trim() || null,
        isDefault,
        isActive,
      },
    });
  });

  revalidatePath("/settings/branches");
  return {};
}
