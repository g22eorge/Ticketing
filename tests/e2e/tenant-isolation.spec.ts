import { expect, test, type Cookie, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";

process.env.DATABASE_URL = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";
const password = process.env.E2E_PASSWORD ?? "Tenant123!";

function parseSetCookie(setCookie: string, origin: URL): Cookie {
  const [nameValue, ...attributes] = setCookie.split(";").map((value) => value.trim());
  const [name, ...valueParts] = nameValue.split("=");
  const cookie: Cookie = {
    name,
    value: valueParts.join("="),
    domain: origin.hostname,
    path: "/",
    expires: -1,
    httpOnly: false,
    secure: false,
    sameSite: "Lax",
  };

  for (const attribute of attributes) {
    const [keyRaw, ...rawValue] = attribute.split("=");
    const key = keyRaw.toLowerCase();
    const value = rawValue.join("=");
    if (key === "path" && value) cookie.path = value;
    if (key === "domain" && value) cookie.domain = value;
    if (key === "httponly") cookie.httpOnly = true;
    if (key === "secure") cookie.secure = true;
    if (key === "samesite" && (value === "Lax" || value === "Strict" || value === "None")) cookie.sameSite = value;
    if (key === "max-age" && value) {
      const seconds = Number(value);
      if (Number.isFinite(seconds)) cookie.expires = Math.floor(Date.now() / 1000) + seconds;
    }
  }

  return cookie;
}

async function ensureAccount(userId: string) {
  const passwordHash = await hashPassword(password);
  const existing = await prisma.account.findFirst({ where: { userId, providerId: "credential" }, select: { id: true } });
  if (existing) {
    await prisma.account.update({ where: { id: existing.id }, data: { password: passwordHash } });
    return;
  }
  await prisma.account.create({ data: { userId, accountId: userId, providerId: "credential", password: passwordHash } });
}

async function seedTenantFixture() {
  const [orgA, orgB] = await Promise.all([
    prisma.organization.upsert({
      where: { slug: "e2e-tenant-a" },
      update: { name: "E2E Tenant A", billingStatus: "ACTIVE", plan: "STARTER" },
      create: { slug: "e2e-tenant-a", name: "E2E Tenant A", billingStatus: "ACTIVE", plan: "STARTER" },
    }),
    prisma.organization.upsert({
      where: { slug: "e2e-tenant-b" },
      update: { name: "E2E Tenant B", billingStatus: "ACTIVE", plan: "STARTER" },
      create: { slug: "e2e-tenant-b", name: "E2E Tenant B", billingStatus: "ACTIVE", plan: "STARTER" },
    }),
  ]);

  const [userA, userB] = await Promise.all([
    prisma.user.upsert({
      where: { email: "tenant-a-admin@example.invalid" },
      update: { orgId: orgA.id, role: "ADMIN", isActive: true, emailVerified: true },
      create: { orgId: orgA.id, name: "Tenant A Admin", email: "tenant-a-admin@example.invalid", role: "ADMIN", isActive: true, emailVerified: true },
    }),
    prisma.user.upsert({
      where: { email: "tenant-b-admin@example.invalid" },
      update: { orgId: orgB.id, role: "ADMIN", isActive: true, emailVerified: true },
      create: { orgId: orgB.id, name: "Tenant B Admin", email: "tenant-b-admin@example.invalid", role: "ADMIN", isActive: true, emailVerified: true },
    }),
  ]);
  await ensureAccount(userA.id);
  await ensureAccount(userB.id);

  const clientB = await prisma.client.upsert({
    where: { phone_orgId: { phone: "08028880001", orgId: orgB.id } },
    update: { fullName: "Tenant B Private Client", email: "tenant-b-client@example.invalid" },
    create: { orgId: orgB.id, fullName: "Tenant B Private Client", phone: "08028880001", email: "tenant-b-client@example.invalid" },
  });

  const jobB = await prisma.job.upsert({
    where: { jobNumber: "E2E-TENANT-B-0001" },
    update: { orgId: orgB.id, clientId: clientB.id, createdById: userB.id, clientBill: 999999, status: "COMPLETED", invoiceNumber: null, invoiceIssuedAt: null },
    create: {
      orgId: orgB.id,
      jobNumber: "E2E-TENANT-B-0001",
      status: "COMPLETED",
      repairPath: "IN_HOUSE",
      clientId: clientB.id,
      createdById: userB.id,
      deviceType: "WINDOWS_PC",
      brand: "TenantBBrand",
      model: "PrivateModel",
      issueDescription: "Tenant B confidential issue",
      clientBill: 999999,
      completedAt: new Date(),
    },
  });
  const invoiceB = await prisma.invoice.upsert({
    where: { jobId: jobB.id },
    update: { orgId: orgB.id, invoiceNumber: "INV-E2E-TENANT-B-0001", totalAmount: 999999, paidAmount: 999999, status: "PAID", paidAt: new Date() },
    create: { orgId: orgB.id, jobId: jobB.id, invoiceNumber: "INV-E2E-TENANT-B-0001", totalAmount: 999999, paidAmount: 999999, status: "PAID", paidAt: new Date() },
  });
  const paymentB = await prisma.payment.create({
    data: { orgId: orgB.id, invoiceId: invoiceB.id, amount: 999999, method: "CASH", reference: `TENANT-B-PAY-${Date.now()}`, createdById: userB.id },
  });
  const deliveryNoteB = await prisma.deliveryNote.create({
    data: {
      orgId: orgB.id,
      invoiceId: invoiceB.id,
      deliveryNoteNumber: `DN-TENANT-B-${Date.now()}`,
      deliveredByName: "Tenant B Dispatcher",
      receivedByName: "Tenant B Private Client",
      createdById: userB.id,
      items: { create: [{ description: "Tenant B private handover", quantity: 1 }] },
    },
  });
  const saleB = await prisma.sale.create({
    data: { orgId: orgB.id, clientId: clientB.id, saleNumber: `S-TENANT-B-${Date.now()}`, status: "PAID", totalAmount: 12345, paidAmount: 12345, paidAt: new Date(), createdById: userB.id },
  });
  const partB = await prisma.part.create({
    data: { orgId: orgB.id, sku: `TB-${Date.now()}`, name: "Tenant B Secret Part", qtyOnHand: 7 },
  });
  await prisma.systemAuditEvent.create({
    data: { orgId: orgB.id, actorUserId: userB.id, entityType: "Job", entityId: jobB.id, action: "TENANT_B_SECRET_AUDIT", summary: "Tenant B audit secret" },
  }).catch(() => undefined);

  return { userA, clientB, jobB, paymentB, deliveryNoteB, saleB, partB };
}

async function login(page: Page, email: string) {
  const origin = new URL(baseUrl);
  const response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", origin: baseUrl },
    body: JSON.stringify({ email, password, callbackURL: "/jobs" }),
  });
  expect(response.ok, `status=${response.status} body=${(await response.clone().text()).slice(0, 240)}`).toBeTruthy();
  await page.context().addCookies(response.headers.getSetCookie().map((entry) => parseSetCookie(entry, origin)));
}

test("tenant-scoped job APIs and documents do not expose another organization", async ({ page }) => {
  const { userA, clientB, jobB, paymentB, deliveryNoteB, saleB, partB } = await seedTenantFixture();
  await login(page, userA.email);
  await page.goto("/jobs");

  const jobs = await page.evaluate(async () => {
    const response = await fetch("/api/jobs", { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`GET /api/jobs failed: ${response.status}`);
    return response.text();
  });
  expect(jobs).not.toContain("E2E-TENANT-B-0001");
  expect(jobs).not.toContain("Tenant B Private Client");
  expect(jobs).not.toContain("08028880001");

  const detailStatus = await page.evaluate(async (id) => fetch(`/api/jobs/${id}`, { headers: { accept: "application/json" } }).then((r) => r.status), jobB.id);
  expect(detailStatus).toBe(404);

  const invoiceStatus = await page.evaluate(async (id) => fetch(`/api/jobs/${id}/invoice`, { headers: { accept: "application/pdf" } }).then((r) => r.status), jobB.id);
  expect(invoiceStatus).toBe(404);

  const clientStatus = await page.evaluate(async (id) => fetch(`/api/meta/client/${id}`, { headers: { accept: "application/json" } }).then((r) => r.status), clientB.id);
  expect(clientStatus).toBe(404);

  const receiptStatus = await page.evaluate(async (id) => fetch(`/api/payments/${id}/receipt`, { headers: { accept: "application/pdf" } }).then((r) => r.status), paymentB.id);
  expect(receiptStatus).toBe(404);

  const deliveryStatus = await page.evaluate(async (id) => fetch(`/api/delivery-notes/${id}`, { headers: { accept: "application/pdf" } }).then((r) => r.status), deliveryNoteB.id);
  expect(deliveryStatus).toBe(404);

  const uploadStatus = await page.evaluate(async (id) => fetch(`/api/uploads/jobs/${id}/private.webp`).then((r) => r.status), jobB.id);
  expect(uploadStatus).toBe(404);

  const posBody = await page.evaluate(async (id) => {
    const response = await fetch(`/pos/${id}`, { headers: { accept: "text/html" } });
    return response.text();
  }, saleB.id);
  expect(posBody).not.toContain(saleB.saleNumber);
  expect(posBody).not.toContain("Tenant B Private Client");

  const inventoryBody = await page.evaluate(async () => fetch("/inventory", { headers: { accept: "text/html" } }).then((r) => r.text()));
  expect(inventoryBody).not.toContain(partB.name);

  const reportsCsv = await page.evaluate(async () => fetch("/api/reports/export?type=pipeline-aging", { headers: { accept: "text/csv" } }).then((r) => r.text()));
  expect(reportsCsv).not.toContain("E2E-TENANT-B-0001");
  expect(reportsCsv).not.toContain("Tenant B Private Client");

  const auditCsv = await page.evaluate(async () => fetch("/api/audit/export", { headers: { accept: "text/csv" } }).then((r) => r.text()));
  expect(auditCsv).not.toContain("TENANT_B_SECRET_AUDIT");
  expect(auditCsv).not.toContain("Tenant B audit secret");
});
