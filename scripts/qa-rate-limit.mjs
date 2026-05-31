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

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RATE_LIMIT_ENDPOINT = `${BASE_URL}/api/auth/sign-in/email`;
const TOTAL_REQUESTS = 11;
const _RATE_LIMIT_THRESHOLD = 10; // server limit per 15 min window

console.log(`Rate-limit smoke test → ${RATE_LIMIT_ENDPOINT}`);
console.log(`Sending ${TOTAL_REQUESTS} requests with wrong credentials...`);

const results = [];

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
    await new Promise((r) => setTimeout(r, 50));
  }
}

// The first N attempts (up to the limit) may return 400/401/422 (bad credentials).
// The attempt at index RATE_LIMIT_THRESHOLD (11th = index 10) must be 429.
const lastResult = results[TOTAL_REQUESTS - 1];
if (lastResult.status === 429) {
  console.log(`\nOK: attempt ${TOTAL_REQUESTS} returned HTTP 429 — rate limiting is active.`);
  process.exit(0);
} else {
  console.error(
    `\nFAIL: attempt ${TOTAL_REQUESTS} returned HTTP ${lastResult.status} instead of 429.`,
  );
  console.error("The auth rate limiter may not be enforced on this server.");
  console.error("Full results:", results);
  process.exit(1);
}
