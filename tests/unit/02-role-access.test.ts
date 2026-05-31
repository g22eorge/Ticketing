/**
 * Group 2 — Permission-cache tests (tests 11–20)
 *
 * Verifies the permission-cache module: resolvePermissions, invalidatePermissions,
 * requirePermission, warmPermissions, and PermissionError behaviour.
 */

import { test, expect, beforeAll, afterAll } from "bun:test";
import {
  resolvePermissions,
  invalidatePermissions,
  requirePermission,
  warmPermissions,
  PermissionError,
} from "@/lib/permission-cache";
import { setupTestDb, teardownTestDb, createOrg, createUser, type PrismaClient } from "./helpers";

let db: PrismaClient;
let orgId: string;

beforeAll(async () => {
  db = await setupTestDb();
  const org = await createOrg(db, "perm-cache");
  orgId = org.id;
});

afterAll(teardownTestDb);

// ── Test 11 ───────────────────────────────────────────────────────────────────

test("11: resolvePermissions returns null for non-existent userId", async () => {
  const result = await resolvePermissions("non-existent-user-id-000000");
  expect(result).toBeNull();
});

// ── Test 12 ───────────────────────────────────────────────────────────────────

test("12: resolvePermissions returns role and empty permissions for a basic user", async () => {
  const user = await createUser(db, orgId, { role: "OPS" });

  const resolved = await resolvePermissions(user.id);

  expect(resolved).not.toBeNull();
  expect(resolved!.role).toBe("OPS");
  expect(resolved!.has("any_permission")).toBe(false);
});

// ── Test 13 ───────────────────────────────────────────────────────────────────

test("13: resolvePermissions includes granted permissions", async () => {
  const user = await createUser(db, orgId, { role: "OPS" });

  await db.userPermission.create({
    data: { userId: user.id, permission: "can_generate_invoice" },
  });

  await invalidatePermissions(user.id);
  const resolved = await resolvePermissions(user.id);

  expect(resolved).not.toBeNull();
  expect(resolved!.has("can_generate_invoice")).toBe(true);
  expect(resolved!.has("can_manage_users")).toBe(false);
});

// ── Test 14 ───────────────────────────────────────────────────────────────────

test("14: resolvePermissions returns null for inactive user (isActive: false)", async () => {
  const user = await createUser(db, orgId, {
    role: "OPS",
    isActive: false,
  });

  const resolved = await resolvePermissions(user.id);

  expect(resolved).toBeNull();
});

// ── Test 15 ───────────────────────────────────────────────────────────────────

test("15: cache returns stale data before invalidation after direct DB mutation", async () => {
  const user = await createUser(db, orgId, {
    role: "TECHNICIAN_INTERNAL",
  });

  // Warm the cache with an initial resolve (no permissions yet).
  const first = await resolvePermissions(user.id);
  expect(first).not.toBeNull();
  expect(first!.has("can_run_diagnostics")).toBe(false);

  // Mutate DB directly — bypass permission-cache.
  await db.userPermission.create({
    data: { userId: user.id, permission: "can_run_diagnostics" },
  });

  // Cache should still return the stale (old) value.
  const stale = await resolvePermissions(user.id);
  expect(stale!.has("can_run_diagnostics")).toBe(false);
});

// ── Test 16 ───────────────────────────────────────────────────────────────────

test("16: after invalidatePermissions, resolvePermissions reflects new permissions", async () => {
  const user = await createUser(db, orgId, {
    role: "TECHNICIAN_INTERNAL",
  });

  // Prime the cache.
  await resolvePermissions(user.id);

  // Add a permission directly in DB.
  await db.userPermission.create({
    data: { userId: user.id, permission: "can_close_jobs" },
  });

  // Invalidate, then re-resolve.
  await invalidatePermissions(user.id);
  const fresh = await resolvePermissions(user.id);

  expect(fresh).not.toBeNull();
  expect(fresh!.has("can_close_jobs")).toBe(true);
});

// ── Test 17 ───────────────────────────────────────────────────────────────────

test("17: requirePermission throws PermissionError when user lacks the permission", async () => {
  const user = await createUser(db, orgId, {
    role: "OPS",
  });

  await invalidatePermissions(user.id);

  await expect(
    requirePermission(user.id, "can_manage_users"),
  ).rejects.toBeInstanceOf(PermissionError);
});

// ── Test 18 ───────────────────────────────────────────────────────────────────

test("18: requirePermission resolves when user has the permission", async () => {
  const user = await createUser(db, orgId, {
    role: "OPS",
  });

  await db.userPermission.create({
    data: { userId: user.id, permission: "can_approve_quotes" },
  });

  await invalidatePermissions(user.id);

  const resolved = await requirePermission(user.id, "can_approve_quotes");

  expect(resolved).not.toBeNull();
  expect(resolved.has("can_approve_quotes")).toBe(true);
});

// ── Test 19 ───────────────────────────────────────────────────────────────────

test("19: warmPermissions pre-populates cache so second call returns data without DB hit", async () => {
  const user = await createUser(db, orgId, {
    role: "ADMIN",
  });

  await db.userPermission.create({
    data: { userId: user.id, permission: "can_view_reports" },
  });

  // Warm the cache explicitly.
  await warmPermissions(user.id);

  // Mutate DB — but cache should serve the warmed data.
  await db.userPermission.create({
    data: { userId: user.id, permission: "can_export_data" },
  });

  // The cached (warmed) result should NOT include the post-warm mutation.
  const cached = await resolvePermissions(user.id);
  expect(cached).not.toBeNull();
  expect(cached!.has("can_view_reports")).toBe(true);
  expect(cached!.has("can_export_data")).toBe(false);

  // After invalidation the fresh resolve picks up both permissions.
  await invalidatePermissions(user.id);
  const fresh = await resolvePermissions(user.id);
  expect(fresh!.has("can_export_data")).toBe(true);
});

// ── Test 20 ───────────────────────────────────────────────────────────────────

test("20: resolvePermissions returns correct role for each user role value", async () => {
  const roles = [
    "ADMIN",
    "TECHNICIAN_INTERNAL",
    "TECHNICIAN_EXTERNAL",
    "OPS",
  ] as const;

  for (const role of roles) {
    const user = await createUser(db, orgId, {
      role,
    });

    await invalidatePermissions(user.id);
    const resolved = await resolvePermissions(user.id);

    expect(resolved).not.toBeNull();
    expect(resolved!.role).toBe(role);
  }
});
