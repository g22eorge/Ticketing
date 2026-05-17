/**
 * Group 7 — Session edge cases (tests 81–88)
 *
 * Verifies deactivated users are blocked, permission cache invalidation works,
 * and reactivated users regain access — all DB-backed.
 */

import { test, expect, beforeAll, afterAll } from "bun:test";
import { resolvePermissions, invalidatePermissions } from "@/lib/permission-cache";
import { setupTestDb, teardownTestDb, createOrg, createUser, type PrismaClient } from "./helpers";

let db: PrismaClient;
let orgId: string;

beforeAll(async () => {
  db = await setupTestDb();
  const org = await createOrg(db, "session-edge");
  orgId = org.id;
});

afterAll(teardownTestDb);

// ── Test 81 ───────────────────────────────────────────────────────────────────

test("81: resolvePermissions returns null for a freshly deactivated user", async () => {
  const u = await createUser(db, orgId, { role: "OPS" });
  await db.user.update({ where: { id: u.id }, data: { isActive: false } });
  await invalidatePermissions(u.id);

  const result = await resolvePermissions(u.id);
  expect(result).toBeNull();
});

// ── Test 82 ───────────────────────────────────────────────────────────────────

test("82: resolvePermissions returns permissions after user is reactivated", async () => {
  const u = await createUser(db, orgId, { role: "OPS" });
  await db.user.update({ where: { id: u.id }, data: { isActive: false } });
  await invalidatePermissions(u.id);

  const afterDeactivate = await resolvePermissions(u.id);
  expect(afterDeactivate).toBeNull();

  await db.user.update({ where: { id: u.id }, data: { isActive: true } });
  await invalidatePermissions(u.id);

  const afterReactivate = await resolvePermissions(u.id);
  expect(afterReactivate).not.toBeNull();
  expect(afterReactivate!.role).toBe("OPS");
});

// ── Test 83 ───────────────────────────────────────────────────────────────────

test("83: resolvePermissions returns null for a non-existent userId", async () => {
  const result = await resolvePermissions("non-existent-user-id-xyz");
  expect(result).toBeNull();
});

// ── Test 84 ───────────────────────────────────────────────────────────────────

test("84: resolvePermissions cache serves stale data before invalidation", async () => {
  const u = await createUser(db, orgId, { role: "SALES" });
  // Prime the cache
  const initial = await resolvePermissions(u.id);
  expect(initial?.role).toBe("SALES");

  // Mutate role directly bypassing cache
  await db.user.update({ where: { id: u.id }, data: { role: "FINANCE" } });

  // Cache still returns old role
  const cached = await resolvePermissions(u.id);
  expect(cached?.role).toBe("SALES");

  // After invalidation, fresh data is returned
  await invalidatePermissions(u.id);
  const fresh = await resolvePermissions(u.id);
  expect(fresh?.role).toBe("FINANCE");

  // Restore role
  await db.user.update({ where: { id: u.id }, data: { role: "SALES" } });
});

// ── Test 85 ───────────────────────────────────────────────────────────────────

test("85: resolvePermissions includes explicitly granted extra permissions", async () => {
  const u = await createUser(db, orgId, { role: "OPS" });
  await db.userPermission.create({
    data: { userId: u.id, permission: "can_approve_invoices" },
  });
  await invalidatePermissions(u.id);

  const perms = await resolvePermissions(u.id);
  expect(perms).not.toBeNull();
  expect(perms!.has("can_approve_invoices")).toBe(true);
});

// ── Test 86 ───────────────────────────────────────────────────────────────────

test("86: resolvePermissions does NOT include revoked extra permissions after invalidation", async () => {
  const u = await createUser(db, orgId, { role: "OPS" });
  await db.userPermission.create({
    data: { userId: u.id, permission: "can_void_invoices" },
  });
  await invalidatePermissions(u.id);

  const withGrant = await resolvePermissions(u.id);
  expect(withGrant!.has("can_void_invoices")).toBe(true);

  // Revoke it
  await db.userPermission.deleteMany({ where: { userId: u.id, permission: "can_void_invoices" } });
  await invalidatePermissions(u.id);

  const afterRevoke = await resolvePermissions(u.id);
  expect(afterRevoke!.has("can_void_invoices")).toBe(false);
});

// ── Test 87 ───────────────────────────────────────────────────────────────────

test("87: deactivated user with extra permissions still returns null from resolvePermissions", async () => {
  const u = await createUser(db, orgId, { role: "ADMIN" });
  await db.userPermission.create({
    data: { userId: u.id, permission: "can_approve_invoices" },
  });
  await db.user.update({ where: { id: u.id }, data: { isActive: false } });
  await invalidatePermissions(u.id);

  const result = await resolvePermissions(u.id);
  expect(result).toBeNull();
});

// ── Test 88 ───────────────────────────────────────────────────────────────────

test("88: concurrent invalidation calls do not corrupt cache state", async () => {
  const u = await createUser(db, orgId, { role: "MANAGER" });
  await resolvePermissions(u.id); // prime cache

  // Fire multiple invalidations concurrently
  await Promise.all([
    invalidatePermissions(u.id),
    invalidatePermissions(u.id),
    invalidatePermissions(u.id),
  ]);

  const result = await resolvePermissions(u.id);
  expect(result).not.toBeNull();
  expect(result!.role).toBe("MANAGER");
});
