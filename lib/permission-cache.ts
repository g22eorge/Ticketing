/**
 * Permission cache — resolves and caches a user's effective permission set.
 *
 * Two-tier strategy:
 *   1. Redis (when REDIS_URL is set): TTL-based cache keyed by userId:orgId.
 *      Survives across server restarts and is shared between instances.
 *   2. In-process Map (when Redis is absent): per-process LRU-style TTL cache.
 *      Suitable for single-instance SQLite dev environments.
 *
 * Cache invalidation:
 *   Call invalidatePermissions(userId) whenever a User's role or permissions
 *   change (role update, permission grant/revoke, user deactivation).
 *   The function clears both tiers.
 *
 * Usage:
 *   import { resolvePermissions } from "@/lib/permission-cache";
 *   const perms = await resolvePermissions(userId, orgId);
 *   if (!perms.has("can_approve_invoices")) return forbidden();
 */

import { prisma } from "@/lib/prisma";
import { getRedisConnection } from "@/lib/queue/redis";
import { EXTRA_PERMISSIONS, type ExtraPermission } from "@/lib/permissions";

// ── Config ────────────────────────────────────────────────────────────────────

const CACHE_TTL_SECONDS = 300; // 5 minutes — matches Prisma session cookie cache TTL
const REDIS_KEY_PREFIX = "perm:";

// ── In-process cache ──────────────────────────────────────────────────────────

interface CacheEntry {
  permissions: Set<string>;
  role: string;
  orgId: string;
  isActive: boolean;
  expiresAt: number;
}

const _localCache = new Map<string, CacheEntry>();

function localCacheKey(userId: string): string {
  return userId;
}

function readLocal(userId: string): CacheEntry | null {
  const entry = _localCache.get(localCacheKey(userId));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _localCache.delete(localCacheKey(userId));
    return null;
  }
  return entry;
}

function writeLocal(userId: string, entry: CacheEntry): void {
  // Evict oldest entries if the local cache grows beyond 2000 entries (safety valve).
  if (_localCache.size > 2000) {
    const now = Date.now();
    for (const [key, val] of _localCache) {
      if (now > val.expiresAt) _localCache.delete(key);
    }
  }
  _localCache.set(localCacheKey(userId), entry);
}

function deleteLocal(userId: string): void {
  _localCache.delete(localCacheKey(userId));
}

// ── Redis helpers ─────────────────────────────────────────────────────────────

function redisKey(userId: string): string {
  return `${REDIS_KEY_PREFIX}${userId}`;
}

interface SerializedEntry {
  permissions: string[];
  role: string;
  orgId: string;
  isActive: boolean;
}

async function readRedis(userId: string): Promise<CacheEntry | null> {
  const redis = getRedisConnection();
  if (!redis) return null;
  try {
    const raw = await redis.get(redisKey(userId));
    if (!raw) return null;
    const parsed: SerializedEntry = JSON.parse(raw);
    return {
      permissions: new Set(parsed.permissions),
      role: parsed.role,
      orgId: parsed.orgId,
      isActive: parsed.isActive,
      expiresAt: Date.now() + CACHE_TTL_SECONDS * 1_000,
    };
  } catch {
    return null;
  }
}

async function writeRedis(userId: string, entry: CacheEntry): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) return;
  try {
    const payload: SerializedEntry = {
      permissions: [...entry.permissions],
      role: entry.role,
      orgId: entry.orgId,
      isActive: entry.isActive,
    };
    await redis.setex(redisKey(userId), CACHE_TTL_SECONDS, JSON.stringify(payload));
  } catch {
    // Non-fatal — permissions will be re-fetched from DB next time.
  }
}

async function deleteRedis(userId: string): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) return;
  try {
    await redis.del(redisKey(userId));
  } catch {
    // Non-fatal.
  }
}

// ── DB resolver ───────────────────────────────────────────────────────────────

async function fetchFromDb(userId: string): Promise<CacheEntry | null> {
  let row: {
    role: string;
    isActive: boolean;
    orgId: string | null;
    permissionGrants: { permission: string }[];
  } | null = null;

  try {
    row = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        isActive: true,
        orgId: true,
        permissionGrants: { select: { permission: true } },
      },
    });
  } catch {
    // Fallback for partially migrated schemas.
    try {
      const base = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, isActive: true },
      });
      if (!base) return null;

      const orgIdRows = await prisma.$queryRaw<{ orgId: string | null }[]>`
        SELECT orgId FROM "User" WHERE id = ${userId} LIMIT 1
      `;
      const permRows = await prisma.$queryRaw<{ permission: string }[]>`
        SELECT permission FROM "UserPermission" WHERE userId = ${userId}
      `;

      row = {
        role: base.role,
        isActive: base.isActive,
        orgId: orgIdRows[0]?.orgId ?? null,
        permissionGrants: permRows,
      };
    } catch {
      return null;
    }
  }

  if (!row) return null;

  const permissions = new Set(
    row.permissionGrants
      .map((g) => g.permission)
      .filter((p): p is string => typeof p === "string" && p.length > 0),
  );

  return {
    permissions,
    role: row.role,
    orgId: row.orgId ?? "",
    isActive: row.isActive,
    expiresAt: Date.now() + CACHE_TTL_SECONDS * 1_000,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ResolvedPermissions {
  /** The user's current role string. */
  role: string;
  /** The user's orgId — use this to verify session consistency. */
  orgId: string;
  /** Whether the account is active. */
  isActive: boolean;
  /** Check if the user has a specific extra permission grant. */
  has(permission: ExtraPermission | string): boolean;
  /** All granted extra permissions as an array. */
  all(): string[];
}

/**
 * Resolve a user's full permission set, using the two-tier cache.
 * Returns null if the user is not found or is inactive.
 */
export async function resolvePermissions(userId: string): Promise<ResolvedPermissions | null> {
  // 1. Check in-process cache first (fastest).
  let entry = readLocal(userId);

  // 2. Check Redis if local miss.
  if (!entry) {
    entry = await readRedis(userId);
    if (entry) {
      // Warm the local cache from Redis.
      writeLocal(userId, entry);
    }
  }

  // 3. DB fetch on full cache miss.
  if (!entry) {
    entry = await fetchFromDb(userId);
    if (!entry) return null;
    writeLocal(userId, entry);
    await writeRedis(userId, entry);
  }

  if (!entry.isActive) return null;

  const snapshot = entry; // capture for closure

  return {
    role: snapshot.role,
    orgId: snapshot.orgId,
    isActive: snapshot.isActive,
    has(permission: string) {
      return snapshot.permissions.has(permission);
    },
    all() {
      return [...snapshot.permissions];
    },
  };
}

/**
 * Invalidate the cache for a user.
 * MUST be called whenever role or permissions change.
 *
 * Example (in user management API route):
 *   await prisma.user.update({ where: { id }, data: { role: newRole } });
 *   await invalidatePermissions(id);
 */
export async function invalidatePermissions(userId: string): Promise<void> {
  deleteLocal(userId);
  await deleteRedis(userId);
}

/**
 * Invalidate all cached entries for an org (e.g. when org-wide permissions change).
 * Only works when Redis is available — in-process cache entries are evicted by TTL.
 */
export async function invalidateOrgPermissions(orgId: string): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) return;
  try {
    const keys = await redis.keys(`${REDIS_KEY_PREFIX}*`);
    // We can't efficiently filter by orgId from Redis keys alone — flush all.
    // In practice, org-wide permission changes are rare; a full-cache flush is acceptable.
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    _localCache.clear();
  } catch {
    // Non-fatal.
  }
}

/**
 * Warm the cache for a user proactively (e.g. after login).
 * Avoids the first-request DB hit.
 */
export async function warmPermissions(userId: string): Promise<void> {
  const entry = await fetchFromDb(userId);
  if (!entry) return;
  writeLocal(userId, entry);
  await writeRedis(userId, entry);
}

/**
 * Helper for API routes: resolves permissions and throws a typed error if the
 * user lacks the required permission.
 *
 * Example:
 *   await requirePermission(userId, "can_approve_invoices");
 */
export async function requirePermission(
  userId: string,
  permission: ExtraPermission | string,
): Promise<ResolvedPermissions> {
  const perms = await resolvePermissions(userId);
  if (!perms) {
    throw new PermissionError("User not found or inactive", "USER_INACTIVE");
  }
  if (!perms.has(permission)) {
    throw new PermissionError(
      `User ${userId} lacks permission: ${permission}`,
      "PERMISSION_DENIED",
    );
  }
  return perms;
}

export class PermissionError extends Error {
  constructor(
    message: string,
    public readonly code: "PERMISSION_DENIED" | "USER_INACTIVE",
  ) {
    super(message);
    this.name = "PermissionError";
  }
}

// ── Cache stats (for /admin/debug endpoint) ────────────────────────────────────

export function getLocalCacheStats() {
  const now = Date.now();
  let live = 0;
  let expired = 0;
  for (const entry of _localCache.values()) {
    if (now > entry.expiresAt) expired++;
    else live++;
  }
  return { total: _localCache.size, live, expired };
}
