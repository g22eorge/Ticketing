import { hashPassword } from "better-auth/crypto";
import { DeviceType, JobStatus, OrgModule, Prisma, RepairPath, Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const ALL_MODULES = Object.values(OrgModule) as OrgModule[];

function supportsCommsTemplates() {
  return Boolean(Prisma.dmmf.datamodel.models.find((m) => m.name === "CommunicationTemplate"));
}

async function seedDefaultCommsTemplates() {
  // Intentionally no-op.
  // We keep the Templates feature, but do not seed global defaults.
  // Each org can create its own templates in /settings/notifications/templates.
  if (!supportsCommsTemplates()) return;
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
  orgId,
}: {
  name: string;
  email: string;
  role: Role;
  password: string;
  orgId?: string;
}) {
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, role, isActive: true, emailVerified: true, ...(orgId ? { orgId } : {}) },
    create: { name, email, role, isActive: true, emailVerified: true, ...(orgId ? { orgId } : {}) },
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
  orgId,
}: {
  fullName: string;
  phone: string;
  email?: string;
  organization?: string;
  orgId: string;
}) {
  const existing = await prisma.client.findFirst({ where: { phone, orgId }, select: { id: true } });
  if (existing) {
    return prisma.client.update({
      where: { id: existing.id },
      data: { fullName, email: email ?? null, organization: organization ?? null, orgId },
    });
  }
  return prisma.client.create({
    data: { fullName, phone, email: email ?? null, organization: organization ?? null, orgId },
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
  orgId,
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
  orgId: string;
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
        orgId,
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
      orgId,
    },
  });
}

async function ensureAudit(jobId: string, userId: string, action: string, detail: unknown, orgId?: string) {
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
      ...(orgId ? { orgId } : {}),
    },
  });
}

function formatJobNumber(date: Date, sequence: number) {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return `EIS-${month}/${year}/${String(sequence).padStart(4, "0")}`;
}

async function main() {
  const defaultPassword = process.env.SEED_PASSWORD ?? "Admin123!";

  // Ensure a seed org exists so users can access the app (multi-tenant requirement).
  const seedOrg = await prisma.organization.upsert({
    where: { slug: "eagle-info-seed" },
    update: {},
    create: {
      name: "Eagle Info Solutions",
      slug: "eagle-info-seed",
      billingStatus: "ACTIVE",
      plan: "STARTER",
    },
  });
  await prisma.documentBrandingSettings.upsert({
    where: { orgId: seedOrg.id },
    update: {},
    create: { orgId: seedOrg.id },
  });
  await prisma.orgModuleGrant.deleteMany({ where: { orgId: seedOrg.id } });
  await prisma.orgModuleGrant.createMany({
    data: ALL_MODULES.map((module) => ({ orgId: seedOrg.id, module })),
  });
  const orgId = seedOrg.id;

  const admin = await ensureUser({
    name: "System Admin",
    email: process.env.SEED_ADMIN_EMAIL ?? "admin@eagle.local",
    role: "ADMIN",
    password: process.env.SEED_ADMIN_PASSWORD ?? defaultPassword,
    orgId,
  });

  const techInternal = await ensureUser({
    name: "Rest",
    email: "rest@eagle.tech",
    role: "TECHNICIAN_INTERNAL",
    password: defaultPassword,
    orgId,
  });
  await ensureUserPermissions(techInternal.id, ["can_approve_invoices"]);

  const techExternal = await ensureUser({
    name: "Abdu",
    email: "abdu@eagle.tech",
    role: "TECHNICIAN_EXTERNAL",
    password: defaultPassword,
    orgId,
  });

  const ops = await ensureUser({
    name: "Kakande",
    email: "ops@eagle.tech",
    role: "FRONT_DESK",
    password: defaultPassword,
    orgId,
  });
  await ensureUserPermissions(ops.id, []);

  const opsExtended = await ensureUser({
    name: "Ops Extended",
    email: "ops.extended@eagle.tech",
    role: "OPS",
    password: defaultPassword,
    orgId,
  });
  await ensureUserPermissions(opsExtended.id, restExtendedPermissions);

  const ryan = await ensureUser({
    name: "Ryan",
    email: "ryan@eagle.tech",
    role: "TECHNICIAN_EXTERNAL",
    password: defaultPassword,
    orgId,
  });

  const dan = await ensureUser({
    name: "Dan",
    email: "dan@eagle.tech",
    role: "TECHNICIAN_EXTERNAL",
    password: defaultPassword,
    orgId,
  });

  await deactivateUsersByEmail([
    "ops@eagle.local",
    "tech.internal@eagle.local",
    "tech.external@eagle.local",
  ]);

  await prisma.user.updateMany({
    where: { email: "ops@eagle.local" },
    data: { name: "Ops Coordinator (Legacy)" },
  });
  await prisma.user.updateMany({
    where: { email: "tech.internal@eagle.local" },
    data: { name: "Internal Tech (Legacy)" },
  });
  await prisma.user.updateMany({
    where: { email: "tech.external@eagle.local" },
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
    ensureClient({ fullName: "Amina Yusuf", phone: "0701100001", email: "amina@train.eagle", orgId }),
    ensureClient({ fullName: "Bello Devices Ltd", phone: "0701100002", organization: "Bello Devices", orgId }),
    ensureClient({ fullName: "Chinwe Okafor", phone: "0701100003", orgId }),
    ensureClient({ fullName: "Danjuma Musa", phone: "0701100004", orgId }),
    ensureClient({ fullName: "Eko Learning Hub", phone: "0701100005", organization: "Eko Hub", orgId }),
    ensureClient({ fullName: "Fatima Ibra", phone: "0701100006", orgId }),
    ensureClient({ fullName: "Gadgets Plus", phone: "0701100007", organization: "Gadgets Plus", orgId }),
    ensureClient({ fullName: "Hassan Ali", phone: "0701100008", orgId }),
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
        orgId,
      });
    }),
  );

  for (const job of trainingJobs) {
    await ensureAudit(job.id, admin.id, "JOB_CREATED", {
      seeded: true,
      training: true,
      jobNumber: job.jobNumber,
    }, orgId);

    if (job.status === "DIAGNOSING" || job.status === "IN_REPAIR") {
      await ensureAudit(job.id, job.assignedToId ?? techInternal.id, "TECHNICIAN_UPDATE", {
        seeded: true,
        note: "Technician training update recorded",
      }, orgId);
    }
    if (job.status === "AWAITING_APPROVAL") {
      await ensureAudit(job.id, ops.id, "AWAITING_CLIENT_APPROVAL", {
        seeded: true,
        note: "Client contact logged for approval workflow",
      }, orgId);
    }
  }

  console.log(`Prepared ${trainingJobs.length} fresh training jobs for go-live rehearsal.`);

  // ── BRANCHES ────────────────────────────────────────────────────────────────
  const branch1 = await prisma.branch.upsert({
    where: { id: `seed-branch-main-${orgId}` },
    update: {},
    create: {
      id: `seed-branch-main-${orgId}`,
      orgId,
      name: "Main Branch – Bombo Road",
      address: "Nalubega Complex, 1st Floor, Shop L28, Bombo Road, Kampala",
      phone: "+256772006344",
      isDefault: true,
      isActive: true,
    },
  });
  const branch2 = await prisma.branch.upsert({
    where: { id: `seed-branch-ntinda-${orgId}` },
    update: {},
    create: {
      id: `seed-branch-ntinda-${orgId}`,
      orgId,
      name: "Ntinda Branch",
      address: "Ntinda Complex, Ground Floor, Ntinda, Kampala",
      phone: "+256754006344",
      isDefault: false,
      isActive: true,
    },
  });
  console.log("Seeded branches.");

  // ── SUPPLIERS ───────────────────────────────────────────────────────────────
  const supplier1 = await prisma.supplier.upsert({
    where: { id: `seed-sup-techparts-${orgId}` },
    update: {},
    create: {
      id: `seed-sup-techparts-${orgId}`,
      orgId,
      name: "TechParts Uganda Ltd",
      contactName: "Mukasa David",
      phone: "+256701234567",
      email: "sales@techpartsug.com",
      address: "Kikuubo Lane, Kampala",
      isActive: true,
    },
  });
  const supplier2 = await prisma.supplier.upsert({
    where: { id: `seed-sup-gadgetzone-${orgId}` },
    update: {},
    create: {
      id: `seed-sup-gadgetzone-${orgId}`,
      orgId,
      name: "Gadget Zone Supplies",
      contactName: "Nansubuga Grace",
      phone: "+256782345678",
      email: "orders@gadgetzone.co.ug",
      address: "Nasser Road, Kampala",
      isActive: true,
    },
  });
  console.log("Seeded suppliers.");

  // ── PARTS / INVENTORY ───────────────────────────────────────────────────────
  const partsData = [
    { sku: "SCR-SAM-A54", name: "Samsung Galaxy A54 Screen Assembly", unitCost: 85000, qtyOnHand: 8, reorderLevel: 3 },
    { sku: "BAT-IP13", name: "iPhone 13 Battery (OEM)", unitCost: 65000, qtyOnHand: 12, reorderLevel: 5 },
    { sku: "SCR-IP13", name: "iPhone 13 Screen Assembly", unitCost: 145000, qtyOnHand: 5, reorderLevel: 3 },
    { sku: "BAT-SAM-A54", name: "Samsung Galaxy A54 Battery", unitCost: 45000, qtyOnHand: 15, reorderLevel: 5 },
    { sku: "CHG-USB-C-65W", name: "USB-C 65W Laptop Charger (Universal)", unitCost: 35000, qtyOnHand: 20, reorderLevel: 8 },
    { sku: "RAM-DDR4-8GB", name: "DDR4 8GB RAM Module (Laptop)", unitCost: 120000, qtyOnHand: 6, reorderLevel: 3 },
    { sku: "SSD-SATA-256", name: "256GB SATA SSD", unitCost: 95000, qtyOnHand: 9, reorderLevel: 4 },
    { sku: "FAN-LAPTOP-UNI", name: "Universal Laptop Cooling Fan", unitCost: 25000, qtyOnHand: 2, reorderLevel: 5 },
    { sku: "SCR-DELL-LAT54", name: "Dell Latitude 5420 Screen 14\"", unitCost: 280000, qtyOnHand: 1, reorderLevel: 2 },
    { sku: "KB-LENOVO-E14", name: "Lenovo ThinkPad E14 Keyboard", unitCost: 75000, qtyOnHand: 3, reorderLevel: 4 },
    { sku: "CHG-IP-CABLE", name: "Lightning Charging Cable (1m)", unitCost: 12000, qtyOnHand: 30, reorderLevel: 10 },
    { sku: "PASTE-THERMAL", name: "Thermal Paste (Arctic Silver 3.5g)", unitCost: 8000, qtyOnHand: 0, reorderLevel: 5 },
  ];

  const seededParts: Array<{ id: string }> = [];
  for (const p of partsData) {
    const existing = await prisma.part.findFirst({ where: { sku: p.sku, orgId } });
    let part;
    if (existing) {
      part = existing;
    } else {
      part = await prisma.part.create({
        data: {
          orgId,
          sku: p.sku,
          name: p.name,
          unitCost: p.unitCost,
          qtyOnHand: p.qtyOnHand,
          reorderLevel: p.reorderLevel,
          isActive: true,
        },
      });
    }
    seededParts.push(part);
  }
  console.log(`Seeded ${seededParts.length} parts.`);

  // ── PURCHASE ORDERS ─────────────────────────────────────────────────────────
  const po1Existing = await prisma.purchaseOrder.findFirst({
    where: { orgId, reference: "PO-SEED-001" },
  });
  if (!po1Existing) {
    await prisma.purchaseOrder.create({
      data: {
        orgId,
        supplierId: supplier1.id,
        status: "RECEIVED",
        reference: "PO-SEED-001",
        orderedAt: new Date("2026-04-10"),
        expectedAt: new Date("2026-04-17"),
        receivedAt: new Date("2026-04-18"),
        notes: "Monthly screen and battery restock",
        items: {
          create: [
            { description: "Samsung Galaxy A54 Screen Assembly", qtyOrdered: 10, qtyReceived: 10, unitCost: 82000, partId: seededParts[0].id },
            { description: "iPhone 13 Battery (OEM)", qtyOrdered: 15, qtyReceived: 15, unitCost: 63000, partId: seededParts[1].id },
          ],
        },
      },
    });
  }

  const po2Existing = await prisma.purchaseOrder.findFirst({
    where: { orgId, reference: "PO-SEED-002" },
  });
  if (!po2Existing) {
    await prisma.purchaseOrder.create({
      data: {
        orgId,
        supplierId: supplier2.id,
        status: "ORDERED",
        reference: "PO-SEED-002",
        orderedAt: new Date("2026-05-05"),
        expectedAt: new Date("2026-05-12"),
        notes: "Storage and RAM top-up order",
        items: {
          create: [
            { description: "256GB SATA SSD", qtyOrdered: 5, qtyReceived: 0, unitCost: 93000, partId: seededParts[6].id },
            { description: "DDR4 8GB RAM Module (Laptop)", qtyOrdered: 4, qtyReceived: 0, unitCost: 118000, partId: seededParts[5].id },
            { description: "Thermal Paste (Arctic Silver 3.5g)", qtyOrdered: 10, qtyReceived: 0, unitCost: 7500 },
          ],
        },
      },
    });
  }
  console.log("Seeded purchase orders.");

  // ── COMPLAINTS ──────────────────────────────────────────────────────────────
  const complaintsData = [
    {
      complaintNumber: "CMP-2026-0001",
      status: "RESOLVED" as const,
      category: "REPAIR_DELAY" as const,
      channel: "WHATSAPP" as const,
      clientName: "Nakato Sarah",
      clientPhone: "+256701234001",
      description: "My laptop was supposed to be ready in 3 days but it took over 2 weeks. No updates were given.",
      resolution: "Apologised and offered 10% discount on next service. Repair delay was due to parts shortage.",
    },
    {
      complaintNumber: "CMP-2026-0002",
      status: "INVESTIGATING" as const,
      category: "DAMAGE_CAUSED" as const,
      channel: "WALK_IN" as const,
      clientName: "Kizito Brian",
      clientPhone: "+256782345002",
      description: "The screen has a new crack that was not there when I brought in the phone for battery replacement.",
    },
    {
      complaintNumber: "CMP-2026-0003",
      status: "ACKNOWLEDGED" as const,
      category: "BILLING" as const,
      channel: "PHONE" as const,
      clientName: "Nalwoga Prossy",
      clientPhone: "+256703456003",
      description: "I was charged 250,000 UGX but the quote said 180,000 UGX. No one explained the difference.",
    },
    {
      complaintNumber: "CMP-2026-0004",
      status: "RECEIVED" as const,
      category: "UNRESOLVED_FAULT" as const,
      channel: "EMAIL" as const,
      clientName: "Ssemakula Ivan",
      clientPhone: "+256754567004",
      description: "My phone was returned repaired but the same overheating issue persists after one week.",
    },
  ];

  for (const c of complaintsData) {
    const existing = await prisma.complaint.findFirst({ where: { complaintNumber: c.complaintNumber } });
    if (!existing) {
      await prisma.complaint.create({
        data: {
          orgId,
          complaintNumber: c.complaintNumber,
          status: c.status,
          category: c.category,
          channel: c.channel,
          clientName: c.clientName,
          clientPhone: c.clientPhone,
          description: c.description,
          resolution: c.resolution ?? null,
          acknowledgedAt: ["ACKNOWLEDGED", "INVESTIGATING", "RESOLVED", "CLOSED"].includes(c.status)
            ? new Date("2026-05-02")
            : null,
          investigatingAt: ["INVESTIGATING", "RESOLVED"].includes(c.status) ? new Date("2026-05-03") : null,
          resolvedAt: c.status === "RESOLVED" ? new Date("2026-05-08") : null,
        },
      });
    }
  }
  console.log("Seeded complaints.");

  // ── REPAIR REQUESTS (INTAKE) ─────────────────────────────────────────────────
  const repairRequestsData = [
    {
      requestNumber: "REQ-2026-0001",
      requestStatus: "PENDING_FRONT_DESK" as const,
      customerName: "Nakamya Florence",
      phone: "+256701100101",
      deviceType: "PHONE_ANDROID" as const,
      brand: "Samsung",
      model: "Galaxy A32",
      problemDescription: "Phone screen is cracked and touch not responding on the right side.",
      handoverMethod: "SELF_DROPOFF" as const,
    },
    {
      requestNumber: "REQ-2026-0002",
      requestStatus: "APPROVED" as const,
      customerName: "Muwanguzi Peter",
      phone: "+256782200202",
      deviceType: "WINDOWS_PC" as const,
      brand: "HP",
      model: "ProBook 450",
      problemDescription: "Laptop overheats and shuts down within 10 minutes of use.",
      handoverMethod: "SELF_DROPOFF" as const,
    },
    {
      requestNumber: "REQ-2026-0003",
      requestStatus: "CONVERTED_TO_JOB" as const,
      customerName: "Namirembe Agnes",
      phone: "+256703300303",
      deviceType: "PHONE_IPHONE" as const,
      brand: "Apple",
      model: "iPhone 11",
      problemDescription: "Battery drains from 100% to 0 in under 2 hours.",
      handoverMethod: "SEND_WITH_DELIVERY_PERSON" as const,
      deliveryPersonName: "Mugisha Tom",
      deliveryPersonPhone: "+256701000999",
    },
    {
      requestNumber: "REQ-2026-0004",
      requestStatus: "PENDING_FRONT_DESK" as const,
      customerName: "Byaruhanga Ronald",
      phone: "+256754400404",
      deviceType: "TABLET" as const,
      brand: "Samsung",
      model: "Tab A8",
      problemDescription: "Tablet not charging at all. Tried different cables but no luck.",
      handoverMethod: "REQUEST_PICKUP" as const,
      pickupAddress: "Kireka, Kampala",
      preferredPickupDate: "2026-05-20",
    },
    {
      requestNumber: "REQ-2026-0005",
      requestStatus: "REJECTED" as const,
      customerName: "Auma Christine",
      phone: "+256706500505",
      deviceType: "WINDOWS_PC" as const,
      brand: "Acer",
      model: "Aspire 5",
      problemDescription: "Keyboard keys are sticking after liquid spill. Some keys not working.",
      handoverMethod: "SELF_DROPOFF" as const,
    },
  ];

  for (const r of repairRequestsData) {
    const existing = await prisma.repairRequest.findFirst({ where: { requestNumber: r.requestNumber } });
    if (!existing) {
      await prisma.repairRequest.create({
        data: {
          orgId,
          requestNumber: r.requestNumber,
          requestStatus: r.requestStatus,
          handoverStatus: "PENDING",
          customerName: r.customerName,
          phone: r.phone,
          deviceType: r.deviceType,
          brand: r.brand,
          model: r.model ?? null,
          problemDescription: r.problemDescription,
          handoverMethod: r.handoverMethod,
          deliveryPersonName: r.deliveryPersonName ?? null,
          deliveryPersonPhone: r.deliveryPersonPhone ?? null,
          pickupAddress: r.pickupAddress ?? null,
          preferredPickupDate: r.preferredPickupDate ?? null,
        },
      });
    }
  }
  console.log("Seeded repair requests (intake).");

  // ── INVOICES ────────────────────────────────────────────────────────────────
  // Pick completed jobs that have a clientBill to attach invoices to
  const completedJobsForInvoices = trainingJobs
    .filter((j) => j.status === "COMPLETED" && j.clientBill != null)
    .slice(0, 4);

  for (let i = 0; i < completedJobsForInvoices.length; i++) {
    const job = completedJobsForInvoices[i];
    const invoiceNumber = `INV-2026-${String(i + 1).padStart(4, "0")}`;
    const existing = await prisma.invoice.findFirst({ where: { invoiceNumber } });
    if (!existing) {
      const statuses = ["PAID", "PAID", "ISSUED", "DRAFT"] as const;
      const totalAmount = job.clientBill ?? 200000;
      const paidAmount = statuses[i] === "PAID" ? totalAmount : 0;
      await prisma.invoice.create({
        data: {
          orgId,
          jobId: job.id,
          invoiceNumber,
          status: statuses[i],
          totalAmount,
          paidAmount,
          issuedAt: new Date("2026-04-20"),
          paidAt: statuses[i] === "PAID" ? new Date("2026-04-22") : null,
          notes: "Seeded invoice",
        },
      });
    }
  }
  console.log("Seeded invoices.");

  // ── SALES (POS) ─────────────────────────────────────────────────────────────
  const salesData = [
    { saleNumber: "SALE-2026-0001", status: "PAID" as const, totalAmount: 45000, paidAmount: 45000, clientIdx: 0 },
    { saleNumber: "SALE-2026-0002", status: "PAID" as const, totalAmount: 95000, paidAmount: 95000, clientIdx: 1 },
    { saleNumber: "SALE-2026-0003", status: "OPEN" as const, totalAmount: 35000, paidAmount: 0, clientIdx: 2 },
    { saleNumber: "SALE-2026-0004", status: "VOID" as const, totalAmount: 12000, paidAmount: 0, clientIdx: 3 },
  ];

  const seededSales: Array<{ id: string }> = [];
  for (const s of salesData) {
    const existing = await prisma.sale.findFirst({ where: { saleNumber: s.saleNumber } });
    if (existing) {
      seededSales.push(existing);
    } else {
      const sale = await prisma.sale.create({
        data: {
          orgId,
          saleNumber: s.saleNumber,
          status: s.status,
          totalAmount: s.totalAmount,
          subtotal: s.totalAmount,
          paidAmount: s.paidAmount,
          paidAt: s.status === "PAID" ? new Date("2026-04-25") : null,
          clientId: clientPool[s.clientIdx].id,
          createdById: ops.id,
          currency: "UGX",
          items: {
            create: [
              {
                description: s.saleNumber === "SALE-2026-0001"
                  ? "Lightning Charging Cable (1m)"
                  : s.saleNumber === "SALE-2026-0002"
                  ? "USB-C 65W Laptop Charger"
                  : s.saleNumber === "SALE-2026-0003"
                  ? "Thermal Paste (Arctic Silver)"
                  : "Screen Protector",
                quantity: 1,
                unitPrice: s.totalAmount,
                lineTotal: s.totalAmount,
              },
            ],
          },
        },
      });
      seededSales.push(sale);
    }
  }
  console.log("Seeded sales.");

  // ── PAYMENTS (RECEIPTS) ──────────────────────────────────────────────────────
  // Get invoices we just seeded that are PAID
  const paidInvoices = await prisma.invoice.findMany({
    where: { orgId, status: "PAID" },
    take: 2,
  });

  for (let i = 0; i < paidInvoices.length; i++) {
    const inv = paidInvoices[i];
    const existing = await prisma.payment.findFirst({ where: { invoiceId: inv.id, orgId } });
    if (!existing) {
      const methods = ["CASH", "MOBILE_MONEY"] as const;
      await prisma.payment.create({
        data: {
          orgId,
          invoiceId: inv.id,
          amount: inv.totalAmount,
          method: methods[i % methods.length],
          reference: `RCP-SEED-${String(i + 1).padStart(4, "0")}`,
          receivedAt: new Date("2026-04-22"),
          createdById: ops.id,
          currency: "UGX",
          note: "Seeded payment",
        },
      });
    }
  }

  // One cash sale payment
  const paidSale = seededSales.find((_, i) => salesData[i]?.status === "PAID");
  if (paidSale) {
    const existingSalePayment = await prisma.payment.findFirst({ where: { saleId: paidSale.id, orgId } });
    if (!existingSalePayment) {
      await prisma.payment.create({
        data: {
          orgId,
          saleId: paidSale.id,
          amount: salesData[0].totalAmount,
          method: "CASH",
          receivedAt: new Date("2026-04-25"),
          createdById: ops.id,
          currency: "UGX",
        },
      });
    }
  }
  console.log("Seeded payments.");

  // ── DELIVERY NOTES ───────────────────────────────────────────────────────────
  const invoicesForDelivery = await prisma.invoice.findMany({
    where: { orgId, status: "PAID" },
    take: 2,
  });

  const deliveryNoteNumbers = ["DN-2026-0001", "DN-2026-0002", "DN-2026-0003"];
  for (let i = 0; i < Math.min(invoicesForDelivery.length, 2); i++) {
    const inv = invoicesForDelivery[i];
    const existing = await prisma.deliveryNote.findFirst({ where: { deliveryNoteNumber: deliveryNoteNumbers[i] } });
    if (!existing) {
      await prisma.deliveryNote.create({
        data: {
          orgId,
          invoiceId: inv.id,
          deliveryNoteNumber: deliveryNoteNumbers[i],
          deliveredAt: new Date("2026-04-23"),
          deliveryMethod: "PICKUP",
          deliveredByName: "Kakande",
          receivedByName: i === 0 ? "Amina Yusuf" : "Bello Devices Ltd",
          receivedBySignatureText: "Received in good condition",
          note: "Device collected after repair",
          createdById: ops.id,
          items: {
            create: [
              { description: "Repaired device handed over", quantity: 1 },
            ],
          },
        },
      });
    }
  }

  // One sale delivery note
  const paidSaleForDN = seededSales[1]; // SALE-2026-0002
  if (paidSaleForDN) {
    const existing = await prisma.deliveryNote.findFirst({ where: { deliveryNoteNumber: deliveryNoteNumbers[2] } });
    if (!existing) {
      await prisma.deliveryNote.create({
        data: {
          orgId,
          saleId: paidSaleForDN.id,
          deliveryNoteNumber: deliveryNoteNumbers[2],
          deliveredAt: new Date("2026-04-26"),
          deliveryMethod: "DELIVERY",
          deliveredByName: "Ops Extended",
          receivedByName: "Bello Devices Ltd",
          note: "Accessories delivered to client premises",
          createdById: opsExtended.id,
          items: {
            create: [
              { description: "USB-C 65W Laptop Charger", quantity: 1 },
            ],
          },
        },
      });
    }
  }
  console.log("Seeded delivery notes.");

  // ── OUTBOUND MESSAGES ────────────────────────────────────────────────────────
  const outboundMsgsData = [
    {
      channel: "WHATSAPP" as const,
      status: "SENT" as const,
      type: "JOB_CREATED" as const,
      to: "+256701100001",
      body: "Hello Amina, your repair job EIS-4/2026/0001 has been created. We will update you on progress.",
      sentAt: new Date("2026-04-01T09:00:00Z"),
    },
    {
      channel: "WHATSAPP" as const,
      status: "SENT" as const,
      type: "JOB_COMPLETED" as const,
      to: "+256701100002",
      body: "Hello Bello Devices, your device is ready for collection. Please visit our shop with your receipt.",
      sentAt: new Date("2026-04-03T14:30:00Z"),
    },
    {
      channel: "EMAIL" as const,
      status: "SENT" as const,
      type: "JOB_STATUS_UPDATE" as const,
      to: "amina@train.eagle",
      subject: "Repair Status Update – EIS-4/2026/0003",
      body: "Dear Amina, your device diagnosis is complete. Please see attached quote for approval.",
      sentAt: new Date("2026-04-05T11:00:00Z"),
    },
    {
      channel: "WHATSAPP" as const,
      status: "FAILED" as const,
      type: "READY_FOR_PICKUP_NUDGE_1" as const,
      to: "+256701100003",
      body: "Reminder: Your repaired device is awaiting collection at Eagle Info Solutions.",
      sentAt: null,
    },
    {
      channel: "WHATSAPP" as const,
      status: "PENDING" as const,
      type: "JOB_STATUS_UPDATE" as const,
      to: "+256701100004",
      body: "Dear Danjuma, your device is currently being diagnosed. Expected timeline: 1-2 days.",
      sentAt: null,
    },
  ];

  for (const m of outboundMsgsData) {
    const existing = await prisma.outboundMessage.findFirst({
      where: { orgId, to: m.to, type: m.type, channel: m.channel },
    });
    if (!existing) {
      await prisma.outboundMessage.create({
        data: {
          orgId,
          channel: m.channel,
          status: m.status,
          type: m.type,
          to: m.to,
          subject: m.subject ?? null,
          body: m.body,
          sentAt: m.sentAt ?? null,
          nextAttemptAt: m.sentAt ?? new Date(),
          attemptCount: m.status === "SENT" ? 1 : m.status === "FAILED" ? 3 : 0,
        },
      });
    }
  }
  console.log("Seeded outbound messages.");

  // ── COMMUNICATION TEMPLATES ──────────────────────────────────────────────────
  const commTemplatesData = [
    {
      key: "job_created_whatsapp",
      channel: "WHATSAPP" as const,
      label: "Job Created – WhatsApp",
      body: "Hello {{clientName}}, your repair job {{jobNumber}} has been received. We will keep you updated.",
      variables: JSON.stringify(["clientName", "jobNumber"]),
      isActive: true,
    },
    {
      key: "job_completed_whatsapp",
      channel: "WHATSAPP" as const,
      label: "Job Completed – WhatsApp",
      body: "Hello {{clientName}}, great news! Your device ({{jobNumber}}) is ready for collection. Visit us at Bombo Road.",
      variables: JSON.stringify(["clientName", "jobNumber"]),
      isActive: true,
    },
    {
      key: "approval_needed_email",
      channel: "EMAIL" as const,
      label: "Awaiting Approval – Email",
      subject: "Repair Quote for Your Approval – {{jobNumber}}",
      body: "Dear {{clientName}},\n\nPlease find attached your repair quote for {{jobNumber}}.\nTotal: {{amount}} UGX.\n\nKindly confirm approval so we can proceed.\n\nEagle Info Solutions",
      variables: JSON.stringify(["clientName", "jobNumber", "amount"]),
      isActive: true,
    },
  ];

  for (const t of commTemplatesData) {
    const existing = await prisma.communicationTemplate.findFirst({
      where: { key: t.key, channel: t.channel, orgId },
    });
    if (!existing) {
      await prisma.communicationTemplate.create({
        data: {
          orgId,
          key: t.key,
          channel: t.channel,
          label: t.label,
          subject: t.subject ?? null,
          body: t.body,
          variables: t.variables ?? null,
          isActive: t.isActive,
        },
      });
    }
  }
  console.log("Seeded communication templates.");

  console.log("Sample login password for seeded non-admin users:", defaultPassword);
  console.log("All seed data committed successfully.");
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
