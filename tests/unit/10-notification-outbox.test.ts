/**
 * Group 10 — Notification outbox (tests 111–116)
 *
 * Verifies that enqueueWhatsAppMessage and enqueueEmailMessage write
 * OutboundMessage rows to the database with correct fields.
 */

import { test, expect, beforeAll, afterAll } from "bun:test";
import { enqueueWhatsAppMessage, enqueueEmailMessage } from "@/lib/notifications/whatsapp-outbox";
import { setupTestDb, teardownTestDb, createOrg, type PrismaClient } from "./helpers";

let db: PrismaClient;
let orgId: string;

beforeAll(async () => {
  db = await setupTestDb();
  const org = await createOrg(db, "notif-outbox");
  orgId = org.id;
});

afterAll(teardownTestDb);

// ── Test 111 ──────────────────────────────────────────────────────────────────

test("111: enqueueWhatsAppMessage creates an OutboundMessage row with PENDING status", async () => {
  const before = await db.outboundMessage.count({ where: { orgId } });

  await enqueueWhatsAppMessage({
    orgId,
    to: "+254700000001",
    body: "Test notification body",
    type: "ADMIN_TEST",
  });

  const after = await db.outboundMessage.count({ where: { orgId } });
  expect(after).toBe(before + 1);

  const row = await db.outboundMessage.findFirst({
    where: { orgId, to: "+254700000001" },
    orderBy: { createdAt: "desc" },
  });
  expect(row).not.toBeNull();
  expect(row!.status).toBe("PENDING");
  expect(row!.body).toBe("Test notification body");
});

// ── Test 112 ──────────────────────────────────────────────────────────────────

test("112: enqueueWhatsAppMessage sets channel to WHATSAPP", async () => {
  await enqueueWhatsAppMessage({
    orgId,
    to: "+254700000002",
    body: "Channel check",
    type: "ADMIN_TEST",
  });

  const row = await db.outboundMessage.findFirst({
    where: { orgId, to: "+254700000002" },
    orderBy: { createdAt: "desc" },
  });
  expect(row!.channel).toBe("WHATSAPP");
});

// ── Test 113 ──────────────────────────────────────────────────────────────────

test("113: enqueueWhatsAppMessage with nextAttemptAt schedules for the future", async () => {
  const future = new Date(Date.now() + 60_000);

  await enqueueWhatsAppMessage({
    orgId,
    to: "+254700000003",
    body: "Scheduled message",
    type: "ADMIN_TEST",
    nextAttemptAt: future,
  });

  const row = await db.outboundMessage.findFirst({
    where: { orgId, to: "+254700000003" },
    orderBy: { createdAt: "desc" },
  });
  expect(row).not.toBeNull();
  expect(row!.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
});

// ── Test 114 ──────────────────────────────────────────────────────────────────

test("114: enqueueEmailMessage creates an OutboundMessage row with EMAIL channel", async () => {
  const before = await db.outboundMessage.count({ where: { orgId } });

  await enqueueEmailMessage({
    orgId,
    to: "test-recipient@example.invalid",
    subject: "Test email subject",
    body: "<p>Test email body</p>",
    type: "REPAIR_REQUEST_EMAIL_ALERT",
  });

  const after = await db.outboundMessage.count({ where: { orgId } });
  expect(after).toBe(before + 1);

  const row = await db.outboundMessage.findFirst({
    where: { orgId, to: "test-recipient@example.invalid" },
    orderBy: { createdAt: "desc" },
  });
  expect(row).not.toBeNull();
  expect(row!.channel).toBe("EMAIL");
  expect(row!.status).toBe("PENDING");
});

// ── Test 115 ──────────────────────────────────────────────────────────────────

test("115: enqueueEmailMessage stores the subject in templateKey field", async () => {
  await enqueueEmailMessage({
    orgId,
    to: "subject-check@example.invalid",
    subject: "My Important Subject",
    body: "Body text",
    type: "ADMIN_TEST",
  });

  const row = await db.outboundMessage.findFirst({
    where: { orgId, to: "subject-check@example.invalid" },
    orderBy: { createdAt: "desc" },
  });
  expect(row).not.toBeNull();
  expect(row!.subject).toBe("My Important Subject");
});

// ── Test 116 ──────────────────────────────────────────────────────────────────

test("116: multiple enqueueWhatsAppMessage calls produce independent rows", async () => {
  const recipients = ["+254711000001", "+254711000002", "+254711000003"];

  await Promise.all(
    recipients.map((to) =>
      enqueueWhatsAppMessage({ orgId, to, body: `Message to ${to}`, type: "ADMIN_TEST" }),
    ),
  );

  const rows = await db.outboundMessage.findMany({
    where: { orgId, to: { in: recipients } },
    orderBy: { createdAt: "desc" },
  });

  expect(rows.length).toBe(3);
  const tos = new Set(rows.map((r) => r.to));
  for (const recipient of recipients) {
    expect(tos.has(recipient)).toBe(true);
  }
});
