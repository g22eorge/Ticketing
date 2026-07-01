#!/usr/bin/env bun
/**
 * Safe password reset script for production.
 * Usage: bun scripts/reset-password.ts <email> [newPassword]
 *
 * If newPassword is omitted, a strong random password is generated and printed.
 * Requires DATABASE_URL (and TURSO_DATABASE_URL if applicable) to be set.
 */

import { prisma } from "@/lib/prisma";
import { hashPassword } from "better-auth/crypto";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function ensureUser(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }
  return user;
}

async function ensureAccount(userId: string) {
  const account = await prisma.account.findFirst({
    where: { userId, providerId: "credential" },
  });
  if (!account) {
    console.error(`No credential account for user id: ${userId}`);
    process.exit(1);
  }
  return account;
}

async function setPassword(accountId: string, newPassword: string) {
  if (newPassword.length < 8) {
    console.error("Password must be at least 8 characters");
    process.exit(1);
  }
  const hash = await hashPassword(newPassword);
  const updated = await prisma.account.update({
    where: { id: accountId },
    data: { password: hash },
  });
  return updated;
}

async function main() {
  const [emailArg, passwordArg] = process.argv.slice(2);
  const email = emailArg?.trim().toLowerCase();

  if (!email || !EMAIL_REGEX.test(email)) {
    console.error("Usage: bun scripts/reset-password.ts <email> [newPassword]");
    process.exit(1);
  }

  const newPassword = passwordArg || crypto.randomUUID().replace(/-/g, "") + "!A1";
  const user = await ensureUser(email);
  const account = await ensureAccount(user.id);
  const result = await setPassword(account.id, newPassword);
  console.log(`Password updated for user: ${user.email} (account: ${result.id})`);
  if (!passwordArg) {
    console.log(`Temporary password: ${newPassword}`);
    console.log("⚠️  Share this password only with the account owner and advise them to change it on first login.");
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
}).finally(() => prisma.$disconnect());
