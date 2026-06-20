#!/usr/bin/env bun
// scripts/prod-create-users.mjs
// Upserts George and Brian into the Turso (production) database with hashed credentials.

import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

// ── Load .env.local ──────────────────────────────────────────────────────────
const envPath = "/Users/Mac/Ticketing/.env.local";
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const [key, ...rest] = trimmed.split("=");
  if (key) env[key] = rest.join("=").trim();
}

const TURSO_DATABASE_URL = env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = env.TURSO_AUTH_TOKEN;

if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in .env.local");
  process.exit(1);
}

// ── Better-Auth crypto (dynamic import because it is an ESM package) ──────────
let hashPassword;
try {
  const betterAuthCrypto = await import("better-auth/crypto");
  hashPassword = betterAuthCrypto.hashPassword;
} catch (err) {
  console.error("Failed to import better-auth/crypto:", err.message);
  process.exit(1);
}

// ── Connect via @prisma/adapter-libsql ────────────────────────────────────────
const adapter = new PrismaLibSQL({
  url: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN,
});

const prisma = new PrismaClient({ adapter });

// ── User definitions ────────────────────────────────────────────────────────
const usersToCreate = [
  {
    email: "george@eagleinfosolutions.com",
    name: "George",
    role: "ADMIN",
    orgSlug: "eagle-info",
  },
  {
    email: "brian@eagleinfosolutions.com",
    name: "Brian",
    role: "MANAGER",
    orgSlug: "eagle-info",
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function generatePassword() {
  // Secure random 32-byte hex string
  return randomBytes(32).toString("hex");
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("Connecting to Turso database...\n");

  // Ensure org exists
  const orgSlug = "eagle-info";
  let org = await prisma.organization.findUnique({
    where: { slug: orgSlug },
  });

  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: "Eagle Info Solutions",
        slug: orgSlug,
      },
    });
    console.log(`Created organization: ${org.name} (${org.slug})`);
  } else {
    console.log(`Found organization: ${org.name} (${org.slug})`);
  }

  const createdOrUpdated = [];

  for (const u of usersToCreate) {
    const plainPassword = generatePassword();
    const hashed = await hashPassword(plainPassword);

    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        orgId: org.id,
        emailVerified: true,
      },
      create: {
        email: u.email,
        name: u.name,
        role: u.role,
        orgId: org.id,
        emailVerified: true,
      },
    });

    // Upsert the credential account row
    const existingAccount = await prisma.account.findFirst({
      where: {
        userId: user.id,
        providerId: "credential",
      },
    });

    if (existingAccount) {
      await prisma.account.update({
        where: { id: existingAccount.id },
        data: {
          accountId: user.email,
          password: hashed,
        },
      });
    } else {
      await prisma.account.create({
        data: {
          accountId: user.email,
          providerId: "credential",
          userId: user.id,
          password: hashed,
        },
      });
    }

    createdOrUpdated.push({
      email: u.email,
      name: u.name,
      role: u.role,
      password: plainPassword,
      userId: user.id,
    });
  }

  console.log("\n✅ Users created/updated successfully:\n");
  for (const u of createdOrUpdated) {
    console.log(`  Name : ${u.name}`);
    console.log(`  Email: ${u.email}`);
    console.log(`  Role : ${u.role}`);
    console.log(`  Pass=z  User ID: ${u.userId}`);
    console.log(`  Generated Password: ${u.password}`);
    console.log(`  Password Length   : ${u.password.length}`);
    console.log("────────────────────────────────────────");
  }
}

main()
  .catch((err) => {
    console.error("Error running script:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
