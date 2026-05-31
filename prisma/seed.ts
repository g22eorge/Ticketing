/**
 * Comprehensive seed file for Eagle Info Repair Manager
 * Seeds: org, users (all roles), 15+ clients, 30+ jobs, invoices, payments,
 * inventory parts, POS sales, bank accounts, expenses, and audit logs.
 *
 * Safe to re-run (idempotent via upsert).
 * Requires ALLOW_DESTRUCTIVE_SEED=1 if protected tables already have data.
 */

import { hashPassword } from "better-auth/crypto";
import {
  DeviceType,
  ExpenseCategory,
  InvoiceStatus,
  JobStatus,
  NotificationChannel,
  NotificationType,
  PaymentMethod,
  Prisma,
  RepairPath,
  Role,
  OutboundMessageChannel,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ensureDefaultAiKnowledge } from "@/lib/ai-knowledge";

// ── Constants ────────────────────────────────────────────────────────────────

const PROTECTED_SEED_TABLES = ["AuditLog", "Photo", "Job", "ClientNote", "Client"] as const;
const EIS_ORG_ID = "org_eis_01";

// ── Guard ────────────────────────────────────────────────────────────────────

async function assertSeedCanReplaceDemoData() {
  let existingRows = 0;
  for (const table of PROTECTED_SEED_TABLES) {
    const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint | number }>>(
      `SELECT COUNT(*) AS count FROM "${table}"`,
    );
    existingRows += Number(rows[0]?.count ?? 0);
  }

  if (existingRows > 0 && process.env.ALLOW_DESTRUCTIVE_SEED !== "1") {
    throw new Error(
      `Refusing to run destructive demo seed: protected business tables contain ${existingRows} rows. ` +
        "Set ALLOW_DESTRUCTIVE_SEED=1 only for disposable local/demo databases.",
    );
  }
}

// ── Comms templates ──────────────────────────────────────────────────────────

function supportsCommsTemplates() {
  return Boolean(Prisma.dmmf.datamodel.models.find((m) => m.name === "CommunicationTemplate"));
}

async function seedDefaultCommsTemplates() {
  if (!supportsCommsTemplates()) return;

  const templates: Array<{
    key: string;
    channel: OutboundMessageChannel;
    label: string;
    subject?: string | null;
    body: string;
  }> = [
    {
      key: "REPAIR_REQUEST_CONFIRMATION",
      channel: "WHATSAPP",
      label: "Repair request confirmation",
      body: [
        "Hello {customerName},",
        "",
        "Thank you for submitting your repair request ({requestNumber}).",
        "",
        "Your request has been received and logged successfully. Our team will contact you shortly with next steps, including device drop-off/pick-up guidance and the diagnosis timeline.",
        "",
        "Best regards,",
        "Eagle Info Solutions",
      ].join("\n"),
    },
    {
      key: "FRONT_DESK_APPROVED",
      channel: "WHATSAPP",
      label: "Intake approved",
      body: [
        "Hello {customerName},",
        "",
        "Your repair request ({requestNumber}) has been APPROVED.",
        "",
        "{preferredDropoffDateLine}",
        "",
        "Please bring your device to our shop at your convenience.",
        "",
        "Best regards,",
        "Eagle Info Solutions",
      ].join("\n"),
    },
    {
      key: "FRONT_DESK_REJECTED",
      channel: "WHATSAPP",
      label: "Intake rejected",
      body: [
        "Hello {customerName},",
        "",
        "Unfortunately, we are unable to process your repair request ({requestNumber}) at this time.",
        "",
        "Please contact us for more information.",
        "",
        "Best regards,",
        "Eagle Info Solutions",
      ].join("\n"),
    },
    {
      key: "JOB_CREATED",
      channel: "WHATSAPP",
      label: "Job created",
      body: [
        "Hello {customerName},",
        "",
        "Your device has been registered as Job #{jobNumber}.",
        "",
        "We will update you as the repair progresses.",
        "",
        "Best regards,",
        "Eagle Info Solutions",
      ].join("\n"),
    },
    {
      key: "JOB_COMPLETED",
      channel: "WHATSAPP",
      label: "Job completed",
      body: [
        "Hello {customerName},",
        "",
        "Great news! Your device (Job #{jobNumber}) is ready for pickup.",
        "",
        "Please visit our shop to collect your device.",
        "",
        "Best regards,",
        "Eagle Info Solutions",
      ].join("\n"),
    },
    {
      key: "JOB_STATUS_UPDATE",
      channel: "WHATSAPP",
      label: "Generic job status update (WhatsApp)",
      body: [
        "Hello {customerName},",
        "",
        "Update on Job #{jobNumber}:",
        "Status: {newStatusLabel}",
        "",
        "Best regards,",
        "Eagle Info Solutions",
      ].join("\n"),
    },
    {
      key: "JOB_STATUS_UPDATE",
      channel: "EMAIL",
      label: "Generic job status update (Email)",
      subject: "Update on Job #{jobNumber}",
      body: [
        "Hello {customerName},",
        "",
        "Update on Job #{jobNumber}:",
        "Status: {newStatusLabel}",
        "",
        "Best regards,",
        "Eagle Info Solutions",
      ].join("\n"),
    },
    {
      key: "READY_FOR_PICKUP_NUDGE_1",
      channel: "WHATSAPP",
      label: "Ready for pickup (nudge 1)",
      body: [
        "Hello {customerName},",
        "",
        "Reminder: Your device for Job #{jobNumber} is ready for pickup.",
        "",
        "Please visit us to collect it.",
        "",
        "Eagle Info Solutions",
      ].join("\n"),
    },
    {
      key: "READY_FOR_PICKUP_NUDGE_2",
      channel: "WHATSAPP",
      label: "Ready for pickup (nudge 2)",
      body: [
        "Hello {customerName},",
        "",
        "Final reminder: Job #{jobNumber} is still ready for pickup.",
        "",
        "If you need delivery, reply and we will advise.",
        "",
        "Eagle Info Solutions",
      ].join("\n"),
    },
  ];

  for (const t of templates) {
    const variables = [
      ...new Set(
        (`${t.subject ?? ""}\n${t.body}`)
          .match(/\{([a-zA-Z0-9_]+)\}/g) ?? [],
      ),
    ]
      .map((v) => v.replaceAll("{", "").replaceAll("}", ""))
      .sort();

    await prisma.communicationTemplate.upsert({
      where: { key_channel_orgId: { key: t.key, channel: t.channel, orgId: "" } },
      update: {
        label: t.label,
        subject: t.subject ?? null,
        body: t.body,
        variables: variables.length ? JSON.stringify(variables) : null,
        isActive: true,
      },
      create: {
        key: t.key,
        channel: t.channel,
        label: t.label,
        subject: t.subject ?? null,
        body: t.body,
        variables: variables.length ? JSON.stringify(variables) : null,
        isActive: true,
      },
    });
  }
}

// ── Auth helpers ─────────────────────────────────────────────────────────────

async function ensureCredentialAccount(userId: string, password: string) {
  const existing = await prisma.account.findFirst({
    where: { userId, providerId: "credential" },
  });

  if (existing) {
    await prisma.account.update({
      where: { id: existing.id },
      data: { password: await hashPassword(password) },
    });
    return;
  }

  await prisma.account.create({
    data: {
      accountId: userId,
      providerId: "credential",
      userId,
      password: await hashPassword(password),
    },
  });
}

async function ensureUser({
  name,
  email,
  role,
  password,
  phone,
}: {
  name: string;
  email: string;
  role: Role;
  password: string;
  phone?: string;
}) {
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, role, orgId: EIS_ORG_ID, isActive: true, emailVerified: true, phone: phone ?? null },
    create: {
      name,
      email,
      role,
      orgId: EIS_ORG_ID,
      isActive: true,
      emailVerified: true,
      phone: phone ?? null,
    },
  });

  await ensureCredentialAccount(user.id, password);
  return user;
}

// ── Client helper ─────────────────────────────────────────────────────────────

async function ensureClient({
  fullName,
  phone,
  email,
  organization,
}: {
  fullName: string;
  phone: string;
  email?: string;
  organization?: string;
}) {
  return prisma.client.upsert({
    where: { phone_orgId: { phone, orgId: EIS_ORG_ID } },
    update: {
      fullName,
      email: email ?? null,
      organization: organization ?? null,
    },
    create: {
      fullName,
      phone,
      email: email ?? null,
      organization: organization ?? null,
      orgId: EIS_ORG_ID,
    },
  });
}

// ── Job helper ────────────────────────────────────────────────────────────────

async function ensureJob(data: {
  jobNumber: string;
  status: JobStatus;
  repairPath?: RepairPath;
  clientId: string;
  createdById: string;
  assignedToId?: string;
  deviceType: DeviceType;
  brand: string;
  model: string;
  serialOrImei?: string;
  issueDescription: string;
  diagnosisNotes?: string;
  externalDiagnosis?: string;
  externalTechBill?: number;
  clientBill?: number;
  clientApproved?: boolean | null;
  repairTimeline?: string;
  timelineMinMinutes?: number;
  timelineMaxMinutes?: number;
  timelineConfidence?: "FIRM" | "ESTIMATED" | "PARTS_DEPENDENT";
  workDone?: string;
  partsReplaced?: string;
  externalTechFee?: number;
  externalPaid?: boolean;
  externalPaidAt?: Date;
  externalPaymentRef?: string;
  clientPaid?: boolean;
  clientPaidAt?: Date;
  receivedAt: Date;
  completedAt?: Date;
  closedAt?: Date;
}) {
  const existing = await prisma.job.findUnique({
    where: { jobNumber: data.jobNumber },
    select: { id: true },
  });

  const payload = {
    status: data.status,
    repairPath: data.repairPath ?? null,
    clientId: data.clientId,
    createdById: data.createdById,
    assignedToId: data.assignedToId ?? null,
    deviceType: data.deviceType,
    brand: data.brand,
    model: data.model,
    serialOrImei: data.serialOrImei ?? null,
    issueDescription: data.issueDescription,
    diagnosisNotes: data.diagnosisNotes ?? null,
    externalDiagnosis: data.externalDiagnosis ?? null,
    externalTechBill: data.externalTechBill ?? null,
    clientBill: data.clientBill ?? null,
    clientApproved: typeof data.clientApproved === "boolean" ? data.clientApproved : null,
    repairTimeline: data.repairTimeline ?? null,
    timelineMinMinutes: data.timelineMinMinutes ?? null,
    timelineMaxMinutes: data.timelineMaxMinutes ?? null,
    timelineConfidence: data.timelineConfidence ?? null,
    workDone: data.workDone ?? null,
    partsReplaced: data.partsReplaced ?? null,
    externalTechFee: data.externalTechFee ?? null,
    externalPaid: data.externalPaid ?? false,
    externalPaidAt: data.externalPaidAt ?? null,
    externalPaymentRef: data.externalPaymentRef ?? null,
    clientPaid: data.clientPaid ?? false,
    clientPaidAt: data.clientPaidAt ?? null,
    receivedAt: data.receivedAt,
    completedAt: data.completedAt ?? null,
    closedAt: data.closedAt ?? null,
    orgId: EIS_ORG_ID,
  };

  if (existing) {
    return prisma.job.update({ where: { id: existing.id }, data: payload });
  }

  return prisma.job.create({
    data: { jobNumber: data.jobNumber, ...payload },
  });
}

// ── Audit helper ──────────────────────────────────────────────────────────────

async function ensureAudit(jobId: string, userId: string, action: string, detail: unknown) {
  const serialized = JSON.stringify(detail);
  const existing = await prisma.auditLog.findFirst({
    where: { jobId, userId, action, detail: serialized },
  });
  if (existing) return;

  await prisma.auditLog.create({
    data: { jobId, userId, action, detail: serialized, orgId: EIS_ORG_ID },
  });
}

// ── Job number format ─────────────────────────────────────────────────────────

function jobNum(month: number, year: number, seq: number) {
  return `EIS-${month}/${year}/${String(seq).padStart(4, "0")}`;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  await assertSeedCanReplaceDemoData();
  const defaultPassword = process.env.SEED_PASSWORD ?? "password123";

  // ─── Organisation ──────────────────────────────────────────────────────────
  await prisma.organization.upsert({
    where: { id: EIS_ORG_ID },
    update: { name: "Eagle Info Tech", plan: "GROWTH", isActive: true },
    create: {
      id: EIS_ORG_ID,
      name: "Eagle Info Tech",
      slug: "eagle-info-tech",
      plan: "GROWTH",
      isActive: true,
      baseCurrency: "UGX",
    },
  });

  // Module grants
  const modules = [
    "JOBS",
    "INVENTORY",
    "POS",
    "PURCHASE_ORDERS",
    "INVOICING",
    "COMPLAINTS",
    "REPORTS",
    "SALES",
    "FIELD",
    "TARGETS",
  ] as const;
  for (const mod of modules) {
    await prisma.orgModuleGrant.upsert({
      where: { orgId_module: { orgId: EIS_ORG_ID, module: mod } },
      update: {},
      create: { orgId: EIS_ORG_ID, module: mod },
    });
  }

  console.log("Organisation ready.");

  // ─── Users ─────────────────────────────────────────────────────────────────
  const admin = await ensureUser({
    name: "George Admin",
    email: "admin@eagle.test",
    role: "ADMIN",
    password: defaultPassword,
    phone: "+256772100001",
  });

  const _manager = await ensureUser({
    name: "Sarah Manager",
    email: "manager@eagle.test",
    role: "MANAGER",
    password: defaultPassword,
    phone: "+256772100002",
  });

  const ops = await ensureUser({
    name: "Kakande Ops",
    email: "ops@eagle.test",
    role: "OPS",
    password: defaultPassword,
    phone: "+256772100003",
  });

  const frontDesk = await ensureUser({
    name: "Aisha Front Desk",
    email: "frontdesk@eagle.test",
    role: "FRONT_DESK",
    password: defaultPassword,
    phone: "+256772100004",
  });

  const tech1 = await ensureUser({
    name: "Rest Internal Tech",
    email: "tech1@eagle.test",
    role: "TECHNICIAN_INTERNAL",
    password: defaultPassword,
    phone: "+256772100005",
  });

  const tech2 = await ensureUser({
    name: "David Internal Tech",
    email: "tech2@eagle.test",
    role: "TECHNICIAN_INTERNAL",
    password: defaultPassword,
    phone: "+256772100006",
  });

  const extTech = await ensureUser({
    name: "Abdu External Tech",
    email: "exttech@eagle.test",
    role: "TECHNICIAN_EXTERNAL",
    password: defaultPassword,
    phone: "+256772100007",
  });

  const extTech2 = await ensureUser({
    name: "Ryan External Tech",
    email: "exttech2@eagle.test",
    role: "TECHNICIAN_EXTERNAL",
    password: defaultPassword,
    phone: "+256772100008",
  });

  // ── E2E test users ─────────────────────────────────────────────────────────
  // These must exist with password "Admin123!" so qa:e2e can log in without
  // knowing SEED_PASSWORD (which may differ across environments).
  // Emails match the E2E_EXTERNAL_TECH_EMAIL / E2E_EXTERNAL_TECH_EMAILS defaults
  // in authz-smoke.spec.ts and external-tech-privacy.spec.ts.
  await ensureUser({
    name: "Abdulrahman Ssemwanga",
    email: "abdu@eagle.tech",
    role: "TECHNICIAN_EXTERNAL",
    password: "Admin123!",
    phone: "+256772200001",
  });

  await ensureUser({
    name: "Ryan Ochieng",
    email: "ryan@eagle.tech",
    role: "TECHNICIAN_EXTERNAL",
    password: "Admin123!",
    phone: "+256772200002",
  });

  await ensureUser({
    name: "Daniel Tumwebaze",
    email: "dan@eagle.tech",
    role: "TECHNICIAN_EXTERNAL",
    password: "Admin123!",
    phone: "+256772200003",
  });

  const finance = await ensureUser({
    name: "Fatima Finance",
    email: "finance@eagle.test",
    role: "FINANCE",
    password: defaultPassword,
    phone: "+256772100009",
  });

  const _sales = await ensureUser({
    name: "Brian Sales",
    email: "sales@eagle.test",
    role: "SALES",
    password: defaultPassword,
    phone: "+256772100010",
  });

  // E2E stable account
  await ensureUser({
    name: "E2E Admin",
    email: process.env.E2E_ADMIN_EMAIL ?? "admin@eagle.local",
    role: "ADMIN",
    password: "Admin123!",
  });

  console.log("Users seeded (11 accounts).");

  // ─── Comms templates ───────────────────────────────────────────────────────
  await seedDefaultCommsTemplates().catch((err) => {
    console.warn("Comms templates skipped:", err instanceof Error ? err.message : String(err));
  });

  // ─── AI knowledge ──────────────────────────────────────────────────────────
  await ensureDefaultAiKnowledge().catch((err) => {
    console.warn("AI knowledge skipped:", err instanceof Error ? err.message : String(err));
  });

  // ─── Wipe protected demo tables ────────────────────────────────────────────
  await prisma.auditLog.deleteMany({});
  await prisma.photo.deleteMany({});
  await prisma.job.deleteMany({});
  await prisma.clientNote.deleteMany({});
  await prisma.client.deleteMany({});

  // ─── Clients (15) ──────────────────────────────────────────────────────────
  const [c01, c02, c03, c04, c05, c06, c07, c08, c09, c10, c11, c12, c13, c14, c15] =
    await Promise.all([
      ensureClient({ fullName: "Amina Yusuf", phone: "+256701100001", email: "amina.yusuf@gmail.com" }),
      ensureClient({ fullName: "Bello Devices Ltd", phone: "+256701100002", email: "bello@devices.ug", organization: "Bello Devices Ltd" }),
      ensureClient({ fullName: "Chinwe Okafor", phone: "+256701100003" }),
      ensureClient({ fullName: "Danjuma Musa", phone: "+256701100004", email: "danjuma.musa@yahoo.com" }),
      ensureClient({ fullName: "Eko Learning Hub", phone: "+256701100005", email: "admin@ekohub.ug", organization: "Eko Learning Hub" }),
      ensureClient({ fullName: "Fatima Ibrahim", phone: "+256701100006" }),
      ensureClient({ fullName: "Gadgets Plus Ltd", phone: "+256701100007", email: "info@gadgetsplus.ug", organization: "Gadgets Plus Ltd" }),
      ensureClient({ fullName: "Hassan Ali", phone: "+256701100008", email: "hassan.ali@hotmail.com" }),
      ensureClient({ fullName: "Irene Nakato", phone: "+256701100009", email: "irene.nakato@gmail.com" }),
      ensureClient({ fullName: "Joseph Ssemwogerere", phone: "+256701100010" }),
      ensureClient({ fullName: "Kampala Tech Solutions", phone: "+256701100011", email: "info@kampalatech.ug", organization: "Kampala Tech Solutions" }),
      ensureClient({ fullName: "Lydia Akello", phone: "+256701100012", email: "lydia.akello@gmail.com" }),
      ensureClient({ fullName: "Moses Nkurunziza", phone: "+256701100013" }),
      ensureClient({ fullName: "Nancy Atim", phone: "+256701100014", email: "nancy.atim@gmail.com" }),
      ensureClient({ fullName: "Omega Business Centre", phone: "+256701100015", email: "accounts@omega.ug", organization: "Omega Business Centre" }),
    ]);

  console.log("Clients seeded (15).");

  // ─── Jobs (33) ─────────────────────────────────────────────────────────────
  // Helper dates
  const d = (daysAgo: number) => new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

  const jobs = await Promise.all([
    // ── RECEIVED (3) ──────────────────────────────────────────────────────
    ensureJob({
      jobNumber: jobNum(5, 2025, 1),
      status: "RECEIVED",
      repairPath: "IN_HOUSE",
      clientId: c01.id,
      createdById: frontDesk.id,
      deviceType: "PHONE_ANDROID",
      brand: "Samsung",
      model: "Galaxy A54",
      serialOrImei: "358000001234567",
      issueDescription: "Screen is cracked and touch not responding after drop.",
      receivedAt: d(2),
    }),
    ensureJob({
      jobNumber: jobNum(5, 2025, 2),
      status: "RECEIVED",
      repairPath: "IN_HOUSE",
      clientId: c09.id,
      createdById: ops.id,
      deviceType: "PHONE_IPHONE",
      brand: "Apple",
      model: "iPhone 14",
      serialOrImei: "C7GXYZ789012",
      issueDescription: "Battery drains very fast, charges to 100% but drops to 20% within an hour.",
      receivedAt: d(1),
    }),
    ensureJob({
      jobNumber: jobNum(5, 2025, 3),
      status: "RECEIVED",
      repairPath: "EXTERNAL",
      clientId: c11.id,
      createdById: ops.id,
      deviceType: "WINDOWS_PC",
      brand: "Dell",
      model: "OptiPlex 7090",
      issueDescription: "Computer will not boot. Shows blue screen with error code 0x000000F4.",
      receivedAt: d(1),
    }),

    // ── DIAGNOSING (4) ────────────────────────────────────────────────────
    ensureJob({
      jobNumber: jobNum(5, 2025, 4),
      status: "DIAGNOSING",
      repairPath: "IN_HOUSE",
      clientId: c02.id,
      createdById: frontDesk.id,
      assignedToId: tech1.id,
      deviceType: "WINDOWS_PC",
      brand: "Lenovo",
      model: "ThinkPad E14",
      issueDescription: "Laptop overheats and shuts down randomly during video calls.",
      diagnosisNotes: "Fan running at max RPM. Thermal paste dried out. Possible blocked heat pipe.",
      receivedAt: d(5),
    }),
    ensureJob({
      jobNumber: jobNum(5, 2025, 5),
      status: "DIAGNOSING",
      repairPath: "IN_HOUSE",
      clientId: c03.id,
      createdById: ops.id,
      assignedToId: tech2.id,
      deviceType: "PHONE_ANDROID",
      brand: "Tecno",
      model: "Camon 20",
      issueDescription: "Camera app crashes immediately when opened. Other apps work fine.",
      diagnosisNotes: "Possible firmware issue or camera module fault. Running diagnostics.",
      receivedAt: d(4),
    }),
    ensureJob({
      jobNumber: jobNum(5, 2025, 6),
      status: "DIAGNOSING",
      repairPath: "EXTERNAL",
      clientId: c05.id,
      createdById: ops.id,
      assignedToId: extTech.id,
      deviceType: "MAC",
      brand: "Apple",
      model: "MacBook Pro 13\" M1",
      serialOrImei: "FVFXXX123456",
      issueDescription: "Screen has horizontal coloured lines and randomly goes black.",
      diagnosisNotes: "Suspected display flex cable or T-CON board issue.",
      externalDiagnosis: "Board-level fault confirmed. Needs specialist soldering.",
      externalTechBill: 250000,
      receivedAt: d(6),
    }),
    ensureJob({
      jobNumber: jobNum(5, 2025, 7),
      status: "DIAGNOSING",
      repairPath: "IN_HOUSE",
      clientId: c12.id,
      createdById: frontDesk.id,
      assignedToId: tech1.id,
      deviceType: "TABLET",
      brand: "Samsung",
      model: "Galaxy Tab S8",
      issueDescription: "Tablet fell in water. Will not turn on.",
      diagnosisNotes: "Water damage detected on motherboard. Cleaning in progress.",
      receivedAt: d(3),
    }),

    // ── AWAITING_APPROVAL (4) ─────────────────────────────────────────────
    ensureJob({
      jobNumber: jobNum(5, 2025, 8),
      status: "AWAITING_APPROVAL",
      repairPath: "IN_HOUSE",
      clientId: c04.id,
      createdById: ops.id,
      assignedToId: tech2.id,
      deviceType: "PHONE_IPHONE",
      brand: "Apple",
      model: "iPhone 13",
      issueDescription: "Microphone not working. People on calls cannot hear me.",
      diagnosisNotes: "Bottom microphone module faulty. Replacement microphone + flex needed.",
      externalTechBill: 120000,
      clientBill: 185000,
      clientApproved: null,
      repairTimeline: "1 day",
      timelineMinMinutes: 60,
      timelineMaxMinutes: 480,
      timelineConfidence: "FIRM",
      receivedAt: d(8),
    }),
    ensureJob({
      jobNumber: jobNum(5, 2025, 9),
      status: "AWAITING_APPROVAL",
      repairPath: "EXTERNAL",
      clientId: c06.id,
      createdById: frontDesk.id,
      assignedToId: extTech2.id,
      deviceType: "WINDOWS_PC",
      brand: "HP",
      model: "EliteBook 840 G6",
      issueDescription: "Keyboard keys sticking. Several keys do not register presses.",
      diagnosisNotes: "Keyboard replacement required. Spill damage observed under keycaps.",
      externalDiagnosis: "Full keyboard deck replacement needed.",
      externalTechBill: 180000,
      clientBill: 250000,
      clientApproved: null,
      repairTimeline: "2 days",
      timelineMinMinutes: 1440,
      timelineMaxMinutes: 2880,
      timelineConfidence: "ESTIMATED",
      receivedAt: d(10),
    }),
    ensureJob({
      jobNumber: jobNum(5, 2025, 10),
      status: "AWAITING_APPROVAL",
      repairPath: "IN_HOUSE",
      clientId: c13.id,
      createdById: ops.id,
      assignedToId: tech1.id,
      deviceType: "PHONE_ANDROID",
      brand: "Infinix",
      model: "Hot 30i",
      issueDescription: "Phone dropped. Back glass cracked and charging port damaged.",
      diagnosisNotes: "Back glass + USB-C port replacement. Parts ordered.",
      externalTechBill: 95000,
      clientBill: 145000,
      clientApproved: null,
      repairTimeline: "1-2 days",
      timelineMinMinutes: 1440,
      timelineMaxMinutes: 2880,
      timelineConfidence: "FIRM",
      receivedAt: d(7),
    }),
    ensureJob({
      jobNumber: jobNum(5, 2025, 11),
      status: "AWAITING_APPROVAL",
      repairPath: "EXTERNAL",
      clientId: c15.id,
      createdById: ops.id,
      assignedToId: extTech.id,
      deviceType: "WINDOWS_PC",
      brand: "Acer",
      model: "Aspire 5",
      issueDescription: "Screen completely dark. Backlight issue suspected.",
      diagnosisNotes: "Backlight driver chip on motherboard failed. Board-level repair needed.",
      externalDiagnosis: "Backlight IC replacement. Specialist work required.",
      externalTechBill: 320000,
      clientBill: 420000,
      clientApproved: null,
      repairTimeline: "3-5 days",
      timelineMinMinutes: 4320,
      timelineMaxMinutes: 7200,
      timelineConfidence: "PARTS_DEPENDENT",
      receivedAt: d(9),
    }),

    // ── IN_REPAIR (6) ─────────────────────────────────────────────────────
    ensureJob({
      jobNumber: jobNum(4, 2025, 1),
      status: "IN_REPAIR",
      repairPath: "IN_HOUSE",
      clientId: c07.id,
      createdById: frontDesk.id,
      assignedToId: tech2.id,
      deviceType: "PHONE_ANDROID",
      brand: "Samsung",
      model: "Galaxy S22",
      serialOrImei: "352000009876543",
      issueDescription: "Screen flickering and showing ghost touches.",
      diagnosisNotes: "AMOLED display fault confirmed. Replacement display ordered.",
      externalTechBill: 380000,
      clientBill: 480000,
      clientApproved: true,
      repairTimeline: "2 days",
      timelineMinMinutes: 1440,
      timelineMaxMinutes: 2880,
      timelineConfidence: "FIRM",
      receivedAt: d(14),
    }),
    ensureJob({
      jobNumber: jobNum(4, 2025, 2),
      status: "IN_REPAIR",
      repairPath: "IN_HOUSE",
      clientId: c08.id,
      createdById: ops.id,
      assignedToId: tech1.id,
      deviceType: "WINDOWS_PC",
      brand: "Dell",
      model: "Latitude 5420",
      issueDescription: "Laptop does not recognize SSD. Data recovery needed.",
      diagnosisNotes: "SSD connector pins bent. SSD itself healthy. Replacing connector.",
      externalTechBill: 200000,
      clientBill: 280000,
      clientApproved: true,
      repairTimeline: "1-2 days",
      timelineMinMinutes: 1440,
      timelineMaxMinutes: 2880,
      timelineConfidence: "FIRM",
      receivedAt: d(12),
    }),
    ensureJob({
      jobNumber: jobNum(4, 2025, 3),
      status: "IN_REPAIR",
      repairPath: "EXTERNAL",
      clientId: c10.id,
      createdById: ops.id,
      assignedToId: extTech.id,
      deviceType: "PHONE_IPHONE",
      brand: "Apple",
      model: "iPhone 12 Pro",
      serialOrImei: "C8HABC456789",
      issueDescription: "Face ID not working after screen replacement elsewhere.",
      diagnosisNotes: "Dot projector module damaged. Specialist face ID repair needed.",
      externalDiagnosis: "Dot projector replaced. Calibration in progress.",
      externalTechBill: 450000,
      clientBill: 580000,
      clientApproved: true,
      repairTimeline: "3 days",
      timelineMinMinutes: 4320,
      timelineMaxMinutes: 4320,
      timelineConfidence: "FIRM",
      receivedAt: d(15),
    }),
    ensureJob({
      jobNumber: jobNum(4, 2025, 4),
      status: "IN_REPAIR",
      repairPath: "IN_HOUSE",
      clientId: c14.id,
      createdById: frontDesk.id,
      assignedToId: tech2.id,
      deviceType: "MAC",
      brand: "Apple",
      model: "iMac 27\" 2019",
      issueDescription: "iMac not turning on. No lights, no fan.",
      diagnosisNotes: "PSU fault confirmed. Replacement power supply unit sourced.",
      externalTechBill: 600000,
      clientBill: 780000,
      clientApproved: true,
      repairTimeline: "3-4 days",
      timelineMinMinutes: 4320,
      timelineMaxMinutes: 5760,
      timelineConfidence: "ESTIMATED",
      receivedAt: d(16),
    }),
    ensureJob({
      jobNumber: jobNum(4, 2025, 5),
      status: "IN_REPAIR",
      repairPath: "IN_HOUSE",
      clientId: c01.id,
      createdById: ops.id,
      assignedToId: tech1.id,
      deviceType: "PHONE_ANDROID",
      brand: "Tecno",
      model: "Spark 10 Pro",
      issueDescription: "Speaker very low volume even at max. Calls fine but media audio barely audible.",
      diagnosisNotes: "Speaker grille clogged. Internal speaker membrane torn.",
      externalTechBill: 75000,
      clientBill: 120000,
      clientApproved: true,
      repairTimeline: "Same day",
      timelineMinMinutes: 120,
      timelineMaxMinutes: 360,
      timelineConfidence: "FIRM",
      receivedAt: d(11),
    }),
    ensureJob({
      jobNumber: jobNum(4, 2025, 6),
      status: "IN_REPAIR",
      repairPath: "EXTERNAL",
      clientId: c05.id,
      createdById: ops.id,
      assignedToId: extTech2.id,
      deviceType: "WINDOWS_PC",
      brand: "HP",
      model: "ProDesk 400 G7",
      issueDescription: "Desktop PC making grinding noise. Very slow performance.",
      diagnosisNotes: "HDD failing. Replacing with SSD. OS reinstall required.",
      externalDiagnosis: "HDD replaced with 512GB SSD. OS migration in progress.",
      externalTechBill: 280000,
      clientBill: 380000,
      clientApproved: true,
      repairTimeline: "2 days",
      timelineMinMinutes: 1440,
      timelineMaxMinutes: 2880,
      timelineConfidence: "FIRM",
      receivedAt: d(13),
    }),

    // ── READY_FOR_PICKUP (3) ──────────────────────────────────────────────
    ensureJob({
      jobNumber: jobNum(3, 2025, 1),
      status: "READY_FOR_PICKUP",
      repairPath: "IN_HOUSE",
      clientId: c02.id,
      createdById: ops.id,
      assignedToId: tech1.id,
      deviceType: "PHONE_ANDROID",
      brand: "Samsung",
      model: "Galaxy A34",
      issueDescription: "Phone not charging. Tried multiple cables and chargers.",
      diagnosisNotes: "USB-C port clogged with debris and pin bent. Replaced charging port.",
      externalTechBill: 85000,
      clientBill: 135000,
      clientApproved: true,
      repairTimeline: "Same day",
      timelineMinMinutes: 120,
      timelineMaxMinutes: 360,
      timelineConfidence: "FIRM",
      workDone: "USB-C charging port replaced. Tested with 3 different chargers. Charging normally at full speed.",
      partsReplaced: "USB-C charging port module",
      receivedAt: d(20),
    }),
    ensureJob({
      jobNumber: jobNum(3, 2025, 2),
      status: "READY_FOR_PICKUP",
      repairPath: "EXTERNAL",
      clientId: c11.id,
      createdById: frontDesk.id,
      assignedToId: extTech.id,
      deviceType: "WINDOWS_PC",
      brand: "Lenovo",
      model: "IdeaPad 3",
      issueDescription: "Laptop hinge broken. Screen wobbles and will fall.",
      diagnosisNotes: "Both hinges cracked. Replacement hinges installed.",
      externalDiagnosis: "New hinge kit installed. Screen alignment corrected.",
      externalTechBill: 150000,
      externalTechFee: 150000,
      externalPaid: false,
      clientBill: 220000,
      clientApproved: true,
      repairTimeline: "2 days",
      timelineMinMinutes: 1440,
      timelineMaxMinutes: 2880,
      timelineConfidence: "FIRM",
      workDone: "Both hinges replaced. Screen opens and closes smoothly with proper tension.",
      partsReplaced: "Left and right hinge kit",
      receivedAt: d(22),
    }),
    ensureJob({
      jobNumber: jobNum(3, 2025, 3),
      status: "READY_FOR_PICKUP",
      repairPath: "IN_HOUSE",
      clientId: c06.id,
      createdById: ops.id,
      assignedToId: tech2.id,
      deviceType: "PHONE_IPHONE",
      brand: "Apple",
      model: "iPhone 11",
      issueDescription: "Back glass completely shattered. Screen still works.",
      diagnosisNotes: "Back glass replacement. Original screen intact.",
      externalTechBill: 160000,
      clientBill: 220000,
      clientApproved: true,
      repairTimeline: "1 day",
      timelineMinMinutes: 480,
      timelineMaxMinutes: 1440,
      timelineConfidence: "FIRM",
      workDone: "Back glass replaced using adhesive method. Camera module re-seated. Wireless charging tested OK.",
      partsReplaced: "Rear glass panel (black)",
      receivedAt: d(18),
    }),

    // ── COMPLETED (8) ─────────────────────────────────────────────────────
    ensureJob({
      jobNumber: jobNum(2, 2025, 1),
      status: "COMPLETED",
      repairPath: "IN_HOUSE",
      clientId: c03.id,
      createdById: ops.id,
      assignedToId: tech1.id,
      deviceType: "PHONE_ANDROID",
      brand: "Xiaomi",
      model: "Redmi Note 12",
      issueDescription: "Screen cracked. Touch still works but display has ink spread.",
      diagnosisNotes: "AMOLED display replacement required.",
      externalTechBill: 210000,
      clientBill: 290000,
      clientApproved: true,
      repairTimeline: "1-2 days",
      timelineMinMinutes: 1440,
      timelineMaxMinutes: 2880,
      timelineConfidence: "FIRM",
      workDone: "AMOLED display replaced. All touch areas calibrated. Front camera and earpiece tested.",
      partsReplaced: "Display assembly (AMOLED)",
      clientPaid: true,
      clientPaidAt: d(40),
      receivedAt: d(45),
      completedAt: d(43),
    }),
    ensureJob({
      jobNumber: jobNum(2, 2025, 2),
      status: "COMPLETED",
      repairPath: "EXTERNAL",
      clientId: c04.id,
      createdById: frontDesk.id,
      assignedToId: extTech.id,
      deviceType: "MAC",
      brand: "Apple",
      model: "MacBook Air M2",
      serialOrImei: "FVHXXX654321",
      issueDescription: "Spilled liquid on keyboard. Several keys not working and trackpad stuck.",
      diagnosisNotes: "Liquid damage to keyboard and trackpad. Full top case replacement needed.",
      externalDiagnosis: "Apple top case with keyboard and trackpad replaced.",
      externalTechBill: 850000,
      externalTechFee: 850000,
      externalPaid: true,
      externalPaidAt: d(30),
      externalPaymentRef: "MTN-2025-0042",
      clientBill: 1100000,
      clientApproved: true,
      repairTimeline: "5 days",
      timelineMinMinutes: 7200,
      timelineMaxMinutes: 7200,
      timelineConfidence: "FIRM",
      workDone: "Top case replaced. All keys functional. Trackpad click and gestures working. Battery health 97%.",
      partsReplaced: "Top case assembly (keyboard + trackpad)",
      clientPaid: true,
      clientPaidAt: d(32),
      receivedAt: d(40),
      completedAt: d(35),
    }),
    ensureJob({
      jobNumber: jobNum(2, 2025, 3),
      status: "COMPLETED",
      repairPath: "IN_HOUSE",
      clientId: c07.id,
      createdById: ops.id,
      assignedToId: tech2.id,
      deviceType: "TABLET",
      brand: "Huawei",
      model: "MatePad T10s",
      issueDescription: "Tablet screen broken after drop. Backlight visible but display cracked.",
      diagnosisNotes: "LCD display with touch digitizer replacement.",
      externalTechBill: 280000,
      clientBill: 360000,
      clientApproved: true,
      repairTimeline: "2 days",
      timelineMinMinutes: 1440,
      timelineMaxMinutes: 2880,
      timelineConfidence: "FIRM",
      workDone: "LCD with digitizer replaced. Stylus input tested. All corners responsive.",
      partsReplaced: "LCD digitizer assembly",
      clientPaid: true,
      clientPaidAt: d(50),
      receivedAt: d(55),
      completedAt: d(52),
    }),
    ensureJob({
      jobNumber: jobNum(2, 2025, 4),
      status: "COMPLETED",
      repairPath: "IN_HOUSE",
      clientId: c08.id,
      createdById: frontDesk.id,
      assignedToId: tech1.id,
      deviceType: "WINDOWS_PC",
      brand: "HP",
      model: "Pavilion 15",
      issueDescription: "Laptop battery not holding charge. Drains in 15 minutes.",
      diagnosisNotes: "Battery cells degraded to 23% health. Replacement required.",
      externalTechBill: 180000,
      clientBill: 240000,
      clientApproved: true,
      repairTimeline: "Same day",
      timelineMinMinutes: 60,
      timelineMaxMinutes: 240,
      timelineConfidence: "FIRM",
      workDone: "Battery replaced with genuine HP 3-cell 41.04Wh unit. Runtime tested at 4.5 hours.",
      partsReplaced: "HP 3-cell 41.04Wh battery",
      clientPaid: true,
      clientPaidAt: d(60),
      receivedAt: d(62),
      completedAt: d(61),
    }),
    ensureJob({
      jobNumber: jobNum(2, 2025, 5),
      status: "COMPLETED",
      repairPath: "EXTERNAL",
      clientId: c10.id,
      createdById: ops.id,
      assignedToId: extTech2.id,
      deviceType: "PHONE_ANDROID",
      brand: "Google",
      model: "Pixel 7a",
      issueDescription: "Phone fell from motorbike. Screen shattered. Touch unresponsive.",
      diagnosisNotes: "Full OLED display with digitizer replacement.",
      externalDiagnosis: "OEM display installed. Fingerprint sensor re-calibrated.",
      externalTechBill: 420000,
      externalTechFee: 420000,
      externalPaid: true,
      externalPaidAt: d(55),
      externalPaymentRef: "AIRTEL-2025-0087",
      clientBill: 530000,
      clientApproved: true,
      repairTimeline: "2-3 days",
      timelineMinMinutes: 2880,
      timelineMaxMinutes: 4320,
      timelineConfidence: "FIRM",
      workDone: "OLED display + digitizer replaced. Face unlock, fingerprint, and all sensors recalibrated.",
      partsReplaced: "OLED display assembly + fingerprint module",
      clientPaid: true,
      clientPaidAt: d(57),
      receivedAt: d(63),
      completedAt: d(58),
    }),
    ensureJob({
      jobNumber: jobNum(1, 2025, 1),
      status: "COMPLETED",
      repairPath: "IN_HOUSE",
      clientId: c12.id,
      createdById: frontDesk.id,
      assignedToId: tech2.id,
      deviceType: "PHONE_IPHONE",
      brand: "Apple",
      model: "iPhone XR",
      issueDescription: "Phone very hot and battery swollen. Concerned about safety.",
      diagnosisNotes: "Battery swollen — safety priority. Immediate replacement.",
      externalTechBill: 140000,
      clientBill: 195000,
      clientApproved: true,
      repairTimeline: "Same day — urgent",
      timelineMinMinutes: 60,
      timelineMaxMinutes: 180,
      timelineConfidence: "FIRM",
      workDone: "Swollen battery safely removed and replaced. Device temperature normal. Charging cycle tested.",
      partsReplaced: "iPhone XR OEM replacement battery (2942 mAh)",
      clientPaid: true,
      clientPaidAt: d(72),
      receivedAt: d(73),
      completedAt: d(73),
    }),
    ensureJob({
      jobNumber: jobNum(1, 2025, 2),
      status: "COMPLETED",
      repairPath: "IN_HOUSE",
      clientId: c13.id,
      createdById: ops.id,
      assignedToId: tech1.id,
      deviceType: "WINDOWS_PC",
      brand: "Asus",
      model: "VivoBook 15",
      issueDescription: "Laptop has virus. Very slow and random pop-ups opening.",
      diagnosisNotes: "Malware infection confirmed. OS reinstall recommended.",
      externalTechBill: 120000,
      clientBill: 170000,
      clientApproved: true,
      repairTimeline: "1 day",
      timelineMinMinutes: 480,
      timelineMaxMinutes: 1440,
      timelineConfidence: "FIRM",
      workDone: "Full Windows 11 reinstall. All drivers updated. Data backed up to external HDD before wipe. Antivirus installed.",
      partsReplaced: "No parts — software service",
      clientPaid: true,
      clientPaidAt: d(78),
      receivedAt: d(80),
      completedAt: d(79),
    }),
    ensureJob({
      jobNumber: jobNum(1, 2025, 3),
      status: "COMPLETED",
      repairPath: "EXTERNAL",
      clientId: c15.id,
      createdById: ops.id,
      assignedToId: extTech.id,
      deviceType: "PHONE_ANDROID",
      brand: "OnePlus",
      model: "Nord CE 3",
      issueDescription: "Earpiece speaker completely dead during calls.",
      diagnosisNotes: "Earpiece module failed. Replacement sourced from supplier.",
      externalDiagnosis: "Earpiece replaced. Call audio crystal clear.",
      externalTechBill: 95000,
      externalTechFee: 95000,
      externalPaid: true,
      externalPaidAt: d(85),
      externalPaymentRef: "CASH-2025-0021",
      clientBill: 145000,
      clientApproved: true,
      repairTimeline: "1 day",
      timelineMinMinutes: 480,
      timelineMaxMinutes: 1440,
      timelineConfidence: "FIRM",
      workDone: "Earpiece speaker module replaced. Volume and clarity tested at all levels.",
      partsReplaced: "Earpiece speaker module",
      clientPaid: true,
      clientPaidAt: d(87),
      receivedAt: d(90),
      completedAt: d(87),
    }),

    // ── CLOSED (5) ────────────────────────────────────────────────────────
    ensureJob({
      jobNumber: jobNum(3, 2025, 4),
      status: "CLOSED",
      repairPath: "IN_HOUSE",
      clientId: c14.id,
      createdById: frontDesk.id,
      assignedToId: tech1.id,
      deviceType: "PHONE_ANDROID",
      brand: "Samsung",
      model: "Galaxy S10",
      issueDescription: "Phone motherboard damaged after lightning strike.",
      diagnosisNotes: "Motherboard completely fried. Replacement motherboard cost exceeds device value.",
      externalTechBill: 950000,
      clientBill: 1200000,
      clientApproved: false,
      repairTimeline: "5-7 days",
      timelineMinMinutes: 7200,
      timelineMaxMinutes: 10080,
      timelineConfidence: "ESTIMATED",
      receivedAt: d(25),
      closedAt: d(22),
    }),
    ensureJob({
      jobNumber: jobNum(3, 2025, 5),
      status: "CLOSED",
      repairPath: "EXTERNAL",
      clientId: c09.id,
      createdById: ops.id,
      assignedToId: extTech2.id,
      deviceType: "WINDOWS_PC",
      brand: "Toshiba",
      model: "Satellite L50",
      issueDescription: "Laptop totally dead. No power response.",
      diagnosisNotes: "Multiple component failures. Repair not economically viable.",
      externalDiagnosis: "CPU, RAM, and charging IC all failed. Unrepairable.",
      externalTechBill: 1500000,
      clientBill: 1900000,
      clientApproved: false,
      receivedAt: d(28),
      closedAt: d(24),
    }),
    ensureJob({
      jobNumber: jobNum(4, 2025, 7),
      status: "CLOSED",
      repairPath: "IN_HOUSE",
      clientId: c03.id,
      createdById: frontDesk.id,
      assignedToId: tech2.id,
      deviceType: "PHONE_IPHONE",
      brand: "Apple",
      model: "iPhone 6",
      issueDescription: "Battery swollen and home button not working.",
      diagnosisNotes: "Parts no longer available for this model. Customer informed.",
      externalTechBill: 200000,
      clientApproved: false,
      receivedAt: d(19),
      closedAt: d(17),
    }),
    ensureJob({
      jobNumber: jobNum(4, 2025, 8),
      status: "CLOSED",
      repairPath: "IN_HOUSE",
      clientId: c07.id,
      createdById: ops.id,
      assignedToId: tech1.id,
      deviceType: "TABLET",
      brand: "Alcatel",
      model: "3T 8",
      issueDescription: "Tablet screen and back cover cracked. Wants repair estimate.",
      diagnosisNotes: "Repair cost exceeds purchase price of tablet. Client declined.",
      externalTechBill: 180000,
      clientBill: 230000,
      clientApproved: false,
      receivedAt: d(17),
      closedAt: d(15),
    }),
    ensureJob({
      jobNumber: jobNum(2, 2025, 6),
      status: "CLOSED",
      repairPath: "EXTERNAL",
      clientId: c08.id,
      createdById: frontDesk.id,
      assignedToId: extTech.id,
      deviceType: "WINDOWS_PC",
      brand: "Dell",
      model: "XPS 15 9520",
      issueDescription: "Coffee spilt on keyboard and trackpad. Both stopped working.",
      diagnosisNotes: "Motherboard corrosion from liquid. Repair specialist assessed.",
      externalDiagnosis: "Motherboard liquid corrosion on I/O region. Repair cost very high.",
      externalTechBill: 2200000,
      clientBill: 2750000,
      clientApproved: false,
      receivedAt: d(50),
      closedAt: d(46),
    }),
  ]);

  console.log(`Jobs seeded (${jobs.length}).`);

  // ─── Audit logs ────────────────────────────────────────────────────────────
  for (const job of jobs) {
    await ensureAudit(job.id, admin.id, "JOB_CREATED", { seeded: true, jobNumber: job.jobNumber });

    if (["DIAGNOSING", "IN_REPAIR", "READY_FOR_PICKUP"].includes(job.status)) {
      await ensureAudit(job.id, job.assignedToId ?? tech1.id, "TECHNICIAN_UPDATE", {
        seeded: true, note: "Diagnosis or repair update added",
      });
    }
    if (job.status === "AWAITING_APPROVAL") {
      await ensureAudit(job.id, ops.id, "AWAITING_CLIENT_APPROVAL", {
        seeded: true, note: "Client contacted for approval",
      });
    }
    if (job.status === "COMPLETED") {
      await ensureAudit(job.id, ops.id, "JOB_COMPLETED", {
        seeded: true, note: "Device ready and collected",
      });
    }
    if (job.status === "CLOSED") {
      await ensureAudit(job.id, ops.id, "JOB_CLOSED", {
        seeded: true, note: "Job closed — client declined or unrepairable",
      });
    }
  }
  console.log("Audit logs seeded.");

  // ─── Inventory parts (12) ──────────────────────────────────────────────────
  const partData = [
    { sku: "SCR-SAM-A54-BLK", name: "Samsung Galaxy A54 Screen Assembly (Black)", manufacturer: "Samsung", unitCost: 185000, qtyOnHand: 5, reorderLevel: 2 },
    { sku: "SCR-IPH14-BLK", name: "iPhone 14 OLED Display Assembly", manufacturer: "Apple OEM", unitCost: 420000, qtyOnHand: 3, reorderLevel: 1 },
    { sku: "BAT-IPH13", name: "iPhone 13 Replacement Battery 3227mAh", manufacturer: "Apple OEM", unitCost: 95000, qtyOnHand: 10, reorderLevel: 3 },
    { sku: "BAT-HP-PAVIL15", name: "HP Pavilion 15 3-Cell 41Wh Battery", manufacturer: "HP", unitCost: 145000, qtyOnHand: 4, reorderLevel: 2 },
    { sku: "CHG-USBC-UNIV", name: "USB-C Charging Port Module (Universal)", manufacturer: "Generic", unitCost: 25000, qtyOnHand: 20, reorderLevel: 5 },
    { sku: "HDD-SATA-512-SSD", name: "512GB SATA SSD (2.5\")", manufacturer: "Kingston", unitCost: 85000, qtyOnHand: 8, reorderLevel: 3 },
    { sku: "RAM-DDR4-8GB", name: "DDR4 8GB 3200MHz SODIMM", manufacturer: "Samsung", unitCost: 75000, qtyOnHand: 6, reorderLevel: 2 },
    { sku: "SCR-LENOVO-E14-FHD", name: "Lenovo ThinkPad E14 FHD IPS Display Panel", manufacturer: "Lenovo", unitCost: 310000, qtyOnHand: 2, reorderLevel: 1 },
    { sku: "BAT-SAM-GALAXY-A34", name: "Samsung Galaxy A34 Battery 5000mAh", manufacturer: "Samsung", unitCost: 65000, qtyOnHand: 7, reorderLevel: 2 },
    { sku: "HINGE-LENOVO-IDP3", name: "Lenovo IdeaPad 3 Hinge Kit (Left + Right)", manufacturer: "Lenovo", unitCost: 85000, qtyOnHand: 3, reorderLevel: 1 },
    { sku: "SPKR-IPHONE-XR-EAR", name: "iPhone XR Earpiece Speaker Module", manufacturer: "Apple OEM", unitCost: 45000, qtyOnHand: 12, reorderLevel: 4 },
    { sku: "THERMAL-PASTE-10G", name: "Arctic Silver 5 Thermal Paste 10g", manufacturer: "Arctic Silver", unitCost: 15000, qtyOnHand: 15, reorderLevel: 5 },
  ];

  const parts = await Promise.all(
    partData.map((p) =>
      prisma.part.upsert({
        where: { sku_orgId: { sku: p.sku, orgId: EIS_ORG_ID } },
        update: { name: p.name, manufacturer: p.manufacturer, unitCost: p.unitCost, qtyOnHand: p.qtyOnHand, reorderLevel: p.reorderLevel },
        create: { ...p, orgId: EIS_ORG_ID, isActive: true },
      }),
    ),
  );

  console.log(`Parts seeded (${parts.length}).`);

  // ─── Invoices (10) — linked to completed jobs ──────────────────────────────
  // Find completed jobs that have clientBill
  const completedJobs = jobs.filter((j) => j.status === "COMPLETED" && j.clientBill);
  let invSeq = 1;

  const invoices = [];
  for (const job of completedJobs.slice(0, 8)) {
    const invNumber = `INV-EIS-05/2025/${String(invSeq).padStart(4, "0")}`;
    invSeq++;

    const inv = await prisma.invoice.upsert({
      where: { invoiceNumber: invNumber },
      update: {
        totalAmount: job.clientBill ?? 0,
        paidAmount: job.clientPaid ? (job.clientBill ?? 0) : 0,
        status: job.clientPaid ? "PAID" : "ISSUED",
        paidAt: job.clientPaid ? job.clientPaidAt : null,
      },
      create: {
        orgId: EIS_ORG_ID,
        jobId: job.id,
        clientId: job.clientId,
        invoiceNumber: invNumber,
        invoiceType: "REPAIR",
        currency: "UGX",
        status: job.clientPaid ? "PAID" : "ISSUED",
        issuedAt: job.completedAt ?? new Date(),
        totalAmount: job.clientBill ?? 0,
        paidAmount: job.clientPaid ? (job.clientBill ?? 0) : 0,
        paidAt: job.clientPaid ? job.clientPaidAt : null,
      },
    });

    // Invoice line
    await prisma.invoiceLine.upsert({
      where: undefined as never,
      update: {},
      create: {
        orgId: EIS_ORG_ID,
        invoiceId: inv.id,
        description: `Repair service — ${job.brand} ${job.model}`,
        quantity: 1,
        unitPrice: job.clientBill ?? 0,
        lineTotal: job.clientBill ?? 0,
      },
    }).catch(() => {}); // skip if line already exists

    invoices.push(inv);
  }

  // 2 standalone invoices (not job-linked) for corporate clients
  const standaloneInvoices = [
    { client: c11, amount: 500000, subject: "Monthly IT support contract — May 2025", status: "ISSUED" as InvoiceStatus },
    { client: c15, amount: 750000, subject: "Network setup and configuration service", status: "PAID" as InvoiceStatus },
  ];
  for (const si of standaloneInvoices) {
    const invNumber = `INV-EIS-05/2025/${String(invSeq).padStart(4, "0")}`;
    invSeq++;
    const inv = await prisma.invoice.upsert({
      where: { invoiceNumber: invNumber },
      update: {},
      create: {
        orgId: EIS_ORG_ID,
        clientId: si.client.id,
        invoiceNumber: invNumber,
        invoiceType: "SERVICE",
        subject: si.subject,
        currency: "UGX",
        status: si.status,
        issuedAt: d(5),
        totalAmount: si.amount,
        paidAmount: si.status === "PAID" ? si.amount : 0,
        paidAt: si.status === "PAID" ? d(3) : null,
      },
    });
    invoices.push(inv);
  }

  console.log(`Invoices seeded (${invoices.length}).`);

  // ─── Payments (10) ─────────────────────────────────────────────────────────
  let payCount = 0;
  for (const inv of invoices) {
    if (inv.status === "PAID" && inv.totalAmount > 0) {
      const exists = await prisma.payment.findFirst({ where: { invoiceId: inv.id } });
      if (!exists) {
        await prisma.payment.create({
          data: {
            orgId: EIS_ORG_ID,
            invoiceId: inv.id,
            currency: "UGX",
            amount: inv.totalAmount,
            method: payCount % 3 === 0 ? "MOBILE_MONEY" : payCount % 3 === 1 ? "CASH" : "BANK_TRANSFER",
            receivedAt: inv.paidAt ?? new Date(),
            createdById: finance.id,
            note: "Payment received in full",
          },
        });
        payCount++;
      }
    }
  }

  // Partial payment on an ISSUED invoice
  const issuedInv = invoices.find((i) => i.status === "ISSUED" && !i.jobId);
  if (issuedInv) {
    const exists = await prisma.payment.findFirst({ where: { invoiceId: issuedInv.id } });
    if (!exists) {
      await prisma.payment.create({
        data: {
          orgId: EIS_ORG_ID,
          invoiceId: issuedInv.id,
          currency: "UGX",
          amount: issuedInv.totalAmount * 0.5,
          method: "MOBILE_MONEY",
          receivedAt: d(2),
          createdById: finance.id,
          note: "50% advance payment",
        },
      });
      payCount++;
    }
  }

  console.log(`Payments seeded (${payCount}).`);

  // ─── Bank accounts (2) ─────────────────────────────────────────────────────
  const bankMain = await prisma.bankAccount.upsert({
    where: { id: "bank_eis_main" },
    update: {},
    create: {
      id: "bank_eis_main",
      orgId: EIS_ORG_ID,
      name: "Stanbic Bank — Operations Account",
      accountNumber: "9030012345678",
      bankName: "Stanbic Bank Uganda",
      currency: "UGX",
      openingBalance: 5000000,
      currentBalance: 12500000,
    },
  });

  const bankMM = await prisma.bankAccount.upsert({
    where: { id: "bank_eis_mm" },
    update: {},
    create: {
      id: "bank_eis_mm",
      orgId: EIS_ORG_ID,
      name: "MTN Mobile Money Float",
      accountNumber: "+256772006344",
      bankName: "MTN MoMo",
      currency: "UGX",
      openingBalance: 1000000,
      currentBalance: 3200000,
    },
  });

  // Bank transactions (8)
  const bankTxns = [
    { bankAccountId: bankMain.id, date: d(30), description: "Payment from Kampala Tech Solutions — Invoice INV-EIS-05/2025/0009", amount: 500000, type: "CREDIT" as const, reference: "TRF-KTS-001" },
    { bankAccountId: bankMain.id, date: d(25), description: "Supplier payment — Component parts", amount: 350000, type: "DEBIT" as const, reference: "PO-2025-001" },
    { bankAccountId: bankMain.id, date: d(20), description: "Salary disbursement — Technical staff", amount: 2500000, type: "DEBIT" as const, reference: "PAYROLL-2025-05" },
    { bankAccountId: bankMain.id, date: d(15), description: "Payment from Omega Business — INV-EIS-05/2025/0010", amount: 750000, type: "CREDIT" as const, reference: "TRF-OBC-002" },
    { bankAccountId: bankMM.id, date: d(10), description: "Mobile money collection — multiple jobs", amount: 680000, type: "CREDIT" as const, reference: "MM-BULK-0512" },
    { bankAccountId: bankMM.id, date: d(8), description: "Transfer to main account", amount: 500000, type: "DEBIT" as const, reference: "MM-TO-BANK-0512" },
    { bankAccountId: bankMM.id, date: d(5), description: "Repair payment — Amina Yusuf", amount: 290000, type: "CREDIT" as const, reference: "MM-PAY-0514" },
    { bankAccountId: bankMain.id, date: d(3), description: "Airtel Money transfer receipt", amount: 530000, type: "CREDIT" as const, reference: "AIRTEL-0515" },
  ];

  for (const tx of bankTxns) {
    const exists = await prisma.bankTransaction.findFirst({
      where: { bankAccountId: tx.bankAccountId, reference: tx.reference },
    });
    if (!exists) {
      await prisma.bankTransaction.create({ data: { ...tx, orgId: EIS_ORG_ID } });
    }
  }

  console.log("Bank accounts and transactions seeded.");

  // ─── Expenses (12) ─────────────────────────────────────────────────────────
  const expensesData: Array<{
    expenseNumber: string;
    category: ExpenseCategory;
    description: string;
    amount: number;
    method: PaymentMethod;
    paidAt: Date;
  }> = [
    { expenseNumber: "EXP-2025-001", category: "RENT", description: "Shop rent — Nalubega Complex, May 2025", amount: 1200000, method: "BANK_TRANSFER", paidAt: d(30) },
    { expenseNumber: "EXP-2025-002", category: "UTILITIES", description: "Electricity (UMEME) — April 2025", amount: 180000, method: "MOBILE_MONEY", paidAt: d(28) },
    { expenseNumber: "EXP-2025-003", category: "UTILITIES", description: "Internet (Liquid Telecom) — May 2025", amount: 250000, method: "BANK_TRANSFER", paidAt: d(25) },
    { expenseNumber: "EXP-2025-004", category: "SUPPLIES", description: "Repair consumables — thermal paste, IPA, cotton swabs", amount: 85000, method: "CASH", paidAt: d(22) },
    { expenseNumber: "EXP-2025-005", category: "EQUIPMENT", description: "Soldering station — new hot air rework station", amount: 650000, method: "CASH", paidAt: d(20) },
    { expenseNumber: "EXP-2025-006", category: "MARKETING", description: "Facebook ads — April campaign", amount: 150000, method: "MOBILE_MONEY", paidAt: d(18) },
    { expenseNumber: "EXP-2025-007", category: "TRAVEL", description: "Field visit transport — client delivery runs", amount: 45000, method: "CASH", paidAt: d(15) },
    { expenseNumber: "EXP-2025-008", category: "SALARIES", description: "Technician stipend advance — May 2025", amount: 800000, method: "MOBILE_MONEY", paidAt: d(12) },
    { expenseNumber: "EXP-2025-009", category: "SUPPLIES", description: "Screen protectors and cases for resale", amount: 320000, method: "CASH", paidAt: d(10) },
    { expenseNumber: "EXP-2025-010", category: "MAINTENANCE", description: "Generator service and fuel", amount: 95000, method: "CASH", paidAt: d(8) },
    { expenseNumber: "EXP-2025-011", category: "TAXES", description: "Local authority trading licence — 2025", amount: 200000, method: "BANK_TRANSFER", paidAt: d(6) },
    { expenseNumber: "EXP-2025-012", category: "OTHER", description: "Stationery and receipt booklets", amount: 35000, method: "CASH", paidAt: d(3) },
  ];

  for (const exp of expensesData) {
    await prisma.expense.upsert({
      where: { expenseNumber: exp.expenseNumber },
      update: {},
      create: { ...exp, orgId: EIS_ORG_ID, currency: "UGX", createdById: finance.id },
    });
  }

  console.log(`Expenses seeded (${expensesData.length}).`);

  // ─── POS Session + Sales (5) ───────────────────────────────────────────────
  const posSession = await prisma.posSession.upsert({
    where: { id: "pos_sess_eis_01" },
    update: {},
    create: {
      id: "pos_sess_eis_01",
      orgId: EIS_ORG_ID,
      operatorId: frontDesk.id,
      status: "CLOSED",
      openingFloat: 200000,
      closingCash: 850000,
      cashTotal: 650000,
      mobileTotal: 420000,
      totalSales: 1070000,
      salesCount: 5,
      openedAt: d(3),
      closedAt: d(3),
    },
  });

  const salesData = [
    {
      id: "sale_eis_001",
      saleNumber: "SL-EIS-05/2025/0001",
      clientId: c02.id,
      items: [
        { partId: parts[2].id, description: "iPhone 13 Battery Replacement", qty: 1, unitPrice: 140000 },
      ],
      totalAmount: 140000,
      paidAt: d(3),
    },
    {
      id: "sale_eis_002",
      saleNumber: "SL-EIS-05/2025/0002",
      clientId: c04.id,
      items: [
        { partId: parts[4].id, description: "USB-C Charging Port (Samsung)", qty: 1, unitPrice: 45000 },
        { partId: parts[11].id, description: "Thermal Paste Application", qty: 1, unitPrice: 20000 },
      ],
      totalAmount: 65000,
      paidAt: d(3),
    },
    {
      id: "sale_eis_003",
      saleNumber: "SL-EIS-05/2025/0003",
      clientId: c07.id,
      items: [
        { partId: parts[5].id, description: "512GB SSD Upgrade", qty: 1, unitPrice: 130000 },
        { partId: parts[6].id, description: "8GB RAM Upgrade", qty: 1, unitPrice: 110000 },
      ],
      totalAmount: 240000,
      paidAt: d(2),
    },
    {
      id: "sale_eis_004",
      saleNumber: "SL-EIS-05/2025/0004",
      clientId: c09.id,
      items: [
        { partId: parts[8].id, description: "Samsung A34 Battery", qty: 1, unitPrice: 95000 },
      ],
      totalAmount: 95000,
      paidAt: d(2),
    },
    {
      id: "sale_eis_005",
      saleNumber: "SL-EIS-05/2025/0005",
      clientId: c12.id,
      items: [
        { partId: parts[0].id, description: "Samsung A54 Screen Assembly", qty: 1, unitPrice: 280000 },
      ],
      totalAmount: 280000,
      paidAt: d(1),
    },
  ];

  for (const sale of salesData) {
    const subtotal = sale.totalAmount;
    const existing = await prisma.sale.findFirst({ where: { saleNumber: sale.saleNumber } });
    const saleRecord = existing ?? await prisma.sale.create({
      data: {
        id: sale.id,
        orgId: EIS_ORG_ID,
        saleNumber: sale.saleNumber,
        clientId: sale.clientId,
        posSessionId: posSession.id,
        status: "PAID",
        billingMode: "CASH",
        currency: "UGX",
        subtotal,
        totalAmount: subtotal,
        paidAmount: subtotal,
        paidAt: sale.paidAt,
        createdById: frontDesk.id,
      },
    });

    // Sale items
    for (const item of sale.items) {
      const lineExists = await prisma.saleItem.findFirst({ where: { saleId: saleRecord.id, partId: item.partId } });
      if (!lineExists) {
        await prisma.saleItem.create({
          data: {
            saleId: saleRecord.id,
            partId: item.partId,
            description: item.description,
            quantity: item.qty,
            unitPrice: item.unitPrice,
            lineTotal: item.unitPrice * item.qty,
          },
        });
      }
    }

    // Payment for sale
    const payExists = await prisma.payment.findFirst({ where: { saleId: saleRecord.id } });
    if (!payExists) {
      await prisma.payment.create({
        data: {
          orgId: EIS_ORG_ID,
          saleId: saleRecord.id,
          currency: "UGX",
          amount: subtotal,
          method: "CASH",
          receivedAt: sale.paidAt,
          createdById: frontDesk.id,
        },
      });
    }
  }

  console.log(`POS sales seeded (${salesData.length}).`);

  // ─── Notifications ─────────────────────────────────────────────────────────
  // Seed realistic in-app notifications so the bell is non-empty from day one.
  // We clear existing seed org notifications first (idempotent re-runs).
  await prisma.notification.deleteMany({ where: { orgId: EIS_ORG_ID } });

  const adminOpsIds = [admin.id, ops.id];
  const now = Date.now();
  const hr = 60 * 60 * 1000;

  type NotifRow = {
    type: NotificationType;
    title: string;
    message: string;
    jobId?: string;
    userId: string;
    channel: NotificationChannel;
    isRead: boolean;
    orgId: string;
    createdAt: Date;
  };

  const notifRows: NotifRow[] = [];

  for (const job of jobs) {
    const device = `${job.brand} ${job.model}`;
    // We need the client name — fetch it to build a realistic message
    const clientRecord = await prisma.client.findUnique({ where: { id: job.clientId }, select: { fullName: true } }).catch(() => null);
    const clientName = clientRecord?.fullName ?? "Client";

    if (job.status === "COMPLETED" || job.status === "DELIVERED") {
      for (const uid of adminOpsIds) {
        notifRows.push({
          type: NotificationType.STATUS_CHANGE,
          title: "Job Completed",
          message: `Job ${job.jobNumber} (${clientName} · ${device}) has been completed.`,
          jobId: job.id,
          userId: uid,
          channel: NotificationChannel.DASHBOARD,
          isRead: true,
          orgId: EIS_ORG_ID,
          createdAt: new Date(now - Math.round(Math.random() * 5 * 24) * hr),
        });
      }
    } else if (job.status === "AWAITING_APPROVAL") {
      for (const uid of adminOpsIds) {
        notifRows.push({
          type: NotificationType.APPROVAL_NEEDED,
          title: "Approval Needed",
          message: `Job ${job.jobNumber} (${clientName} · ${device}) is awaiting client approval.`,
          jobId: job.id,
          userId: uid,
          channel: NotificationChannel.DASHBOARD,
          isRead: false,
          orgId: EIS_ORG_ID,
          createdAt: new Date(now - Math.round(Math.random() * 2 * 24) * hr),
        });
      }
    } else if (job.status === "IN_REPAIR" || job.status === "READY_FOR_PICKUP") {
      for (const uid of adminOpsIds) {
        notifRows.push({
          type: NotificationType.STATUS_CHANGE,
          title: job.status === "READY_FOR_PICKUP" ? "Ready for Pickup" : "In Repair",
          message: `Job ${job.jobNumber} (${clientName} · ${device}) is now ${job.status === "READY_FOR_PICKUP" ? "ready for pickup" : "in repair"}.`,
          jobId: job.id,
          userId: uid,
          channel: NotificationChannel.DASHBOARD,
          isRead: job.status !== "READY_FOR_PICKUP",
          orgId: EIS_ORG_ID,
          createdAt: new Date(now - Math.round(Math.random() * 3 * 24) * hr),
        });
      }
    } else if (job.status === "RECEIVED") {
      for (const uid of adminOpsIds) {
        notifRows.push({
          type: NotificationType.STATUS_CHANGE,
          title: "New Job Received",
          message: `Job ${job.jobNumber} (${clientName} · ${device}) has been received.`,
          jobId: job.id,
          userId: uid,
          channel: NotificationChannel.DASHBOARD,
          isRead: false,
          orgId: EIS_ORG_ID,
          createdAt: new Date(now - Math.round(Math.random() * 12) * hr),
        });
      }
    }

    // Technician assignment notifications
    if (job.assignedToId) {
      notifRows.push({
        type: NotificationType.JOB_ASSIGNED,
        title: "Job Assigned",
        message: `You have been assigned job ${job.jobNumber} – ${device}.`,
        jobId: job.id,
        userId: job.assignedToId,
        channel: NotificationChannel.DASHBOARD,
        isRead: ["COMPLETED", "DELIVERED", "CLOSED"].includes(job.status),
        orgId: EIS_ORG_ID,
        createdAt: new Date(now - Math.round(Math.random() * 4 * 24) * hr),
      });
    }
  }

  if (notifRows.length > 0) {
    await prisma.notification.createMany({ data: notifRows });
  }

  const unreadCount = notifRows.filter((n) => !n.isRead).length;
  console.log(`Notifications seeded (${notifRows.length} total, ${unreadCount} unread).`);

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log("\n=== Seed complete ===");
  console.log(`  Organisation:   1 (Eagle Info Tech)`);
  console.log(`  Users:          11`);
  console.log(`  Clients:        15`);
  console.log(`  Jobs:           ${jobs.length}`);
  console.log(`  Parts:          ${parts.length}`);
  console.log(`  Invoices:       ${invoices.length}`);
  console.log(`  Payments:       ${payCount + salesData.length}`);
  console.log(`  Bank accounts:  2 + ${bankTxns.length} transactions`);
  console.log(`  Expenses:       ${expensesData.length}`);
  console.log(`  POS sales:      ${salesData.length}`);
  console.log(`\nLogin credentials (all roles):`);
  console.log(`  admin@eagle.test     → ADMIN`);
  console.log(`  manager@eagle.test   → MANAGER`);
  console.log(`  ops@eagle.test       → OPS`);
  console.log(`  frontdesk@eagle.test → FRONT_DESK`);
  console.log(`  tech1@eagle.test     → TECHNICIAN_INTERNAL`);
  console.log(`  tech2@eagle.test     → TECHNICIAN_INTERNAL`);
  console.log(`  exttech@eagle.test   → TECHNICIAN_EXTERNAL`);
  console.log(`  exttech2@eagle.test  → TECHNICIAN_EXTERNAL`);
  console.log(`  finance@eagle.test   → FINANCE`);
  console.log(`  sales@eagle.test     → SALES`);
  console.log(`\n  Password for all: ${defaultPassword}`);
}

main()
  .catch((error) => {
    const known = error as { code?: string; meta?: unknown; message?: string; stack?: string };
    console.error("Seed failed:", known?.message ?? error);
    if (known?.code) console.error("Prisma code:", known.code);
    if (known?.meta) console.error("Prisma meta:", known.meta);
    if (known?.stack) console.error(known.stack);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
