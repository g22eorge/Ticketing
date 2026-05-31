import { spawnSync } from "node:child_process";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// ── Step 1: prisma generate + model assertion ────────────────────────────────
// prisma.config.ts reads process.env.DATABASE_URL at PrismaClient init time,
// so we must mutate process.env directly — passing via the child's env option
// is not sufficient because Prisma v6 reads the parent's process.env.
//
// Stash the real URL, override to a valid SQLite file: URL for generate/assert
// (these steps only parse schema — no DB connection ever made), then restore
// the real URL before migrate/build.
const realDatabaseUrl = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || "";

process.env.DATABASE_URL    = "file:./dev.db";   // always valid for SQLite provider
process.env.TURSO_DATABASE_URL = "";              // prevent prisma.config.ts fallback

run("node", ["scripts/generate-prisma-clean.mjs"]);
run("node", ["scripts/assert-prisma-models.mjs"]);

// ── Step 2: migrations + Next.js build ───────────────────────────────────────
// Restore the real URL now that generate/assert are done.
process.env.DATABASE_URL = realDatabaseUrl || "file:./dev.db";
if (realDatabaseUrl.startsWith("libsql:")) {
  process.env.TURSO_DATABASE_URL = realDatabaseUrl;
}

if (process.env.RUN_PRISMA_MIGRATE_DEPLOY === "1") {
  if (!realDatabaseUrl) {
    console.error("RUN_PRISMA_MIGRATE_DEPLOY=1 requires DATABASE_URL or TURSO_DATABASE_URL.");
    process.exit(1);
  }
  run("bunx", ["prisma", "migrate", "deploy"]);
}

run("next", ["build"]);
