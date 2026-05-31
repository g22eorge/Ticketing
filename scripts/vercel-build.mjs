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
// These steps only parse the schema — they never open a DB connection.
// Prisma SQLite provider rejects any URL that doesn't start with "file:",
// so we always use a local dev.db placeholder here regardless of what
// TURSO_DATABASE_URL is set to on the deployment platform.
const generateEnv = {
  ...process.env,
  DATABASE_URL: "file:./dev.db",
  // Clear Turso vars so Prisma can't accidentally pick them up
  TURSO_DATABASE_URL: "",
  TURSO_AUTH_TOKEN: "",
};

run("node", ["scripts/generate-prisma-clean.mjs"], { env: generateEnv });
run("node", ["scripts/assert-prisma-models.mjs"], { env: generateEnv });

// ── Step 2: migrations + Next.js build ───────────────────────────────────────
// Use the real database URL (Turso in production, file: in preview/local).
const runtimeEnv = { ...process.env };
if (!runtimeEnv.DATABASE_URL && runtimeEnv.TURSO_DATABASE_URL) {
  runtimeEnv.DATABASE_URL = runtimeEnv.TURSO_DATABASE_URL;
}
if (!runtimeEnv.DATABASE_URL) {
  runtimeEnv.DATABASE_URL = "file:./dev.db";
}

if (runtimeEnv.RUN_PRISMA_MIGRATE_DEPLOY === "1") {
  if (!process.env.DATABASE_URL && !process.env.TURSO_DATABASE_URL) {
    console.error("RUN_PRISMA_MIGRATE_DEPLOY=1 requires DATABASE_URL or TURSO_DATABASE_URL.");
    process.exit(1);
  }
  run("bunx", ["prisma", "migrate", "deploy"], { env: runtimeEnv });
}

run("next", ["build"], { env: runtimeEnv });
