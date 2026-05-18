import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const env = { ...process.env };
if (!env.DATABASE_URL && env.TURSO_DATABASE_URL) {
  env.DATABASE_URL = env.TURSO_DATABASE_URL;
}
if (!env.DATABASE_URL) {
  env.DATABASE_URL = "file:./dev.db";
}

for (const path of ["node_modules/.prisma/client", "node_modules/@prisma/client/.prisma"]) {
  rmSync(path, { recursive: true, force: true });
}

run("bunx", ["prisma", "generate"], { env });
run("node", ["scripts/assert-prisma-models.mjs"], { env });

if (env.RUN_PRISMA_MIGRATE_DEPLOY === "1") {
  if (!process.env.DATABASE_URL && !process.env.TURSO_DATABASE_URL) {
    console.error("RUN_PRISMA_MIGRATE_DEPLOY=1 requires DATABASE_URL or TURSO_DATABASE_URL.");
    process.exit(1);
  }
  run("bunx", ["prisma", "migrate", "deploy"], { env });
}

run("next", ["build"], { env });
