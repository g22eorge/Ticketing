import { prisma } from "@/lib/prisma";

let tableEnsured = false;

async function ensureTable() {
  if (tableEnsured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PlatformSetting" (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  tableEnsured = true;
}

export async function getPlatformSetting(key: string): Promise<string | null> {
  try {
    await ensureTable();
    const rows = await prisma.$queryRaw<Array<{ value: string }>>`
      SELECT value FROM "PlatformSetting" WHERE key = ${key} LIMIT 1
    `;
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

export async function setPlatformSetting(key: string, value: string): Promise<void> {
  await ensureTable();
  await prisma.$executeRaw`
    INSERT INTO "PlatformSetting" (key, value, updatedAt)
    VALUES (${key}, ${value}, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = CURRENT_TIMESTAMP
  `;
}

export async function deletePlatformSetting(key: string): Promise<void> {
  await ensureTable();
  await prisma.$executeRaw`DELETE FROM "PlatformSetting" WHERE key = ${key}`;
}

export async function getPlatformSettings(keys: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  try {
    await ensureTable();
    for (const key of keys) {
      const rows = await prisma.$queryRaw<Array<{ value: string }>>`
        SELECT value FROM "PlatformSetting" WHERE key = ${key} LIMIT 1
      `;
      if (rows[0]) result[key] = rows[0].value;
    }
  } catch {
    // return partial result
  }
  return result;
}

// ── Pesapal ──────────────────────────────────────────────────────────────────

export async function getPesapalConsumerKey(): Promise<string | null> {
  const db = await getPlatformSetting("PESAPAL_CONSUMER_KEY");
  return db ?? process.env.PESAPAL_CONSUMER_KEY ?? null;
}

export async function getPesapalConsumerSecret(): Promise<string | null> {
  const db = await getPlatformSetting("PESAPAL_CONSUMER_SECRET");
  return db ?? process.env.PESAPAL_CONSUMER_SECRET ?? null;
}
