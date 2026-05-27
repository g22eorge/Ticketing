#!/usr/bin/env node

const base = process.env.SMOKE_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const email = process.env.SMOKE_EMAIL ?? "admin@eagle.tech";
const password = process.env.SMOKE_PASSWORD ?? "Admin123!";

function okStatus(status, allowed) {
  return allowed.includes(status);
}

function cookieHeaderFromSetCookie(setCookieValues) {
  return setCookieValues
    .map((value) => value.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

async function run() {
  const checks = [];
  let passed = 0;

  const loginRes = await fetch(`${base}/login`, { redirect: "manual" });
  checks.push({
    name: "GET /login",
    status: loginRes.status,
    pass: okStatus(loginRes.status, [200]),
    expected: "200",
  });

  const unauthDashRes = await fetch(`${base}/dashboard`, { redirect: "manual" });
  checks.push({
    name: "GET /dashboard (unauth)",
    status: unauthDashRes.status,
    pass: okStatus(unauthDashRes.status, [302, 303, 307, 308]),
    expected: "302/303/307/308",
  });

  const unauthJobsApiRes = await fetch(`${base}/api/jobs`, { redirect: "manual" });
  checks.push({
    name: "GET /api/jobs (unauth)",
    status: unauthJobsApiRes.status,
    pass: okStatus(unauthJobsApiRes.status, [302, 303, 307, 308, 401, 403]),
    expected: "redirect or 401/403",
  });

  const signinRes = await fetch(`${base}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, callbackURL: "/dashboard" }),
    redirect: "manual",
  });

  const setCookieValues = signinRes.headers.getSetCookie();
  const cookieHeader = cookieHeaderFromSetCookie(setCookieValues);
  checks.push({
    name: "POST /api/auth/sign-in/email",
    status: signinRes.status,
    pass: signinRes.ok && cookieHeader.length > 0,
    expected: "200 + session cookies",
  });

  if (cookieHeader.length > 0) {
    const authDashRes = await fetch(`${base}/dashboard`, {
      headers: { cookie: cookieHeader },
      redirect: "manual",
    });
    checks.push({
      name: "GET /dashboard (auth)",
      status: authDashRes.status,
      pass: okStatus(authDashRes.status, [200]),
      expected: "200",
    });

    const authJobsApiRes = await fetch(`${base}/api/jobs`, {
      headers: { cookie: cookieHeader, accept: "application/json" },
      redirect: "manual",
    });
    checks.push({
      name: "GET /api/jobs (auth)",
      status: authJobsApiRes.status,
      pass: okStatus(authJobsApiRes.status, [200]),
      expected: "200",
    });
  } else {
    checks.push({
      name: "GET /dashboard (auth)",
      status: "skipped",
      pass: false,
      expected: "200",
    });
    checks.push({
      name: "GET /api/jobs (auth)",
      status: "skipped",
      pass: false,
      expected: "200",
    });
  }

  for (const check of checks) {
    if (check.pass) {
      passed += 1;
      console.log(`OK: ${check.name} -> ${check.status}`);
    } else {
      console.error(`FAIL: ${check.name} -> ${check.status} (expected ${check.expected})`);
    }
  }

  const percentage = Math.round((passed / checks.length) * 100);
  console.log(`SMOKE SCORE: ${passed}/${checks.length} (${percentage}%)`);

  if (passed !== checks.length) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error("FAIL: smoke script crashed:", error.message);
  process.exit(1);
});
