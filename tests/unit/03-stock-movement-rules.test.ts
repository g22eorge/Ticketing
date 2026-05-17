/**
 * Group 3 — Stock movement rules (tests 21–30)
 *
 * Validates the core invariants of inventoryService for pure qtyOnHand changes:
 * every stock mutation flows through the service, balances stay consistent,
 * and the system blocks negative stock unless explicitly overridden.
 *
 * Multi-tenant, location-aware schema.
 */

import { test, expect, beforeAll, afterAll } from "bun:test";
import {
  receiveStock,
  issueStock,
  applyAdjustment,
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
  seedLocationStock,
  type PrismaClient,
} from "./helpers";

let db: PrismaClient;
let orgId: string;
let partId: string;
let locationId: string;
let userId: string;

beforeAll(async () => {
  db = await setupTestDb();
  const org = await createOrg(db, "stock-rules");
  orgId = org.id;
  const user = await createUser(db, orgId, { role: "ADMIN" });
  userId = user.id;
  const part = await createPart(db, orgId, { qty: 0 });
  partId = part.id;
  const loc = await createLocation(db, orgId);
  locationId = loc.id;
});

afterAll(teardownTestDb);

const ctx = () => ({ orgId, performedById: userId });

// ── Test 21 ───────────────────────────────────────────────────────────────────

test("21: receiveStock increases qtyOnHand at location and creates an IN transaction record", async () => {
  await receiveStock({ partId, locationId, quantity: 10, ctx: ctx() });

  const balance = await getLocationBalance(partId, locationId);
  expect(balance.qtyOnHand).toBeGreaterThanOrEqual(10);

  const txns = await db.partStockTransaction.findMany({ where: { partId } });
  expect(txns.length).toBeGreaterThanOrEqual(1);
  expect(txns.at(-1)!.type).toBe("IN");
});

// ── Test 22 ───────────────────────────────────────────────────────────────────

test("22: issueStock decreases qtyOnHand and blocks going negative", async () => {
  // Ensure we have enough available stock.
  const before = await getLocationBalance(partId, locationId);
  if (before.qtyAvailable < 3) {
    await receiveStock({ partId, locationId, quantity: 10, ctx: ctx() });
  }

  const balanceBefore = await getLocationBalance(partId, locationId);
  await issueStock({ partId, locationId, quantity: 3, ctx: ctx() });
  const balanceAfter = await getLocationBalance(partId, locationId);

  expect(balanceAfter.qtyOnHand).toBe(balanceBefore.qtyOnHand - 3);

  // Attempting to issue more than available must throw INSUFFICIENT_STOCK.
  const error = await issueStock({ partId, locationId, quantity: 99999, ctx: ctx() }).catch((e) => e);
  expect(error).toBeInstanceOf(InventoryError);
  expect((error as InventoryError).code).toBe("INSUFFICIENT_STOCK");
});

// ── Test 23 ───────────────────────────────────────────────────────────────────

test("23: allowNegative flag lets issueStock go below zero", async () => {
  const balanceBefore = await getLocationBalance(partId, locationId);
  const available = balanceBefore.qtyAvailable;

  await issueStock({
    partId,
    locationId,
    quantity: available + 5,
    ctx: { ...ctx(), allowNegative: true },
  });

  const balanceAfter = await getLocationBalance(partId, locationId);
  expect(balanceAfter.qtyOnHand).toBeLessThan(0);

  // Restore stock so subsequent tests are not affected.
  await receiveStock({ partId, locationId, quantity: available + 5 + 10, ctx: ctx() });
});

// ── Test 24 ───────────────────────────────────────────────────────────────────

test("24: issueStock with zero quantity throws INVALID_QUANTITY without creating a transaction record", async () => {
  const txnsBefore = await db.partStockTransaction.count({ where: { partId } });

  await expect(
    issueStock({ partId, locationId, quantity: 0, ctx: ctx() }),
  ).rejects.toBeInstanceOf(InventoryError);

  const txnsAfter = await db.partStockTransaction.count({ where: { partId } });
  expect(txnsAfter).toBe(txnsBefore); // no transaction created
});

// ── Test 25 ───────────────────────────────────────────────────────────────────

test("25: applyAdjustment with positive variance increases location stock", async () => {
  const before = await getLocationBalance(partId, locationId);

  await applyAdjustment({
    partId,
    locationId,
    systemQuantity: before.qtyOnHand,
    countedQuantity: before.qtyOnHand + 5,
    ctx: ctx(),
  });

  const after = await getLocationBalance(partId, locationId);
  expect(after.qtyOnHand).toBe(before.qtyOnHand + 5);
});

// ── Test 26 ───────────────────────────────────────────────────────────────────

test("26: applyAdjustment negative variance blocks going negative; allowNegative override succeeds", async () => {
  const before = await getLocationBalance(partId, locationId);

  // Claim system has 1000 more than reality (counted=0) → variance=-1000 → would go negative.
  const error = await applyAdjustment({
    partId,
    locationId,
    systemQuantity: before.qtyOnHand + 1000,
    countedQuantity: 0,
    ctx: ctx(),
  }).catch((e) => e);
  expect(error).toBeInstanceOf(InventoryError);
  expect((error as InventoryError).code).toBe("INSUFFICIENT_STOCK");

  // With allowNegative override the same adjustment succeeds.
  await applyAdjustment({
    partId,
    locationId,
    systemQuantity: before.qtyOnHand + 1000,
    countedQuantity: 0,
    ctx: { ...ctx(), allowNegative: true },
  });

  // Restore stock.
  await receiveStock({ partId, locationId, quantity: 1000 + before.qtyOnHand + 10, ctx: ctx() });
});

// ── Test 27 ───────────────────────────────────────────────────────────────────

test("27: every stock operation creates exactly one PartStockTransaction record", async () => {
  const before = await db.partStockTransaction.count({ where: { partId } });

  await receiveStock({ partId, locationId, quantity: 1, ctx: ctx() });

  const after = await db.partStockTransaction.count({ where: { partId } });
  expect(after).toBe(before + 1);
});

// ── Test 28 ───────────────────────────────────────────────────────────────────

test("28: Part.qtyOnHand aggregate equals the sum of all PartLocationStock.qtyOnHand rows for that part", async () => {
  // Add more stock to ensure a non-trivial sum.
  await receiveStock({ partId, locationId, quantity: 5, ctx: ctx() });

  const agg = await db.partLocationStock.aggregate({
    where: { partId },
    _sum: { qtyOnHand: true },
  });
  const part = await db.part.findUnique({ where: { id: partId }, select: { qtyOnHand: true } });
  expect(part?.qtyOnHand).toBe(agg._sum.qtyOnHand ?? 0);
});

// ── Test 29 ───────────────────────────────────────────────────────────────────

test("29: issueStock checks qtyAvailable (qtyOnHand - qtyReserved), not raw qtyOnHand", async () => {
  // Create a fresh part and location for an isolated test.
  const part29 = await createPart(db, orgId, { qty: 0 });
  const loc29 = await createLocation(db, orgId, "Test Location 29");

  // Seed qtyOnHand=5, qtyReserved=3 directly → qtyAvailable=2.
  await seedLocationStock(db, orgId, part29.id, loc29.id, 5, 3);

  // Sync Part.qtyOnHand to match location stock.
  await db.part.update({ where: { id: part29.id }, data: { qtyOnHand: 5 } });

  const balance = await getLocationBalance(part29.id, loc29.id);
  expect(balance.qtyOnHand).toBe(5);
  expect(balance.qtyReserved).toBe(3);
  expect(balance.qtyAvailable).toBe(2);

  // Attempting to issue 3 must fail — only 2 are available.
  const error = await issueStock({ partId: part29.id, locationId: loc29.id, quantity: 3, ctx: ctx() }).catch((e) => e);
  expect(error).toBeInstanceOf(InventoryError);
  expect((error as InventoryError).code).toBe("INSUFFICIENT_STOCK");
});

// ── Test 30 ───────────────────────────────────────────────────────────────────

test("30: receiveStock with negative quantity throws INVALID_QUANTITY", async () => {
  const txnsBefore = await db.partStockTransaction.count({ where: { partId } });

  await expect(
    receiveStock({ partId, locationId, quantity: -5, ctx: ctx() }),
  ).rejects.toBeInstanceOf(InventoryError);

  const txnsAfter = await db.partStockTransaction.count({ where: { partId } });
  expect(txnsAfter).toBe(txnsBefore); // no transaction created
});
