/**
 * prisma/seed-commercial.ts
 *
 * Seeds three demo organisations for the commercial branch.
 * Run with:  bun run seed:commercial
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  DEMO ACCOUNTS                          Password: Demo1234!             │
 * ├──────────────────────────┬──────────────────────┬───────────────────────┤
 * │  TechFix Uganda (GROWTH) │  iRepair Kenya (STARTER trial) │ FixIt Fast (ENTERPRISE) │
 * │  admin@techfix.ug        │  admin@irepair.ke    │  admin@fixitfast.gh  │
 * │  ops@techfix.ug          │  ops@irepair.ke      │  ops@fixitfast.gh    │
 * │  tech@techfix.ug         │                      │  tech@fixitfast.gh   │
 * │  ext@techfix.ug          │                      │  ext@fixitfast.gh    │
 * └──────────────────────────┴──────────────────────┴──────────────────────┘
 */

import { hashPassword } from "better-auth/crypto";
import { DeviceType, JobStatus, OrgBillingStatus, OrgPlan, RepairPath, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const DEMO_PASSWORD = "Demo1234!";

// ── helpers ───────────────────────────────────────────────────────────────────

async function upsertOrg({
  name,
  slug,
  plan,
  billingStatus,
  trialEndsAt,
  planRenewsAt,
}: {
  name: string;
  slug: string;
  plan: OrgPlan;
  billingStatus: OrgBillingStatus;
  trialEndsAt?: Date;
  planRenewsAt?: Date;
}) {
  return prisma.organization.upsert({
    where: { slug },
    update: { name, plan, billingStatus, trialEndsAt: trialEndsAt ?? null, planRenewsAt: planRenewsAt ?? null },
    create: { name, slug, plan, billingStatus, trialEndsAt: trialEndsAt ?? null, planRenewsAt: planRenewsAt ?? null },
  });
}

async function upsertUser({
  orgId,
  name,
  email,
  role,
}: {
  orgId: string;
  name: string;
  email: string;
  role: Role;
}) {
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, role, orgId, isActive: true, emailVerified: true },
    create: { name, email, role, orgId, isActive: true, emailVerified: true },
  });

  // Ensure credential account
  const existing = await prisma.account.findFirst({ where: { userId: user.id, providerId: "credential" } });
  if (existing) {
    await prisma.account.update({
      where: { id: existing.id },
      data: { password: await hashPassword(DEMO_PASSWORD) },
    });
  } else {
    await prisma.account.create({
      data: {
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: await hashPassword(DEMO_PASSWORD),
      },
    });
  }

  return user;
}

async function upsertBranding({
  orgId,
  companyName,
  companyTagline,
  companyAddressLine1,
  companyAddressLine2,
  companyContacts,
  companyEmail,
  companyWebsite,
  primaryColor,
  secondaryColor,
}: {
  orgId: string;
  companyName: string;
  companyTagline?: string;
  companyAddressLine1: string;
  companyAddressLine2: string;
  companyContacts: string;
  companyEmail?: string;
  companyWebsite?: string;
  primaryColor?: string;
  secondaryColor?: string;
}) {
  const existing = await prisma.documentBrandingSettings.findUnique({ where: { orgId } });
  const data = {
    companyName,
    companyTagline: companyTagline ?? null,
    companyAddressLine1,
    companyAddressLine2,
    companyContacts,
    companyEmail: companyEmail ?? null,
    companyWebsite: companyWebsite ?? null,
    primaryColor: primaryColor ?? "#000000",
    secondaryColor: secondaryColor ?? "#D4AF37",
    accentColor: secondaryColor ?? "#D4AF37",
  };
  if (existing) {
    return prisma.documentBrandingSettings.update({ where: { orgId }, data });
  }
  return prisma.documentBrandingSettings.create({ data: { orgId, ...data } });
}

async function createClient(orgId: string, fullName: string, phone: string, email?: string) {
  const existing = await prisma.client.findFirst({ where: { phone, orgId } });
  if (existing) return existing;
  return prisma.client.create({ data: { orgId, fullName, phone, email: email ?? null } });
}

async function createJob({
  orgId,
  jobNumber,
  status,
  repairPath,
  clientId,
  createdById,
  assignedToId,
  deviceType,
  brand,
  model,
  issueDescription,
  diagnosisNotes,
  clientBill,
  workDone,
  receivedAt,
  completedAt,
}: {
  orgId: string;
  jobNumber: string;
  status: JobStatus;
  repairPath?: RepairPath;
  clientId: string;
  createdById: string;
  assignedToId?: string;
  deviceType: DeviceType;
  brand: string;
  model: string;
  issueDescription: string;
  diagnosisNotes?: string;
  clientBill?: number;
  workDone?: string;
  receivedAt: Date;
  completedAt?: Date;
}) {
  const existing = await prisma.job.findUnique({ where: { jobNumber }, select: { id: true } });
  if (existing) return existing;
  return prisma.job.create({
    data: {
      orgId,
      jobNumber,
      status,
      repairPath: repairPath ?? null,
      clientId,
      createdById,
      assignedToId: assignedToId ?? null,
      deviceType,
      brand,
      model,
      issueDescription,
      diagnosisNotes: diagnosisNotes ?? null,
      clientBill: clientBill ?? null,
      workDone: workDone ?? null,
      receivedAt,
      completedAt: completedAt ?? null,
    },
  });
}

async function ensureAudit(jobId: string, userId: string, action: string, detail: unknown) {
  const serialized = JSON.stringify(detail);
  const existing = await prisma.auditLog.findFirst({
    where: { jobId, userId, action, detail: serialized },
    select: { id: true },
  });
  if (existing) return;
  await prisma.auditLog.create({
    data: { jobId, userId, action, detail: serialized },
    select: { id: true },
  });
}

// ── main ─────────────────────────────────────────────────────────────────────

export async function seedCommercialData() {
  console.log("Seeding commercial demo organisations...\n");

  const now = new Date();
  const daysFromNow = (n: number) => new Date(now.getTime() + n * 86_400_000);
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  // ────────────────────────────────────────────────────────────────────────────
  // 1. TechFix Uganda — GROWTH plan, active paid subscriber
  // ────────────────────────────────────────────────────────────────────────────
  const techfix = await upsertOrg({
    name: "TechFix Uganda",
    slug: "techfix-ug",
    plan: "GROWTH",
    billingStatus: "ACTIVE",
    planRenewsAt: daysFromNow(18),
  });

  const [, tfOps, tfTech] = await Promise.all([
    upsertUser({ orgId: techfix.id, name: "Sarah Nakato",    email: "admin@techfix.ug",  role: "ADMIN" }),
    upsertUser({ orgId: techfix.id, name: "Moses Ssemakula", email: "ops@techfix.ug",    role: "OPS" }),
    upsertUser({ orgId: techfix.id, name: "David Ochieng",   email: "tech@techfix.ug",   role: "TECHNICIAN_INTERNAL" }),
    upsertUser({ orgId: techfix.id, name: "Ali Mugerwa",     email: "ext@techfix.ug",    role: "TECHNICIAN_EXTERNAL" }),
  ]);

  await upsertBranding({
    orgId: techfix.id,
    companyName: "TechFix Uganda",
    companyTagline: "Fast. Reliable. Affordable.",
    companyAddressLine1: "Plot 45, Nakivubo Road",
    companyAddressLine2: "Kampala, Uganda",
    companyContacts: "+256 700 111 222",
    companyEmail: "info@techfix.ug",
    companyWebsite: "www.techfix.ug",
    primaryColor: "#1a1a2e",
    secondaryColor: "#e94560",
  });

  const tfClients = await Promise.all([
    createClient(techfix.id, "Aisha Namukasa",    "+256701001001", "aisha@gmail.com"),
    createClient(techfix.id, "Brian Kavuma",       "+256701001002"),
    createClient(techfix.id, "Cynthia Tendo",     "+256701001003", "cynthia@work.co.ug"),
    createClient(techfix.id, "Daniel Sentongo",    "+256701001004"),
    createClient(techfix.id, "Esther Namata",     "+256701001005"),
    createClient(techfix.id, "Frank Wasswa",      "+256701001006"),
    createClient(techfix.id, "Grace Nakimuli",    "+256701001007", "grace.n@email.com"),
    createClient(techfix.id, "Hassan Ssembuusi",  "+256701001008"),
    createClient(techfix.id, "Irene Akello",      "+256701001009", "irene@corp.ug"),
    createClient(techfix.id, "James Mukiibi",     "+256701001010"),
    createClient(techfix.id, "Kampala Tech Hub",  "+256701001011", "info@kth.ug"),
    createClient(techfix.id, "Lydia Nambatya",    "+256701001012", "lydia.n@gmail.com"),
    createClient(techfix.id, "Moses Kiggundu",    "+256701001013"),
    createClient(techfix.id, "Norah Atim",        "+256701001014", "norah@school.ac.ug"),
    createClient(techfix.id, "Patrick Onyango",   "+256701001015"),
    createClient(techfix.id, "Rita Nakabuubi",    "+256701001016", "rita.k@business.ug"),
    createClient(techfix.id, "Samuel Ochieng",    "+256701001017"),
    createClient(techfix.id, "Tabitha Nantongo",  "+256701001018", "tabitha@home.ug"),
    createClient(techfix.id, "Uganda Moto Parts", "+256701001019", "orders@ugmoto.ug"),
    createClient(techfix.id, "Victoria Nassali",  "+256701001020"),
  ]);

  const tfJobs = [
    { n: "TFX-001", status: "COMPLETED" as JobStatus, client: 0, device: "PHONE_IPHONE" as DeviceType, brand: "Apple", model: "iPhone 14", issue: "Cracked screen, touch unresponsive", diagnosis: "LCD + digitizer assembly replaced", bill: 320000, work: "Screen replaced with OEM part. 30-day warranty.", received: daysAgo(12), completed: daysAgo(8) },
    { n: "TFX-002", status: "IN_REPAIR" as JobStatus, client: 1, device: "WINDOWS_PC" as DeviceType, brand: "Dell", model: "Latitude 5520", issue: "Laptop not booting, fans spin then stop", diagnosis: "Faulty RAM slot identified, thermal paste dried out", bill: undefined, work: undefined, received: daysAgo(3) },
    { n: "TFX-003", status: "AWAITING_APPROVAL" as JobStatus, client: 2, device: "PHONE_ANDROID" as DeviceType, brand: "Samsung", model: "Galaxy A53", issue: "Battery drains very fast, overheats", diagnosis: "Battery health at 41%, recommend replacement", bill: 85000, work: undefined, received: daysAgo(2) },
    { n: "TFX-004", status: "RECEIVED" as JobStatus, client: 3, device: "MAC" as DeviceType, brand: "Apple", model: "MacBook Air M1", issue: "Keyboard some keys not working after liquid spill", diagnosis: undefined, bill: undefined, work: undefined, received: daysAgo(1) },
    { n: "TFX-005", status: "COMPLETED" as JobStatus, client: 4, device: "TABLET" as DeviceType, brand: "Samsung", model: "Tab S7", issue: "Charging port broken, won't charge", diagnosis: "USB-C port replaced", bill: 120000, work: "Charging port replaced. Device charges normally.", received: daysAgo(7), completed: daysAgo(4) },
    { n: "TFX-006", status: "DIAGNOSING" as JobStatus, client: 5, device: "PHONE_ANDROID" as DeviceType, brand: "Tecno", model: "Camon 20", issue: "Camera blurry after drop, front camera not working", diagnosis: undefined, bill: undefined, work: undefined, received: daysAgo(1) },
    { n: "TFX-007", status: "READY_FOR_PICKUP" as JobStatus, client: 0, device: "WINDOWS_PC" as DeviceType, brand: "HP", model: "EliteBook 840", issue: "SSD failing, system very slow", diagnosis: "SSD replaced with 512GB NVMe", bill: 280000, work: "SSD replaced, OS reinstalled, data restored.", received: daysAgo(5), completed: daysAgo(1) },
    { n: "TFX-008", status: "RECEIVED" as JobStatus, client: 1, device: "PHONE_IPHONE" as DeviceType, brand: "Apple", model: "iPhone 12 Pro", issue: "Face ID not working after screen replacement elsewhere", diagnosis: undefined, bill: undefined, work: undefined, received: daysAgo(0) },
  ];

  for (const j of tfJobs) {
    const job = await createJob({
      orgId: techfix.id,
      jobNumber: j.n,
      status: j.status,
      repairPath: "IN_HOUSE",
      clientId: tfClients[j.client].id,
      createdById: tfOps.id,
      assignedToId: j.status === "RECEIVED" ? undefined : tfTech.id,
      deviceType: j.device,
      brand: j.brand,
      model: j.model,
      issueDescription: j.issue,
      diagnosisNotes: j.diagnosis,
      clientBill: j.bill,
      workDone: j.work,
      receivedAt: j.received,
      completedAt: j.completed,
    });
    await ensureAudit(job.id, tfOps.id, "JOB_CREATED", { seeded: true, org: techfix.slug, jobNumber: j.n });
  }

  console.log(`✓ TechFix Uganda — ${tfJobs.length} jobs, 4 users (GROWTH / ACTIVE)`);

  // ────────────────────────────────────────────────────────────────────────────
  // 2. iRepair Kenya — STARTER plan, still in trial (5 days left)
  // ────────────────────────────────────────────────────────────────────────────
  const irepair = await upsertOrg({
    name: "iRepair Kenya",
    slug: "irepair-ke",
    plan: "STARTER",
    billingStatus: "TRIALING",
    trialEndsAt: daysFromNow(5),
  });

  const [irAdmin, irOps] = await Promise.all([
    upsertUser({ orgId: irepair.id, name: "Grace Wanjiku", email: "admin@irepair.ke", role: "ADMIN" }),
    upsertUser({ orgId: irepair.id, name: "Kevin Otieno",  email: "ops@irepair.ke",   role: "OPS" }),
  ]);

  await upsertBranding({
    orgId: irepair.id,
    companyName: "iRepair Kenya",
    companyTagline: "Your device, back to life.",
    companyAddressLine1: "Moi Avenue, Jubilee Exchange",
    companyAddressLine2: "Nairobi, Kenya",
    companyContacts: "+254 712 000 333",
    companyEmail: "hello@irepair.ke",
    primaryColor: "#0f172a",
    secondaryColor: "#38bdf8",
  });

  const irClients = await Promise.all([
    createClient(irepair.id, "Joan Achieng",   "+254700201001", "joan@mail.ke"),
    createClient(irepair.id, "Peter Kamau",    "+254700201002"),
    createClient(irepair.id, "Sandra Muthoni", "+254700201003"),
  ]);

  const irJobs = [
    { n: "IRK-001", status: "COMPLETED" as JobStatus, client: 0, device: "PHONE_IPHONE" as DeviceType, brand: "Apple", model: "iPhone 11", issue: "Battery swollen, back glass cracked", diagnosis: "Battery + back glass replaced", bill: 8500, work: "Battery and back glass replaced.", received: daysAgo(10), completed: daysAgo(6) },
    { n: "IRK-002", status: "IN_REPAIR" as JobStatus, client: 1, device: "PHONE_ANDROID" as DeviceType, brand: "Samsung", model: "Galaxy S22", issue: "Water damage, not switching on", diagnosis: "Motherboard corrosion, ultrasonic clean in progress", bill: undefined, work: undefined, received: daysAgo(4) },
    { n: "IRK-003", status: "RECEIVED" as JobStatus, client: 2, device: "WINDOWS_PC" as DeviceType, brand: "Lenovo", model: "IdeaPad 3", issue: "Blue screen on startup, possible virus", diagnosis: undefined, bill: undefined, work: undefined, received: daysAgo(0) },
  ];

  for (const j of irJobs) {
    const job = await createJob({
      orgId: irepair.id,
      jobNumber: j.n,
      status: j.status,
      repairPath: "IN_HOUSE",
      clientId: irClients[j.client].id,
      createdById: irOps.id,
      assignedToId: j.status === "RECEIVED" ? undefined : irAdmin.id,
      deviceType: j.device,
      brand: j.brand,
      model: j.model,
      issueDescription: j.issue,
      diagnosisNotes: j.diagnosis,
      clientBill: j.bill,
      workDone: j.work,
      receivedAt: j.received,
      completedAt: j.completed,
    });
    await ensureAudit(job.id, irOps.id, "JOB_CREATED", { seeded: true, org: irepair.slug, jobNumber: j.n });
  }

  console.log(`✓ iRepair Kenya — ${irJobs.length} jobs, 2 users (STARTER / TRIALING — 5 days left)`);

  // ────────────────────────────────────────────────────────────────────────────
  // 3. FixIt Fast Ghana — ENTERPRISE plan, active subscriber, mixed workflow
  // ────────────────────────────────────────────────────────────────────────────
  const fixitfast = await upsertOrg({
    name: "FixIt Fast Ghana",
    slug: "fixitfast-gh",
    plan: "ENTERPRISE",
    billingStatus: "ACTIVE",
    planRenewsAt: daysFromNow(22),
  });

  const [, ffOps, , ffTech, ffExt] = await Promise.all([
    upsertUser({ orgId: fixitfast.id, name: "Kwame Asante",    email: "admin@fixitfast.gh",  role: "ADMIN" }),
    upsertUser({ orgId: fixitfast.id, name: "Abena Mensah",    email: "ops@fixitfast.gh",    role: "OPS" }),
    upsertUser({ orgId: fixitfast.id, name: "Kofi Boateng",    email: "ops2@fixitfast.gh",   role: "OPS" }),
    upsertUser({ orgId: fixitfast.id, name: "Yaw Darko",       email: "tech@fixitfast.gh",   role: "TECHNICIAN_INTERNAL" }),
    upsertUser({ orgId: fixitfast.id, name: "Ama Owusu",       email: "ext@fixitfast.gh",    role: "TECHNICIAN_EXTERNAL" }),
  ]);

  await upsertBranding({
    orgId: fixitfast.id,
    companyName: "FixIt Fast Ghana",
    companyTagline: "Speed. Quality. Trust.",
    companyAddressLine1: "Osu Oxford Street",
    companyAddressLine2: "Accra, Ghana",
    companyContacts: "+233 20 700 4567",
    companyEmail: "support@fixitfast.gh",
    companyWebsite: "www.fixitfast.gh",
    primaryColor: "#064e3b",
    secondaryColor: "#fbbf24",
  });

  const ffClients = await Promise.all([
    createClient(fixitfast.id, "Nana Ama Boadu",    "+233240301001", "nana@company.gh"),
    createClient(fixitfast.id, "Kojo Mensah",       "+233240301002"),
    createClient(fixitfast.id, "Akosua Frimpong",   "+233240301003", "akosua@firm.gh"),
    createClient(fixitfast.id, "Emmanuel Adjei",    "+233240301004"),
    createClient(fixitfast.id, "Ama Pokua",         "+233240301005"),
    createClient(fixitfast.id, "Bright Osei",       "+233240301006"),
    createClient(fixitfast.id, "Gifty Appiah",      "+233240301007"),
    createClient(fixitfast.id, "Richmond Asare",    "+233240301008"),
  ]);

  const ffJobs = [
    { n: "FIF-001", status: "COMPLETED" as JobStatus, client: 0, path: "IN_HOUSE" as RepairPath, assignee: ffTech.id, device: "PHONE_ANDROID" as DeviceType, brand: "Samsung", model: "Galaxy A73", issue: "Screen shattered after drop", diagnosis: "AMOLED panel replaced", bill: 550, work: "Display replaced. Touch and Face ID functional.", received: daysAgo(14), completed: daysAgo(10) },
    { n: "FIF-002", status: "COMPLETED" as JobStatus, client: 1, path: "EXTERNAL" as RepairPath, assignee: ffExt.id, device: "MAC" as DeviceType, brand: "Apple", model: "MacBook Pro 16 M1", issue: "Logic board failure, won't power on", diagnosis: "Board-level repair completed by specialist", bill: 2800, work: "Logic board repaired.", received: daysAgo(20), completed: daysAgo(12) },
    { n: "FIF-003", status: "IN_REPAIR" as JobStatus, client: 2, path: "IN_HOUSE" as RepairPath, assignee: ffTech.id, device: "WINDOWS_PC" as DeviceType, brand: "Acer", model: "Swift 3", issue: "Overheating and throttling under load", diagnosis: "Thermal paste dried out, fan bearing worn", bill: undefined, work: undefined, received: daysAgo(3) },
    { n: "FIF-004", status: "AWAITING_APPROVAL" as JobStatus, client: 3, path: "IN_HOUSE" as RepairPath, assignee: ffTech.id, device: "PHONE_IPHONE" as DeviceType, brand: "Apple", model: "iPhone 15 Pro Max", issue: "True Tone broken after third-party screen repair", diagnosis: "Original Apple display needed to restore True Tone", bill: 3200, work: undefined, received: daysAgo(4) },
    { n: "FIF-005", status: "DIAGNOSING" as JobStatus, client: 4, path: "IN_HOUSE" as RepairPath, assignee: ffTech.id, device: "TABLET" as DeviceType, brand: "iPad", model: "iPad Pro 12.9 2022", issue: "Apple Pencil not charging, only one speaker working", diagnosis: undefined, bill: undefined, work: undefined, received: daysAgo(2) },
    { n: "FIF-006", status: "READY_FOR_PICKUP" as JobStatus, client: 5, path: "IN_HOUSE" as RepairPath, assignee: ffTech.id, device: "PHONE_ANDROID" as DeviceType, brand: "Google", model: "Pixel 8", issue: "Back glass cracked, camera protruding after drop", diagnosis: "Back glass and camera module replaced", bill: 420, work: "Back glass and camera housing replaced.", received: daysAgo(6), completed: daysAgo(1) },
    { n: "FIF-007", status: "RECEIVED" as JobStatus, client: 6, path: undefined, assignee: undefined, device: "WINDOWS_PC" as DeviceType, brand: "HP", model: "Spectre x360", issue: "Touchscreen flickering and occasional black screen", diagnosis: undefined, bill: undefined, work: undefined, received: daysAgo(0) },
    { n: "FIF-008", status: "REFERRED" as JobStatus, client: 7, path: "EXTERNAL" as RepairPath, assignee: ffExt.id, device: "PHONE_ANDROID" as DeviceType, brand: "Huawei", model: "P50 Pro", issue: "No network signal, IMEI shows unknown", diagnosis: "Baseband chip issue, needs specialist board repair", bill: undefined, work: undefined, received: daysAgo(5) },
    { n: "FIF-009", status: "COMPLETED" as JobStatus, client: 0, path: "IN_HOUSE" as RepairPath, assignee: ffTech.id, device: "PHONE_IPHONE" as DeviceType, brand: "Apple", model: "iPhone 13 mini", issue: "Microphone not working during calls", diagnosis: "Bottom microphone replaced", bill: 380, work: "Bottom microphone replaced. Call quality confirmed normal.", received: daysAgo(9), completed: daysAgo(6) },
    { n: "FIF-010", status: "CLOSED" as JobStatus, client: 1, path: "IN_HOUSE" as RepairPath, assignee: ffTech.id, device: "WINDOWS_PC" as DeviceType, brand: "Dell", model: "XPS 13", issue: "Keyboard water damaged, several keys stuck", diagnosis: "Full keyboard replacement GHS 600, client declined cost", bill: undefined, work: undefined, received: daysAgo(8) },
  ];

  for (const j of ffJobs) {
    const job = await createJob({
      orgId: fixitfast.id,
      jobNumber: j.n,
      status: j.status,
      repairPath: j.path,
      clientId: ffClients[j.client].id,
      createdById: ffOps.id,
      assignedToId: j.assignee,
      deviceType: j.device,
      brand: j.brand,
      model: j.model,
      issueDescription: j.issue,
      diagnosisNotes: j.diagnosis,
      clientBill: j.bill,
      workDone: j.work,
      receivedAt: j.received,
      completedAt: j.completed,
    });
    await ensureAudit(job.id, ffOps.id, "JOB_CREATED", { seeded: true, org: fixitfast.slug, jobNumber: j.n });
  }

  console.log(`✓ FixIt Fast Ghana — ${ffJobs.length} jobs, 5 users (ENTERPRISE / ACTIVE)\n`);

  // ────────────────────────────────────────────────────────────────────────────
  // EXPANSION — TechFix Uganda: extra users, branches, groups, parts, supplier,
  //             purchase order, stock txns, sales, invoices, payments, complaints
  // ────────────────────────────────────────────────────────────────────────────

  // Extra users
  await Promise.all([
    upsertUser({ orgId: techfix.id, name: "Patricia Namutebi", email: "techmanager@techfix.ug", role: "TECH_MANAGER" }),
    upsertUser({ orgId: techfix.id, name: "Ronald Kiggundu",   email: "manager@techfix.ug",     role: "MANAGER" }),
    upsertUser({ orgId: techfix.id, name: "Sandra Akello",     email: "sales@techfix.ug",        role: "SALES" }),
    upsertUser({ orgId: techfix.id, name: "James Lubega",      email: "fd@techfix.ug",           role: "FRONT_DESK" }),
  ]);

  // Branches
  async function ensureBranch(orgId: string, name: string, address: string, isDefault: boolean) {
    const existing = await prisma.branch.findFirst({ where: { orgId, name } });
    if (existing) return existing;
    return prisma.branch.create({ data: { orgId, name, address, isDefault } });
  }

  const tfMainBranch = await ensureBranch(techfix.id, "Main Branch", "Plot 45, Nakivubo Road, Kampala", true);
  await ensureBranch(techfix.id, "Ntinda Branch", "Ntinda Complex, Kampala", false);

  // User Groups
  async function ensureUserGroup(orgId: string, name: string, description: string, permissions: string[]) {
    const existing = await prisma.userGroup.findUnique({ where: { orgId_name: { orgId, name } } });
    const group = existing
      ? existing
      : await prisma.userGroup.create({ data: { orgId, name, description } });
    // Ensure permissions are set
    for (const permission of permissions) {
      await prisma.userGroupPermission.upsert({
        where: { groupId_permission: { groupId: group.id, permission } },
        update: {},
        create: { groupId: group.id, permission },
      });
    }
    return group;
  }

  await ensureUserGroup(techfix.id, "Field Technicians", "Technicians doing on-site and in-house repairs", [
    "can_run_internal_repairs",
    "can_view_job_progress",
  ]);
  await ensureUserGroup(techfix.id, "Senior Ops", "Senior operations staff managing intake and job flow", [
    "can_intake",
    "can_manage_intake",
    "can_assign_jobs",
    "can_approve_invoices",
  ]);
  await ensureUserGroup(techfix.id, "Finance Team", "Finance staff overseeing accounts and billing", [
    "can_view_accounts_summary",
    "can_approve_invoices",
    "can_review_external_bills",
  ]);

  // Parts
  async function ensurePart(orgId: string, sku: string, name: string, unitCost: number, qtyOnHand: number) {
    const existing = await prisma.part.findUnique({ where: { sku_orgId: { sku, orgId } } });
    if (existing) return existing;
    return prisma.part.create({ data: { orgId, sku, name, unitCost, qtyOnHand } });
  }

  const tfParts = {
    lcdIp14:   await ensurePart(techfix.id, "LCD-IP14",       "LCD iPhone 14 Screen",            180000,  5),
    batSa53:   await ensurePart(techfix.id, "BAT-SA53",       "Samsung A53 Battery",              45000, 12),
    portUsbc:  await ensurePart(techfix.id, "PORT-USBC",      "USB-C Charging Port",              15000, 20),
    kbMbpM1:   await ensurePart(techfix.id, "KB-MBP-M1",      "MacBook Keyboard",                 95000,  3),
    ssd512:    await ensurePart(techfix.id, "SSD-512-NVMe",   "HP 512GB NVMe SSD",               120000,  8),
    batIp12:   await ensurePart(techfix.id, "BAT-IP12",       "iPhone 12 Battery",                55000,  9),
    pasteTx:   await ensurePart(techfix.id, "PASTE-TX",       "Thermal Paste",                     8000, 25),
    portTabS7: await ensurePart(techfix.id, "PORT-TABS7",     "Samsung Tab S7 Charger Port",      22000,  6),
    // Additional parts
    lcdSa23:   await ensurePart(techfix.id, "LCD-SA23",       "Samsung A23 Display Assembly",     95000,  7),
    lcdIp13:   await ensurePart(techfix.id, "LCD-IP13",       "LCD iPhone 13 Screen",            155000,  4),
    batDellL:  await ensurePart(techfix.id, "BAT-DELL-LAT",   "Dell Latitude 65Wh Battery",       88000,  6),
    ramDdr4:   await ensurePart(techfix.id, "RAM-DDR4-8GB",   "8GB DDR4 Laptop RAM",              65000, 10),
    hdmi:      await ensurePart(techfix.id, "CABLE-HDMI",     "HDMI Cable 2m",                     8500, 30),
    screwKit:  await ensurePart(techfix.id, "TOOL-SCREW-KIT", "Precision Screwdriver Set",        25000,  4),
    flexIp14:  await ensurePart(techfix.id, "FLEX-IP14-PWRBTN","iPhone 14 Power Button Flex",     18000,  8),
    fanDell:   await ensurePart(techfix.id, "FAN-DELL-5520",  "Dell 5520 CPU Cooling Fan",        42000,  5),
    dcJack:    await ensurePart(techfix.id, "DC-JACK-UNIV",   "Universal DC Power Jack",          12000, 15),
    lensIp14:  await ensurePart(techfix.id, "LENS-IP14-REAR", "iPhone 14 Rear Camera Lens",       35000,  6),
    portLenIp: await ensurePart(techfix.id, "PORT-LEN-TB",    "Lenovo ThinkPad Charging Port",    28000,  9),
    ssd256:    await ensurePart(techfix.id, "SSD-256-NVMe",   "256GB NVMe SSD",                   72000, 11),
    isopropyl: await ensurePart(techfix.id, "CHEM-IPA-99",    "IPA 99% Cleaning Solution 500ml",   9500, 18),
    screenProtector: await ensurePart(techfix.id, "ACC-SCRN-PROT", "Universal Screen Protector",   3500, 50),
  };

  // Supplier
  const tfSupplier = await (async () => {
    const existing = await prisma.supplier.findFirst({ where: { orgId: techfix.id, name: "SpareHub Uganda" } });
    if (existing) return existing;
    return prisma.supplier.create({
      data: {
        orgId: techfix.id,
        name: "SpareHub Uganda",
        contactName: "Isaac Buyondo",
        phone: "+256752100200",
        email: "orders@sparehub.ug",
      },
    });
  })();

  // Second supplier
  const tfSupplier2 = await (async () => {
    const existing = await prisma.supplier.findFirst({ where: { orgId: techfix.id, name: "AppleParts EA" } });
    if (existing) return existing;
    return prisma.supplier.create({
      data: {
        orgId: techfix.id,
        name: "AppleParts EA",
        contactName: "Diana Koech",
        phone: "+254722300400",
        email: "supply@appleparts.co.ke",
      },
    });
  })();

  // Third supplier
  await (async () => {
    const existing = await prisma.supplier.findFirst({ where: { orgId: techfix.id, name: "TechStock KLA" } });
    if (existing) return existing;
    return prisma.supplier.create({
      data: {
        orgId: techfix.id,
        name: "TechStock KLA",
        contactName: "Ronald Kato",
        phone: "+256775500600",
        email: "kato@techstock.ug",
      },
    });
  })();

  // Second purchase order (PENDING)
  await (async () => {
    const existing = await prisma.purchaseOrder.findFirst({ where: { orgId: techfix.id, reference: "PO-TFX-002" } });
    if (existing) return existing;
    return prisma.purchaseOrder.create({
      data: {
        orgId: techfix.id,
        supplierId: tfSupplier2.id,
        status: "ORDERED",
        reference: "PO-TFX-002",
        orderedAt: daysAgo(3),
        items: {
          create: [
            { partId: tfParts.lcdIp13.id,  description: "LCD iPhone 13 Screen",  qtyOrdered: 4, qtyReceived: 0, unitCost: 155000 },
            { partId: tfParts.lcdSa23.id,  description: "Samsung A23 Display",    qtyOrdered: 6, qtyReceived: 0, unitCost: 95000 },
            { partId: tfParts.flexIp14.id, description: "iPhone 14 Power Flex",   qtyOrdered: 8, qtyReceived: 0, unitCost: 18000 },
          ],
        },
      },
    });
  })();

  // Purchase Order
  const tfPo = await (async () => {
    const existing = await prisma.purchaseOrder.findFirst({ where: { orgId: techfix.id, reference: "PO-TFX-001" } });
    if (existing) return existing;
    return prisma.purchaseOrder.create({
      data: {
        orgId: techfix.id,
        supplierId: tfSupplier.id,
        status: "RECEIVED",
        reference: "PO-TFX-001",
        orderedAt: daysAgo(15),
        receivedAt: daysAgo(10),
        items: {
          create: [
            { partId: tfParts.lcdIp14.id,  description: "LCD iPhone 14 Screen",  qtyOrdered: 5,  qtyReceived: 5,  unitCost: 180000 },
            { partId: tfParts.batSa53.id,  description: "Samsung A53 Battery",    qtyOrdered: 12, qtyReceived: 12, unitCost: 45000 },
            { partId: tfParts.ssd512.id,   description: "HP 512GB NVMe SSD",      qtyOrdered: 8,  qtyReceived: 8,  unitCost: 120000 },
          ],
        },
      },
    });
  })();
  void tfPo; // used for reference in reason strings below

  // Stock transactions
  async function ensureStockTxn(partId: string, type: "IN" | "OUT", quantity: number, reason: string, jobId?: string) {
    const existing = await prisma.partStockTransaction.findFirst({ where: { partId, type, reason } });
    if (existing) return existing;
    return prisma.partStockTransaction.create({ data: { partId, type, quantity, reason, jobId: jobId ?? null } });
  }

  // Resolve jobIds for TFX-001 and TFX-007
  const tfJob001 = await prisma.job.findUnique({ where: { jobNumber: "TFX-001" }, select: { id: true } });
  const tfJob007 = await prisma.job.findUnique({ where: { jobNumber: "TFX-007" }, select: { id: true } });

  await ensureStockTxn(tfParts.lcdIp14.id,  "IN",  5,  "PO-TFX-001 receipt");
  await ensureStockTxn(tfParts.batSa53.id,  "IN", 12,  "PO-TFX-001 receipt");
  await ensureStockTxn(tfParts.ssd512.id,   "IN",  8,  "PO-TFX-001 receipt");
  if (tfJob001) await ensureStockTxn(tfParts.lcdIp14.id, "OUT", 1, "Used in repair", tfJob001.id);
  if (tfJob007) await ensureStockTxn(tfParts.ssd512.id,  "OUT", 1, "Used in repair", tfJob007.id);

  // Sales
  async function ensureSale(
    orgId: string,
    saleNumber: string,
    clientId: string | null,
    branchId: string | null,
    billingMode: "CASH" | "INVOICE",
    totalAmount: number,
    paidAmount: number,
    currency: string,
    items: Array<{ description: string; qty: number; unitPrice: number; lineTotal: number }>,
  ) {
    const existing = await prisma.sale.findUnique({ where: { saleNumber } });
    if (existing) return existing;
    return prisma.sale.create({
      data: {
        orgId,
        saleNumber,
        clientId,
        branchId,
        status: "PAID",
        billingMode,
        currency,
        subtotal: totalAmount,
        totalAmount,
        paidAmount,
        paidAt: daysAgo(1),
        items: {
          create: items.map((i) => ({
            description: i.description,
            quantity: i.qty,
            unitPrice: i.unitPrice,
            lineTotal: i.lineTotal,
          })),
        },
      },
    });
  }

  const tfSale1 = await ensureSale(
    techfix.id, "SAL-TFX-001",
    tfClients[0].id, tfMainBranch.id, "CASH",
    320000, 320000, "UGX",
    [{ description: "iPhone 14 Screen Replacement", qty: 1, unitPrice: 320000, lineTotal: 320000 }],
  );
  const tfSale2 = await ensureSale(
    techfix.id, "SAL-TFX-002",
    tfClients[1].id, null, "CASH",
    85000, 85000, "UGX",
    [{ description: "Samsung A53 Battery Replacement", qty: 1, unitPrice: 85000, lineTotal: 85000 }],
  );
  const tfSale3 = await ensureSale(
    techfix.id, "SAL-TFX-003",
    tfClients[0].id, null, "CASH",
    280000, 280000, "UGX",
    [{ description: "HP 512GB NVMe SSD Replacement + OS Reinstall", qty: 1, unitPrice: 280000, lineTotal: 280000 }],
  );
  void tfSale2; void tfSale3;

  // Payments for Sales
  async function ensureSalePayment(orgId: string, saleId: string, amount: number, method: "CASH" | "MOBILE_MONEY", currency: string) {
    const existing = await prisma.payment.findFirst({ where: { saleId, orgId } });
    if (existing) return existing;
    return prisma.payment.create({ data: { orgId, saleId, amount, method, currency, receivedAt: daysAgo(1) } });
  }

  await ensureSalePayment(techfix.id, tfSale1.id, 320000, "CASH",         "UGX");
  await ensureSalePayment(techfix.id, tfSale2.id,  85000, "MOBILE_MONEY", "UGX");
  await ensureSalePayment(techfix.id, tfSale3.id, 280000, "CASH",         "UGX");

  // Invoices for completed jobs
  async function ensureInvoice(
    orgId: string,
    jobNumber: string,
    invoiceNumber: string,
    totalAmount: number,
    paidAmount: number,
    currency: string,
    paymentMethod: "CASH" | "MOBILE_MONEY",
  ) {
    const job = await prisma.job.findUnique({ where: { jobNumber }, select: { id: true } });
    if (!job) return;
    const existing = await prisma.invoice.findUnique({ where: { jobId: job.id } });
    const inv = existing
      ? existing
      : await prisma.invoice.create({
          data: {
            orgId,
            jobId: job.id,
            invoiceNumber,
            currency,
            status: "PAID",
            totalAmount,
            paidAmount,
            paidAt: daysAgo(2),
          },
        });
    // Ensure payment for invoice
    const existingPmt = await prisma.payment.findFirst({ where: { invoiceId: inv.id, orgId } });
    if (!existingPmt) {
      await prisma.payment.create({
        data: { orgId, invoiceId: inv.id, amount: paidAmount, method: paymentMethod, currency, receivedAt: daysAgo(2) },
      });
    }
    return inv;
  }

  await ensureInvoice(techfix.id, "TFX-001", "INV-TFX-001", 320000, 320000, "UGX", "CASH");
  await ensureInvoice(techfix.id, "TFX-005", "INV-TFX-005", 120000, 120000, "UGX", "MOBILE_MONEY");
  await ensureInvoice(techfix.id, "TFX-007", "INV-TFX-007", 280000, 280000, "UGX", "CASH");

  // Complaints
  async function ensureComplaint(data: {
    orgId: string;
    complaintNumber: string;
    status: "RECEIVED" | "ACKNOWLEDGED" | "INVESTIGATING" | "RESOLVED" | "CLOSED";
    category: "SERVICE_QUALITY" | "REPAIR_DELAY" | "BILLING" | "STAFF_CONDUCT" | "DAMAGE_CAUSED" | "UNRESOLVED_FAULT" | "OTHER";
    clientName: string;
    clientPhone: string;
    description: string;
    resolution?: string;
    resolvedAt?: Date;
  }) {
    const existing = await prisma.complaint.findUnique({ where: { complaintNumber: data.complaintNumber } });
    if (existing) return existing;
    return prisma.complaint.create({
      data: {
        orgId: data.orgId,
        complaintNumber: data.complaintNumber,
        status: data.status,
        category: data.category,
        clientName: data.clientName,
        clientPhone: data.clientPhone,
        description: data.description,
        resolution: data.resolution ?? null,
        resolvedAt: data.resolvedAt ?? null,
      },
    });
  }

  await ensureComplaint({
    orgId: techfix.id,
    complaintNumber: "CMP-2025-0001",
    status: "RESOLVED",
    category: "REPAIR_DELAY",
    clientName: "Aisha Namukasa",
    clientPhone: "+256701001001",
    description: "My phone repair took 2 weeks instead of 3 days as promised",
    resolution: "Apologised, offered 10% discount on next repair",
    resolvedAt: daysAgo(3),
  });
  await ensureComplaint({
    orgId: techfix.id,
    complaintNumber: "CMP-2025-0002",
    status: "INVESTIGATING",
    category: "SERVICE_QUALITY",
    clientName: "Brian Kavuma",
    clientPhone: "+256701001002",
    description: "Laptop returned but keyboard still sticking after supposed repair",
  });
  await ensureComplaint({
    orgId: techfix.id,
    complaintNumber: "CMP-2025-0003",
    status: "RECEIVED",
    category: "BILLING",
    clientName: "Cynthia Tendo",
    clientPhone: "+256701001003",
    description: "Was quoted 100k but charged 120k without explanation",
  });

  console.log("✓ TechFix Uganda — expanded: branches, groups, parts, supplier, PO, stock, sales, invoices, payments, complaints");

  // ── TechFix Uganda: Repair Requests (intake page) ────────────────────────
  async function ensureRepairRequest(data: {
    orgId: string;
    requestNumber: string;
    requestStatus: "PENDING_FRONT_DESK" | "PENDING_INTAKE" | "APPROVED" | "CONVERTED_TO_JOB";
    customerName: string;
    phone: string;
    deviceType: DeviceType;
    brand: string;
    model: string;
    problemDescription: string;
  }) {
    const existing = await prisma.repairRequest.findUnique({ where: { requestNumber: data.requestNumber } });
    if (existing) return existing;
    return prisma.repairRequest.create({
      data: {
        orgId: data.orgId,
        requestNumber: data.requestNumber,
        requestStatus: data.requestStatus,
        customerName: data.customerName,
        phone: data.phone,
        deviceType: data.deviceType,
        brand: data.brand,
        model: data.model,
        problemDescription: data.problemDescription,
        handoverMethod: "SELF_DROPOFF",
        preferredContactMethod: "WHATSAPP",
      },
    });
  }

  await ensureRepairRequest({ orgId: techfix.id, requestNumber: "RR-TFX-2026-0001", requestStatus: "PENDING_FRONT_DESK", customerName: "Josephine Nalwoga", phone: "+256702001001", deviceType: "PHONE_IPHONE", brand: "Apple", model: "iPhone 13", problemDescription: "Phone fell in water, now shows apple logo then turns off" });
  await ensureRepairRequest({ orgId: techfix.id, requestNumber: "RR-TFX-2026-0002", requestStatus: "PENDING_FRONT_DESK", customerName: "Robert Ssekabira", phone: "+256702001002", deviceType: "WINDOWS_PC", brand: "Lenovo", model: "ThinkPad X1 Carbon", problemDescription: "Laptop screen has vertical lines and flickering" });
  await ensureRepairRequest({ orgId: techfix.id, requestNumber: "RR-TFX-2026-0003", requestStatus: "PENDING_INTAKE", customerName: "Agnes Atim", phone: "+256702001003", deviceType: "PHONE_ANDROID", brand: "Tecno", model: "Spark 10", problemDescription: "Phone not charging at all, tried different cables" });
  await ensureRepairRequest({ orgId: techfix.id, requestNumber: "RR-TFX-2026-0004", requestStatus: "PENDING_INTAKE", customerName: "Emmanuel Opio", phone: "+256702001004", deviceType: "TABLET", brand: "Samsung", model: "Galaxy Tab A8", problemDescription: "Tablet screen cracked after drop from table" });
  await ensureRepairRequest({ orgId: techfix.id, requestNumber: "RR-TFX-2026-0005", requestStatus: "APPROVED", customerName: "Patience Nakibuuka", phone: "+256702001005", deviceType: "MAC", brand: "Apple", model: "MacBook Pro 13 M2", problemDescription: "Keyboard liquid spill, multiple keys not registering" });
  await ensureRepairRequest({ orgId: techfix.id, requestNumber: "RR-TFX-2026-0006", requestStatus: "CONVERTED_TO_JOB", customerName: "Timothy Byaruhanga", phone: "+256702001006", deviceType: "PHONE_ANDROID", brand: "Samsung", model: "Galaxy S23", problemDescription: "Battery inflated and back glass popping open" });

  // ── TechFix Uganda: External jobs for payouts page ───────────────────────
  // Resolve the ext user
  const tfExtUser = await prisma.user.findUnique({ where: { email: "ext@techfix.ug" }, select: { id: true } });

  if (tfExtUser) {
    const extClientA = await createClient(techfix.id, "Harriet Nabwire",  "+256703001001", "harriet@biz.ug");
    const extClientB = await createClient(techfix.id, "Samuel Kawooya",   "+256703001002");
    const extClientC = await createClient(techfix.id, "Lydia Nakirya",    "+256703001003", "lydia@work.ug");
    const extClientD = await createClient(techfix.id, "Patrick Mukaaya",  "+256703001004");

    const extJobs = [
      { n: "TFX-EXT-001", clientId: extClientA.id, device: "MAC" as DeviceType, brand: "Apple", model: "MacBook Pro 14 M3", issue: "Logic board failure, water damage from spill", diagnosis: "Board-level repair completed", bill: 450000, received: daysAgo(20), completed: daysAgo(14) },
      { n: "TFX-EXT-002", clientId: extClientB.id, device: "PHONE_IPHONE" as DeviceType, brand: "Apple", model: "iPhone 15 Pro", issue: "Face ID not working, proximity sensor fault", diagnosis: "Face ID module replaced by specialist", bill: 280000, received: daysAgo(18), completed: daysAgo(11) },
      { n: "TFX-EXT-003", clientId: extClientC.id, device: "WINDOWS_PC" as DeviceType, brand: "Dell", model: "XPS 15 9530", issue: "GPU failure, artifacting on screen", diagnosis: "GPU reball completed, thermal compound replaced", bill: 390000, received: daysAgo(15), completed: daysAgo(8) },
      { n: "TFX-EXT-004", clientId: extClientD.id, device: "PHONE_ANDROID" as DeviceType, brand: "Huawei", model: "P60 Pro", issue: "Baseband issue, no network signal", diagnosis: "Baseband IC replaced by specialist", bill: 220000, received: daysAgo(10), completed: daysAgo(5) },
      { n: "TFX-EXT-005", clientId: extClientA.id, device: "MAC" as DeviceType, brand: "Apple", model: "Mac Mini M2", issue: "SSD failure, data recovery needed", diagnosis: "SSD chip-level data recovery done", bill: 350000, received: daysAgo(8), completed: daysAgo(3) },
    ];

    for (const j of extJobs) {
      const job = await createJob({
        orgId: techfix.id,
        jobNumber: j.n,
        status: "COMPLETED" as JobStatus,
        repairPath: "EXTERNAL",
        clientId: j.clientId,
        createdById: tfOps.id,
        assignedToId: tfExtUser.id,
        deviceType: j.device,
        brand: j.brand,
        model: j.model,
        issueDescription: j.issue,
        diagnosisNotes: j.diagnosis,
        clientBill: j.bill,
        workDone: j.diagnosis,
        receivedAt: j.received,
        completedAt: j.completed,
      });
      await ensureAudit(job.id, tfOps.id, "JOB_CREATED", { seeded: true, org: "techfix-ug", jobNumber: j.n });
    }
  }

  // ── TechFix Uganda: Additional invoices (invoices page) ──────────────────
  // Create extra jobs to attach invoices to (invoices need unique jobIds)
  const invClientA = await createClient(techfix.id, "Gloria Namusoke",  "+256704001001", "gloria@ngo.ug");
  const invClientB = await createClient(techfix.id, "Ivan Mukiibi",     "+256704001002");

  async function ensureJobForInvoice(
    orgId: string,
    jobNumber: string,
    clientId: string,
    createdById: string,
    device: DeviceType,
    brand: string,
    model: string,
    issue: string,
    diagnosis: string,
    bill: number,
    received: Date,
    completed: Date,
  ) {
    const existing = await prisma.job.findUnique({ where: { jobNumber }, select: { id: true } });
    if (existing) return existing;
    return prisma.job.create({
      data: {
        orgId,
        jobNumber,
        status: "COMPLETED",
        repairPath: "IN_HOUSE",
        clientId,
        createdById,
        deviceType: device,
        brand,
        model,
        issueDescription: issue,
        diagnosisNotes: diagnosis,
        clientBill: bill,
        workDone: diagnosis,
        receivedAt: received,
        completedAt: completed,
      },
    });
  }

  const invJob1 = await ensureJobForInvoice(techfix.id, "TFX-INV-J001", invClientA.id, tfOps.id, "PHONE_IPHONE", "Apple", "iPhone 12 mini", "Home button flex replacement", "Home button flex cable replaced", 95000, daysAgo(30), daysAgo(27));
  const invJob2 = await ensureJobForInvoice(techfix.id, "TFX-INV-J002", invClientB.id, tfOps.id, "WINDOWS_PC", "HP", "Pavilion 15", "Motherboard cleaning after dust buildup", "Full motherboard cleaning, thermal paste replaced", 75000, daysAgo(25), daysAgo(22));
  const invJob3 = await ensureJobForInvoice(techfix.id, "TFX-INV-J003", invClientA.id, tfOps.id, "PHONE_ANDROID", "Infinix", "Hot 40 Pro", "Speaker replacement, no audio during calls", "Speaker module replaced, audio restored", 55000, daysAgo(22), daysAgo(19));

  async function ensureInvoiceWithStatus(
    orgId: string,
    jobId: string,
    invoiceNumber: string,
    totalAmount: number,
    paidAmount: number,
    currency: string,
    status: "DRAFT" | "ISSUED" | "PAID" | "VOID",
    paymentMethod?: "CASH" | "MOBILE_MONEY" | "BANK_TRANSFER",
    issuedDaysAgo?: number,
  ) {
    const existing = await prisma.invoice.findUnique({ where: { jobId } });
    if (existing) return existing;
    const inv = await prisma.invoice.create({
      data: {
        orgId,
        jobId,
        invoiceNumber,
        currency,
        status,
        totalAmount,
        paidAmount,
        paidAt: status === "PAID" ? daysAgo(issuedDaysAgo ? issuedDaysAgo - 1 : 1) : null,
        issuedAt: daysAgo(issuedDaysAgo ?? 2),
      },
    });
    if (status === "PAID" && paymentMethod && paidAmount > 0) {
      const existingPmt = await prisma.payment.findFirst({ where: { invoiceId: inv.id, orgId } });
      if (!existingPmt) {
        await prisma.payment.create({
          data: { orgId, invoiceId: inv.id, amount: paidAmount, method: paymentMethod, currency, receivedAt: daysAgo(issuedDaysAgo ? issuedDaysAgo - 1 : 1) },
        });
      }
    }
    return inv;
  }

  await ensureInvoiceWithStatus(techfix.id, invJob1.id, "INV-TFX-101", 95000,  95000, "UGX", "PAID",   "MOBILE_MONEY", 27);
  await ensureInvoiceWithStatus(techfix.id, invJob2.id, "INV-TFX-102", 75000,  75000, "UGX", "PAID",   "CASH",         22);
  await ensureInvoiceWithStatus(techfix.id, invJob3.id, "INV-TFX-103", 55000,  0,     "UGX", "DRAFT");

  // A couple more jobs with ISSUED (outstanding) invoices
  const invJob4 = await ensureJobForInvoice(techfix.id, "TFX-INV-J004", invClientB.id, tfOps.id, "PHONE_IPHONE", "Apple", "iPhone 11 Pro", "Camera module replacement", "Rear triple camera replaced", 185000, daysAgo(10), daysAgo(7));
  const invJob5 = await ensureJobForInvoice(techfix.id, "TFX-INV-J005", invClientA.id, tfOps.id, "WINDOWS_PC", "Acer", "Aspire 5", "Display hinge broken", "Display hinge and bezel replaced", 130000, daysAgo(8), daysAgo(5));

  await ensureInvoiceWithStatus(techfix.id, invJob4.id, "INV-TFX-104", 185000, 0, "UGX", "ISSUED", undefined, 7);
  await ensureInvoiceWithStatus(techfix.id, invJob5.id, "INV-TFX-105", 130000, 0, "UGX", "ISSUED", undefined, 5);

  // ── TechFix Uganda: Additional payments (receipts page) ──────────────────
  // Add standalone sale payments with varied methods
  async function ensureStandaloneSalePayment(orgId: string, saleId: string, amount: number, method: "CASH" | "MOBILE_MONEY" | "BANK_TRANSFER", reference: string | null, receivedDaysAgo: number) {
    const existing = await prisma.payment.findFirst({ where: { saleId, orgId, method } });
    if (existing) return existing;
    return prisma.payment.create({ data: { orgId, saleId, amount, method, reference, currency: "UGX", receivedAt: daysAgo(receivedDaysAgo) } });
  }

  // Add a bank transfer and card sale for variety
  const tfSale4 = await (async () => {
    const existing = await prisma.sale.findUnique({ where: { saleNumber: "SAL-TFX-004" } });
    if (existing) return existing;
    return prisma.sale.create({
      data: {
        orgId: techfix.id, saleNumber: "SAL-TFX-004", clientId: invClientA.id, branchId: tfMainBranch.id,
        status: "PAID", billingMode: "CASH", currency: "UGX",
        subtotal: 160000, totalAmount: 160000, paidAmount: 160000, paidAt: daysAgo(5),
        items: { create: [{ description: "USB-C Charger + Screen Guard Bundle", quantity: 2, unitPrice: 80000, lineTotal: 160000 }] },
      },
    });
  })();

  const tfSale5 = await (async () => {
    const existing = await prisma.sale.findUnique({ where: { saleNumber: "SAL-TFX-005" } });
    if (existing) return existing;
    return prisma.sale.create({
      data: {
        orgId: techfix.id, saleNumber: "SAL-TFX-005", clientId: invClientB.id, branchId: null,
        status: "PAID", billingMode: "CASH", currency: "UGX",
        subtotal: 45000, totalAmount: 45000, paidAmount: 45000, paidAt: daysAgo(3),
        items: { create: [{ description: "Samsung A53 Tempered Glass + Case", quantity: 1, unitPrice: 45000, lineTotal: 45000 }] },
      },
    });
  })();

  await ensureStandaloneSalePayment(techfix.id, tfSale4.id, 160000, "BANK_TRANSFER", "TXN-BK-20260501", 5);
  await ensureStandaloneSalePayment(techfix.id, tfSale5.id,  45000, "MOBILE_MONEY",  "MTN-7689034",     3);

  // ── TechFix Uganda: Delivery Notes (delivery-notes page) ─────────────────
  async function ensureDeliveryNote(data: {
    orgId: string;
    deliveryNoteNumber: string;
    invoiceId?: string;
    saleId?: string;
    deliveredByName: string;
    receivedByName: string;
    deliveredDaysAgo: number;
    items: Array<{ description: string; quantity: number }>;
  }) {
    const existing = await prisma.deliveryNote.findUnique({ where: { deliveryNoteNumber: data.deliveryNoteNumber } });
    if (existing) return existing;
    return prisma.deliveryNote.create({
      data: {
        orgId: data.orgId,
        deliveryNoteNumber: data.deliveryNoteNumber,
        invoiceId: data.invoiceId ?? null,
        saleId: data.saleId ?? null,
        deliveredByName: data.deliveredByName,
        receivedByName: data.receivedByName,
        deliveredAt: daysAgo(data.deliveredDaysAgo),
        items: { create: data.items.map((i) => ({ description: i.description, quantity: i.quantity })) },
      },
    });
  }

  // Fetch invoice IDs for completed invoices
  const invTfx001 = await prisma.invoice.findUnique({ where: { invoiceNumber: "INV-TFX-001" }, select: { id: true } });
  const invTfx005 = await prisma.invoice.findUnique({ where: { invoiceNumber: "INV-TFX-005" }, select: { id: true } });
  const invTfx101 = await prisma.invoice.findUnique({ where: { invoiceNumber: "INV-TFX-101" }, select: { id: true } });

  if (invTfx001) {
    await ensureDeliveryNote({
      orgId: techfix.id, deliveryNoteNumber: "DN-TFX-2026-001",
      invoiceId: invTfx001.id,
      deliveredByName: "Moses Ssemakula", receivedByName: "Aisha Namukasa",
      deliveredDaysAgo: 8,
      items: [{ description: "Apple iPhone 14 (repaired — screen replaced)", quantity: 1 }],
    });
  }

  if (invTfx005) {
    await ensureDeliveryNote({
      orgId: techfix.id, deliveryNoteNumber: "DN-TFX-2026-002",
      invoiceId: invTfx005.id,
      deliveredByName: "David Ochieng", receivedByName: "Esther Namata",
      deliveredDaysAgo: 4,
      items: [{ description: "Samsung Galaxy Tab S7 (repaired — charging port replaced)", quantity: 1 }],
    });
  }

  if (invTfx101) {
    await ensureDeliveryNote({
      orgId: techfix.id, deliveryNoteNumber: "DN-TFX-2026-003",
      invoiceId: invTfx101.id,
      deliveredByName: "Moses Ssemakula", receivedByName: "Gloria Namusoke",
      deliveredDaysAgo: 26,
      items: [{ description: "Apple iPhone 12 mini (repaired — home button flex replaced)", quantity: 1 }],
    });
  }

  await ensureDeliveryNote({
    orgId: techfix.id, deliveryNoteNumber: "DN-TFX-2026-004",
    saleId: tfSale4.id,
    deliveredByName: "Sandra Akello", receivedByName: "Gloria Namusoke",
    deliveredDaysAgo: 5,
    items: [
      { description: "USB-C Charger", quantity: 1 },
      { description: "Screen Protector (Tempered Glass)", quantity: 1 },
    ],
  });

  // ── TechFix Uganda: POS Sales (pos page) ─────────────────────────────────
  const posClients = await Promise.all([
    createClient(techfix.id, "Winnie Nakabugo",  "+256705001001"),
    createClient(techfix.id, "Charles Sempijja", "+256705001002"),
    createClient(techfix.id, "Deborah Acom",     "+256705001003"),
  ]);

  async function ensurePosSale(
    orgId: string,
    saleNumber: string,
    clientId: string | null,
    branchId: string | null,
    status: "OPEN" | "PAID" | "VOID",
    totalAmount: number,
    paidAmount: number,
    currency: string,
    paidDaysAgo: number | null,
    items: Array<{ description: string; quantity: number; unitPrice: number; lineTotal: number }>,
    paymentMethod?: "CASH" | "MOBILE_MONEY" | "BANK_TRANSFER",
  ) {
    const existing = await prisma.sale.findUnique({ where: { saleNumber } });
    if (existing) return existing;
    const sale = await prisma.sale.create({
      data: {
        orgId, saleNumber, clientId, branchId,
        status, billingMode: "CASH", currency,
        subtotal: totalAmount, totalAmount, paidAmount,
        paidAt: paidDaysAgo !== null ? daysAgo(paidDaysAgo) : null,
        items: { create: items },
      },
    });
    if (status === "PAID" && paymentMethod && paidDaysAgo !== null) {
      const existingPmt = await prisma.payment.findFirst({ where: { saleId: sale.id, orgId } });
      if (!existingPmt) {
        await prisma.payment.create({ data: { orgId, saleId: sale.id, amount: paidAmount, method: paymentMethod, currency, receivedAt: daysAgo(paidDaysAgo) } });
      }
    }
    return sale;
  }

  await ensurePosSale(techfix.id, "SAL-TFX-POS-001", posClients[0].id, tfMainBranch.id, "PAID", 120000, 120000, "UGX", 6,
    [{ description: "iPhone 14 Pro Tempered Glass (OEM)", quantity: 2, unitPrice: 35000, lineTotal: 70000 }, { description: "iPhone Charging Cable (Lightning)", quantity: 1, unitPrice: 50000, lineTotal: 50000 }], "CASH");

  await ensurePosSale(techfix.id, "SAL-TFX-POS-002", posClients[1].id, tfMainBranch.id, "PAID", 85000, 85000, "UGX", 5,
    [{ description: "Samsung Galaxy A54 Flip Case", quantity: 1, unitPrice: 45000, lineTotal: 45000 }, { description: "Micro USB to USB-C Adapter (x2)", quantity: 2, unitPrice: 20000, lineTotal: 40000 }], "MOBILE_MONEY");

  await ensurePosSale(techfix.id, "SAL-TFX-POS-003", posClients[2].id, null, "PAID", 200000, 200000, "UGX", 4,
    [{ description: "Generic Laptop Cooling Pad", quantity: 1, unitPrice: 80000, lineTotal: 80000 }, { description: "USB Hub 4-Port", quantity: 2, unitPrice: 60000, lineTotal: 120000 }], "BANK_TRANSFER");

  await ensurePosSale(techfix.id, "SAL-TFX-POS-004", null, tfMainBranch.id, "PAID", 30000, 30000, "UGX", 2,
    [{ description: "Screen Cleaning Kit", quantity: 3, unitPrice: 10000, lineTotal: 30000 }], "CASH");

  await ensurePosSale(techfix.id, "SAL-TFX-POS-005", posClients[0].id, tfMainBranch.id, "OPEN", 150000, 0, "UGX", null,
    [{ description: "Laptop Bag (15.6-inch)", quantity: 1, unitPrice: 150000, lineTotal: 150000 }]);

  // ── TechFix Uganda: Outbound Messages (notifications outbox page) ─────────
  async function ensureOutboundMessage(data: {
    orgId: string;
    channel: "WHATSAPP" | "EMAIL";
    type: "JOB_CREATED" | "JOB_COMPLETED" | "JOB_STATUS_UPDATE" | "REPAIR_REQUEST_CONFIRMATION" | "FRONT_DESK_APPROVED" | "ADMIN_TEST";
    status: "PENDING" | "SENT" | "FAILED" | "DEAD";
    to: string;
    body: string;
    subject?: string;
    sentDaysAgo?: number;
    jobId?: string;
  }) {
    const existing = await prisma.outboundMessage.findFirst({
      where: { orgId: data.orgId, to: data.to, type: data.type, body: data.body },
    });
    if (existing) return existing;
    return prisma.outboundMessage.create({
      data: {
        orgId: data.orgId,
        channel: data.channel,
        type: data.type,
        status: data.status,
        to: data.to,
        body: data.body,
        subject: data.subject ?? null,
        sentAt: data.sentDaysAgo !== undefined ? daysAgo(data.sentDaysAgo) : null,
        jobId: data.jobId ?? null,
        attemptCount: data.status === "PENDING" ? 0 : 1,
        lastAttemptAt: data.sentDaysAgo !== undefined ? daysAgo(data.sentDaysAgo) : null,
        nextAttemptAt: data.status === "PENDING" ? now : daysAgo(0),
      },
    });
  }

  const tfJob001Row = await prisma.job.findUnique({ where: { jobNumber: "TFX-001" }, select: { id: true } });
  const tfJob005Row = await prisma.job.findUnique({ where: { jobNumber: "TFX-005" }, select: { id: true } });
  const tfJob007Row = await prisma.job.findUnique({ where: { jobNumber: "TFX-007" }, select: { id: true } });

  await ensureOutboundMessage({ orgId: techfix.id, channel: "WHATSAPP", type: "JOB_CREATED", status: "SENT", to: "+256701001001", body: "Dear Aisha, your repair job TFX-001 has been received. We will keep you updated.", sentDaysAgo: 12, jobId: tfJob001Row?.id });
  await ensureOutboundMessage({ orgId: techfix.id, channel: "WHATSAPP", type: "JOB_COMPLETED", status: "SENT", to: "+256701001001", body: "Good news! Your iPhone 14 is ready for pickup. Job TFX-001.", sentDaysAgo: 8, jobId: tfJob001Row?.id });
  await ensureOutboundMessage({ orgId: techfix.id, channel: "WHATSAPP", type: "JOB_CREATED", status: "SENT", to: "+256701001005", body: "Dear Esther, your repair job TFX-005 has been received. We will keep you updated.", sentDaysAgo: 7, jobId: tfJob005Row?.id });
  await ensureOutboundMessage({ orgId: techfix.id, channel: "WHATSAPP", type: "JOB_COMPLETED", status: "SENT", to: "+256701001005", body: "Your Samsung Tab S7 charging port has been repaired. Job TFX-005 ready for pickup!", sentDaysAgo: 4, jobId: tfJob005Row?.id });
  await ensureOutboundMessage({ orgId: techfix.id, channel: "WHATSAPP", type: "JOB_STATUS_UPDATE", status: "FAILED", to: "+256701001001", body: "Your HP EliteBook SSD replacement is complete. Job TFX-007 — please collect at your earliest.", sentDaysAgo: 1, jobId: tfJob007Row?.id });
  await ensureOutboundMessage({ orgId: techfix.id, channel: "EMAIL", type: "JOB_CREATED", status: "SENT", to: "aisha@gmail.com", subject: "Repair Job Received — TFX-001", body: "Dear Aisha Namukasa,\n\nYour repair request for an iPhone 14 has been received. Job reference: TFX-001.\n\nWe will contact you once diagnosis is complete.\n\nTechFix Uganda", sentDaysAgo: 12, jobId: tfJob001Row?.id });
  await ensureOutboundMessage({ orgId: techfix.id, channel: "WHATSAPP", type: "REPAIR_REQUEST_CONFIRMATION", status: "SENT", to: "+256702001001", body: "Thank you Josephine! We have received your repair request RR-TFX-2026-0001. Our team will review it shortly.", sentDaysAgo: 2 });
  await ensureOutboundMessage({ orgId: techfix.id, channel: "WHATSAPP", type: "ADMIN_TEST", status: "PENDING", to: "+256700111222", body: "Test message from TechFix Uganda notification system." });
  await ensureOutboundMessage({ orgId: techfix.id, channel: "EMAIL", type: "JOB_STATUS_UPDATE", status: "FAILED", to: "cynthia@work.co.ug", subject: "Update on your Repair — TFX-003", body: "Dear Cynthia, we have a cost estimate ready for your Samsung Galaxy A53 battery replacement. Please call us to approve.", sentDaysAgo: 2 });

  // ── TechFix Uganda: Communication Templates (templates page) ─────────────
  async function ensureCommunicationTemplate(data: {
    orgId: string;
    key: string;
    channel: "WHATSAPP" | "EMAIL";
    label: string;
    subject?: string;
    body: string;
    variables?: string;
    isActive?: boolean;
  }) {
    const existing = await prisma.communicationTemplate.findFirst({
      where: { key: data.key, channel: data.channel, orgId: data.orgId },
    });
    if (existing) return existing;
    return prisma.communicationTemplate.create({
      data: {
        orgId: data.orgId,
        key: data.key,
        channel: data.channel,
        label: data.label,
        subject: data.subject ?? null,
        body: data.body,
        variables: data.variables ?? null,
        isActive: data.isActive ?? true,
      },
    });
  }

  await ensureCommunicationTemplate({ orgId: techfix.id, key: "job_created_wa", channel: "WHATSAPP", label: "Job Created (WhatsApp)", body: "Dear {{customerName}}, your repair job {{jobNumber}} for {{deviceBrand}} {{deviceModel}} has been received at TechFix Uganda. We will contact you once diagnosis is complete.", variables: '["customerName","jobNumber","deviceBrand","deviceModel"]' });
  await ensureCommunicationTemplate({ orgId: techfix.id, key: "job_completed_wa", channel: "WHATSAPP", label: "Job Completed (WhatsApp)", body: "Great news {{customerName}}! Your {{deviceBrand}} {{deviceModel}} has been repaired. Job {{jobNumber}} is ready for pickup. Our address: Plot 45, Nakivubo Road, Kampala.", variables: '["customerName","deviceBrand","deviceModel","jobNumber"]' });
  await ensureCommunicationTemplate({ orgId: techfix.id, key: "awaiting_approval_wa", channel: "WHATSAPP", label: "Awaiting Approval (WhatsApp)", body: "Hello {{customerName}}, we have completed the diagnosis for your {{deviceBrand}} {{deviceModel}} (Job {{jobNumber}}). Estimated repair cost: UGX {{costEstimate}}. Please reply YES to approve or NO to decline.", variables: '["customerName","deviceBrand","deviceModel","jobNumber","costEstimate"]' });
  await ensureCommunicationTemplate({ orgId: techfix.id, key: "job_created_email", channel: "EMAIL", label: "Job Created (Email)", subject: "Repair Job Received — {{jobNumber}}", body: "Dear {{customerName}},\n\nThank you for bringing your {{deviceBrand}} {{deviceModel}} to TechFix Uganda.\n\nYour job reference is: {{jobNumber}}\n\nWe will notify you once our technician has completed the initial diagnosis.\n\nBest regards,\nTechFix Uganda Team", variables: '["customerName","deviceBrand","deviceModel","jobNumber"]' });
  await ensureCommunicationTemplate({ orgId: techfix.id, key: "repair_request_confirm_wa", channel: "WHATSAPP", label: "Repair Request Confirmation (WhatsApp)", body: "Hi {{customerName}}, we have received your online repair request (Ref: {{requestNumber}}) for your {{deviceBrand}}. Our front desk team will contact you shortly to confirm the appointment.", variables: '["customerName","requestNumber","deviceBrand"]' });

  // ── TechFix Uganda: Third branch ─────────────────────────────────────────
  await ensureBranch(techfix.id, "Mbarara Branch", "Ntare Road, Mbarara City", false);

  console.log("✓ TechFix Uganda — added: repair requests, external jobs, invoices, delivery notes, POS sales, outbound messages, templates, third branch");

  // ────────────────────────────────────────────────────────────────────────────
  // EXPANSION — FixIt Fast Ghana: extra users, branches, parts, supplier,
  //             invoices, payments, complaint
  // ────────────────────────────────────────────────────────────────────────────

  await Promise.all([
    upsertUser({ orgId: fixitfast.id, name: "Efua Asare",    email: "techmanager@fixitfast.gh", role: "TECH_MANAGER" }),
    upsertUser({ orgId: fixitfast.id, name: "Esi Boateng",   email: "manager@fixitfast.gh",     role: "MANAGER" }),
  ]);

  await ensureBranch(fixitfast.id, "Osu Branch",  "Osu Oxford Street, Accra",    true);
  await ensureBranch(fixitfast.id, "Tema Branch", "Tema Community 1, Accra",     false);

  const ffParts = {
    lcdSa73:   await ensurePart(fixitfast.id, "LCD-SA73",    "Samsung A73 AMOLED",            350,  4),
    lbMbp16:   await ensurePart(fixitfast.id, "LB-MBP16",    "MacBook Pro Logic Board",      1800,  2),
    lcdIp15pm: await ensurePart(fixitfast.id, "LCD-IP15PM",  "iPhone 15 Pro Max Display",    2200,  2),
    bgPx8:     await ensurePart(fixitfast.id, "BG-PX8",      "Pixel 8 Back Glass",            280,  5),
    micIp13m:  await ensurePart(fixitfast.id, "MIC-IP13M",   "iPhone 13 mini Mic Module",     180,  8),
  };
  void ffParts;

  await (async () => {
    const existing = await prisma.supplier.findFirst({ where: { orgId: fixitfast.id, name: "GhanaSpares Ltd" } });
    if (!existing) {
      await prisma.supplier.create({
        data: { orgId: fixitfast.id, name: "GhanaSpares Ltd", phone: "+233501234567" },
      });
    }
  })();

  await ensureInvoice(fixitfast.id, "FIF-001", "INV-FIF-001", 550,  550,  "GHS", "CASH");
  await ensureInvoice(fixitfast.id, "FIF-002", "INV-FIF-002", 2800, 2800, "GHS", "MOBILE_MONEY");
  await ensureInvoice(fixitfast.id, "FIF-009", "INV-FIF-009", 380,  380,  "GHS", "CASH");

  await ensureComplaint({
    orgId: fixitfast.id,
    complaintNumber: "CMP-GH-0001",
    status: "ACKNOWLEDGED",
    category: "DAMAGE_CAUSED",
    clientName: "Kojo Mensah",
    clientPhone: "+233240301002",
    description: "Deep scratch on laptop lid that wasn't there before repair",
  });

  console.log("✓ FixIt Fast Ghana — expanded: branches, parts, supplier, invoices, payments, complaint\n");

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════════");
  console.log("  DEMO LOGIN CREDENTIALS  (password: Demo1234!)");
  console.log("═══════════════════════════════════════════════════════");
  console.log("");
  console.log("  TechFix Uganda  (Growth plan — active)");
  console.log("    admin@techfix.ug        → Admin");
  console.log("    ops@techfix.ug          → Ops");
  console.log("    tech@techfix.ug         → Internal Tech");
  console.log("    ext@techfix.ug          → External Tech");
  console.log("    techmanager@techfix.ug  → Tech Manager");
  console.log("    manager@techfix.ug      → Manager");
  console.log("    sales@techfix.ug        → Sales");
  console.log("    fd@techfix.ug           → Front Desk");
  console.log("");
  console.log("  iRepair Kenya  (Starter — trial, 5 days left)");
  console.log("    admin@irepair.ke   → Admin");
  console.log("    ops@irepair.ke     → Ops");
  console.log("");
  console.log("  FixIt Fast Ghana  (Enterprise plan — active)");
  console.log("    admin@fixitfast.gh       → Admin");
  console.log("    ops@fixitfast.gh         → Ops");
  console.log("    ops2@fixitfast.gh        → Ops (second)");
  console.log("    tech@fixitfast.gh        → Internal Tech");
  console.log("    ext@fixitfast.gh         → External Tech");
  console.log("    techmanager@fixitfast.gh → Tech Manager");
  console.log("    manager@fixitfast.gh     → Manager");
  console.log("");
  console.log("═══════════════════════════════════════════════════════");
}

// Only run directly when invoked as a script (not when imported)
if (require.main === module || process.argv[1]?.endsWith("seed-commercial.ts")) {
  seedCommercialData()
    .catch((err) => {
      console.error("Commercial seed failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
