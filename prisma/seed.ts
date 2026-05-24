import { hashPassword } from "better-auth/crypto";
import { DeviceType, JobStatus, OutboundMessageChannel, Prisma, RepairPath, Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const PROTECTED_SEED_TABLES = ["AuditLog", "Photo", "Job", "ClientNote", "Client"] as const;

async function assertSeedCanReplaceDemoData() {
  let existingRows = 0;
  for (const table of PROTECTED_SEED_TABLES) {
    const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint | number }>>(`SELECT COUNT(*) AS count FROM "${table}"`);
    existingRows += Number(rows[0]?.count ?? 0);
  }

  if (existingRows > 0 && process.env.ALLOW_DESTRUCTIVE_SEED !== "1") {
    throw new Error(
      `Refusing to run destructive demo seed: protected business tables contain ${existingRows} rows. `
      + "Set ALLOW_DESTRUCTIVE_SEED=1 only for disposable local/demo databases.",
    );
  }
}

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
        "We have received your device and will contact you shortly to confirm the diagnosis and timeline.",
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
      key: "READY_FOR_PICKUP_NUDGE_1",
      channel: "EMAIL",
      label: "Ready for pickup (nudge 1) (Email)",
      subject: "Pickup reminder: Job #{jobNumber}",
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
    {
      key: "READY_FOR_PICKUP_NUDGE_2",
      channel: "EMAIL",
      label: "Ready for pickup (nudge 2) (Email)",
      subject: "Final pickup reminder: Job #{jobNumber}",
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
    const variables = [...new Set((`${t.subject ?? ""}\n${t.body}`).match(/\{([a-zA-Z0-9_]+)\}/g) ?? [])]
      .map((v) => v.replaceAll("{", "").replaceAll("}", ""))
      .sort();

    await prisma.communicationTemplate.upsert({
      where: { key_channel: { key: t.key, channel: t.channel } },
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

const restExtendedPermissions = [
  "can_run_internal_repairs",
  "can_intake",
  "can_search_jobs",
  "can_generate_job_cards",
  "can_view_job_progress",
  "can_view_approved_cost",
  "can_assign_jobs",
  "can_view_external_updates",
  "can_view_external_quotes",
  "can_review_external_bills",
  "can_view_accounts_summary",
  "can_approve_invoices",
] as const;

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
}: {
  name: string;
  email: string;
  role: Role;
  password: string;
}) {
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, role, isActive: true, emailVerified: true },
    create: { name, email, role, isActive: true, emailVerified: true },
  });

  await ensureCredentialAccount(user.id, password);
  return user;
}

async function deactivateUsersByEmail(emails: string[]) {
  if (emails.length === 0) return;
  await prisma.user.updateMany({
    where: { email: { in: emails } },
    data: { isActive: false },
  });
}

async function ensureUserPermissions(userId: string, permissions: readonly string[]) {
  await prisma.userPermission.deleteMany({ where: { userId } });
  for (const permission of permissions) {
    await prisma.userPermission.create({
      data: { userId, permission },
    });
  }
}

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
  const EIS_ORG_ID = "org_eis_01";
  return prisma.client.upsert({
    where: { phone_orgId: { phone, orgId: EIS_ORG_ID } },
    update: { fullName, email: email ?? null, organization: organization ?? null },
    create: { fullName, phone, email: email ?? null, organization: organization ?? null, orgId: EIS_ORG_ID },
  });
}

async function ensureJob({
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
  externalDiagnosis,
  externalTechBill,
  clientBill,
  clientApproved,
  repairTimeline,
  timelineMinMinutes,
  timelineMaxMinutes,
  timelineConfidence,
  timelineNote,
  workDone,
  partsReplaced,
  externalTechFee,
  externalPaid,
  externalPaidAt,
  externalPaymentRef,
  receivedAt,
  completedAt,
  closedAt,
}: {
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
  externalDiagnosis?: string;
  externalTechBill?: number;
  clientBill?: number;
  clientApproved?: boolean | null;
  repairTimeline?: string;
  timelineMinMinutes?: number;
  timelineMaxMinutes?: number;
  timelineConfidence?: "FIRM" | "ESTIMATED" | "PARTS_DEPENDENT";
  timelineNote?: string;
  workDone?: string;
  partsReplaced?: string;
  externalTechFee?: number;
  externalPaid?: boolean;
  externalPaidAt?: Date;
  externalPaymentRef?: string;
  receivedAt: Date;
  completedAt?: Date;
  closedAt?: Date;
}) {
  // Select explicitly so seeding doesn't break when optional columns
  // (e.g. deviceId) are not present in some environments yet.
  const existing = await prisma.job.findUnique({
    where: { jobNumber },
    select: { id: true },
  });
  if (existing) {
    return prisma.job.update({
      where: { id: existing.id },
      data: {
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
        externalDiagnosis: externalDiagnosis ?? null,
        externalTechBill: externalTechBill ?? null,
        clientBill: clientBill ?? null,
        clientApproved: typeof clientApproved === "boolean" ? clientApproved : null,
        repairTimeline: repairTimeline ?? null,
        timelineMinMinutes: timelineMinMinutes ?? null,
        timelineMaxMinutes: timelineMaxMinutes ?? null,
        timelineConfidence: timelineConfidence ?? null,
        timelineNote: timelineNote ?? null,
        workDone: workDone ?? null,
        partsReplaced: partsReplaced ?? null,
        externalTechFee: externalTechFee ?? null,
        externalPaid: externalPaid ?? false,
        externalPaidAt: externalPaidAt ?? null,
        externalPaymentRef: externalPaymentRef ?? null,
        receivedAt,
        completedAt: completedAt ?? null,
        closedAt: closedAt ?? null,
      },
    });
  }

  return prisma.job.create({
    data: {
      jobNumber,
      status,
      repairPath,
      clientId,
      createdById,
      assignedToId: assignedToId ?? null,
      deviceType,
      brand,
      model,
      issueDescription,
      diagnosisNotes: diagnosisNotes ?? null,
      externalDiagnosis: externalDiagnosis ?? null,
      externalTechBill: externalTechBill ?? null,
      clientBill: clientBill ?? null,
      clientApproved: typeof clientApproved === "boolean" ? clientApproved : null,
      repairTimeline: repairTimeline ?? null,
      timelineMinMinutes: timelineMinMinutes ?? null,
      timelineMaxMinutes: timelineMaxMinutes ?? null,
      timelineConfidence: timelineConfidence ?? null,
      timelineNote: timelineNote ?? null,
      workDone: workDone ?? null,
      partsReplaced: partsReplaced ?? null,
      externalTechFee: externalTechFee ?? null,
      externalPaid: externalPaid ?? false,
      externalPaidAt: externalPaidAt ?? null,
      externalPaymentRef: externalPaymentRef ?? null,
      receivedAt,
      completedAt: completedAt ?? null,
      closedAt: closedAt ?? null,
    },
  });
}

async function ensureAudit(jobId: string, userId: string, action: string, detail: unknown) {
  const serialized = JSON.stringify(detail);
  const existing = await prisma.auditLog.findFirst({
    where: { jobId, userId, action, detail: serialized },
  });
  if (existing) return;

  await prisma.auditLog.create({
    data: {
      jobId,
      userId,
      action,
      detail: serialized,
    },
  });
}

function formatJobNumber(date: Date, sequence: number) {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return `EIS-${month}/${year}/${String(sequence).padStart(4, "0")}`;
}

async function main() {
  await assertSeedCanReplaceDemoData();
  const defaultPassword = process.env.SEED_PASSWORD ?? "Admin123!";

  // ── Ensure EIS base organisation exists ──────────────────────────────────
  await prisma.organisation.upsert({
    where: { id: "org_eis_01" },
    update: {},
    create: {
      id: "org_eis_01",
      name: "Eagle Info Solutions",
      slug: "eagle-info-solutions",
      plan: "PROFESSIONAL",
      isActive: true,
      timezone: "Africa/Kampala",
      currency: "UGX",
      website: "https://eagleinfosolutions.com",
      phone: "256772006344",
      email: "info@eagleinfosolutions.com",
      tagline: "Your trusted device repair partner",
      enableRepairModule: true,
    },
  });

  const admin = await ensureUser({
    name: process.env.SEED_ADMIN_NAME ?? "George",
    email: process.env.SEED_ADMIN_EMAIL ?? "george@eagleinfosolutions.com",
    role: "ADMIN",
    password: process.env.SEED_ADMIN_PASSWORD ?? defaultPassword,
  });

  // E2E / CI test account — stable credentials so Playwright tests don't depend
  // on SEED_ADMIN_EMAIL. Never referenced in production workflows.
  const e2eAdminEmail = process.env.E2E_ADMIN_EMAIL ?? "admin@dduuka.local";
  await ensureUser({
    name: "E2E Admin",
    email: e2eAdminEmail,
    role: "ADMIN",
    password: "Admin123!",
  });

  const techInternal = await ensureUser({
    name: "Rest",
    email: "rest@eagle.tech",
    role: "TECHNICIAN_INTERNAL",
    password: defaultPassword,
  });
  await ensureUserPermissions(techInternal.id, ["can_approve_invoices"]);

  const techExternal = await ensureUser({
    name: "Abdu",
    email: "abdu@eagle.tech",
    role: "TECHNICIAN_EXTERNAL",
    password: defaultPassword,
  });

  const ops = await ensureUser({
    name: "Kakande",
    email: "ops@eagle.tech",
    role: "FRONT_DESK",
    password: defaultPassword,
  });
  await ensureUserPermissions(ops.id, []);

  const opsExtended = await ensureUser({
    name: "Ops Extended",
    email: "ops.extended@eagle.tech",
    role: "OPS",
    password: defaultPassword,
  });
  await ensureUserPermissions(opsExtended.id, restExtendedPermissions);

  const ryan = await ensureUser({
    name: "Ryan",
    email: "ryan@eagle.tech",
    role: "TECHNICIAN_EXTERNAL",
    password: defaultPassword,
  });

  const dan = await ensureUser({
    name: "Dan",
    email: "dan@eagle.tech",
    role: "TECHNICIAN_EXTERNAL",
    password: defaultPassword,
  });

  await deactivateUsersByEmail([
    "ops@dduuka.local",
    "tech.internal@dduuka.local",
    "tech.external@dduuka.local",
  ]);

  await prisma.user.updateMany({
    where: { email: "ops@dduuka.local" },
    data: { name: "Ops Coordinator (Legacy)" },
  });
  await prisma.user.updateMany({
    where: { email: "tech.internal@dduuka.local" },
    data: { name: "Internal Tech (Legacy)" },
  });
  await prisma.user.updateMany({
    where: { email: "tech.external@dduuka.local" },
    data: { name: "External Tech (Legacy)" },
  });

  console.log("Seeded users for all roles.");

  await seedDefaultCommsTemplates().catch((err) => {
    console.warn("Seed: comms templates skipped/failed:", err instanceof Error ? err.message : String(err));
  });

  await prisma.auditLog.deleteMany({});
  await prisma.photo.deleteMany({});
  await prisma.job.deleteMany({});
  await prisma.clientNote.deleteMany({});
  await prisma.client.deleteMany({});

  const trainingDate = new Date();
  const day = 1000 * 60 * 60 * 24;

  const clients = await Promise.all([
    ensureClient({ fullName: "Amina Yusuf", phone: "08010020001", email: "amina@train.eagle" }),
    ensureClient({ fullName: "Bello Devices Ltd", phone: "08010020002", organization: "Bello Devices" }),
    ensureClient({ fullName: "Chinwe Okafor", phone: "08010020003" }),
    ensureClient({ fullName: "Danjuma Musa", phone: "08010020004" }),
    ensureClient({ fullName: "Eko Learning Hub", phone: "08010020005", organization: "Eko Hub" }),
    ensureClient({ fullName: "Fatima Ibra", phone: "08010020006" }),
    ensureClient({ fullName: "Gadgets Plus", phone: "08010020007", organization: "Gadgets Plus" }),
    ensureClient({ fullName: "Hassan Ali", phone: "08010020008" }),
  ]);

  const [c1, c2, c3, c4, c5, c6, c7, c8] = clients;

  const clientPool = [c1, c2, c3, c4, c5, c6, c7, c8];
  const externalTechIds = [techExternal.id, ryan.id, dan.id];
  const creators = [ops.id, ops.id, ops.id, opsExtended.id];
  const statusCycle: JobStatus[] = [
    "RECEIVED",
    "DIAGNOSING",
    "AWAITING_APPROVAL",
    "IN_REPAIR",
    "READY_FOR_PICKUP",
    "COMPLETED",
    "COMPLETED",
    "CLOSED",
    "IN_REPAIR",
    "DIAGNOSING",
  ];
  const deviceCycle: Array<{ deviceType: DeviceType; brand: string; model: string }> = [
    { deviceType: "PHONE_ANDROID", brand: "Samsung", model: "Galaxy A54" },
    { deviceType: "PHONE_IPHONE", brand: "Apple", model: "iPhone 13" },
    { deviceType: "WINDOWS_PC", brand: "Dell", model: "Latitude 5420" },
    { deviceType: "MAC", brand: "Apple", model: "MacBook Pro 2020" },
    { deviceType: "TABLET", brand: "Samsung", model: "Tab S8" },
    { deviceType: "OTHER", brand: "Canon", model: "Pixma G3410" },
    { deviceType: "WINDOWS_PC", brand: "Lenovo", model: "ThinkPad E14" },
    { deviceType: "PHONE_ANDROID", brand: "Google", model: "Pixel 7" },
  ];

  let extCounter = 0;

  const trainingJobs = await Promise.all(
    Array.from({ length: 70 }, (_, index) => {
      const sequence = index + 1;
      const status = statusCycle[index % statusCycle.length];
      const isExternal = index % 3 !== 1;
      const selectedClient = clientPool[index % clientPool.length];
      const selectedDevice = deviceCycle[index % deviceCycle.length];
      const createdById = creators[index % creators.length];
      const assignedToId = isExternal ? externalTechIds[extCounter++ % externalTechIds.length] : techInternal.id;

      const receivedAt = new Date(Date.UTC(2026, 3, 1 + (index % 20)));
      const completedAt =
        status === "COMPLETED"
          ? new Date(Date.UTC(2026, 3, 3 + (index % 20)))
          : undefined;
      const closedAt =
        status === "CLOSED"
          ? new Date(Date.UTC(2026, 3, 4 + (index % 20)))
          : undefined;

      const externalTechBill = 110000 + (index % 9) * 25000;
      const clientBill = externalTechBill + 65000 + (index % 5) * 10000;
      const externalTechFee = externalTechBill;
      const externalPaid = isExternal && status === "COMPLETED" ? index % 4 === 0 : false;

      return ensureJob({
        jobNumber: formatJobNumber(trainingDate, sequence),
        status,
        repairPath: isExternal ? "EXTERNAL" : "IN_HOUSE",
        clientId: selectedClient.id,
        createdById,
        assignedToId,
        deviceType: selectedDevice.deviceType,
        brand: selectedDevice.brand,
        model: selectedDevice.model,
        issueDescription: isExternal
          ? "Intermittent fault requiring specialist board-level diagnostics"
          : "Device fails under normal usage and needs workshop diagnosis",
        diagnosisNotes:
          !isExternal && status !== "RECEIVED"
            ? "Initial diagnostics captured by internal bench tests"
            : undefined,
        externalDiagnosis:
          isExternal && status !== "RECEIVED"
            ? "External specialist update recorded for workflow handoff"
            : undefined,
        externalTechBill,
        clientBill: ["READY_FOR_PICKUP", "COMPLETED", "CLOSED"].includes(status) ? clientBill : undefined,
        clientApproved: status === "AWAITING_APPROVAL" ? null : status === "CLOSED" ? false : true,
        repairTimeline: status === "RECEIVED" ? undefined : isExternal ? "2-4 days" : "1-2 days",
        timelineMinMinutes: status === "RECEIVED" ? undefined : isExternal ? 2 * 24 * 60 : 24 * 60,
        timelineMaxMinutes: status === "RECEIVED" ? undefined : isExternal ? 4 * 24 * 60 : 2 * 24 * 60,
        timelineConfidence: status === "RECEIVED" ? undefined : isExternal ? "ESTIMATED" : "FIRM",
        timelineNote:
          status === "IN_REPAIR" || status === "AWAITING_APPROVAL"
            ? "Parts availability and client response monitored"
            : undefined,
        workDone:
          status === "READY_FOR_PICKUP" || status === "COMPLETED"
            ? "Repair completed and final quality checks passed"
            : undefined,
        partsReplaced:
          status === "READY_FOR_PICKUP" || status === "COMPLETED"
            ? isExternal
              ? "Board-level components"
              : "Display/Battery module"
            : undefined,
        externalTechFee: isExternal ? externalTechFee : undefined,
        externalPaid,
        externalPaidAt: externalPaid ? new Date((completedAt ?? receivedAt).getTime() + day) : undefined,
        externalPaymentRef: externalPaid ? `TRN-EXT-${String(2000 + sequence)}` : undefined,
        receivedAt,
        completedAt,
        closedAt,
      });
    }),
  );

  for (const job of trainingJobs) {
    await ensureAudit(job.id, admin.id, "JOB_CREATED", {
      seeded: true,
      training: true,
      jobNumber: job.jobNumber,
    });

    if (job.status === "DIAGNOSING" || job.status === "IN_REPAIR") {
      await ensureAudit(job.id, job.assignedToId ?? techInternal.id, "TECHNICIAN_UPDATE", {
        seeded: true,
        note: "Technician training update recorded",
      });
    }
    if (job.status === "AWAITING_APPROVAL") {
      await ensureAudit(job.id, ops.id, "AWAITING_CLIENT_APPROVAL", {
        seeded: true,
        note: "Client contact logged for approval workflow",
      });
    }
  }

  console.log(`Prepared ${trainingJobs.length} fresh training jobs for go-live rehearsal.`);
  console.log("Sample login password for seeded non-admin users:", defaultPassword);
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
