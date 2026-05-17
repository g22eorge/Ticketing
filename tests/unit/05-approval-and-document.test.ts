/**
 * Group 5 — Permission enforcement & business invariants (tests 39–44)
 *
 * Verifies:
 * - requirePermission throws PermissionError when user lacks a permission.
 * - requirePermission resolves with correct role when user has the permission.
 * - Inactive user returns null from resolvePermissions.
 * - can.approveInvoices: OPS role denied without explicit grant.
 * - can.approveInvoices: ADMIN role allowed by default.
 * - Stock isolation: creating a Part directly does NOT change another part's balance.
 */

import { test, expect, beforeAll, afterAll } from "bun:test";
import { can } from "@/lib/permissions";
import {
  resolvePermissions,
  requirePermission,
  invalidatePermissions,
  PermissionError,
} from "@/lib/permission-cache";
import { receiveStock, getLocationBalance } from "@/lib/inventory-service";
import {
  setupTestDb,
  teardownTestDb,
  createOrg,
  createUser,
  createPart,
  createLocation,
  type PrismaClient,
} from "./helpers";

let db: PrismaClient;
let orgId: string;
let adminUserId: string;
let opsUserId: string;
let locationId: string;

beforeAll(async () => {
  db = await setupTestDb();
  const org = await createOrg(db, "approval");
  orgId = org.id;

  const admin = await createUser(db, orgId, { role: "ADMIN" });
  adminUserId = admin.id;

  const ops = await createUser(db, orgId, { role: "OPS" });
  opsUserId = ops.id;

  const loc = await createLocation(db, orgId);
  locationId = loc.id;
});

afterAll(teardownTestDb);

// ── Test 39 ───────────────────────────────────────────────────────────────────

test("39: requirePermission throws PermissionError when user lacks the permission", async () => {
  await invalidatePermissions(opsUserId);

  const error = await requirePermission(opsUserId, "can_approve_invoices").catch((e) => e);
  expect(error).toBeInstanceOf(PermissionError);
  expect((error as PermissionError).code).toBe("PERMISSION_DENIED");
});

// ── Test 40 ───────────────────────────────────────────────────────────────────

test("40: requirePermission resolves when user has the permission, returns correct role", async () => {
  await db.userPermission.upsert({
    where: { userId_permission: { userId: adminUserId, permission: "can_approve_invoices" } },
    create: { userId: adminUserId, permission: "can_approve_invoices" },
    update: {},
  });
  await invalidatePermissions(adminUserId);

  const perms = await requirePermission(adminUserId, "can_approve_invoices");

  expect(perms).not.toBeNull();
  expect(perms.role).toBe("ADMIN");
  expect(perms.has("can_approve_invoices")).toBe(true);
});

// ── Test 41 ───────────────────────────────────────────────────────────────────

test("41: resolvePermissions returns null for an inactive user", async () => {
  const inactiveUser = await createUser(db, orgId, { role: "OPS" });

  await db.user.update({ where: { id: inactiveUser.id }, data: { isActive: false } });
  await invalidatePermissions(inactiveUser.id);

  const perms = await resolvePermissions(inactiveUser.id);
  expect(perms).toBeNull();

  await db.user.update({ where: { id: inactiveUser.id }, data: { isActive: true } });
  await invalidatePermissions(inactiveUser.id);
});

// ── Test 42 ───────────────────────────────────────────────────────────────────

test("42: can.approveInvoices returns false for OPS role without explicit permission grant", () => {
  expect(can.approveInvoices({ role: "OPS" })).toBe(false);
});

// ── Test 43 ───────────────────────────────────────────────────────────────────

test("43: can.approveInvoices returns true for ADMIN role", () => {
  expect(can.approveInvoices({ role: "ADMIN" })).toBe(true);
});

// ── Test 44 ───────────────────────────────────────────────────────────────────

test("44: creating a Part directly does NOT change another part's location balance", async () => {
  const sentinel = await createPart(db, orgId, { qty: 0 });

  await receiveStock({
    partId: sentinel.id,
    locationId,
    quantity: 5,
    ctx: { orgId, performedById: adminUserId },
  });

  const before = await getLocationBalance(sentinel.id, locationId);
  expect(before.qtyOnHand).toBe(5);

  // Simulate a "PO received" event by inserting a Part row directly — no inventory call.
  await db.part.create({
    data: {
      sku: `PO-NEW-${Date.now()}`,
      name: "New Part from PO",
      qtyOnHand: 0,
      orgId,
    } as never,
  });

  // The sentinel part's location balance must be completely unaffected.
  const after = await getLocationBalance(sentinel.id, locationId);
  expect(after.qtyOnHand).toBe(before.qtyOnHand);
});
