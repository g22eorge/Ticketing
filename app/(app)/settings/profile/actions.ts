"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { sanitizeText } from "@/lib/sanitize";
import { requireSession } from "@/lib/session";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80, "Name is too long"),
  phone: z
    .string()
    .trim()
    .max(30, "Phone number is too long")
    .optional(),
});

export type UpdateProfileState = {
  error?: string;
  success?: string;
};

export async function updateProfileAction(
  _prevState: UpdateProfileState,
  formData: FormData,
): Promise<UpdateProfileState> {
  const session = await requireSession();
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
