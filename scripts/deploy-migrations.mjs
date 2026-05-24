import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL;

if (!databaseUrl) {
  console.error("Missing DATABASE_URL or TURSO_DATABASE_URL. Refusing to run migrations against local fallback DB.");
  process.exit(1);
}

const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
};

const result = spawnSync("bunx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
