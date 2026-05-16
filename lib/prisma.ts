import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const DEFAULT_LOCAL_DATABASE_URL = (() => {
  const cwd = process.cwd();
  // Support running from `.next/standalone` where relative paths break.
  if (cwd.includes(".next/standalone")) {
    return `file:${cwd}/../../prisma/dev.db`;
  }
  return `file:${cwd}/prisma/dev.db`;
})();

function toSqliteAbsoluteUrl(url: string) {
  if (!url.startsWith("file:")) return url;
  const rawPath = url.slice("file:".length);
  if (!rawPath || rawPath.startsWith("/") || rawPath.startsWith("..")) return url;

  // Avoid path/process.cwd() here to prevent Turbopack over-tracing.
  // Dev scripts already run prisma db push/generate before dev/build.
  if (rawPath === "dev.db" || rawPath === "./dev.db" || rawPath === "prisma/dev.db" || rawPath === "./prisma/dev.db") {
    return DEFAULT_LOCAL_DATABASE_URL;
  }

  return url;
}

function createPrismaClient() {
  // Use TURSO_DATABASE_URL to detect production mode
  const isProduction = !!process.env.TURSO_DATABASE_URL;

  // GitHub Actions/CI runs Next in production mode but uses local sqlite.
  const isCi = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";

  // When Next runs `next build`, NODE_ENV is production; allow local sqlite during build.
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  if (
    process.env.NODE_ENV === "production" &&
    !isProduction &&
    !isBuildPhase &&
    !isCi &&
    process.env.ALLOW_SQLITE_PRODUCTION !== "1"
  ) {
    // Prefer a clear error over a noisy sqlite "unable to open" failure on serverless.
    throw new Error("Missing TURSO_DATABASE_URL (set Turso env vars for production runtime)");
  }

  if (!isProduction) {
    const databaseUrl = process.env.DATABASE_URL?.trim();

    if (!databaseUrl) {
      process.env.DATABASE_URL = toSqliteAbsoluteUrl(DEFAULT_LOCAL_DATABASE_URL);
    } else {
      process.env.DATABASE_URL = toSqliteAbsoluteUrl(databaseUrl);
    }

    return new PrismaClient({
      log: ["error", "warn"],
    });
  }

  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    throw new Error("Missing TURSO_DATABASE_URL");
  }

  const adapter = new PrismaLibSql({
    url,
    ...(process.env.TURSO_AUTH_TOKEN ? { authToken: process.env.TURSO_AUTH_TOKEN } : {}),
  });

  return new PrismaClient({
    adapter,
    log: ["error", "warn"],
  });
}

// If a cached singleton is missing recently-added models (stale hot-reload cache),
// discard it so a fresh client is created with the current generated schema.
function isStaleSingleton(client: PrismaClient | undefined): boolean {
  if (!client) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as any;
  return !c.complaint || !c.userGroup || !c.branch || !c.supplier || !c.salesTarget;
}

if (isStaleSingleton(globalForPrisma.prisma)) {
  try { void globalForPrisma.prisma?.$disconnect(); } catch { /* ignore */ }
  globalForPrisma.prisma = undefined;
}

export const prisma =
  globalForPrisma.prisma ??
  createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

