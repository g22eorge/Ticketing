"use server";

import { hashPassword } from "better-auth/crypto";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const acceptSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(2, "Name must be at least 2 characters").max(80),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirm: z.string().min(1),
}).refine((d) => d.password === d.confirm, {
  message: "Passwords do not match",
  path: ["confirm"],
});

export type AcceptInviteState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function acceptInvite(
  _prev: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const raw = {
    token: formData.get("token") as string,
    name: (formData.get("name") as string)?.trim(),
    password: formData.get("password") as string,
    confirm: formData.get("confirm") as string,
  };

  const parsed = acceptSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { token, name, password } = parsed.data;

  // Load and validate the invite.
  const invite = await prisma.userInvite.findUnique({
    where: { token },
    include: { org: { select: { id: true, name: true } } },
  });

  if (!invite) return { error: "Invite link is invalid." };
  if (invite.usedAt) return { error: "This invite has already been used." };
  if (invite.expiresAt < new Date()) return { error: "This invite has expired. Ask your admin to send a new one." };

  // Check if email already has an account.
  const existing = await prisma.user.findUnique({
    where: { email: invite.email },
    select: { id: true, orgId: true },
  });

  if (existing) {
    if (existing.orgId && existing.orgId !== invite.orgId) {
      return { error: "This email already belongs to a different workspace." };
    }
    // User exists but has no org yet — just link them.
    await prisma.$transaction([
      prisma.user.update({
        where: { id: existing.id },
        data: { orgId: invite.orgId, role: invite.role },
      }),
      prisma.userInvite.update({
        where: { token },
        data: { usedAt: new Date() },
      }),
    ]);
  } else {
    // Create new user + link to org in one transaction.
    await prisma.$transaction(async (tx) => {
      const hashed = await hashPassword(password);

      const user = await tx.user.create({
        data: {
          name,
          email: invite.email,
          role: invite.role,
          orgId: invite.orgId,
          emailVerified: true, // trusted — admin invited them
        },
      });

      await tx.account.create({
        data: {
          accountId: user.email,
          providerId: "credential",
          userId: user.id,
          password: hashed,
        },
      });

      await tx.userInvite.update({
        where: { token },
        data: { usedAt: new Date() },
      });
    });
  }

  // Sign them in automatically.
  if (auth) {
    await auth.api.signInEmail({
      body: { email: invite.email, password, callbackURL: "/dashboard" },
      headers: await headers(),
    });
  } else {
    redirect("/login");
  }

  redirect("/dashboard");
}
