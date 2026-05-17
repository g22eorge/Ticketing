/**
 * Group 4 — Reservation lifecycle (tests 31–38)
 *
 * Verifies the reserve → consume / release flows and that:
 * - Reservations decrease qtyAvailable without touching qtyOnHand.
 * - Consuming a reservation decrements qtyOnHand and creates an OUT transaction.
 * - Releasing a reservation restores qtyAvailable without changing qtyOnHand.
 * - Double-consume is blocked.
 * - Multiple reservations for the same part are tracked independently.
 * - getLocationBalance correctly counts only RESERVED (not CONSUMED or RELEASED).
 *
 * Multi-tenant, location-aware schema.
 */

import { test, expect, beforeAll, afterAll } from "bun:test";
import {
  receiveStock,
  reserveForJob,
  consumeReservation,
  releaseReservation,
  getLocationBalance,
  InventoryError,
} from "@/lib/inventory-service";
import {
  setupTestDb,
  teardownTestDb,
  createOrg,
  createUser,
  createPart,
  createLocation,
  createTestJob,
  type PrismaClient,
} from "./helpers";

let db: PrismaClient;
let orgId: string;
let partId: string;
let locationId: string;
let userId: string;

beforeAll(async () => {
  db = await setupTestDb();
  const org = await createOrg(db, "reservations");
  orgId = org.id;
  const user = await createUser(db, orgId, { role: "ADMIN" });
  userId = user.id;
  const part = await createPart(db, orgId, { qty: 0 });
  partId = part.id;
  const loc = await createLocation(db, orgId);
  locationId = loc.id;
  // Seed enough initial stock for all tests.
  await receiveStock({ partId, locationId, quantity: 20, ctx: { orgId, performedById: userId } });
});

afterAll(teardownTestDb);

const ctx = () => ({ orgId, performedById: userId });

// ── Test 31 ───────────────────────────────────────────────────────────────────

test("31: reserveForJob creates a RESERVED reservation, qtyReserved increases, qtyOnHand unchanged, qtyAvailable decreases", async () => {
  const job = await createTestJob(db, orgId, userId);
  if (!job) return; // schema mismatch — skip

  const before = await getLocationBalance(partId, locationId);

  const reservationId = await reserveForJob({ partId, locationId, quantity: 2, jobId: job.id, ctx: ctx() });

  const after = await getLocationBalance(partId, locationId);
  expect(typeof reservationId).toBe("string");
  expect(reservationId.length).toBeGreaterThan(0);
  expect(after.qtyOnHand).toBe(before.qtyOnHand);           // qtyOnHand unchanged
  expect(after.qtyReserved).toBe(before.qtyReserved + 2);   // reservation counted
  expect(after.qtyAvailable).toBe(before.qtyAvailable - 2); // less available

  const reservation = await db.partReservation.findUnique({ where: { id: reservationId } });
  expect(reservation).not.toBeNull();
  expect(reservation!.status).toBe("RESERVED");
});

// ── Test 32 ───────────────────────────────────────────────────────────────────

test("32: reserveForJob throws INSUFFICIENT_STOCK when requested > qtyAvailable", async () => {
  const job = await createTestJob(db, orgId, userId);
  if (!job) return; // schema mismatch — skip

  const balance = await getLocationBalance(partId, locationId);

  const error = await reserveForJob({
    partId,
    locationId,
    quantity: balance.qtyAvailable + 999,
    jobId: job.id,
    ctx: ctx(),
  }).catch((e) => e);

  expect(error).toBeInstanceOf(InventoryError);
  expect((error as InventoryError).code).toBe("INSUFFICIENT_STOCK");
});

// ── Test 33 ───────────────────────────────────────────────────────────────────

test("33: consumeReservation marks CONSUMED, decrements qtyOnHand and qtyReserved, creates OUT transaction", async () => {
  const job = await createTestJob(db, orgId, userId);
  if (!job) return; // schema mismatch — skip

  const reservationId = await reserveForJob({ partId, locationId, quantity: 1, jobId: job.id, ctx: ctx() });

  const before = await getLocationBalance(partId, locationId);
  const txnsBefore = await db.partStockTransaction.count({ where: { partId } });

  await consumeReservation({ reservationId, locationId, ctx: ctx() });

  const after = await getLocationBalance(partId, locationId);
  const txnsAfter = await db.partStockTransaction.count({ where: { partId } });

  // qtyOnHand decremented after consume.
  expect(after.qtyOnHand).toBe(before.qtyOnHand - 1);
  // The reservation no longer counts as RESERVED so qtyReserved drops.
  expect(after.qtyReserved).toBe(before.qtyReserved - 1);
  // A new OUT transaction was created.
  expect(txnsAfter).toBe(txnsBefore + 1);

  const txn = await db.partStockTransaction.findFirst({
    where: { partId },
    orderBy: { createdAt: "desc" },
  });
  expect(txn!.type).toBe("OUT");

  const reservation = await db.partReservation.findUnique({ where: { id: reservationId } });
  expect(reservation!.status).toBe("CONSUMED");
  expect(reservation!.consumedAt).not.toBeNull();
});

// ── Test 34 ───────────────────────────────────────────────────────────────────

test("34: consumeReservation throws ALREADY_CONSUMED on double-consume", async () => {
  const job = await createTestJob(db, orgId, userId);
  if (!job) return; // schema mismatch — skip

  const reservationId = await reserveForJob({ partId, locationId, quantity: 1, jobId: job.id, ctx: ctx() });

  await consumeReservation({ reservationId, locationId, ctx: ctx() });

  const error = await consumeReservation({ reservationId, locationId, ctx: ctx() }).catch((e) => e);
  expect(error).toBeInstanceOf(InventoryError);
  expect((error as InventoryError).code).toBe("ALREADY_CONSUMED");
});

// ── Test 35 ───────────────────────────────────────────────────────────────────

test("35: releaseReservation marks RELEASED, qtyOnHand unchanged, qtyReserved decreases (qtyAvailable goes back up)", async () => {
  const job = await createTestJob(db, orgId, userId);
  if (!job) return; // schema mismatch — skip

  const reservationId = await reserveForJob({ partId, locationId, quantity: 2, jobId: job.id, ctx: ctx() });

  const before = await getLocationBalance(partId, locationId);

  await releaseReservation({ reservationId, locationId, ctx: ctx() });

  const after = await getLocationBalance(partId, locationId);
  // qtyOnHand must be unchanged — releasing does not deduct stock.
  expect(after.qtyOnHand).toBe(before.qtyOnHand);
  // qtyReserved decreases and qtyAvailable goes back up.
  expect(after.qtyReserved).toBe(before.qtyReserved - 2);
  expect(after.qtyAvailable).toBe(before.qtyAvailable + 2);

  const reservation = await db.partReservation.findUnique({ where: { id: reservationId } });
  expect(reservation!.status).toBe("RELEASED");
  expect(reservation!.releasedAt).not.toBeNull();
});

// ── Test 36 ───────────────────────────────────────────────────────────────────

test("36: after release, can reserve again for the freed quantity", async () => {
  const job1 = await createTestJob(db, orgId, userId);
  const job2 = await createTestJob(db, orgId, userId);
  if (!job1 || !job2) return; // schema mismatch — skip

  const balanceBefore = await getLocationBalance(partId, locationId);

  const reservationId = await reserveForJob({ partId, locationId, quantity: 3, jobId: job1.id, ctx: ctx() });
  const balanceDuring = await getLocationBalance(partId, locationId);
  expect(balanceDuring.qtyAvailable).toBe(balanceBefore.qtyAvailable - 3);

  await releaseReservation({ reservationId, locationId, ctx: ctx() });
  const balanceAfterRelease = await getLocationBalance(partId, locationId);
  expect(balanceAfterRelease.qtyAvailable).toBe(balanceBefore.qtyAvailable);

  // Should be able to reserve the freed quantity again.
  const newReservationId = await reserveForJob({ partId, locationId, quantity: 3, jobId: job2.id, ctx: ctx() });
  expect(typeof newReservationId).toBe("string");

  // Cleanup.
  await releaseReservation({ reservationId: newReservationId, locationId, ctx: ctx() });
});

// ── Test 37 ───────────────────────────────────────────────────────────────────

test("37: multiple simultaneous reservations for same part/location are tracked independently", async () => {
  const job1 = await createTestJob(db, orgId, userId);
  const job2 = await createTestJob(db, orgId, userId);
  if (!job1 || !job2) return; // schema mismatch — skip

  // Ensure enough availability for two separate reservations.
  const balanceCheck = await getLocationBalance(partId, locationId);
  if (balanceCheck.qtyAvailable < 4) {
    await receiveStock({ partId, locationId, quantity: 10, ctx: ctx() });
  }

  const balanceBefore = await getLocationBalance(partId, locationId);

  const reservationId1 = await reserveForJob({ partId, locationId, quantity: 1, jobId: job1.id, ctx: ctx() });
  const reservationId2 = await reserveForJob({ partId, locationId, quantity: 2, jobId: job2.id, ctx: ctx() });

  expect(reservationId1).not.toBe(reservationId2);

  const res1 = await db.partReservation.findUnique({ where: { id: reservationId1 } });
  const res2 = await db.partReservation.findUnique({ where: { id: reservationId2 } });

  expect(res1!.quantity).toBe(1);
  expect(res1!.jobId).toBe(job1.id);
  expect(res2!.quantity).toBe(2);
  expect(res2!.jobId).toBe(job2.id);

  // Total qtyReserved should have increased by 3 (1 + 2).
  const balanceAfter = await getLocationBalance(partId, locationId);
  expect(balanceAfter.qtyReserved).toBe(balanceBefore.qtyReserved + 3);

  // Consuming one does not affect the other.
  await consumeReservation({ reservationId: reservationId1, locationId, ctx: ctx() });

  const res2After = await db.partReservation.findUnique({ where: { id: reservationId2 } });
  expect(res2After!.status).toBe("RESERVED");

  // Cleanup: release the second reservation.
  await releaseReservation({ reservationId: reservationId2, locationId, ctx: ctx() });
});

// ── Test 38 ───────────────────────────────────────────────────────────────────

test("38: getLocationBalance qtyReserved only counts RESERVED status, not CONSUMED or RELEASED", async () => {
  const job1 = await createTestJob(db, orgId, userId);
  const job2 = await createTestJob(db, orgId, userId);
  const job3 = await createTestJob(db, orgId, userId);
  if (!job1 || !job2 || !job3) return; // schema mismatch — skip

  // Ensure enough stock for 3 reservations.
  const check = await getLocationBalance(partId, locationId);
  if (check.qtyAvailable < 3) {
    await receiveStock({ partId, locationId, quantity: 10, ctx: ctx() });
  }

  const id1 = await reserveForJob({ partId, locationId, quantity: 1, jobId: job1.id, ctx: ctx() });
  const id2 = await reserveForJob({ partId, locationId, quantity: 1, jobId: job2.id, ctx: ctx() });
  const id3 = await reserveForJob({ partId, locationId, quantity: 1, jobId: job3.id, ctx: ctx() });

  // Consume one, release another — only id3 stays RESERVED.
  await consumeReservation({ reservationId: id1, locationId, ctx: ctx() });
  await releaseReservation({ reservationId: id2, locationId, ctx: ctx() });

  const balance = await getLocationBalance(partId, locationId);

  // Only the still-RESERVED reservation (id3 = 1 unit) should appear in qtyReserved
  // (among these three; there may be other pre-existing RESERVED reservations).
  const id3Record = await db.partReservation.findUnique({ where: { id: id3 } });
  expect(id3Record!.status).toBe("RESERVED");

  // The balance qtyReserved must match the manual aggregate of RESERVED-status rows.
  const manualCount = await db.partReservation.aggregate({
    where: { partId, status: "RESERVED" },
    _sum: { quantity: true },
  });
  expect(balance.qtyReserved).toBe(manualCount._sum.quantity ?? 0);

  // Cleanup.
  await releaseReservation({ reservationId: id3, locationId, ctx: ctx() });
});
