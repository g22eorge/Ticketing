import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { prisma } from "@/lib/prisma";

function normalizeOrigin(value: string | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function collectTrustedOrigins() {
  const hardcoded = [
    "https://care.eagleinfosolutions.com",
    "https://mrms-eight.vercel.app",
  ];

  const fromSingleEnv = [
    normalizeOrigin(process.env.BETTER_AUTH_URL),
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL),
    normalizeOrigin(process.env.AUTH_URL),
  ].filter((origin): origin is string => Boolean(origin));

  const fromListEnv = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((part) => normalizeOrigin(part))
    .filter((origin): origin is string => Boolean(origin));

  return Array.from(new Set([...hardcoded, ...fromSingleEnv, ...fromListEnv]));
}

const trustedOrigins = collectTrustedOrigins();

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL,
  trustedOrigins,
  database: prismaAdapter(prisma, { provider: "sqlite" }),
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "OPS",
        input: false,
      },
      isActive: {
        type: "boolean",
        required: true,
        defaultValue: true,
        input: false,
      },
    },
  },
  session: {
    // Keep sessions reasonably short.
    // expiresIn: session lifetime (seconds)
    // disableSessionRefresh: prevents extending sessions indefinitely
    expiresIn: 60 * 60 * 8, // 8 hours
    disableSessionRefresh: true,
    cookieCache: { enabled: true, maxAge: 60 * 5 }, // 5 minutes
  },
});
