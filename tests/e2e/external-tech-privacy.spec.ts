import { expect, test, type Cookie, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

process.env.DATABASE_URL = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;

const prisma = new PrismaClient();

const externalTechEmails = (process.env.E2E_EXTERNAL_TECH_EMAILS ?? "abdu@eagle.tech,ryan@eagle.tech,dan@eagle.tech")
  .split(",")
  .map((email) => email.trim())
  .filter(Boolean);
const password = process.env.E2E_PASSWORD ?? process.env.SEED_PASSWORD ?? "Admin123!";
const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";

const forbiddenKeys = [
  "client",
  "clientId",
  "clientBill",
  "externalTechBill",
  "finalCost",
  "createdBy",
  "issueDescription",
  "diagnosisNotes",
  "technicianNotes",
  "workDone",
  "partsReplaced",
] as const;

const forbiddenSeedValues = [
  "Amina Yusuf",
  "Bello Devices Ltd",
  "Chinwe Okafor",
  "Danjuma Musa",
  "08010020001",
  "08010020002",
  "amina@train.eagle",
] as const;

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

async function login(page: Page, email: string) {
  const origin = new URL(baseUrl);
  let response: Response | null = null;
  let failureNote = "";
  for (let attempt = 1; attempt <= 15; attempt += 1) {
    response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        origin: baseUrl,
      },
      body: JSON.stringify({ email, password, callbackURL: "/jobs" }),
    });
    if (response.ok) break;
    failureNote = `status=${response.status} body=${(await response.clone().text()).slice(0, 240)}`;
    await new Promise((resolve) => setTimeout(resolve, response?.status === 429 ? 2000 : 350));
  }

  expect(response?.ok, failureNote).toBeTruthy();

  const cookies = response!.headers.getSetCookie().map((entry) => parseSetCookie(entry, origin));
  await page.context().addCookies(cookies);
}

async function ensureAssignedPrivacyJob(email: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, orgId: true } });
  expect(user?.orgId, `Seeded external technician ${email} must have an org.`).toBeTruthy();

  const orgId = user!.orgId!;
  const client = await prisma.client.upsert({
    where: { phone_orgId: { phone: "08019990001", orgId } },
    update: {
      fullName: "Privacy Test Client",
      email: "privacy-test-client@example.invalid",
      organization: "Privacy Test Org",
    },
    create: {
      orgId,
      fullName: "Privacy Test Client",
      phone: "08019990001",
      email: "privacy-test-client@example.invalid",
      organization: "Privacy Test Org",
    },
  });

  await prisma.job.upsert({
    where: { jobNumber: "E2E-PRIVACY-0001" },
    update: { orgId, clientId: client.id, assignedToId: user!.id, repairPath: "EXTERNAL" },
    create: {
      orgId,
      jobNumber: "E2E-PRIVACY-0001",
      status: "IN_REPAIR",
      repairPath: "EXTERNAL",
      clientId: client.id,
      createdById: user!.id,
      assignedToId: user!.id,
      deviceType: "PHONE_ANDROID",
      brand: "Samsung",
      model: "Galaxy Privacy Fixture",
      issueDescription: "Client described a sensitive issue that external technicians must not receive through APIs.",
      externalDiagnosis: "External-safe diagnosis summary.",
      externalTechBill: 123456,
      clientBill: 234567,
    },
  });
}

function assertNoForbiddenData(payload: unknown) {
  const text = JSON.stringify(payload);
  for (const key of forbiddenKeys) {
    expect(text, `External technician payload leaked key: ${key}`).not.toContain(`"${key}"`);
  }
  for (const value of forbiddenSeedValues) {
    expect(text, `External technician payload leaked seed PII: ${value}`).not.toContain(value);
  }
}

async function fetchJobs(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/jobs", { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`GET /api/jobs failed: ${response.status}`);
    return response.json();
  });
}

test("external technician job APIs do not expose client PII or billing history", async ({ page }) => {
  let jobs: unknown[] = [];

  for (const email of externalTechEmails) {
    await ensureAssignedPrivacyJob(email);
    await page.context().clearCookies();
    await login(page, email);
    await page.goto("/jobs");
    jobs = await fetchJobs(page);
    if (Array.isArray(jobs) && jobs.length > 0) break;
  }

  expect(Array.isArray(jobs)).toBe(true);
  expect(jobs.length, "Seed data should assign at least one job to a seeded external technician.").toBeGreaterThan(0);
  assertNoForbiddenData(jobs);

  const firstJobId = jobs[0]?.id;
  expect(typeof firstJobId).toBe("string");

  const job = await page.evaluate(async (id) => {
    const response = await fetch(`/api/jobs/${id}`, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`GET /api/jobs/${id} failed: ${response.status}`);
    return response.json();
  }, firstJobId);

  assertNoForbiddenData(job);
});
