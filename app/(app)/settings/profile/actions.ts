"use server";

import { hashPassword, verifyPassword } from "better-auth/crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { sanitizeText } from "@/lib/sanitize";
import { requireOrgSession } from "@/lib/org-context";
import { assertOrgCanMutate } from "@/lib/org-write";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80, "Name is too long"),
  phone: z
    .string()
    .trim()
    .max(30, "Phone number is too long")
    .optional(),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from current password",
    path: ["newPassword"],
  });

const adminPasswordSchema = z
  .object({
    userId: z.string().min(1, "Choose a user"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirm: z.string().min(8, "Confirm password must be at least 8 characters"),
  })
  .refine((data) => data.password === data.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

export type UpdateProfileState = {
  error?: string;
  success?: string;
};

export type ChangePasswordState = {
  error?: string;
  success?: string;
};

export type AdminChangePasswordState = {
  error?: string;
  success?: string;
};

export async function updateProfileAction(
  _prevState: UpdateProfileState,
  formData: FormData,
): Promise<UpdateProfileState> {
  const { session, user, org } = await requireOrgSession();
  assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });
  const parsed = schema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const cleanName = sanitizeText(parsed.data.name);
  const cleanPhone = parsed.data.phone ? sanitizeText(parsed.data.phone) : null;

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { name: cleanName },
    });

    try {
      await prisma.$executeRaw`
        UPDATE "User" SET "phone" = ${cleanPhone} WHERE "id" = ${session.user.id}
      `;
    } catch {
      // Ignore for environments where phone column is not migrated yet.
    }
  } catch {
    return { error: "Could not update profile right now" };
  }

  revalidatePath("/settings/profile");
  revalidatePath("/dashboard");
  revalidatePath("/jobs");
  revalidatePath("/technicians");

  return { success: "Profile updated" };
}

export async function changePasswordAction(
  _prevState: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const { session } = await requireOrgSession();

  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid password" };
  }

  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, providerId: "credential" },
    select: { id: true, password: true },
  });

  if (!account?.password) {
    return { error: "Password changes are only available for email/password accounts" };
  }

  const validPassword = await verifyPassword({
    hash: account.password,
    password: parsed.data.currentPassword,
  }).catch(() => false);

  if (!validPassword) {
    return { error: "Current password is incorrect" };
  }

  await prisma.account.update({
    where: { id: account.id },
    data: { password: await hashPassword(parsed.data.newPassword) },
  });

  return { success: "Password changed" };
}

export async function adminChangeUserPasswordAction(
  _prevState: AdminChangePasswordState,
  formData: FormData,
): Promise<AdminChangePasswordState> {
  const { user, orgId, org } = await requireOrgSession();
  if (user.role !== "ADMIN") return { error: "Not authorized" };
  assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

  const parsed = adminPasswordSchema.safeParse({
    userId: formData.get("userId"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid password" };
  }

  const target = await prisma.user.findFirst({
    where: { id: parsed.data.userId, orgId },
    select: { id: true, email: true },
  });

  if (!target) return { error: "User not found in this organization" };

  const hashed = await hashPassword(parsed.data.password);

  await prisma.$transaction(async (tx) => {
    const updated = await tx.account.updateMany({
      where: { userId: target.id, providerId: "credential" },
      data: { password: hashed },
    });

    if (updated.count === 0) {
      await tx.account.create({
        data: { accountId: target.id, providerId: "credential", userId: target.id, password: hashed },
      });
    }

    await tx.session.deleteMany({ where: { userId: target.id } });
  });

  revalidatePath("/settings/users");
  revalidatePath(`/settings/users/${target.id}`);

  return { success: `Password changed for ${target.email}` };
}
