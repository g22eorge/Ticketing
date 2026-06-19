/**
 * Production User Setup for Turso DB
 * Creates: org + super-admin user with credentials
 * Idempotent — safe to re-run.
 */
import { PrismaClient, Role } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { hashPassword } from "better-auth/crypto";

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN")  ;
  process.exit(1);
}

const adapter = new PrismaLibSql({ url: TURSO_URL, authToken: TURSO_TOKEN });
const prisma = new PrismaClient({ adapter, log: [{ emit: "event", level: "error" }] });

// ── Config ───────────────────────────────────────────────────────────────────
const ORG_NAME = process.env.PROD_ORG_NAME || "Eagle Info Solutions";
const ORG_SLUG = process.env.PROD_ORG_SLUG || "eagle-info";
const ADMIN_NAME = process.env.PROD_ADMIN_NAME || "George Brian";
const ADMIN_EMAIL = process.env.PROD_ADMIN_EMAIL || "george@eagleinfosolutions.com";
const ADMIN_PASSWORD = process.env.PROD_ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
  console.error("❌ PROD_ADMIN_PASSWORD is required (set it as an env var)");
  console.error("   Example: PROD_ADMIN_PASSWORD='YourStrongP@ssw0rd!2025'");
  process.exit(1);
}

async function main() {
  console.log(`🔄 Setting up production users in Turso:`);
  console.log(`   DB: ${TURSO_URL}`);
  console.log(`   Org: ${ORG_NAME}`);
  console.log(`   Admin: ${ADMIN_EMAIL}`);
  console.log();

  // ── Step 1: Create/Update Organization ────────────────────────────────────
  const org = await prisma.organization.upsert({
    where: { slug: ORG_SLUG },
    update: { name: ORG_NAME, isActive: true, billingStatus: "ACTIVE", plan: "ENTERPRISE" },
    create: { name: ORG_NAME, slug: ORG_SLUG, isActive: true, billingStatus: "ACTIVE", plan: "ENTERPRISE" },
  });
  console.log(`✅ Organization: ${org.name} (${org.id})`);

  // ── Step 2: Create/Update Super Admin User ───────────────────────────────
  const user = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { name: ADMIN_NAME, role: Role.ADMIN, orgId: org.id, isActive: true, emailVerified: true },
    create: { name: ADMIN_NAME, email: ADMIN_EMAIL, role: Role.ADMIN, orgId: org.id, isActive: true, emailVerified: true },
  });
  console.log(`✅ Super Admin: ${user.name} (${user.email}) — ${user.role}`);

  // ── Step 3: Set Credential Password (always update) ──────────────────────
  const existingAccount = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
    select: { id: true },
  });

  const hashed = await hashPassword(ADMIN_PASSWORD);

  if (existingAccount) {
    await prisma.account.update({
      where: { id: existingAccount.id },
      data: { password: hashed },
    });
    console.log(`🔐 Password updated for ${ADMIN_EMAIL}`);
  } else {
    await prisma.account.create({
      data: {
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: hashed,
      },
    });
    console.log(`🔐 Password created for ${ADMIN_EMAIL}`);
  }

  // ── Step 4: Create Document Branding Defaults ─────────────────────────────
  await prisma.documentBrandingSettings.upsert({
    where: { orgId: org.id },
    update: {},
    create: { orgId: org.id },
  });
  console.log(`✅ Document branding defaults set`);

  // ── Step 5: Create Notification Preferences for Admin ────────────────────
  await prisma.notificationPreferences.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });
  console.log(`✅ Notification preferences set`);

  console.log();
  console.log("══════════════════════════════════════════════════");
  console.log("  Production user setup complete");
  console.log("══════════════════════════════════════════════════");
  console.log(`  Login:      ${ADMIN_EMAIL}`);
  console.log(`  Password:   (set via PROD_ADMIN_PASSWORD)`);
  console.log(`  Org:        ${ORG_NAME}`);
  console.log("══════════════════════════════════════════════════");
}

main()
  .catch((err) => {
    console.error("❌ Setup failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
