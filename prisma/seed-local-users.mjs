import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";

const prisma = new PrismaClient();

async function ensureCredentialAccount(userId, password) {
  const existing = await prisma.account.findFirst({
    where: { userId, providerId: "credential" },
    select: { id: true },
  });

  const hashed = await hashPassword(password);
  if (existing) {
    await prisma.account.update({ where: { id: existing.id }, data: { password: hashed } });
    return;
  }

  await prisma.account.create({
    data: {
      accountId: userId,
      providerId: "credential",
      userId,
      password: hashed,
    },
  });
}

async function ensureUser({ name, email, role, orgId, password }) {
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, role, orgId, isActive: true, emailVerified: true },
    create: { name, email, role, orgId, isActive: true, emailVerified: true },
    select: { id: true, email: true, role: true },
  });

  await ensureCredentialAccount(user.id, password);
  return user;
}

async function main() {
  // For local only.
  const password = process.env.SEED_PASSWORD || "Password123!";
  const slug = process.env.SEED_ORG_SLUG || "local";
  const name = process.env.SEED_ORG_NAME || "Local Org";

  const org = await prisma.organization.upsert({
    where: { slug },
    update: { name, isActive: true },
    create: { name, slug, billingStatus: "ACTIVE", plan: "STARTER", isActive: true },
    select: { id: true, slug: true, name: true },
  });

  // Needed by app shell (branding settings lookup).
  await prisma.documentBrandingSettings.upsert({
    where: { orgId: org.id },
    update: {},
    create: { orgId: org.id },
  });

  const users = [
    { name: "Admin", email: "admin@local.test", role: Role.ADMIN },
    { name: "Ops", email: "ops@local.test", role: Role.OPS },
    { name: "Front Desk", email: "frontdesk@local.test", role: Role.FRONT_DESK },
    { name: "Internal Tech", email: "tech.internal@local.test", role: Role.TECHNICIAN_INTERNAL },
    { name: "External Tech", email: "tech.external@local.test", role: Role.TECHNICIAN_EXTERNAL },
  ];

  for (const u of users) {
    await ensureUser({ ...u, orgId: org.id, password });
  }

  console.log("Local users created/updated:");
  console.log(`Org: ${org.name} (${org.slug}) id=${org.id}`);
  console.log(`Password: ${password}`);
  for (const u of users) {
    console.log(`- ${u.role}: ${u.email}`);
  }
  console.log("Set DEFAULT_ORG_ID to the org id above for public repair requests.");
}

await main()
  .catch((err) => {
    console.error("seed-local-users failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
