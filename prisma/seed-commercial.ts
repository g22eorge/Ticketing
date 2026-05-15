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
    createClient(techfix.id, "Aisha Namukasa",  "+256701001001", "aisha@gmail.com"),
    createClient(techfix.id, "Brian Kavuma",     "+256701001002"),
    createClient(techfix.id, "Cynthia Tendo",   "+256701001003", "cynthia@work.co.ug"),
    createClient(techfix.id, "Daniel Sentongo",  "+256701001004"),
    createClient(techfix.id, "Esther Namata",   "+256701001005"),
    createClient(techfix.id, "Frank Wasswa",    "+256701001006"),
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
    lcdIp14:  await ensurePart(techfix.id, "LCD-IP14",      "LCD iPhone 14 Screen",          180000, 5),
    batSa53:  await ensurePart(techfix.id, "BAT-SA53",      "Samsung A53 Battery",            45000, 12),
    portUsbc: await ensurePart(techfix.id, "PORT-USBC",     "USB-C Charging Port",            15000, 20),
    kbMbpM1: await ensurePart(techfix.id, "KB-MBP-M1",     "MacBook Keyboard",               95000,  3),
    ssd512:   await ensurePart(techfix.id, "SSD-512-NVMe",  "HP 512GB NVMe SSD",             120000,  8),
    batIp12:  await ensurePart(techfix.id, "BAT-IP12",      "iPhone 12 Battery",              55000,  9),
    pasteTx:  await ensurePart(techfix.id, "PASTE-TX",      "Thermal Paste",                   8000, 25),
    portTabS7: await ensurePart(techfix.id, "PORT-TABS7",   "Samsung Tab S7 Charger Port",    22000,  6),
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
