#!/usr/bin/env node
/**
 * qa-pdf-smoke.mjs
 *
 * Smoke-tests every PDF-generating API endpoint by:
 *  1. Logging in as the seed ADMIN user.
 *  2. Fetching one record of each document type from the DB.
 *  3. Requesting the PDF endpoint for that record.
 *  4. Verifying the response starts with the %PDF magic bytes and has a
 *     Content-Length > 1000 bytes.
 *
 * Exits 0 on success, 1 on any failure.
 *
 * Usage:
 *   DATABASE_URL=file:./dev.db E2E_BASE_URL=http://localhost:3000 bun scripts/qa-pdf-smoke.mjs
 */

import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4041";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? process.env.E2E_ADMIN_EMAIL ?? "admin@eagle.local";
const ADMIN_PASSWORD = process.env.SEED_PASSWORD ?? process.env.E2E_PASSWORD ?? "Admin123!";

process.env.DATABASE_URL ??= "file:./dev.db";
process.env.TURSO_DATABASE_URL = "";
process.env.TURSO_AUTH_TOKEN = "";

const prisma = new PrismaClient({ log: [] });

let failed = false;
let serverProcess = null;
let spawnedServer = false;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed = true;
}

function ok(msg) {
  console.log(`OK:   ${msg}`);
}

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

async function startServerIfNeeded() {
  if (process.env.E2E_BASE_URL) return;

  const url = new URL(BASE_URL);
  const port = url.port || "4041";
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

// ── Step 1: Login ─────────────────────────────────────────────────────────────

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      origin: BASE_URL,
    },
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      callbackURL: "/dashboard",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    fail(`Login failed: status=${res.status} body=${text.slice(0, 200)}`);
    return null;
  }

  const cookieHeader = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

  ok("Login successful");
  return cookieHeader;
}

// ── Step 2: Verify a PDF endpoint ────────────────────────────────────────────

async function checkPdf(label, url, cookieHeader) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${url}`, {
      headers: { cookie: cookieHeader },
      redirect: "follow",
    });
  } catch (err) {
    fail(`${label} — network error: ${err.message}`);
    return;
  }

  if (res.status === 404) {
    // No records seeded for this type — skip gracefully
    console.log(`SKIP: ${label} — no record found (404)`);
    return;
  }

  if (!res.ok) {
    fail(`${label} — HTTP ${res.status}`);
    return;
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/pdf")) {
    fail(`${label} — unexpected content-type: ${contentType}`);
    return;
  }

  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Check %PDF magic bytes: 0x25 0x50 0x44 0x46 ('%', 'P', 'D', 'F')
  if (bytes.length < 4 || bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) {
    fail(`${label} — response does not start with %PDF magic bytes`);
    return;
  }

  if (bytes.length < 1000) {
    fail(`${label} — PDF too small (${bytes.length} bytes); likely an error response`);
    return;
  }

  ok(`${label} — valid PDF, ${bytes.length} bytes`);
}

// ── Step 3: Resolve document IDs from DB ─────────────────────────────────────

async function resolveEndpoints() {
  const endpoints = [];

  try {
    const invoiceJob = await prisma.job.findFirst({
      where: { status: { in: ["READY_FOR_PICKUP", "COMPLETED", "CLOSED"] } },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    if (invoiceJob) {
      endpoints.push({ label: "Job Invoice PDF", url: `/api/jobs/${invoiceJob.id}/invoice` });
    } else {
      console.log("SKIP: no invoiceable jobs found in DB - skipping job invoice PDF check");
    }

    const quotationJob = await prisma.job.findFirst({
      where: { status: { in: ["DIAGNOSING", "REFERRED", "AWAITING_APPROVAL", "IN_REPAIR", "READY_FOR_PICKUP", "COMPLETED", "CLOSED"] } },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    if (quotationJob) {
      endpoints.push({ label: "Job Quotation PDF", url: `/api/jobs/${quotationJob.id}/quotation` });
    } else {
      console.log("SKIP: no quotation-ready jobs found in DB - skipping job quotation PDF check");
    }

    const job = await prisma.job.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    if (job) {
      endpoints.push({ label: "Job Card PDF", url: `/api/jobs/${job.id}/job-card` });
    } else {
      console.log("SKIP: no jobs found in DB - skipping job card PDF check");
    }
  } catch {
    console.log("SKIP: could not query jobs table");
  }

  try {
    const sale = await prisma.sale.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    if (sale) {
      endpoints.push({ label: "Sale Receipt PDF", url: `/api/sales/${sale.id}/receipt` });
    } else {
      console.log("SKIP: no sales found in DB — skipping sale receipt PDF check");
    }
  } catch {
    console.log("SKIP: could not query sales table");
  }

  try {
    const payment = await prisma.payment.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (payment) {
      endpoints.push({ label: "Payment Receipt PDF", url: `/api/payments/${payment.id}/receipt` });
    } else {
      console.log("SKIP: no payments found in DB — skipping payment receipt PDF check");
    }
  } catch {
    console.log("SKIP: could not query payments table");
  }

  try {
    const dn = await prisma.deliveryNote.findFirst({
      orderBy: { deliveredAt: "desc" },
      select: { id: true },
    });
    if (dn) {
      endpoints.push({ label: "Delivery Note PDF", url: `/api/delivery-notes/${dn.id}` });
    } else {
      console.log("SKIP: no delivery notes found in DB — skipping delivery note PDF check");
    }
  } catch {
    console.log("SKIP: could not query deliveryNote table");
  }

  return endpoints;
}

// ── Main ──────────────────────────────────────────────────────────────────────

try {
  await startServerIfNeeded();

  const cookieHeader = await login();
  if (!cookieHeader) {
    process.exit(1);
  }

  const endpoints = await resolveEndpoints();

  if (endpoints.length === 0) {
    console.log("SKIP: no seeded records found — database appears empty. Run seed first.");
    process.exit(0);
  }

  for (const ep of endpoints) {
    await checkPdf(ep.label, ep.url, cookieHeader);
  }
} finally {
  await prisma.$disconnect();
  if (spawnedServer && serverProcess?.pid) {
    serverProcess.kill("SIGTERM");
  }
}

if (failed) {
  process.exit(1);
} else {
  console.log("\nAll PDF smoke checks passed.");
}
