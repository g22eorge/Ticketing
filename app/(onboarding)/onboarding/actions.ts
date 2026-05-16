"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { sendWelcomeEmail } from "@/lib/email";
import { ALL_MODULES } from "@/lib/module-access";

const schema = z.object({
  businessName: z.string().min(2, "Business name must be at least 2 characters").max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens"),
});

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
}

export type CreateOrgState = {
  error?: string;
  fieldErrors?: { businessName?: string[]; slug?: string[] };
};

export async function createOrganization(
  _prev: CreateOrgState,
  formData: FormData,
): Promise<CreateOrgState> {
  const session = await requireSession();

  const raw = {
    businessName: formData.get("businessName") as string,
    slug: toSlug((formData.get("businessName") as string) ?? ""),
  };

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { businessName, slug } = parsed.data;

  // Check if user already has an org.
  const existingUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { orgId: true },
  });

  if (existingUser?.orgId) {
    redirect("/dashboard");
  }

  // Check slug uniqueness.
  const slugTaken = await prisma.organization.findUnique({ where: { slug } });
  if (slugTaken) {
    return { error: "That business name is already taken. Try a different one." };
  }

  // Create org and link the founding user as ADMIN.
  // Free plan trial: 2 months (60 days). After expiry the workspace suspends
  // and the admin is prompted to pick a paid plan.
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 60);

  await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: businessName,
        slug,
        trialEndsAt,
        billingStatus: "TRIALING",
      },
    });

    await tx.user.update({
      where: { id: session.user.id },
      data: { orgId: org.id, role: "ADMIN" },
    });

    // Seed default branding settings for this org.
    await tx.documentBrandingSettings.create({
      data: { orgId: org.id },
    });

    // Grant all modules to new orgs by default.
    await tx.orgModuleGrant.createMany({
      data: ALL_MODULES.map((module) => ({ orgId: org.id, module })),
      skipDuplicates: true,
    });
  });

  // Fire-and-forget welcome email (don't block redirect on email failure).
  void sendWelcomeEmail(session.user.email, session.user.name, businessName);

  redirect("/dashboard");
}
