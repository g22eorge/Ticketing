#!/usr/bin/env bun
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const marker = `qa-rr-${Date.now()}`;
  const phone = `+256700${String(Date.now()).slice(-6)}`;

  const createOne = async () => {
    const { createRepairRequest } = await import("../lib/repairs/request.ts");
    return createRepairRequest({
      customerName: marker,
      phone,
      email: `${marker}@example.invalid`,
      preferredContactMethod: "WHATSAPP",
      deviceType: "PHONE_ANDROID",
      brand: "QA",
      model: "Concurrency",
      problemDescription: `Request number concurrency check ${marker}`,
      handoverMethod: "SELF_DROPOFF",
      submissionIp: "127.0.0.1",
    });
  };

  const runs = 20;
  const results = await Promise.all(Array.from({ length: runs }, () => createOne()));
  const failures = results.filter((r) => !r.success);
  assert(failures.length === 0, `expected 0 failures, got ${failures.length}`);

  const numbers = results.map((r) => r.requestNumber);
  const unique = new Set(numbers);
  assert(unique.size === runs, `expected ${runs} unique request numbers, got ${unique.size}`);

  console.log("OK: repair request numbers unique under concurrency.");
} catch (error) {
  console.error("FAIL:", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
