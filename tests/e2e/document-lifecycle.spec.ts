import { expect, test, type Cookie, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";

process.env.DATABASE_URL = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";
const password = process.env.E2E_PASSWORD ?? "Lifecycle123!";

function parseSetCookie(setCookie: string, origin: URL): Cookie {
  const [nameValue, ...attributes] = setCookie.split(";").map((value) => value.trim());
  const [name, ...valueParts] = nameValue.split("=");
  const cookie: Cookie = { name, value: valueParts.join("="), domain: origin.hostname, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" };
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

async function login(page: Page, email: string) {
  const origin = new URL(baseUrl);
  let response: Response | null = null;
  let failureNote = "";
  for (let attempt = 1; attempt <= 15; attempt += 1) {
    response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", origin: baseUrl },
      body: JSON.stringify({ email, password, callbackURL: "/documents/invoices" }),
    });
    if (response.ok) break;
    failureNote = `status=${response.status} body=${(await response.clone().text()).slice(0, 240)}`;
    await new Promise((resolve) => setTimeout(resolve, response?.status === 429 ? 2000 : 350));
  }
  expect(response?.ok, failureNote).toBeTruthy();
  await page.context().addCookies(response.headers.getSetCookie().map((entry) => parseSetCookie(entry, origin)));
}

async function seedLifecycleFixture() {
  const org = await prisma.organization.upsert({
    where: { slug: "e2e-document-lifecycle" },
    update: { name: "E2E Document Lifecycle", billingStatus: "ACTIVE", plan: "GROWTH", baseCurrency: "UGX", supportedCurrencies: "UGX" },
    create: { slug: "e2e-document-lifecycle", name: "E2E Document Lifecycle", billingStatus: "ACTIVE", plan: "GROWTH", baseCurrency: "UGX", supportedCurrencies: "UGX" },
  });
  const user = await prisma.user.upsert({
    where: { email: "document-lifecycle-admin@example.invalid" },
    update: { orgId: org.id, role: "ADMIN", isActive: true, emailVerified: true },
    create: { orgId: org.id, name: "Document Lifecycle Admin", email: "document-lifecycle-admin@example.invalid", role: "ADMIN", isActive: true, emailVerified: true },
  });
  await ensureAccount(user.id);

  const client = await prisma.client.upsert({
    where: { phone_orgId: { phone: "08025550001", orgId: org.id } },
    update: { fullName: "Lifecycle Client", email: "lifecycle-client@example.invalid" },
    create: { orgId: org.id, fullName: "Lifecycle Client", phone: "08025550001", email: "lifecycle-client@example.invalid" },
  });
  const job = await prisma.job.upsert({
    where: { jobNumber: "E2E-DOC-LIFE-0001" },
    update: {
      orgId: org.id,
      clientId: client.id,
      createdById: user.id,
      status: "COMPLETED",
      clientBill: 150000,
      diagnosisNotes: "Lifecycle diagnosis",
      workDone: "Lifecycle repair complete",
      completedAt: new Date(),
    },
    create: {
      orgId: org.id,
      jobNumber: "E2E-DOC-LIFE-0001",
      status: "COMPLETED",
      repairPath: "IN_HOUSE",
      clientId: client.id,
      createdById: user.id,
      deviceType: "WINDOWS_PC",
      brand: "Dell",
      model: "Lifecycle 5400",
      issueDescription: "Lifecycle issue",
      diagnosisNotes: "Lifecycle diagnosis",
      workDone: "Lifecycle repair complete",
      clientBill: 150000,
      completedAt: new Date(),
    },
  });

  await prisma.deliveryNote.deleteMany({ where: { orgId: org.id, invoice: { jobId: job.id } } }).catch(() => undefined);
  await prisma.payment.deleteMany({ where: { orgId: org.id, invoice: { jobId: job.id } } });
  await prisma.invoice.deleteMany({ where: { orgId: org.id, jobId: job.id } });
  await prisma.job.update({ where: { id: job.id }, data: { invoiceNumber: null, invoiceIssuedAt: null, clientPaid: false, clientPaidAt: null, clientPaidById: null } });

  return { org, user, job };
}

async function expectPdf(page: Page, path: string) {
  const result = await page.evaluate(async (urlPath) => {
    const response = await fetch(urlPath, { headers: { accept: "application/pdf" } });
    return { status: response.status, contentType: response.headers.get("content-type") ?? "", bytes: (await response.arrayBuffer()).byteLength };
  }, path);
  expect(result.status).toBe(200);
  expect(result.contentType).toContain("application/pdf");
  expect(result.bytes).toBeGreaterThan(1000);
}

test("document lifecycle generates job card, quote, invoice, receipt, and delivery note", async ({ page }) => {
  const { org, user, job } = await seedLifecycleFixture();
  await login(page, user.email);
  await page.goto("/documents/invoices");

  await expectPdf(page, `/api/jobs/${job.id}/job-card`);
  await expectPdf(page, `/api/jobs/${job.id}/quotation`);
  await expectPdf(page, `/api/jobs/${job.id}/invoice`);

  const invoice = await prisma.invoice.findFirstOrThrow({ where: { orgId: org.id, jobId: job.id } });
  const payment = await prisma.payment.create({
    data: { orgId: org.id, invoiceId: invoice.id, amount: invoice.totalAmount, currency: invoice.currency, method: "CASH", reference: "E2E-LIFECYCLE-PAYMENT", createdById: user.id },
  });
  await prisma.invoice.update({ where: { id: invoice.id }, data: { paidAmount: invoice.totalAmount, paidAt: new Date(), status: "PAID" } });
  await prisma.job.update({ where: { id: job.id }, data: { clientPaid: true, clientPaidAt: new Date(), clientPaidById: user.id, clientPaymentRef: payment.reference } });
  await expectPdf(page, `/api/payments/${payment.id}/receipt`);

  const deliveryNote = await prisma.deliveryNote.create({
    data: {
      orgId: org.id,
      invoiceId: invoice.id,
      deliveryNoteNumber: `DN-E2E-${Date.now()}`,
      deliveredByName: "Lifecycle Dispatcher",
      receivedByName: "Lifecycle Client",
      deliveryMethod: "PICKUP",
      createdById: user.id,
      items: { create: [{ description: "Lifecycle repaired device handover", quantity: 1 }] },
    },
  });
  await expectPdf(page, `/api/delivery-notes/${deliveryNote.id}`);
});
