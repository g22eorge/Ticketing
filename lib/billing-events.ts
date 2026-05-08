import { prisma } from "@/lib/prisma";

export interface BillingEvent {
  id: string;
  orgId: string;
  orgName?: string;
  event: string;
  amount: number;
  currency: string;
  status: string;
  flwTxId: string | null;
  txRef: string | null;
  plan: string | null;
  createdAt: Date;
}

let tableEnsured = false;

async function ensureTable() {
  if (tableEnsured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "BillingEvent" (
      id TEXT PRIMARY KEY,
      orgId TEXT NOT NULL,
      event TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'UGX',
      status TEXT NOT NULL,
      flwTxId TEXT,
      txRef TEXT,
      plan TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  tableEnsured = true;
}

export async function recordBillingEvent(params: {
  orgId: string;
  event: string;
  amount: number;
  currency: string;
  status: string;
  flwTxId?: string | null;
  txRef?: string | null;
  plan?: string | null;
}): Promise<void> {
  await ensureTable();
  const id = crypto.randomUUID().replace(/-/g, "");
  await prisma.$executeRaw`
    INSERT INTO "BillingEvent" (id, orgId, event, amount, currency, status, flwTxId, txRef, plan)
    VALUES (${id}, ${params.orgId}, ${params.event}, ${params.amount}, ${params.currency},
            ${params.status}, ${params.flwTxId ?? null}, ${params.txRef ?? null}, ${params.plan ?? null})
  `;
}

export async function getRecentBillingEvents(limit = 100): Promise<BillingEvent[]> {
  try {
    await ensureTable();
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT be.id, be.orgId, be.event, be.amount, be.currency, be.status,
             be.flwTxId, be.txRef, be.plan, be.createdAt,
             o.name as orgName
      FROM "BillingEvent" be
      LEFT JOIN "Organization" o ON o.id = be.orgId
      ORDER BY be.createdAt DESC
      LIMIT ${limit}
    `;
    return rows.map(rowToBillingEvent);
  } catch {
    return [];
  }
}

export async function getBillingEventsByOrg(orgId: string): Promise<BillingEvent[]> {
  try {
    await ensureTable();
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM "BillingEvent" WHERE orgId = ${orgId} ORDER BY createdAt DESC LIMIT 30
    `;
    return rows.map(rowToBillingEvent);
  } catch {
    return [];
  }
}

export async function getTotalRevenue(): Promise<number> {
  try {
    await ensureTable();
    const rows = await prisma.$queryRaw<Array<{ total: number }>>`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM "BillingEvent"
      WHERE status = 'successful' AND event = 'charge.completed'
    `;
    return Number(rows[0]?.total ?? 0);
  } catch {
    return 0;
  }
}

export async function getMonthlyRevenue(): Promise<number> {
  try {
    await ensureTable();
    const rows = await prisma.$queryRaw<Array<{ total: number }>>`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM "BillingEvent"
      WHERE status = 'successful'
        AND event = 'charge.completed'
        AND createdAt >= date('now', 'start of month')
    `;
    return Number(rows[0]?.total ?? 0);
  } catch {
    return 0;
  }
}

function rowToBillingEvent(r: Record<string, unknown>): BillingEvent {
  return {
    id: String(r.id),
    orgId: String(r.orgId),
    orgName: r.orgName ? String(r.orgName) : undefined,
    event: String(r.event),
    amount: Number(r.amount),
    currency: String(r.currency),
    status: String(r.status),
    flwTxId: r.flwTxId ? String(r.flwTxId) : null,
    txRef: r.txRef ? String(r.txRef) : null,
    plan: r.plan ? String(r.plan) : null,
    createdAt: new Date(String(r.createdAt)),
  };
}
