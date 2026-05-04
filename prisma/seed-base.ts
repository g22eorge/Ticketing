import { hashPassword } from "better-auth/crypto";

import { prisma } from "@/lib/prisma";

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@eagle.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "Admin123!";

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: "System Admin",
      role: "ADMIN",
      isActive: true,
      emailVerified: true,
    },
    create: {
      name: "System Admin",
      email: adminEmail,
      role: "ADMIN",
      isActive: true,
      emailVerified: true,
    },
  });

  const existingAccount = await prisma.account.findFirst({
    where: { userId: admin.id, providerId: "credential" },
  });

  if (!existingAccount) {
    await prisma.account.create({
      data: {
        accountId: admin.id,
        providerId: "credential",
        userId: admin.id,
        password: await hashPassword(adminPassword),
      },
    });
  }

  console.log(`Base seed complete. Admin: ${adminEmail}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
