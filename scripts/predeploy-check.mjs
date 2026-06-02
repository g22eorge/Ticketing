#!/usr/bin/env node
import { spawnSync } from "node:child_process";

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function warn(message) {
  console.log(`WARN: ${message}`);
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) {
    fail(`command failed: ${cmd} ${args.join(" ")}`);
  }
}

if (!process.env.PROD) {
  process.env.PROD = "false";
}

if (process.env.PROD !== "true") {
  process.env.DATABASE_URL = process.env.PREDEPLOY_DATABASE_URL ?? "file:./dev.db";
  process.env.TURSO_DATABASE_URL = "";
  process.env.TURSO_AUTH_TOKEN = "";
  process.env.ALLOW_SQLITE_PRODUCTION = "1";
  process.env.BETTER_AUTH_SECRET ??= "predeploy-local-better-auth-secret-32-chars";
  process.env.NEXT_PUBLIC_APP_URL ??= "http://127.0.0.1:4020";
  process.env.BETTER_AUTH_URL ??= process.env.NEXT_PUBLIC_APP_URL;
}

const secret = process.env.BETTER_AUTH_SECRET ?? "";
if (!secret || secret.includes("replace-with") || secret.length < 32) {
  fail("BETTER_AUTH_SECRET must be set to a strong random value (32+ chars).");
}

const publicUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
const authUrl = process.env.BETTER_AUTH_URL ?? "";

if (!publicUrl || !authUrl) {
  fail("NEXT_PUBLIC_APP_URL and BETTER_AUTH_URL must be set.");
}

if (process.env.REQUIRE_HTTPS === "1") {
  if (!publicUrl.startsWith("https://") || !authUrl.startsWith("https://")) {
    fail("URLs must use https:// when REQUIRE_HTTPS=1");
  }
}

if (publicUrl.includes("localhost") || authUrl.includes("localhost")) {
  warn("Using localhost URLs. Set production URLs before deployment.");
  process.env.PROD = "false";
}

run("bunx", ["prisma", "migrate", "status"]);
if (process.env.PROD !== "true") {
  run("bunx", ["prisma", "migrate", "deploy"]);
  run("bun", ["run", process.env.PREDEPLOY_DEMO_SEED === "1" ? "seed" : "seed:base"]);
}
run("bun", ["run", "lint"]);
run("bun", ["run", "build"]);
run("bun", ["run", "qa:data-integrity"]);
run("bun", ["run", "qa:concurrency"]);
run("bun", ["run", "qa:perf"]);

if (process.env.PREDEPLOY_SKIP_QA_HTTP === "1") {
  warn("PREDEPLOY_SKIP_QA_HTTP=1; skipped qa:http-security.");
} else {
  run("bun", ["run", "qa:http-security"]);
}

if (process.env.REQUIRE_E2E === "1") {
  process.env.E2E_BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";
  process.env.NEXT_PUBLIC_APP_URL = process.env.E2E_BASE_URL;
  process.env.BETTER_AUTH_URL = process.env.E2E_BASE_URL;
  process.env.E2E_SKIP_BUILD = "1";
  run("bun", ["run", "qa:e2e"]);
} else {
  warn("REQUIRE_E2E not set; skipped qa:e2e.");
}

console.log("OK: predeploy checks passed.");
