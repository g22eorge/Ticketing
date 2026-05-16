import { defineConfig } from "@playwright/test";
import path from "node:path";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";
const port = new URL(baseURL).port || "4173";
const databaseUrl =
  process.env.E2E_DATABASE_URL ??
  process.env.DATABASE_URL ??
  `file:${path.resolve(process.cwd(), "prisma/dev.db")}`;
const betterAuthSecret = process.env.BETTER_AUTH_SECRET ?? "playwright_test_secret_not_for_production";
const authEnv = `NEXT_PUBLIC_APP_URL=${baseURL} BETTER_AUTH_URL=${baseURL} BETTER_AUTH_SECRET=${betterAuthSecret} PROD=false ALLOW_SQLITE_PRODUCTION=1 DATABASE_URL=${databaseUrl}`;

const webServerBoot = `${authEnv} bunx prisma db push --skip-generate && bunx prisma generate && ${authEnv} bun run seed`;

const webServerCommand =
  process.env.E2E_SKIP_BUILD === "1"
    ? `${webServerBoot} && ${authEnv} PORT=${port} bun run start`
    : `${authEnv} bun run build && ${webServerBoot} && ${authEnv} PORT=${port} bun run start`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  timeout: 90000,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: webServerCommand,
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 300000,
  },
});
