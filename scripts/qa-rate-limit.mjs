#!/usr/bin/env node
/**
 * qa-rate-limit.mjs
 *
 * Verifies that the login endpoint enforces its rate limit (10 attempts per
 * 15 minutes per IP) by sending 11 requests with wrong credentials from the
 * same IP and asserting the 11th returns HTTP 429.
 *
 * Exits 0 on success, 1 on failure.
 *
 * Usage:
 *   E2E_BASE_URL=http://localhost:3000 node scripts/qa-rate-limit.mjs
 *
 * Note: This test consumes 11 slots of the auth rate limiter on the target
 * server for the loopback IP. Run against a dev/staging server only.
 */

import { spawn } from "node:child_process";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RATE_LIMIT_ENDPOINT = `${BASE_URL}/api/auth/sign-in/email`;
const TOTAL_REQUESTS = 11;
const _RATE_LIMIT_THRESHOLD = 10; // server limit per 15 min window

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(baseUrl, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/login`, { redirect: "manual" });
      if (response.status === 200 || response.status === 307) {
        return;
      }
    } catch {
      // retry
    }
    await sleep(700);
  }
  throw new Error(`Server did not become ready at ${baseUrl} within ${timeoutMs}ms`);
}

console.log(`Rate-limit smoke test → ${RATE_LIMIT_ENDPOINT}`);
console.log(`Sending ${TOTAL_REQUESTS} requests with wrong credentials...`);

const results = [];

let serverProcess = null;
let spawnedServer = false;

try {
  if (!process.env.E2E_BASE_URL) {
    const url = new URL(BASE_URL);
    const port = url.port || "3000";
    serverProcess = spawn("bun", ["run", "start"], {
      env: {
        ...process.env,
        PORT: port,
        ALLOW_SQLITE_PRODUCTION: "1",
        DATABASE_URL: process.env.DATABASE_URL ?? "file:./dev.db",
        TURSO_DATABASE_URL: "",
        TURSO_AUTH_TOKEN: "",
        BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "qa-local-better-auth-secret-at-least-32-chars",
        BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? BASE_URL,
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? BASE_URL,
        BETTER_AUTH_TRUSTED_ORIGINS: process.env.BETTER_AUTH_TRUSTED_ORIGINS
          ? `${process.env.BETTER_AUTH_TRUSTED_ORIGINS},${BASE_URL}`
          : BASE_URL,
      },
      stdio: "ignore",
    });
    spawnedServer = true;
    await waitForServer(BASE_URL);
  }

  for (let i = 1; i <= TOTAL_REQUESTS; i++) {
    const res = await fetch(RATE_LIMIT_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        origin: BASE_URL,
        // Omit X-Forwarded-For so requests come from the loopback IP
      },
      body: JSON.stringify({
        email: `nonexistent-qa-${i}@example.invalid`,
        password: "WrongPassword!!1",
        callbackURL: "/dashboard",
      }),
    });

    results.push({ attempt: i, status: res.status });
    process.stdout.write(`  [${i}/${TOTAL_REQUESTS}] status=${res.status}\n`);

    // Small delay to avoid confusing the server with burst; keep well under 1s
    if (i < TOTAL_REQUESTS) {
      await sleep(50);
    }
  }

  // The first N attempts (up to the limit) may return 400/401/422 (bad credentials).
  // The attempt at index RATE_LIMIT_THRESHOLD (11th = index 10) must be 429.
  const lastResult = results[TOTAL_REQUESTS - 1];
  if (lastResult.status === 429) {
    console.log(`\nOK: attempt ${TOTAL_REQUESTS} returned HTTP 429 - rate limiting is active.`);
    process.exit(0);
  }

  console.error(
    `\nFAIL: attempt ${TOTAL_REQUESTS} returned HTTP ${lastResult.status} instead of 429.`,
  );
  console.error("The auth rate limiter may not be enforced on this server.");
  console.error("Full results:", results);
  process.exit(1);
} finally {
  if (spawnedServer && serverProcess?.pid) {
    serverProcess.kill("SIGTERM");
  }
}
