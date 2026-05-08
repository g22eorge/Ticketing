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
    await createJob({
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
    await createJob({
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
    await createJob({
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
  }

  console.log(`✓ FixIt Fast Ghana — ${ffJobs.length} jobs, 5 users (ENTERPRISE / ACTIVE)\n`);

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════════");
  console.log("  DEMO LOGIN CREDENTIALS  (password: Demo1234!)");
  console.log("═══════════════════════════════════════════════════════");
  console.log("");
  console.log("  TechFix Uganda  (Growth plan — active)");
  console.log("    admin@techfix.ug    → Admin");
  console.log("    ops@techfix.ug     → Ops");
  console.log("    tech@techfix.ug    → Internal Tech");
  console.log("    ext@techfix.ug     → External Tech");
  console.log("");
  console.log("  iRepair Kenya  (Starter — trial, 5 days left)");
  console.log("    admin@irepair.ke   → Admin");
  console.log("    ops@irepair.ke     → Ops");
  console.log("");
  console.log("  FixIt Fast Ghana  (Enterprise plan — active)");
  console.log("    admin@fixitfast.gh → Admin");
  console.log("    ops@fixitfast.gh   → Ops");
  console.log("    ops2@fixitfast.gh  → Ops (second)");
  console.log("    tech@fixitfast.gh  → Internal Tech");
  console.log("    ext@fixitfast.gh   → External Tech");
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
