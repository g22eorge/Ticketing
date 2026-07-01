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
    "https://care.eagleinfosolutions.com",   // main (single-tenant)
    "https://app.eagleinfosolutions.com",    // commercial (multi-tenant)
    "https://mrms-f8wt.vercel.app",         // commercial Vercel deployment
    "https://mrms-eight.vercel.app",
    "https://mrms-apga.vercel.app",         // commercial Vercel deployment (apga)
    "https://tsict.netlify.app",            // Netlify deployment
    "https://care.techserveict.com",        // custom domain
  ];

  const devOrigins = process.env.NODE_ENV === "production"
    ? []
    : [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003",
        "http://localhost:4173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
        "http://127.0.0.1:3003",
        "http://127.0.0.1:4173",
      ];

  const fromSingleEnv = [
    normalizeOrigin(process.env.BETTER_AUTH_URL),
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL),
    normalizeOrigin(process.env.AUTH_URL),
    // VERCEL_URL is injected for every deployment including preview PRs.
    // Only trust it in non-production to avoid trusting arbitrary PR preview URLs in prod.
    process.env.NODE_ENV !== "production" && process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : null,
  ].filter((origin): origin is string => Boolean(origin));

  const fromListEnv = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((part) => normalizeOrigin(part))
    .filter((origin): origin is string => Boolean(origin));

  return Array.from(new Set([...hardcoded, ...devOrigins, ...fromSingleEnv, ...fromListEnv]));
}

const trustedOrigins = collectTrustedOrigins();

function assertProductionAuthConfig() {
  const isRuntimeProduction = process.env.NODE_ENV === "production"
    && process.env.NEXT_PHASE !== "phase-production-build"
    && process.env.CI !== "true"
    && process.env.GITHUB_ACTIONS !== "true";

  if (!isRuntimeProduction) return;

  if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error("Missing BETTER_AUTH_SECRET: set a stable production secret of at least 32 characters");
  }

  if (!normalizeOrigin(process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL)) {
    throw new Error("Missing BETTER_AUTH_URL or NEXT_PUBLIC_APP_URL: set the production app URL");
  }
}

assertProductionAuthConfig();

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
      orgId: {
        type: "string",
        required: false,
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
