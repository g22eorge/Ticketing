/**
 * Safe, production-friendly script that creates or updates the platform
 * super-admin account (george@eagleinfosolutions.com) without touching
 * any other data.
 *
 * Usage:
 *   GEORGE_PASSWORD=<password> bun scripts/ensure-platform-admin.ts
 */

import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "george@eagleinfosolutions.com";
  const name = "George";
  const password = process.env.GEORGE_PASSWORD;

  if (!password) {
    console.error("Error: GEORGE_PASSWORD env var is required.");
    process.exit(1);
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: { name, role: "ADMIN", isActive: true, emailVerified: true },
    create: { name, email, role: "ADMIN", isActive: true, emailVerified: true },
  });

  const existing = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
  });

  const hashed = await hashPassword(password);

  if (existing) {
    await prisma.account.update({
      where: { id: existing.id },
      data: { password: hashed },
    });
  } else {
    await prisma.account.create({
      data: {
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: hashed,
      },
    });
  }

  console.log(`✓ Platform admin ready: ${email}`);
}

main()
  .catch((err) => {
    console.error("Failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
