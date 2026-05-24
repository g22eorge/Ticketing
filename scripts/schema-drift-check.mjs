import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const checkCurrent = process.env.CHECK_CURRENT_DATABASE === "1";
const tmp = checkCurrent ? null : mkdtempSync(join(tmpdir(), "mrms-drift-"));
const dbPath = tmp ? join(tmp, "drift.db") : null;
const dbUrl = checkCurrent ? process.env.DATABASE_URL : `file:${dbPath}`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: checkCurrent
      ? process.env
      : { ...process.env, DATABASE_URL: dbUrl, TURSO_DATABASE_URL: "", TURSO_AUTH_TOKEN: "" },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    if (options.capture) {
      process.stderr.write(result.stderr ?? "");
      process.stderr.write(result.stdout ?? "");
    }
    process.exit(result.status ?? 1);
  }
  return result.stdout ?? "";
}

try {
  if (!checkCurrent) {
    run("bunx", ["prisma", "migrate", "deploy"]);
  }
  const diff = run("bunx", [
    "prisma",
    "migrate",
    "diff",
    "--from-url",
    dbUrl,
    "--to-schema-datamodel",
    "prisma/schema.prisma",
    "--script",
  ], { capture: true }).trim();

  if (diff && diff !== "-- This is an empty migration.") {
    const out = join(tmp, "migration-drift.sql");
    writeFileSync(out, `${diff}\n`);
    console.error("Migration drift detected: database does not match prisma/schema.prisma.");
    console.error(`Drift SQL written to ${out}`);
    console.error("Run bun run db:reconcile-empty on a disposable empty DB, then create proper migrations for production.");
    process.exit(1);
  }

  console.log(checkCurrent
    ? "OK: current database matches prisma/schema.prisma"
    : "OK: migration history matches prisma/schema.prisma");
} finally {
  if (tmp && (process.exitCode === undefined || process.exitCode === 0)) {
    rmSync(tmp, { recursive: true, force: true });
  }
}
