import { expect, test, type Cookie, type Page } from "@playwright/test";
import { OrgModule, PrismaClient } from "@prisma/client";
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

async function login(page: Page, email: string) {
  const origin = new URL(baseUrl);
  let response: Response | null = null;
  let failureNote = "";
  for (let attempt = 1; attempt <= 15; attempt += 1) {
    response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", origin: baseUrl },
      body: JSON.stringify({ email, password, callbackURL: "/jobs" }),
    });
    if (response.ok) break;
    failureNote = `status=${response.status} body=${(await response.clone().text()).slice(0, 240)}`;
    await new Promise((resolve) => setTimeout(resolve, response?.status === 429 ? 2000 : 350));
  }
  expect(response?.ok, failureNote).toBeTruthy();
  await page.context().addCookies(response!.headers.getSetCookie().map((entry) => parseSetCookie(entry, origin)));
}

async function seedReadOnlyFixture() {
  const org = await prisma.organization.upsert({
    where: { slug: "e2e-read-only-org" },
    update: { name: "E2E Read Only Org", billingStatus: "ACTIVE", plan: "STARTER" },
    create: { slug: "e2e-read-only-org", name: "E2E Read Only Org", billingStatus: "ACTIVE", plan: "STARTER" },
  });
  await prisma.orgModuleGrant.deleteMany({ where: { orgId: org.id } });
  await prisma.orgModuleGrant.createMany({ data: Object.values(OrgModule).map((module) => ({ orgId: org.id, module })) });
  const user = await prisma.user.upsert({
    where: { email: "read-only-admin@example.invalid" },
    update: { orgId: org.id, role: "ADMIN", accessMode: "READ_ONLY", isActive: true, emailVerified: true },
    create: { orgId: org.id, name: "Read Only Admin", email: "read-only-admin@example.invalid", role: "ADMIN", accessMode: "READ_ONLY", isActive: true, emailVerified: true },
  });
  await ensureAccount(user.id);

  const client = await prisma.client.upsert({
    where: { phone_orgId: { orgId: org.id, phone: "08029990001" } },
    update: { fullName: "Read Only Client" },
    create: { orgId: org.id, fullName: "Read Only Client", phone: "08029990001" },
  });

  const invoiceJob = await prisma.job.upsert({
    where: { jobNumber: "E2E-READONLY-INVOICE" },
    update: { orgId: org.id, clientId: client.id, createdById: user.id, status: "COMPLETED", invoiceNumber: null, invoiceIssuedAt: null, clientBill: 50000 },
    create: {
      orgId: org.id,
      jobNumber: "E2E-READONLY-INVOICE",
      status: "COMPLETED",
      repairPath: "IN_HOUSE",
      clientId: client.id,
      createdById: user.id,
      deviceType: "WINDOWS_PC",
      brand: "ROBrand",
      model: "InvoiceModel",
      issueDescription: "Read only invoice test",
      clientBill: 50000,
      completedAt: new Date(),
    },
  });

  const quoteJob = await prisma.job.upsert({
    where: { jobNumber: "E2E-READONLY-QUOTE" },
    update: { orgId: org.id, clientId: client.id, createdById: user.id, status: "DIAGNOSING", quotedAt: null, clientBill: 25000 },
    create: {
      orgId: org.id,
      jobNumber: "E2E-READONLY-QUOTE",
      status: "DIAGNOSING",
      repairPath: "IN_HOUSE",
      clientId: client.id,
      createdById: user.id,
      deviceType: "PHONE_ANDROID",
      brand: "ROBrand",
      model: "QuoteModel",
      issueDescription: "Read only quotation test",
      clientBill: 25000,
    },
  });

  const jobCardJob = await prisma.job.upsert({
    where: { jobNumber: "E2E-READONLY-JOBCARD" },
    update: { orgId: org.id, clientId: client.id, createdById: user.id, status: "RECEIVED" },
    create: {
      orgId: org.id,
      jobNumber: "E2E-READONLY-JOBCARD",
      status: "RECEIVED",
      repairPath: "IN_HOUSE",
      clientId: client.id,
      createdById: user.id,
      deviceType: "TABLET",
      brand: "ROBrand",
      model: "CardModel",
      issueDescription: "Read only job card test",
    },
  });

  for (const job of [invoiceJob, quoteJob, jobCardJob]) {
    const existingAudit = await prisma.auditLog.findFirst({
      where: { jobId: job.id, action: "JOB_CREATED" },
      select: { id: true },
    });
    if (!existingAudit) {
      await prisma.auditLog.create({
        data: {
          orgId: org.id,
          jobId: job.id,
          userId: user.id,
          action: "JOB_CREATED",
          detail: JSON.stringify({ source: "e2e_read_only_fixture" }),
        },
      });
    }
  }

  await prisma.auditLog.deleteMany({ where: { jobId: jobCardJob.id, action: "JOB_CARD_GENERATED" } });
  return { user, invoiceJob, quoteJob, jobCardJob };
}

test("read-only users cannot create new documents or upload files", async ({ page }) => {
  const { user, invoiceJob, quoteJob, jobCardJob } = await seedReadOnlyFixture();
  await login(page, user.email);
  await page.goto("/jobs");

  const invoiceStatus = await page.evaluate(async (id) => fetch(`/api/jobs/${id}/invoice`, { headers: { accept: "application/pdf" } }).then((r) => r.status), invoiceJob.id);
  expect(invoiceStatus).toBe(402);
  await expect.poll(async () => prisma.invoice.findUnique({ where: { jobId: invoiceJob.id } })).toBeNull();

  const quotationStatus = await page.evaluate(async (id) => fetch(`/api/jobs/${id}/quotation`, { headers: { accept: "application/pdf" } }).then((r) => r.status), quoteJob.id);
  expect(quotationStatus).toBe(402);
  await expect.poll(async () => prisma.job.findUnique({ where: { id: quoteJob.id }, select: { quotedAt: true } }).then((job) => job?.quotedAt ?? null)).toBeNull();

  const uploadStatus = await page.evaluate(async (id) => {
    const body = new FormData();
    body.set("jobId", id);
    body.set("label", "before");
    return fetch("/api/upload", { method: "POST", body }).then((r) => r.status);
  }, jobCardJob.id);
  expect(uploadStatus).toBe(403);

  const beforeAuditCount = await prisma.auditLog.count({ where: { jobId: jobCardJob.id, action: "JOB_CARD_GENERATED" } });
  const jobCardStatus = await page.evaluate(async (id) => fetch(`/api/jobs/${id}/job-card`, { headers: { accept: "application/pdf" } }).then((r) => r.status), jobCardJob.id);
  expect(jobCardStatus).toBe(200);
  const afterAuditCount = await prisma.auditLog.count({ where: { jobId: jobCardJob.id, action: "JOB_CARD_GENERATED" } });
  expect(afterAuditCount).toBe(beforeAuditCount);
});
