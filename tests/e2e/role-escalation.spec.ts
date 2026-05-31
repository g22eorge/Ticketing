/**
 * E2E: Role escalation — authenticated wrong-role users get 403
 *
 * Seeds two users in the same org: one TECHNICIAN_EXTERNAL and one SALES.
 * Attempts to access admin-only and finance-only API endpoints while
 * authenticated as each restricted role.
 * Expects 403 (or 404 for org-scoped not-found) — never 200.
 */

import { expect, test } from "@playwright/test";
import { OrgModule, PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";

process.env.DATABASE_URL = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";
const password = process.env.E2E_PASSWORD ?? "Tenant123!";

async function ensureAccount(userId: string) {
  const passwordHash = await hashPassword(password);
  const existing = await prisma.account.findFirst({
    where: { userId, providerId: "credential" },
    select: { id: true },
  });
  if (existing) {
    await prisma.account.update({ where: { id: existing.id }, data: { password: passwordHash } });
    return;
  }
  await prisma.account.create({
    data: { userId, accountId: userId, providerId: "credential", password: passwordHash },
  });
}

async function seedFixture() {
  const org = await prisma.organization.upsert({
    where: { slug: "e2e-role-escalation" },
    update: { name: "E2E Role Escalation Org", billingStatus: "ACTIVE", plan: "STARTER" },
    create: {
      slug: "e2e-role-escalation",
      name: "E2E Role Escalation Org",
      billingStatus: "ACTIVE",
      plan: "STARTER",
    },
  });

  await prisma.orgModuleGrant.deleteMany({ where: { orgId: org.id } });
  await prisma.orgModuleGrant.createMany({
    data: Object.values(OrgModule).map((module) => ({ orgId: org.id, module })),
  });

  const extTech = await prisma.user.upsert({
    where: { email: "e2e-ext-tech@example.invalid" },
    update: { orgId: org.id, role: "TECHNICIAN_EXTERNAL", isActive: true, emailVerified: true },
    create: {
      orgId: org.id,
      name: "E2E External Tech",
      email: "e2e-ext-tech@example.invalid",
      role: "TECHNICIAN_EXTERNAL",
      isActive: true,
      emailVerified: true,
    },
  });

  const salesUser = await prisma.user.upsert({
    where: { email: "e2e-sales-user@example.invalid" },
    update: { orgId: org.id, role: "SALES", isActive: true, emailVerified: true },
    create: {
      orgId: org.id,
      name: "E2E Sales User",
      email: "e2e-sales-user@example.invalid",
      role: "SALES",
      isActive: true,
      emailVerified: true,
    },
  });

  await Promise.all([ensureAccount(extTech.id), ensureAccount(salesUser.id)]);

  return { org, extTech, salesUser };
}

async function loginAs(email: string): Promise<string | null> {
  for (let attempt = 1; attempt <= 15; attempt++) {
    const res = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        origin: baseUrl,
      },
      body: JSON.stringify({ email, password, callbackURL: "/dashboard" }),
    });
    if (res.ok) {
      return res.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
    }
    if (res.status === 429) await new Promise((r) => setTimeout(r, 2000));
    else await new Promise((r) => setTimeout(r, 350));
  }
  return null;
}

test.describe("Role escalation — restricted roles cannot access privileged APIs", () => {
  let extTechCookies: string;
  let salesCookies: string;

  test.beforeAll(async () => {
    await seedFixture();
    extTechCookies = (await loginAs("e2e-ext-tech@example.invalid")) ?? "";
    salesCookies = (await loginAs("e2e-sales-user@example.invalid")) ?? "";

    expect(extTechCookies, "External tech login failed").toBeTruthy();
    expect(salesCookies, "Sales user login failed").toBeTruthy();
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  // ── TECHNICIAN_EXTERNAL role ────────────────────────────────────────────────

  test("TECHNICIAN_EXTERNAL cannot access /api/settings/users (user management)", async ({ request }) => {
    const res = await request.get(`${baseUrl}/api/settings/users`, {
      headers: { cookie: extTechCookies },
    });
    expect([403, 404, 401]).toContain(res.status());
    expect(res.status()).not.toBe(200);
  });

  test("TECHNICIAN_EXTERNAL cannot access /api/reports (financial reports)", async ({ request }) => {
    const res = await request.get(`${baseUrl}/api/reports`, {
      headers: { cookie: extTechCookies },
    });
    expect([403, 404, 401]).toContain(res.status());
    expect(res.status()).not.toBe(200);
  });

  test("TECHNICIAN_EXTERNAL cannot list all clients via /api/clients", async ({ request }) => {
    const res = await request.get(`${baseUrl}/api/clients`, {
      headers: { cookie: extTechCookies },
    });
    // Should be 403 or 404 (route may not exist as a direct API)
    expect(res.status()).not.toBe(200);
  });

  test("TECHNICIAN_EXTERNAL cannot access platform admin routes", async ({ request }) => {
    const res = await request.get(`${baseUrl}/api/platform/orgs`, {
      headers: { cookie: extTechCookies },
    });
    expect([403, 404, 401]).toContain(res.status());
    expect(res.status()).not.toBe(200);
  });

  // ── SALES role ───────────────────────────────────────────────────────────────

  test("SALES user cannot access /api/settings/users (user management)", async ({ request }) => {
    const res = await request.get(`${baseUrl}/api/settings/users`, {
      headers: { cookie: salesCookies },
    });
    expect([403, 404, 401]).toContain(res.status());
    expect(res.status()).not.toBe(200);
  });

  test("SALES user cannot POST to adjust stock (inventory write)", async ({ request }) => {
    const res = await request.post(`${baseUrl}/api/inventory/adjustments`, {
      headers: { cookie: salesCookies, "content-type": "application/json" },
      data: { partId: "fake-part-id", locationId: "fake-loc-id", delta: 10, reason: "QA test" },
    });
    expect([400, 401, 403, 404, 422]).toContain(res.status());
    expect(res.status()).not.toBe(200);
  });

  test("SALES user cannot access platform admin probe", async ({ request }) => {
    const res = await request.get(`${baseUrl}/api/admin/probe`, {
      headers: { cookie: salesCookies },
    });
    expect([403, 404, 401]).toContain(res.status());
    expect(res.status()).not.toBe(200);
  });
});
