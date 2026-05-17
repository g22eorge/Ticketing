/**
 * Shared test helpers for unit tests.
 *
 * DATABASE_URL must point to a SQLite file that has the main schema applied.
 * Run `bun run test:setup` on a new machine before `bun run test:unit`.
 */

import { PrismaClient } from "@prisma/client";
export type { PrismaClient };

process.env.TURSO_DATABASE_URL = "";
process.env.TURSO_AUTH_TOKEN = "";
process.env.ALLOW_SQLITE_PRODUCTION = "1";

let _testPrisma: PrismaClient | null = null;

export function getTestPrisma(): PrismaClient {
  if (!_testPrisma) {
    _testPrisma = new PrismaClient({ log: [] });
  }
  return _testPrisma;
}

export async function setupTestDb(): Promise<PrismaClient> {
  const db = getTestPrisma();
  await db.$connect();
  return db;
}

export async function teardownTestDb(): Promise<void> {
  await _testPrisma?.$disconnect();
  _testPrisma = null;
}

export async function createOrg(db: PrismaClient, slug: string) {
  return db.organization.create({
    data: {
      name: `Org ${slug}`,
      slug: `${slug}-${Math.random().toString(36).slice(2)}`,
    },
  });
}

export async function createUser(
  db: PrismaClient,
  orgId: string,
  opts: { role?: string; email?: string; isActive?: boolean } = {},
) {
  return db.user.create({
    data: {
      name: "Test User",
      email: opts.email ?? `user-${Math.random().toString(36).slice(2)}@test.local`,
      orgId,
      role: (opts.role ?? "OPS") as never,
      ...(opts.isActive !== undefined ? { isActive: opts.isActive } : {}),
    } as never,
  });
}

export async function createPart(
  db: PrismaClient,
  orgId: string,
  opts: { sku?: string; qty?: number } = {},
) {
  return db.part.create({
    data: {
      sku: opts.sku ?? `SKU-${Math.random().toString(36).slice(2)}`,
      name: "Test Part",
      qtyOnHand: opts.qty ?? 0,
      orgId,
    } as never,
  });
}

export async function createLocation(db: PrismaClient, orgId: string, name = "Main Store") {
  return db.stockLocation.create({
    data: {
      orgId,
      name,
      code: `LOC-${Math.random().toString(36).slice(2)}`,
    } as never,
  });
}

export async function seedLocationStock(
  db: PrismaClient,
  orgId: string,
  partId: string,
  locationId: string,
  qtyOnHand: number,
  qtyReserved = 0,
) {
  return db.partLocationStock.upsert({
    where: { partId_locationId: { partId, locationId } },
    create: { orgId, partId, locationId, qtyOnHand, qtyReserved },
    update: { qtyOnHand, qtyReserved },
  } as never);
}

export async function createTestJob(
  db: PrismaClient,
  orgId: string,
  userId: string,
): Promise<{ id: string } | null> {
  try {
    const client = await db.client.create({
      data: {
        fullName: `Client-${Date.now()}`,
        phone: `${Date.now()}${Math.floor(Math.random() * 1000)}`,
        orgId,
      } as never,
    });
    const job = await db.job.create({
      data: {
        orgId,
        jobNumber: `TEST-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        status: "RECEIVED",
        clientId: client.id,
        createdById: userId,
        deviceType: "PHONE_ANDROID",
        brand: "Test",
        model: "Device",
        issueDescription: "Test issue",
      } as never,
    });
    return job as { id: string };
  } catch {
    return null;
  }
}
