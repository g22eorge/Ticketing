"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { assertOrgCanMutate } from "@/lib/org-write";

async function requireAdmin() {
  const ctx = await requireOrgSession();
  if (!can.manageUsers(ctx.user)) redirect("/inventory");
  assertOrgCanMutate({ access: ctx.org.access, userRole: ctx.user.role, kind: "GENERAL" });
  return ctx;
}

export async function createSupplierAction(formData: FormData): Promise<{ id?: string; error?: string }> {
  const { orgId } = await requireAdmin();
  const name = (formData.get("name") as string).trim();
  if (!name) return { error: "Supplier name is required" };
  try {
    const supplier = await prisma.supplier.create({
      data: {
        orgId,
        name,
        contactName: (formData.get("contactName") as string).trim() || null,
        email: (formData.get("email") as string).trim() || null,
        phone: (formData.get("phone") as string).trim() || null,
        address: (formData.get("address") as string).trim() || null,
        notes: (formData.get("notes") as string).trim() || null,
      },
    });
    return { id: supplier.id };
  } catch {
    return { error: "Failed to create supplier" };
  }
}

export async function updateSupplierAction(formData: FormData): Promise<{ error?: string }> {
  const { orgId } = await requireAdmin();
  const id = formData.get("id") as string;
  const supplier = await prisma.supplier.findUnique({ where: { id }, select: { orgId: true } });
  if (!supplier || supplier.orgId !== orgId) return { error: "Not found" };
  await prisma.supplier.update({
    where: { id },
    data: {
      name: (formData.get("name") as string).trim(),
      contactName: (formData.get("contactName") as string).trim() || null,
      email: (formData.get("email") as string).trim() || null,
      phone: (formData.get("phone") as string).trim() || null,
      address: (formData.get("address") as string).trim() || null,
      notes: (formData.get("notes") as string).trim() || null,
      isActive: formData.get("isActive") === "1",
    },
  });
  return {};
}
