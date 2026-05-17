"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { assertOrgCanMutate } from "@/lib/org-write";

async function requireInventoryManager() {
  const ctx = await requireOrgSession();
  if (!can.manageInventory(ctx.user)) redirect("/inventory");
  assertOrgCanMutate({ access: ctx.org.access, userRole: ctx.user.role, userAccessMode: ctx.user.accessMode, kind: "GENERAL" });
  return ctx;
}

function cleanCode(value: FormDataEntryValue | null) {
  const code = String(value ?? "").trim().toUpperCase();
  return code || null;
}

export async function createStockLocationAction(formData: FormData): Promise<void> {
  const { orgId } = await requireInventoryManager();
  const name = String(formData.get("name") ?? "").trim();
  const code = cleanCode(formData.get("code"));
  const branchId = String(formData.get("branchId") ?? "").trim() || null;

  if (!name) redirect("/inventory/locations?error=Location+name+is+required");

  try {
    await prisma.stockLocation.create({
      data: { orgId, name, code, branchId, isActive: true },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Unique constraint") || message.includes("P2002")) {
      redirect("/inventory/locations?error=Location+code+already+exists");
    }
    redirect("/inventory/locations?error=Failed+to+create+location");
  }

  revalidatePath("/inventory/locations");
  redirect("/inventory/locations?created=1");
}

export async function updateStockLocationAction(formData: FormData): Promise<void> {
  const { orgId } = await requireInventoryManager();
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const code = cleanCode(formData.get("code"));
  const branchId = String(formData.get("branchId") ?? "").trim() || null;
  const isActive = formData.get("isActive") === "1";

  if (!id) redirect("/inventory/locations?error=Location+is+required");
  if (!name) redirect("/inventory/locations?error=Location+name+is+required");

  try {
    await prisma.stockLocation.updateMany({
      where: { id, orgId },
      data: { name, code, branchId, isActive },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Unique constraint") || message.includes("P2002")) {
      redirect("/inventory/locations?error=Location+code+already+exists");
    }
    redirect("/inventory/locations?error=Failed+to+update+location");
  }

  revalidatePath("/inventory/locations");
  redirect("/inventory/locations?saved=1");
}

export async function toggleStockLocationAction(formData: FormData) {
  const { orgId } = await requireInventoryManager();
  const id = String(formData.get("id") ?? "").trim();
  const isActive = formData.get("isActive") === "1";
  if (!id) return;

  await prisma.stockLocation.updateMany({ where: { id, orgId }, data: { isActive } });
  revalidatePath("/inventory/locations");
}
