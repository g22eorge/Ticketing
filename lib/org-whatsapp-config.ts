import { prisma } from "@/lib/prisma";
import { getTableColumns } from "@/lib/db-utils";

export interface OrgWhatsAppConfig {
  orgId: string;
  businessNumber: string;
  phoneNumberId: string;
  accessToken: string;
  businessAccountId: string;
  provider: string;
  // Africa's Talking SMS
  atApiKey: string | null;
  atUsername: string | null;
  atSenderId: string | null;
  smsFallback: boolean;
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
  const existingColumns = await getTableColumns("OrgWhatsAppConfig");
  const atCols: [string, string][] = [
    ["atApiKey", "TEXT"],
    ["atUsername", "TEXT"],
    ["atSenderId", "TEXT"],
    ["smsFallback", "INTEGER NOT NULL DEFAULT 0"],
  ];
  for (const [col, def] of atCols) {
    if (!existingColumns.has(col)) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "OrgWhatsAppConfig" ADD COLUMN ${col} ${def}`).catch(() => {});
    }
  }
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
      atApiKey: rows[0].atApiKey ? String(rows[0].atApiKey) : null,
      atUsername: rows[0].atUsername ? String(rows[0].atUsername) : null,
      atSenderId: rows[0].atSenderId ? String(rows[0].atSenderId) : null,
      smsFallback: Boolean(rows[0].smsFallback),
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
    INSERT INTO "OrgWhatsAppConfig" (orgId, businessNumber, phoneNumberId, accessToken, businessAccountId, provider, atApiKey, atUsername, atSenderId, smsFallback, updatedAt)
    VALUES (${orgId}, ${config.businessNumber}, ${config.phoneNumberId}, ${config.accessToken}, ${config.businessAccountId || null}, ${config.provider}, ${config.atApiKey ?? null}, ${config.atUsername ?? null}, ${config.atSenderId ?? null}, ${config.smsFallback ? 1 : 0}, CURRENT_TIMESTAMP)
    ON CONFLICT(orgId) DO UPDATE SET
      businessNumber = excluded.businessNumber,
      phoneNumberId = excluded.phoneNumberId,
      accessToken = excluded.accessToken,
      businessAccountId = excluded.businessAccountId,
      provider = excluded.provider,
      atApiKey = excluded.atApiKey,
      atUsername = excluded.atUsername,
      atSenderId = excluded.atSenderId,
      smsFallback = excluded.smsFallback,
      updatedAt = CURRENT_TIMESTAMP
  `;
}

export async function setOrgAtSenderId(orgId: string, senderId: string | null): Promise<void> {
  await ensureTable();
  // Upsert: create a stub row if none exists, otherwise just update atSenderId
  await prisma.$executeRaw`
    INSERT INTO "OrgWhatsAppConfig" (orgId, businessNumber, phoneNumberId, accessToken, businessAccountId, provider, atSenderId, updatedAt)
    VALUES (${orgId}, '', '', '', null, 'meta', ${senderId ?? null}, CURRENT_TIMESTAMP)
    ON CONFLICT(orgId) DO UPDATE SET atSenderId = ${senderId ?? null}, updatedAt = CURRENT_TIMESTAMP
  `;
}

export async function deleteOrgWhatsAppConfig(orgId: string): Promise<void> {
  await ensureTable();
  await prisma.$executeRaw`DELETE FROM "OrgWhatsAppConfig" WHERE orgId = ${orgId}`;
}
