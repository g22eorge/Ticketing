/**
 * Production User Setup for Turso DB
 * Creates: org + admin users with credentials
 * Idempotent — safe to re-run.
 *
 * Usage:
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... bun scripts/setup-prod-users.mjs
 *
 * Or with custom users:
 *   PROD_USERS='[{"name":"George","email":"george@eagleinfosolutions.com","role":"ADMIN"},{"name":"Brian","email":"brian@businessos.ug","role":"ADMIN"}]' \
 *   PROD_ADMIN_PASSWORD='BusinessOs123!' bun scripts/setup-prod-users.mjs
 */
import { createClient } from "@libsql/client";
import { randomUUID } from "node:crypto";
import { hashPassword } from "@better-auth/utils/password";

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN");
  process.exit(1);
}

const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

const ORG_NAME = process.env.PROD_ORG_NAME || "Eagle Info Solutions";
const ORG_SLUG = process.env.PROD_ORG_SLUG || "eagle-info";
const ADMIN_PASSWORD = process.env.PROD_ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
  console.error("PROD_ADMIN_PASSWORD is required (set it as an env var)");
  process.exit(1);
}

const DEFAULT_USERS = [
  { name: "George", email: "george@eagleinfosolutions.com", role: "ADMIN" },
  { name: "Brian", email: "brian@businessos.ug", role: "ADMIN" },
];

let USERS;
try {
  USERS = process.env.PROD_USERS ? JSON.parse(process.env.PROD_USERS) : DEFAULT_USERS;
} catch {
  USERS = DEFAULT_USERS;
}

async function main() {
  console.log(`Setting up production users in Turso:`);
  console.log(`  DB: ${TURSO_URL}`);
  console.log(`  Org: ${ORG_NAME} (${ORG_SLUG})`);
  console.log(`  Users: ${USERS.map(u => u.email).join(", ")}`);
  console.log();

  let orgId;
  const orgRes = await client.execute({ sql: "SELECT id FROM Organization WHERE slug = ?", args: [ORG_SLUG] });
  if (orgRes.rows.length > 0) {
    orgId = orgRes.rows[0].id;
    await client.execute({
      sql: `UPDATE Organization SET name = ?, isActive = 1, billingStatus = 'ACTIVE', plan = 'ENTERPRISE', updatedAt = datetime('now') WHERE id = ?`,
      args: [ORG_NAME, orgId],
    });
    console.log(`Organization: ${ORG_NAME} (${orgId}) [updated]`);
  } else {
    orgId = randomUUID();
    await client.execute({
      sql: `INSERT INTO Organization (id, name, slug, isActive, billingStatus, plan, createdAt, updatedAt)
            VALUES (?, ?, ?, 1, 'ACTIVE', 'ENTERPRISE', datetime('now'), datetime('now'))`,
      args: [orgId, ORG_NAME, ORG_SLUG],
    });
    console.log(`Organization: ${ORG_NAME} (${orgId}) [created]`);
  }

  const existingBranding = await client.execute({ sql: "SELECT id FROM DocumentBrandingSettings WHERE orgId = ?", args: [orgId] });
  if (existingBranding.rows.length === 0) {
    await client.execute({
      sql: `INSERT INTO DocumentBrandingSettings (id, orgId, updatedAt) VALUES (?, ?, datetime('now'))`,
      args: [randomUUID(), orgId],
    });
    console.log("DocumentBrandingSettings created");
  }

  const hashedPassword = await hashPassword(ADMIN_PASSWORD);
  console.log("Password hash generated\n");

  for (const u of USERS) {
    const existingUser = await client.execute({ sql: "SELECT id FROM User WHERE email = ?", args: [u.email] });
    let userId;

    if (existingUser.rows.length > 0) {
      userId = existingUser.rows[0].id;
      await client.execute({
        sql: `UPDATE User SET name = ?, role = ?, orgId = ?, isActive = 1, emailVerified = 1, updatedAt = datetime('now') WHERE id = ?`,
        args: [u.name, u.role, orgId, userId],
      });
      console.log(`${u.name} (${u.email}) [updated]`);
    } else {
      userId = randomUUID();
      await client.execute({
        sql: `INSERT INTO User (id, email, name, role, orgId, isActive, emailVerified, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, 1, 1, datetime('now'), datetime('now'))`,
        args: [userId, u.email, u.name, u.role, orgId],
      });
      console.log(`${u.name} (${u.email}) [created]`);
    }

    const existingAccount = await client.execute({
      sql: "SELECT id FROM Account WHERE userId = ? AND providerId = 'credential'",
      args: [userId],
    });

    if (existingAccount.rows.length > 0) {
      await client.execute({
        sql: `UPDATE Account SET accountId = ?, password = ?, updatedAt = datetime('now') WHERE id = ?`,
        args: [u.email, hashedPassword, existingAccount.rows[0].id],
      });
      console.log(`  account: accountId=${u.email} [updated]`);
    } else {
      await client.execute({
        sql: `INSERT INTO Account (id, accountId, providerId, userId, password, createdAt, updatedAt)
              VALUES (?, ?, 'credential', ?, ?, datetime('now'), datetime('now'))`,
        args: [randomUUID(), u.email, userId, hashedPassword],
      });
      console.log(`  account: accountId=${u.email} [created]`);
    }

    const existingNP = await client.execute({ sql: "SELECT id FROM NotificationPreferences WHERE userId = ?", args: [userId] });
    if (existingNP.rows.length === 0) {
      await client.execute({
        sql: `INSERT INTO NotificationPreferences (id, userId, createdAt, updatedAt) VALUES (?, ?, datetime('now'), datetime('now'))`,
        args: [randomUUID(), userId],
      });
      console.log(`  NotificationPreferences created`);
    }
    console.log();
  }

  console.log("══════════════════════════════════════════════════");
  console.log("  Production user setup complete");
  console.log("══════════════════════════════════════════════════");
  for (const u of USERS) {
    console.log(`  Login:    ${u.email}`);
    console.log(`  Password: (set via PROD_ADMIN_PASSWORD)`);
    console.log(`  Role:     ${u.role}`);
  }
  console.log(`  Org:      ${ORG_NAME}`);
  console.log("══════════════════════════════════════════════════");
}

main().catch(e => { console.error("Setup failed:", e.message || e); process.exit(1); });
