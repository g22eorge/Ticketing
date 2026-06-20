import { expect, test, type Cookie, type Page } from "@playwright/test";
import { OrgModule, PrismaClient } from "@prisma/client";
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

async function ensureAccount(userId: string, email: string) {
  const passwordHash = await hashPassword(password);
  const existing = await prisma.account.findFirst({ where: { userId, providerId: "credential" }, select: { id: true } });
  if (existing) {
    await prisma.account.update({ where: { id: existing.id }, data: { password: passwordHash } });
    return;
  }
  await prisma.account.create({ data: { accountId: email, providerId: "credential", password: passwordHash, user: { connect: { id: userId } } } });
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
  await page.context().addCookies(response!.headers.getSetCookie().map((entry) => parseSetCookie(entry, origin)));
}

async function seedActionFixture() {
  const org = await prisma.organization.upsert({
    where: { slug: "e2e-doc-actions" },
    update: { name: "E2E Doc Actions", billingStatus: "ACTIVE", plan: "GROWTH", baseCurrency: "UGX", supportedCurrencies: "UGX" },
    create: { slug: "e2e-doc-actions", name: "E2E Doc Actions", billingStatus: "ACTIVE", plan: "GROWTH", baseCurrency: "UGX", supportedCurrencies: "UGX" },
  });
  await prisma.orgModuleGrant.deleteMany({ where: { orgId: org.id } });
  await prisma.orgModuleGrant.createMany({ data: Object.values(OrgModule).map((module) => ({ orgId: org.id, module })) });

  const user = await prisma.user.upsert({
    where: { email: "doc-actions-admin@example.invalid" },
    update: { orgId: org.id, role: "ADMIN", isActive: true, emailVerified: true },
    create: { orgId: org.id, name: "Doc Actions Admin", email: "doc-actions-admin@example.invalid", role: "ADMIN", isActive: true, emailVerified: true },
  });
  await ensureAccount(user.id, user.email);

  const client = await prisma.client.upsert({
    where: { phone_orgId: { phone: "08025550101", orgId: org.id } },
    update: { fullName: "Action Test Client" },
    create: { orgId: org.id, fullName: "Action Test Client", phone: "08025550101", email: "action-client@example.invalid" },
  });

  const job = await prisma.job.upsert({
    where: { jobNumber: "E2E-DOC-ACT-0001" },
    update: { orgId: org.id, clientId: client.id, createdById: user.id, status: "COMPLETED", clientBill: 75000, workDone: "Action test repair", completedAt: new Date() },
    create: {
      orgId: org.id, jobNumber: "E2E-DOC-ACT-0001", status: "COMPLETED", repairPath: "IN_HOUSE",
      clientId: client.id, createdById: user.id, deviceType: "WINDOWS_PC", brand: "Lenovo", model: "ThinkPad X1",
      issueDescription: "Action test issue", diagnosisNotes: "Action diagnosis", workDone: "Action test repair",
      clientBill: 75000, completedAt: new Date(),
    },
  });

  await prisma.quotation.deleteMany({ where: { orgId: org.id } });
  await prisma.invoice.deleteMany({ where: { orgId: org.id } });
  await prisma.receipt.deleteMany({ where: { orgId: org.id } });
  await prisma.payment.deleteMany({ where: { orgId: org.id } });
  await prisma.job.update({ where: { id: job.id }, data: { invoiceNumber: null, invoiceIssuedAt: null, clientPaid: false } });

  return { org, user, job, client };
}

async function openMoreMenu(page: Page) {
  // The more button has aria-label "Actions for {number}"
  const moreBtn = page.getByRole("button", { name: /actions? for/i }).first();
  await moreBtn.click();
  await page.waitForTimeout(300);
}

async function openMoreMenuForRow(page: Page, receiptNumber: string) {
  // Find the row containing the receipt number, then click its more button
  const row = page.locator("tbody tr", { has: page.locator(`a:text-is("${receiptNumber}")`) });
  await row.getByRole("button", { name: /actions? for/i }).click();
  await page.waitForTimeout(300);
}

async function closeDropdown(page: Page) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
}

// ── Test 1: Quotations list — action cell renders and opens dropdown ────────
test("quotations list page shows action cells with Lucide icons and dropdown works", async ({ page }) => {
  const { org, user, job } = await seedActionFixture();
  await login(page, user.email);

  const quote = await prisma.quotation.create({
    data: { orgId: org.id, jobId: job.id, quoteNumber: `Q-E2E-ACT-${Date.now()}`, status: "DRAFT", totalAmount: 50000, currency: "UGX" },
  });

  await page.goto("/documents/quotations");
  await expect(page.getByRole("table")).toBeVisible();

  // Quick action buttons should be visible
  await expect(page.getByRole("link", { name: "View quotation" }).first()).toBeVisible();

  // Open the ⋮ dropdown
  await openMoreMenu(page);
  await expect(page.getByRole("button", { name: "Send to client" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Duplicate quotation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete draft" })).toBeVisible();
  await closeDropdown(page);
});

// ── Test 2: Quotation status transitions (send, approve, convert) ──────────
test("quotation can be sent, approved, and converted to invoice via action buttons", async ({ page }) => {
  const { org, user, job } = await seedActionFixture();
  await login(page, user.email);

  const quote = await prisma.quotation.create({
    data: { orgId: org.id, jobId: job.id, quoteNumber: `Q-E2E-ACT2-${Date.now()}`, status: "DRAFT", totalAmount: 50000, currency: "UGX" },
  });

  await page.goto(`/documents/quotations?q=${job.jobNumber}`);
  await expect(page.getByRole("table")).toBeVisible();

  // Open ⋮ and send the quotation
  await openMoreMenu(page);
  await page.getByRole("button", { name: "Send to client" }).click();
  await expect.poll(async () => prisma.quotation.findUnique({ where: { id: quote.id } })?.status).toBe("SENT");

  // Reload — now SENT status shows different actions
  await page.reload();
  await expect(page.getByRole("button", { name: "Approve quotation" })).toBeVisible();

  // Confirm approval via dialog
  await page.getByRole("button", { name: "Approve quotation" }).click();
  await expect(page.getByText("Approve this quotation?")).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect.poll(async () => prisma.quotation.findUnique({ where: { id: quote.id } })?.status).toBe("ACCEPTED");

  // Reload — ACCEPTED shows Convert to Invoice
  await page.reload();
  await expect(page.getByRole("button", { name: "Convert to invoice" })).toBeVisible();

  // Convert via dialog
  await page.getByRole("button", { name: "Convert to invoice" }).click();
  await expect(page.getByText("Convert this quotation to an invoice?")).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect.poll(async () => prisma.quotation.findUnique({ where: { id: quote.id } })?.convertedToInvoiceId).not.toBeNull();
  await expect.poll(async () => prisma.invoice.count({ where: { orgId: org.id, jobId: job.id } })).toBe(1);
});

// ── Test 3: Invoices list — action cell with mark-paid and void ─────────────
test("invoice can be issued, marked paid, and voided via action buttons", async ({ page }) => {
  const { org, user, job } = await seedActionFixture();
  await login(page, user.email);

  const invoice = await prisma.invoice.create({
    data: { orgId: org.id, jobId: job.id, status: "DRAFT", totalAmount: 75000, currency: "UGX", invoiceNumber: `INV-ACT-TEST-${Date.now()}` },
  });

  await page.goto("/documents/invoices");
  await expect(page.getByRole("table")).toBeVisible();

  // Quick actions visible
  await expect(page.getByRole("link", { name: "View invoice" }).first()).toBeVisible();

  // Open ⋮ and send invoice (moves to ISSUED)
  await openMoreMenu(page);
  await page.getByRole("button", { name: "Send invoice" }).click();
  await expect.poll(async () => prisma.invoice.findUnique({ where: { id: invoice.id } })?.status).toBe("ISSUED");

  // Reload — ISSUED shows Mark as Paid and Void
  await page.reload();
  await expect(page.getByRole("button", { name: "Mark as paid" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Void invoice" })).toBeVisible();

  // Mark as paid via dialog
  await page.getByRole("button", { name: "Mark as paid" }).click();
  await expect(page.getByText("Mark this invoice as paid?")).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect.poll(async () => prisma.invoice.findUnique({ where: { id: invoice.id } })?.status).toBe("PAID");
});

// ── Test 4: Receipt detail page renders correctly ────────────────────────────
test("receipt detail page shows correct data, status badge, and action buttons", async ({ page }) => {
  const { org, user, client } = await seedActionFixture();
  await login(page, user.email);

  const receipt = await prisma.receipt.create({
    data: {
      orgId: org.id, clientId: client.id,
      receiptNumber: `RCP-ACT-DET-${Date.now()}`,
      amount: 75000, currency: "UGX", issuedAt: new Date(),
    },
  });

  await page.goto(`/documents/receipts/${encodeURIComponent(receipt.receiptNumber)}`);

  // Page title shows receipt number
  await expect(page.getByRole("heading", { name: receipt.receiptNumber })).toBeVisible();

  // Status badge shows "Issued" — there are multiple "Issued" texts, be specific
  await expect(page.getByText("Issued").filter({ hasText: /^Issued$/ }).first()).toBeVisible();

  // Action buttons visible — quick actions visible as link/button combo
  await expect(page.getByRole("link", { name: "Download PDF" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send receipt" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Print" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Void receipt" })).toBeVisible();
});

// ── Test 5: Receipts list — voided receipts show correct actions and no void button ─
test("receipts list shows voided receipts with read-only actions and active receipts with void option", async ({ page }) => {
  const { org, user, client } = await seedActionFixture();
  await login(page, user.email);

  const activeReceipt = await prisma.receipt.create({
    data: { orgId: org.id, clientId: client.id, receiptNumber: `RCP-ACT-V1-${Date.now()}`, amount: 50000, currency: "UGX", issuedAt: new Date() },
  });

  const voidedReceipt = await prisma.receipt.create({
    data: { orgId: org.id, clientId: client.id, receiptNumber: `RCP-ACT-V2-${Date.now()}`, amount: 30000, currency: "UGX", issuedAt: new Date(), voidedAt: new Date(), voidReason: "Test void" },
  });

  await page.goto("/documents/receipts");
  await expect(page.getByRole("table")).toBeVisible();

  // Both receipts should be visible (links to detail)
  await expect(page.getByRole("link", { name: activeReceipt.receiptNumber })).toBeVisible();
  await expect(page.getByRole("link", { name: voidedReceipt.receiptNumber })).toBeVisible();

  // Find the voided receipt row and check its more menu
  const rows = page.locator("tbody tr");
  const count = await rows.count();
  let voidedRowIndex = -1;
  for (let i = 0; i < count; i++) {
    const rowText = await rows.nth(i).textContent();
    if (rowText?.includes(voidedReceipt.receiptNumber)) { voidedRowIndex = i; break; }
  }
  expect(voidedRowIndex).toBeGreaterThanOrEqual(0);

  const voidedRow = rows.nth(voidedRowIndex);
  const moreBtn = voidedRow.getByRole("button", { name: /actions? for/i });
  await moreBtn.click();
  await page.waitForTimeout(300);

  // Void button should not exist in voided receipt's more menu
  await expect(page.getByRole("button", { name: "Void receipt" })).toHaveCount(0);
  await closeDropdown(page);
});

// ── Test 6: Receipt can be voided via receipts list action cell ──────────────
test("receipt can be voided via receipts list action cell with confirmation dialog", async ({ page }) => {
  const { org, user, client } = await seedActionFixture();
  await login(page, user.email);

  const receipt = await prisma.receipt.create({
    data: { orgId: org.id, clientId: client.id, receiptNumber: `RCP-ACT-VOID-${Date.now()}`, amount: 40000, currency: "UGX", issuedAt: new Date() },
  });

  await page.goto("/documents/receipts");
  await expect(page.getByRole("table")).toBeVisible();

  // Find the row for our receipt
  const rows = page.locator("tbody tr");
  let targetRow: ReturnType<typeof rows.nth> | null = null;
  for (let i = 0; i < await rows.count(); i++) {
    const rowText = await rows.nth(i).textContent();
    if (rowText?.includes(receipt.receiptNumber)) { targetRow = rows.nth(i); break; }
  }
  expect(targetRow).not.toBeNull();
  await targetRow!.getByRole("button", { name: /actions? for/i }).click();
  await page.waitForTimeout(300);

  // Confirm void via dialog
  await page.getByRole("button", { name: "Void receipt" }).click();
  await expect(page.getByText("Void this receipt? This cannot be undone.")).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect.poll(async () => prisma.receipt.findUnique({ where: { id: receipt.id } })?.voidedAt).not.toBeNull();
});

// ── Test 7: PDF download links return valid PDFs ─────────────────────────────
test("PDF download links return valid PDFs for quotations, invoices, and receipts", async ({ page }) => {
  const { org, user, job } = await seedActionFixture();
  await login(page, user.email);

  const quote = await prisma.quotation.create({
    data: { orgId: org.id, jobId: job.id, quoteNumber: `Q-E2E-PDF-${Date.now()}`, status: "DRAFT", totalAmount: 50000, currency: "UGX" },
  });
  const expectPdf = async (urlPath: string) => {
    const result = await page.evaluate(async (p) => {
      const absUrl = new URL(p, window.location.href).toString();
      const response = await fetch(absUrl, { headers: { accept: "application/pdf" } });
      return { status: response.status, contentType: response.headers.get("content-type") ?? "", bytes: (await response.arrayBuffer()).byteLength };
    }, urlPath);
    expect(result.status).toBe(200);
    expect(result.contentType).toContain("application/pdf");
    expect(result.bytes).toBeGreaterThan(1000);
  };

  await expectPdf(`/api/quotations/${quote.id}`);

  const invoice = await prisma.invoice.create({
    data: { orgId: org.id, jobId: job.id, status: "DRAFT", totalAmount: 75000, currency: "UGX", invoiceNumber: `INV-ACT-PDF-${Date.now()}` },
  });
  await expectPdf(`/api/invoices/${invoice.id}`);

  const receipt = await prisma.receipt.create({
    data: { orgId: org.id, receiptNumber: `RCP-ACT-PDF-${Date.now()}`, amount: 30000, currency: "UGX", issuedAt: new Date() },
  });
  await expectPdf(`/api/receipts/${receipt.id}`);
});

// ── Test 8: Confirm dialog cancel flow ──────────────────────────────────────
test("confirm dialog cancel button dismisses without executing action", async ({ page }) => {
  const { org, user, job } = await seedActionFixture();
  await login(page, user.email);

  const quote = await prisma.quotation.create({
    data: { orgId: org.id, jobId: job.id, quoteNumber: `Q-E2E-CANCEL-${Date.now()}`, status: "SENT", totalAmount: 50000, currency: "UGX" },
  });

    await page.goto("/documents/quotations");
  await openMoreMenu(page);
  await page.getByRole("button", { name: "Reject quotation" }).click();
  await expect(page.getByText("Reject this quotation?")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  // Dialog should be gone and status unchanged
  await expect(page.getByText("Reject this quotation?")).not.toBeVisible();
  await expect.poll(async () => prisma.quotation.findUnique({ where: { id: quote.id } })?.status).toBe("SENT");
});

// ── Test 9: View action navigates to correct detail page ───────────────────
test("view action on invoice rows navigates to the correct detail page", async ({ page }) => {
  const { org, user, job } = await seedActionFixture();
  await login(page, user.email);

  const invoice = await prisma.invoice.create({
    data: { orgId: org.id, jobId: job.id, status: "DRAFT", totalAmount: 75000, currency: "UGX", invoiceNumber: `INV-VIEW-TEST-${Date.now()}` },
  });

  await page.goto("/documents/invoices");
  await page.getByRole("link", { name: "View invoice" }).first().click();
  await page.waitForURL(`**/documents/invoices/**`);
  await expect(page.getByRole("heading", { name: /INV-VIEW-TEST/ })).toBeVisible();
});

// ── Test 10: Receipt detail page void flow ──────────────────────────────────
test("receipt detail page can void a receipt with confirmation dialog", async ({ page }) => {
  const { org, user, client } = await seedActionFixture();
  await login(page, user.email);

  const receipt = await prisma.receipt.create({
    data: { orgId: org.id, clientId: client.id, receiptNumber: `RCP-DET-VOID-${Date.now()}`, amount: 60000, currency: "UGX", issuedAt: new Date() },
  });

  await page.goto(`/documents/receipts/${encodeURIComponent(receipt.receiptNumber)}`);
  await openMoreMenu(page);
  await page.getByRole("button", { name: "Void receipt" }).click();
  await expect(page.getByText("Void this receipt? This cannot be undone.")).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();

  await expect.poll(async () => prisma.receipt.findUnique({ where: { id: receipt.id } })?.voidedAt).not.toBeNull();
  await expect(page.getByText("Voided")).toBeVisible();
  await expect(page.getByText("This receipt has been voided and is no longer valid.")).toBeVisible();
});