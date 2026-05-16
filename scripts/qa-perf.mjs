#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";

function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...opts });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(baseUrl, timeoutMs = 60000) {
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

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function run() {
  const baseUrl = process.env.PERF_BASE_URL ?? "http://127.0.0.1:4020";
  const iterations = toNumber(process.env.PERF_ITERATIONS, 20);
  const timeoutMs = toNumber(process.env.PERF_TIMEOUT_MS, 5000);
  const includeWarmup = toNumber(process.env.PERF_WARMUP, 2);

  const thresholdLoginP95 = toNumber(process.env.PERF_P95_MS_LOGIN, 900);
  const thresholdRedirectP95 = toNumber(process.env.PERF_P95_MS_REDIRECT, 250);

  const scenarios = [
    { name: "GET /login", path: "/login", expected: 200, threshold: thresholdLoginP95 },
    { name: "GET /jobs unauth", path: "/jobs", expected: 307, threshold: thresholdRedirectP95 },
    { name: "GET /api/jobs unauth", path: "/api/jobs", expected: 307, threshold: thresholdRedirectP95 },
  ];

  let serverProcess = null;
  let spawnedServer = false;
  let serverLog = "";

  try {
    if (!process.env.PERF_BASE_URL) {
      // Ensure a production build exists (qa:perf is often run standalone).
      // `next start` hard-requires `.next/BUILD_ID`.
      if (!fs.existsSync(".next/BUILD_ID")) {
        await runCmd("bun", ["run", "build"]);
      }

      const url = new URL(baseUrl);
      const port = url.port || "4020";
      serverProcess = spawn("bun", ["run", "start"], {
        env: { ...process.env, PORT: port },
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });

      serverProcess.stdout?.on("data", (chunk) => {
        serverLog += String(chunk);
        if (serverLog.length > 50_000) serverLog = serverLog.slice(-50_000);
        globalThis.__perfServerLogTail = serverLog;
      });
      serverProcess.stderr?.on("data", (chunk) => {
        serverLog += String(chunk);
        if (serverLog.length > 50_000) serverLog = serverLog.slice(-50_000);
        globalThis.__perfServerLogTail = serverLog;
      });

      spawnedServer = true;
      await waitForServer(baseUrl);
    }

    let failed = false;

    for (const scenario of scenarios) {
      for (let i = 0; i < includeWarmup; i += 1) {
        await fetch(`${baseUrl}${scenario.path}`, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
      }

      const samples = [];
      for (let i = 0; i < iterations; i += 1) {
        const start = performance.now();
        const response = await fetch(`${baseUrl}${scenario.path}`, {
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
        });
        const duration = performance.now() - start;
        samples.push(duration);

        if (response.status !== scenario.expected) {
          console.error(`FAIL: ${scenario.name} expected ${scenario.expected}, got ${response.status}`);
          failed = true;
          break;
        }
      }

      const p95 = percentile(samples, 95);
      const avg = mean(samples);
      const min = Math.min(...samples);
      const max = Math.max(...samples);
      console.log(
        `${scenario.name}: n=${samples.length} avg=${avg.toFixed(1)}ms p95=${p95.toFixed(1)}ms min=${min.toFixed(1)}ms max=${max.toFixed(1)}ms threshold=${scenario.threshold}ms`,
      );

      if (p95 > scenario.threshold) {
        console.error(`FAIL: ${scenario.name} p95 ${p95.toFixed(1)}ms exceeds threshold ${scenario.threshold}ms`);
        failed = true;
      }
    }

    if (failed) {
      process.exitCode = 1;
      return;
    }

    console.log("OK: performance smoke checks passed.");
  } finally {
    if (spawnedServer && serverProcess?.pid) {
      const pid = serverProcess.pid;

      // Prefer killing the whole process group (bun -> shell -> next start).
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        serverProcess.kill("SIGTERM");
      }

      const exited = await Promise.race([
        new Promise((resolve) => {
          serverProcess.once("exit", () => resolve(true));
        }),
        sleep(4000).then(() => false),
      ]);

      if (!exited) {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          serverProcess.kill("SIGKILL");
        }
      }
    }
  }
}

run().catch((error) => {
  console.error("FAIL:", error.message);
  if (error.message?.includes("did not become ready") && process.env.PERF_BASE_URL == null) {
    // If we spawned the server and it never became ready, show recent logs.
    // (The buffer is small; enough for common startup/config errors.)
    console.error("\n--- server log (tail) ---\n" + (globalThis.__perfServerLogTail ?? ""));
  }
  process.exit(1);
});
