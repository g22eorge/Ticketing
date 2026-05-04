#!/usr/bin/env node

import { spawn } from "node:child_process";

const base = process.env.QA_BASE_URL ?? "http://127.0.0.1:4030";

const checks = [
  { path: "/api/jobs", name: "jobs API unauth" },
  { path: "/api/reports/export?type=pipeline-aging", name: "reports export unauth" },
  { path: "/clients", name: "clients route unauth" },
  { path: "/jobs", name: "jobs route unauth" },
];

let failed = false;

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

let serverProcess = null;
let spawnedServer = false;

try {
  if (!process.env.QA_BASE_URL) {
    const url = new URL(base);
    const port = url.port || "4030";
    serverProcess = spawn("bun", ["run", "start"], {
      env: { ...process.env, PORT: port },
      stdio: "ignore",
    });
    spawnedServer = true;
    await waitForServer(base);
  }

  for (const check of checks) {
    try {
      const response = await fetch(`${base}${check.path}`, {
        redirect: "manual",
        headers: { accept: "text/html,application/json" },
      });

    if (response.status === 200) {
      console.error(`FAIL: ${check.name} returned 200`);
      failed = true;
      continue;
    }

    console.log(`OK: ${check.name} returned ${response.status}`);
    } catch (error) {
      console.error(`FAIL: ${check.name} request error`, error.message);
      failed = true;
    }
  }

  if (failed) {
    process.exit(1);
  }

  console.log("OK: unauthenticated access checks passed.");
} finally {
  if (spawnedServer && serverProcess?.pid) {
    serverProcess.kill("SIGTERM");
  }
}
