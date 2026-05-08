import { prisma } from "@/lib/prisma";

export interface OrgWhatsAppConfig {
  orgId: string;
  businessNumber: string;
  phoneNumberId: string;
  accessToken: string;
  businessAccountId: string;
  provider: string;
}

let tableEnsured = false;

async function ensureTable() {
  if (tableEnsured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "OrgWhatsAppConfig" (
      orgId TEXT PRIMARY KEY,
      businessNumber TEXT NOT NULL,
      phoneNumberId TEXT NOT NULL,
      accessToken TEXT NOT NULL,
      businessAccountId TEXT,
      provider TEXT NOT NULL DEFAULT 'meta',
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  tableEnsured = true;
}

export async function getOrgWhatsAppConfig(orgId: string): Promise<OrgWhatsAppConfig | null> {
  try {
    await ensureTable();
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM "OrgWhatsAppConfig" WHERE orgId = ${orgId} LIMIT 1
    `;
    if (!rows[0]) return null;
    return {
      orgId: String(rows[0].orgId),
      businessNumber: String(rows[0].businessNumber),
      phoneNumberId: String(rows[0].phoneNumberId),
      accessToken: String(rows[0].accessToken),
      businessAccountId: rows[0].businessAccountId ? String(rows[0].businessAccountId) : "",
      provider: String(rows[0].provider ?? "meta"),
    };
  } catch {
    return null;
  }
}

export async function saveOrgWhatsAppConfig(
  orgId: string,
  config: Omit<OrgWhatsAppConfig, "orgId">,
): Promise<void> {
  await ensureTable();
  await prisma.$executeRaw`
    INSERT INTO "OrgWhatsAppConfig" (orgId, businessNumber, phoneNumberId, accessToken, businessAccountId, provider, updatedAt)
    VALUES (${orgId}, ${config.businessNumber}, ${config.phoneNumberId}, ${config.accessToken}, ${config.businessAccountId || null}, ${config.provider}, CURRENT_TIMESTAMP)
    ON CONFLICT(orgId) DO UPDATE SET
      businessNumber = excluded.businessNumber,
      phoneNumberId = excluded.phoneNumberId,
      accessToken = excluded.accessToken,
      businessAccountId = excluded.businessAccountId,
      provider = excluded.provider,
      updatedAt = CURRENT_TIMESTAMP
  `;
}

export async function deleteOrgWhatsAppConfig(orgId: string): Promise<void> {
  await ensureTable();
  await prisma.$executeRaw`DELETE FROM "OrgWhatsAppConfig" WHERE orgId = ${orgId}`;
}
