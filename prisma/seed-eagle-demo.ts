/**
 * prisma/seed-eagle-demo.ts
 *
 * Full demo data for the Eagle Info Solutions org.
 * Adds proper staff roster, active jobs across all statuses,
 * invoices, payments, inventory, suppliers, POs, and POS sales.
 *
 * Run: bun run prisma/seed-eagle-demo.ts
 * Password for all demo accounts: Demo1234!
 */

import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/lib/prisma";

const DEMO_PASSWORD = "Demo1234!";
const ORG_ID = "cmoxvcxks00002lgy926wzxoi"; // Eagle Info Solutions

function d(year: number, month: number, day: number) {
  return new Date(year, month - 1, day);
}

async function upsertUser(email: string, name: string, role: string) {
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, role: role as never, orgId: ORG_ID, isActive: true, emailVerified: true },
    create: { name, email, role: role as never, orgId: ORG_ID, isActive: true, emailVerified: true },
  });
  const existing = await prisma.account.findFirst({ where: { userId: user.id, providerId: "credential" } });
  if (existing) {
    await prisma.account.update({ where: { id: existing.id }, data: { password: await hashPassword(DEMO_PASSWORD) } });
  } else {
    await prisma.account.create({
      data: { accountId: user.id, providerId: "credential", userId: user.id, password: await hashPassword(DEMO_PASSWORD) },
    });
  }
  return user;
}

async function upsertPermissions(userId: string, permissions: string[]) {
  await prisma.userPermission.deleteMany({ where: { userId } });
  for (const permission of permissions) {
    await prisma.userPermission.create({ data: { userId, permission } });
  }
}

async function upsertClient(phone: string, fullName: string, email?: string, organization?: string) {
  const existing = await prisma.client.findFirst({ where: { phone, orgId: ORG_ID } });
  if (existing) {
    return prisma.client.update({ where: { id: existing.id }, data: { fullName, email: email ?? null, organization: organization ?? null } });
  }
  return prisma.client.create({ data: { fullName, phone, email: email ?? null, organization: organization ?? null, orgId: ORG_ID } });
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding Eagle Info Solutions demo data…");

  // ── 1. Users ─────────────────────────────────────────────────────────────
  // Update existing placeholder names to proper ones
  await prisma.user.updateMany({ where: { email: "ops.extended@eagle.tech" }, data: { name: "Patricia Namukasa" } });
  await prisma.user.updateMany({ where: { email: "ops@eagle.tech" }, data: { name: "Kakande Brian" } });
  await prisma.user.updateMany({ where: { email: "rest@eagle.tech" }, data: { name: "Stephen Waweru" } });
  await prisma.user.updateMany({ where: { email: "abdu@eagle.tech" }, data: { name: "Abdulrahman Ssemwanga" } });
  await prisma.user.updateMany({ where: { email: "ryan@eagle.tech" }, data: { name: "Ryan Ochieng" } });
  await prisma.user.updateMany({ where: { email: "dan@eagle.tech" }, data: { name: "Daniel Tumwebaze" } });

  // New staff
  const james = await upsertUser("james@eagleinfosolutions.com", "James Mwangi", "OPS");
  await upsertPermissions(james.id, [
    "can_intake", "can_search_jobs", "can_view_job_progress",
    "can_view_approved_cost", "can_approve_invoices", "can_view_accounts_summary",
  ]);

  const brenda = await upsertUser("brenda@eagleinfosolutions.com", "Brenda Auma", "FRONT_DESK");
  await upsertPermissions(brenda.id, ["can_intake", "can_search_jobs", "can_view_job_progress"]);

  const alex = await upsertUser("alex@eagleinfosolutions.com", "Alex Tumwesigye", "TECHNICIAN_EXTERNAL");

  const grace = await upsertUser("grace@eagleinfosolutions.com", "Grace Kiprotich", "TECHNICIAN_INTERNAL");
  await upsertPermissions(grace.id, [
    "can_run_internal_repairs", "can_intake", "can_search_jobs",
    "can_generate_job_cards", "can_view_job_progress", "can_view_approved_cost",
    "can_assign_jobs", "can_view_external_updates",
  ]);

  const mary = await upsertUser("mary@eagleinfosolutions.com", "Mary Wambua", "MANAGER");
  await upsertPermissions(mary.id, [
    "can_manage_intake", "can_search_jobs", "can_generate_job_cards",
    "can_assign_jobs", "can_view_approved_cost", "can_view_external_updates",
    "can_view_external_quotes", "can_review_external_bills",
    "can_view_accounts_summary", "can_approve_invoices",
  ]);

  const peter = await upsertUser("peter@eagleinfosolutions.com", "Peter Ochieng", "FINANCE");
  await upsertPermissions(peter.id, [
    "can_search_jobs", "can_view_approved_cost", "can_view_external_quotes",
    "can_review_external_bills", "can_view_accounts_summary", "can_approve_invoices",
  ]);

  const linda = await upsertUser("linda@eagleinfosolutions.com", "Linda Namuddu", "SALES");
  await upsertPermissions(linda.id, [
    "can_intake", "can_manage_intake", "can_search_jobs",
    "can_generate_job_cards", "can_view_job_progress",
    "can_view_approved_cost", "can_view_external_quotes",
  ]);

  // Fetch persistent user IDs
  const george = await prisma.user.findFirst({ where: { email: "george@eagleinfosolutions.com" }, select: { id: true } });
  const stephen = await prisma.user.findFirst({ where: { email: "rest@eagle.tech" }, select: { id: true } });
  const abdu = await prisma.user.findFirst({ where: { email: "abdu@eagle.tech" }, select: { id: true } });
  const ryan = await prisma.user.findFirst({ where: { email: "ryan@eagle.tech" }, select: { id: true } });
  const dan = await prisma.user.findFirst({ where: { email: "dan@eagle.tech" }, select: { id: true } });
  const patricia = await prisma.user.findFirst({ where: { email: "ops.extended@eagle.tech" }, select: { id: true } });
  const kakande = await prisma.user.findFirst({ where: { email: "ops@eagle.tech" }, select: { id: true } });

  const adminId = george!.id;
  const intIds = [stephen!.id, grace.id];
  const extIds = [abdu!.id, ryan!.id, dan!.id, alex.id];
  const opsIds = [patricia!.id, james.id];
  const frontDeskId = kakande!.id;

  console.log("  ✓ Users seeded");

  // ── 2. Clients ───────────────────────────────────────────────────────────
  const [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10] = await Promise.all([
    upsertClient("+256701234001", "Amina Nakigozi", "amina.n@gmail.com"),
    upsertClient("+256701234002", "Robert Ssekandi", "rsekandi@outlook.com", "Ssekandi & Co."),
    upsertClient("+256701234003", "Priya Sharma", "priya.sharma@gmail.com"),
    upsertClient("+256701234004", "Moses Byaruhanga", "m.byaru@yahoo.com"),
    upsertClient("+256701234005", "Fatuma Wanjiku", "fatuma.w@gmail.com"),
    upsertClient("+256701234006", "Eagle Learning Centre", undefined, "Eagle Learning Centre"),
    upsertClient("+256701234007", "Kevin Onyango", "k.onyango@gmail.com"),
    upsertClient("+256701234008", "Pearl Logistics Ltd", undefined, "Pearl Logistics Ltd"),
    upsertClient("+256701234009", "Sarah Atim", "sarah.atim@gmail.com"),
    upsertClient("+256701234010", "Joseph Mutembei", "joe.mutembei@gmail.com"),
  ]);

  console.log("  ✓ Clients seeded");

  // ── 3. Jobs ──────────────────────────────────────────────────────────────
  function jobNum(seq: number) {
    return `EIS-DEMO-${String(seq).padStart(4, "0")}`;
  }

  const jobDefs = [
    // Active pipeline jobs
    { seq: 1,  status: "RECEIVED",          client: c1,  assignedTo: frontDeskId,    device: "PHONE_ANDROID", brand: "Samsung",  model: "Galaxy S24",       issue: "Screen cracked, touch unresponsive after drop",             receivedAt: d(2026,5,12) },
    { seq: 2,  status: "RECEIVED",          client: c2,  assignedTo: frontDeskId,    device: "WINDOWS_PC",    brand: "HP",       model: "ProBook 450 G9",   issue: "Laptop won't boot — black screen on power on",              receivedAt: d(2026,5,13) },
    { seq: 3,  status: "DIAGNOSING",        client: c3,  assignedTo: intIds[0],      device: "PHONE_IPHONE",  brand: "Apple",    model: "iPhone 15 Pro",    issue: "Face ID stopped working after recent update",               receivedAt: d(2026,5,10), diag: "Face ID module disconnected from mainboard — needs microsoldering" },
    { seq: 4,  status: "DIAGNOSING",        client: c4,  assignedTo: intIds[1],      device: "MAC",           brand: "Apple",    model: "MacBook Pro 14\"", issue: "Kernel panic on startup, repeated crashes",                 receivedAt: d(2026,5,9),  diag: "RAM slot B shows intermittent fault — suspect cold solder joint" },
    { seq: 5,  status: "REFERRED",          client: c5,  assignedTo: extIds[0],      device: "WINDOWS_PC",    brand: "Lenovo",   model: "IdeaPad Slim 5",   issue: "Power adapter port physically broken, no charge",            receivedAt: d(2026,5,8),  diag: "DC jack sheared off — board-level repair needed", extDiag: "Confirmed DC jack replacement required, parts sourced" },
    { seq: 6,  status: "AWAITING_APPROVAL", client: c6,  assignedTo: extIds[1],      device: "TABLET",        brand: "Samsung",  model: "Galaxy Tab S9",    issue: "Display showing pink lines after accidental flex damage",    receivedAt: d(2026,5,7),  diag: "Flex cable bent — display replacement required", clientBill: 420000, approved: null },
    { seq: 7,  status: "AWAITING_APPROVAL", client: c7,  assignedTo: intIds[0],      device: "PHONE_ANDROID", brand: "Tecno",    model: "Camon 30 Pro",     issue: "Charging intermittent, port loose",                         receivedAt: d(2026,5,6),  diag: "USB-C port needs replacement, motherboard undamaged", clientBill: 180000, approved: null },
    { seq: 8,  status: "IN_REPAIR",         client: c8,  assignedTo: extIds[2],      device: "WINDOWS_PC",    brand: "Dell",     model: "Precision 5680",   issue: "GPU artefacts on screen, random freezes",                   receivedAt: d(2026,5,5),  diag: "GPU overheating — thermal repaste and heatsink fix required", clientBill: 550000, approved: true, repairPath: "EXTERNAL", extBill: 220000 },
    { seq: 9,  status: "IN_REPAIR",         client: c9,  assignedTo: intIds[1],      device: "PHONE_IPHONE",  brand: "Apple",    model: "iPhone 14",        issue: "Battery draining in under 2 hours at full brightness",       receivedAt: d(2026,5,4),  diag: "Battery health at 71% — replacing with genuine Apple cell", clientBill: 220000, approved: true, repairPath: "IN_HOUSE" },
    { seq: 10, status: "IN_REPAIR",         client: c10, assignedTo: extIds[3],      device: "MAC",           brand: "Apple",    model: "MacBook Air M2",   issue: "Wi-Fi drops every few minutes, no stable connection",        receivedAt: d(2026,5,3),  diag: "AirPort card failure — replacement ordered", clientBill: 380000, approved: true, repairPath: "EXTERNAL", extBill: 150000 },
    { seq: 11, status: "READY_FOR_PICKUP",  client: c1,  assignedTo: intIds[0],      device: "WINDOWS_PC",    brand: "Asus",     model: "VivoBook 15",      issue: "Overheating, fan loud and ineffective",                     receivedAt: d(2026,5,1),  diag: "Fan seized — replaced fan and repasted CPU/GPU", clientBill: 290000, approved: true, repairPath: "IN_HOUSE", workDone: "Replaced cooling fan module and applied new thermal compound. CPU temp down from 97°C to 62°C under load." },
    { seq: 12, status: "READY_FOR_PICKUP",  client: c2,  assignedTo: extIds[0],      device: "PHONE_ANDROID", brand: "Google",   model: "Pixel 8 Pro",      issue: "Back glass shattered in two pieces",                        receivedAt: d(2026,4,30), diag: "Back glass shattered — cosmetic replacement only", clientBill: 195000, approved: true, repairPath: "EXTERNAL", extBill: 75000, workDone: "New OEM back glass fitted and adhesive cured. Phone fully functional." },
    // Completed jobs
    { seq: 13, status: "COMPLETED", client: c3,  assignedTo: intIds[1],  device: "PHONE_IPHONE", brand: "Apple",   model: "iPhone 13 mini", issue: "Speaker muffled, microphone cuts out in calls",        receivedAt: d(2026,5,2),  completedAt: d(2026,5,8),  clientBill: 160000, approved: true, repairPath: "IN_HOUSE", workDone: "Speaker mesh cleaned, microphone module replaced" },
    { seq: 14, status: "COMPLETED", client: c4,  assignedTo: extIds[1],  device: "WINDOWS_PC",   brand: "HP",      model: "Spectre x360",   issue: "Touchscreen unresponsive, stylus not detected",        receivedAt: d(2026,5,1),  completedAt: d(2026,5,7),  clientBill: 340000, approved: true, repairPath: "EXTERNAL", extBill: 130000, workDone: "Digitiser replaced with genuine HP component. Stylus recalibrated." },
    { seq: 15, status: "COMPLETED", client: c5,  assignedTo: intIds[0],  device: "MAC",          brand: "Apple",   model: "MacBook Pro 13\"",issue: "Keyboard sticky keys, 'e' and 'r' not responding",     receivedAt: d(2026,4,28), completedAt: d(2026,5,5),  clientBill: 270000, approved: true, repairPath: "IN_HOUSE", workDone: "Full keyboard assembly replaced, liquid residue cleaned from board" },
    { seq: 16, status: "COMPLETED", client: c6,  assignedTo: extIds[2],  device: "TABLET",       brand: "Apple",   model: "iPad Pro 12.9\"", issue: "Charging slow, Apple Pencil not charging on back",     receivedAt: d(2026,4,26), completedAt: d(2026,5,4),  clientBill: 185000, approved: true, repairPath: "EXTERNAL", extBill: 70000, workDone: "Charging IC reflowed, MagSafe coil replaced on back panel" },
    { seq: 17, status: "COMPLETED", client: c7,  assignedTo: intIds[1],  device: "PHONE_ANDROID",brand: "Samsung", model: "Galaxy A35",     issue: "Camera app crashes, rear lens cracked",                receivedAt: d(2026,4,24), completedAt: d(2026,5,3),  clientBill: 215000, approved: true, repairPath: "IN_HOUSE", workDone: "Rear camera module replaced, camera app re-tested on all modes" },
    { seq: 18, status: "COMPLETED", client: c8,  assignedTo: extIds[3],  device: "WINDOWS_PC",   brand: "Lenovo",  model: "ThinkPad X1 Carbon",issue: "SSD undetected after Windows update, data at risk",  receivedAt: d(2026,4,22), completedAt: d(2026,5,2),  clientBill: 420000, approved: true, repairPath: "EXTERNAL", extBill: 160000, workDone: "SSD replaced with 1TB NVMe, Windows 11 reinstalled with data migration" },
    { seq: 19, status: "COMPLETED", client: c9,  assignedTo: intIds[0],  device: "PHONE_IPHONE", brand: "Apple",   model: "iPhone 12",      issue: "No 5G signal, calls drop after 30 seconds",            receivedAt: d(2026,4,20), completedAt: d(2026,5,1),  clientBill: 250000, approved: true, repairPath: "IN_HOUSE", workDone: "Antenna module replaced, network tested on three carriers" },
    { seq: 20, status: "COMPLETED", client: c10, assignedTo: extIds[0],  device: "MAC",          brand: "Apple",   model: "iMac 27\"",      issue: "iMac running extremely hot, kernel panics daily",      receivedAt: d(2026,4,18), completedAt: d(2026,4,30), clientBill: 490000, approved: true, repairPath: "EXTERNAL", extBill: 190000, workDone: "GPU heatsink replaced, new thermal paste applied, dust cleared from chassis" },
    { seq: 21, status: "COMPLETED", client: c1,  assignedTo: intIds[1],  device: "PHONE_ANDROID",brand: "Tecno",   model: "Spark 20 Pro",   issue: "Phone stuck in bootloop after OTA update",             receivedAt: d(2026,4,16), completedAt: d(2026,4,28), clientBill: 130000, approved: true, repairPath: "IN_HOUSE", workDone: "Factory reset and firmware reflash performed, data backed up first" },
    { seq: 22, status: "COMPLETED", client: c2,  assignedTo: extIds[1],  device: "WINDOWS_PC",   brand: "Dell",    model: "XPS 13 9305",    issue: "Lid hinge snapped, screen hinge cover cracked",        receivedAt: d(2026,4,14), completedAt: d(2026,4,26), clientBill: 310000, approved: true, repairPath: "EXTERNAL", extBill: 120000, workDone: "Both hinges replaced with OEM units, lid assembly re-aligned" },
    { seq: 23, status: "COMPLETED", client: c3,  assignedTo: intIds[0],  device: "PHONE_IPHONE", brand: "Apple",   model: "iPhone 11",      issue: "Rear dual-camera blurry, portrait mode broken",        receivedAt: d(2026,4,12), completedAt: d(2026,4,24), clientBill: 200000, approved: true, repairPath: "IN_HOUSE", workDone: "Rear camera assembly replaced, portrait mode re-calibrated" },
    // Closed jobs
    { seq: 24, status: "CLOSED", client: c4, assignedTo: intIds[0], device: "WINDOWS_PC", brand: "HP", model: "Envy 15", issue: "Motherboard water damage — extensive corrosion on GPU lane", receivedAt: d(2026,4,10), closedAt: d(2026,4,18), diag: "Motherboard corrosion beyond economical repair — client declined write-off cost", approved: false },
    { seq: 25, status: "CLOSED", client: c5, assignedTo: extIds[0], device: "PHONE_ANDROID", brand: "Infinix", model: "Hot 30", issue: "Dropped in water — severe liquid damage, no power", receivedAt: d(2026,4,8), closedAt: d(2026,4,16), diag: "Logic board beyond repair, cost exceeds device value", approved: false },
  ] as const;

  const createdJobs: Record<number, { id: string }> = {};

  for (const def of jobDefs) {
    const num = jobNum(def.seq);
    const existing = await prisma.job.findUnique({ where: { jobNumber: num }, select: { id: true } });
    const data: Record<string, unknown> = {
      jobNumber: num,
      status: def.status,
      orgId: ORG_ID,
      clientId: def.client.id,
      createdById: opsIds[def.seq % 2],
      assignedToId: (def as Record<string, unknown>).assignedTo as string ?? null,
      deviceType: def.device,
      brand: def.brand,
      model: def.model,
      issueDescription: def.issue,
      diagnosisNotes: (def as Record<string, unknown>).diag as string ?? null,
      externalDiagnosis: (def as Record<string, unknown>).extDiag as string ?? null,
      repairPath: (def as Record<string, unknown>).repairPath ?? null,
      clientBill: (def as Record<string, unknown>).clientBill ?? null,
      externalTechBill: (def as Record<string, unknown>).extBill ?? null,
      clientApproved: (def as Record<string, unknown>).approved ?? null,
      workDone: (def as Record<string, unknown>).workDone ?? null,
      receivedAt: def.receivedAt,
      completedAt: (def as Record<string, unknown>).completedAt ?? null,
      closedAt: (def as Record<string, unknown>).closedAt ?? null,
    };
    let job: { id: string };
    if (existing) {
      job = await prisma.job.update({ where: { id: existing.id }, data });
    } else {
      job = await prisma.job.create({ data: data as never });
    }
    createdJobs[def.seq] = job;
  }

  console.log("  ✓ Jobs seeded:", jobDefs.length, "jobs across all statuses");

  // ── 4. Invoices + Payments ─────────────────────────────────────────────
  const invoiceDefs = [
    { seq: 13, inv: "INV-DEMO-0013", amount: 160000, paid: 160000, method: "MOBILE_MONEY" },
    { seq: 14, inv: "INV-DEMO-0014", amount: 340000, paid: 340000, method: "BANK_TRANSFER" },
    { seq: 15, inv: "INV-DEMO-0015", amount: 270000, paid: 270000, method: "CASH" },
    { seq: 16, inv: "INV-DEMO-0016", amount: 185000, paid: 100000, method: "CASH" },    // partial
    { seq: 17, inv: "INV-DEMO-0017", amount: 215000, paid: 215000, method: "MOBILE_MONEY" },
    { seq: 18, inv: "INV-DEMO-0018", amount: 420000, paid: 420000, method: "BANK_TRANSFER" },
    { seq: 19, inv: "INV-DEMO-0019", amount: 250000, paid: 0,      method: "CASH" },    // unpaid
    { seq: 20, inv: "INV-DEMO-0020", amount: 490000, paid: 490000, method: "BANK_TRANSFER" },
    { seq: 21, inv: "INV-DEMO-0021", amount: 130000, paid: 130000, method: "MOBILE_MONEY" },
    { seq: 22, inv: "INV-DEMO-0022", amount: 310000, paid: 200000, method: "CASH" },    // partial
    { seq: 23, inv: "INV-DEMO-0023", amount: 200000, paid: 0,      method: "CASH" },    // unpaid
  ];

  for (const inv of invoiceDefs) {
    const job = createdJobs[inv.seq];
    if (!job) continue;

    // Invoice
    const existingInv = await prisma.invoice.findFirst({ where: { jobId: job.id, orgId: ORG_ID } });
    let invoiceId: string;
    if (existingInv) {
      invoiceId = existingInv.id;
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          invoiceNumber: inv.inv,
          currency: "UGX",
          status: inv.paid >= inv.amount ? "PAID" : "ISSUED",
          totalAmount: inv.amount,
          paidAmount: inv.paid,
          paidAt: inv.paid >= inv.amount ? d(2026, 5, 10) : null,
          issuedAt: d(2026, 5, 9),
        },
      });
    } else {
      const created = await prisma.invoice.create({
        data: {
          orgId: ORG_ID,
          jobId: job.id,
          invoiceNumber: inv.inv,
          currency: "UGX",
          status: inv.paid >= inv.amount ? "PAID" : "ISSUED",
          totalAmount: inv.amount,
          paidAmount: inv.paid,
          paidAt: inv.paid >= inv.amount ? d(2026, 5, 10) : null,
          issuedAt: d(2026, 5, 9),
        },
      });
      invoiceId = created.id;
    }

    // Invoice lines
    const existingLine = await prisma.invoiceLine.findFirst({ where: { invoiceId, orgId: ORG_ID } });
    if (!existingLine) {
      await prisma.invoiceLine.create({
        data: {
          orgId: ORG_ID,
          invoiceId,
          description: "Repair service",
          quantity: 1,
          unitPrice: inv.amount,
          discountAmount: 0,
          taxAmount: 0,
          lineTotal: inv.amount,
        },
      });
    }

    // Payment (if any paid amount)
    if (inv.paid > 0) {
      const existingPay = await prisma.payment.findFirst({ where: { invoiceId, orgId: ORG_ID } });
      if (!existingPay) {
        await prisma.payment.create({
          data: {
            orgId: ORG_ID,
            invoiceId,
            currency: "UGX",
            amount: inv.paid,
            method: inv.method as never,
            receivedAt: d(2026, 5, 10),
            createdById: adminId,
          },
        });
      }
    }
  }

  console.log("  ✓ Invoices + payments seeded");

  // ── 5. Inventory — Parts ──────────────────────────────────────────────
  const partDefs = [
    { sku: "PRT-SCR-001",  name: "iPhone 14 OLED Display Assembly",     mfg: "Apple OEM",    cost: 280000, qty: 5,  reorder: 2 },
    { sku: "PRT-SCR-002",  name: "Samsung Galaxy S24 Display Module",   mfg: "Samsung",      cost: 320000, qty: 3,  reorder: 2 },
    { sku: "PRT-SCR-003",  name: "MacBook Pro 14\" LCD Panel",          mfg: "LG Display",   cost: 650000, qty: 2,  reorder: 1 },
    { sku: "PRT-BAT-001",  name: "iPhone 14 Battery (A2589)",           mfg: "Apple OEM",    cost: 95000,  qty: 8,  reorder: 3 },
    { sku: "PRT-BAT-002",  name: "Samsung Galaxy A54 Battery",          mfg: "Samsung",      cost: 75000,  qty: 6,  reorder: 3 },
    { sku: "PRT-BAT-003",  name: "Dell XPS 15 Battery Pack",            mfg: "Dell",         cost: 180000, qty: 4,  reorder: 2 },
    { sku: "PRT-KEY-001",  name: "MacBook Pro 13\" Keyboard Assembly",   mfg: "Apple OEM",    cost: 320000, qty: 2,  reorder: 1 },
    { sku: "PRT-KEY-002",  name: "Lenovo ThinkPad Keyboard US Layout",  mfg: "Lenovo",       cost: 110000, qty: 4,  reorder: 2 },
    { sku: "PRT-FAN-001",  name: "Asus VivoBook Cooling Fan",           mfg: "Delta",        cost: 65000,  qty: 7,  reorder: 3 },
    { sku: "PRT-FAN-002",  name: "Dell Precision 5680 Fan Module",      mfg: "Dell",         cost: 95000,  qty: 3,  reorder: 2 },
    { sku: "PRT-CHG-001",  name: "Tecno USB-C Charging Port",           mfg: "Tecno",        cost: 25000,  qty: 12, reorder: 5 },
    { sku: "PRT-CHG-002",  name: "HP ProBook DC Power Jack",            mfg: "HP",           cost: 35000,  qty: 9,  reorder: 4 },
    { sku: "PRT-SSD-001",  name: "Samsung 1TB NVMe SSD (970 EVO)",      mfg: "Samsung",      cost: 380000, qty: 4,  reorder: 2 },
    { sku: "PRT-RAM-001",  name: "Kingston 16GB DDR4 SO-DIMM",          mfg: "Kingston",     cost: 145000, qty: 6,  reorder: 3 },
    { sku: "PRT-CAM-001",  name: "iPhone 13 Rear Dual-Camera Module",   mfg: "Apple OEM",    cost: 210000, qty: 3,  reorder: 2 },
    { sku: "PRT-CAM-002",  name: "Samsung Galaxy A35 Camera Module",    mfg: "Samsung",      cost: 95000,  qty: 5,  reorder: 2 },
    { sku: "PRT-HNG-001",  name: "Dell XPS Laptop Hinge Set (Left+Right)",mfg: "Dell",       cost: 85000,  qty: 4,  reorder: 2 },
    { sku: "PRT-ANT-001",  name: "iPhone 12 Antenna Flex Module",       mfg: "Apple OEM",    cost: 55000,  qty: 6,  reorder: 3 },
    { sku: "PRT-THM-001",  name: "Thermal Paste (Tube, 1g)",            mfg: "Arctic",       cost: 15000,  qty: 0,  reorder: 5 },  // out of stock
    { sku: "PRT-GSK-001",  name: "iPhone Back Glass (Clear, OEM)",      mfg: "Apple OEM",    cost: 45000,  qty: 1,  reorder: 3 },  // low stock
  ];

  for (const p of partDefs) {
    const existing = await prisma.part.findFirst({ where: { sku: p.sku, orgId: ORG_ID } });
    if (existing) {
      await prisma.part.update({ where: { id: existing.id }, data: { name: p.name, manufacturer: p.mfg, unitCost: p.cost, qtyOnHand: p.qty, reorderLevel: p.reorder, isActive: true } });
    } else {
      await prisma.part.create({ data: { sku: p.sku, name: p.name, manufacturer: p.mfg, unitCost: p.cost, qtyOnHand: p.qty, reorderLevel: p.reorder, isActive: true, orgId: ORG_ID } });
    }
  }

  console.log("  ✓ Parts seeded:", partDefs.length, "items");

  // ── 6. Suppliers ──────────────────────────────────────────────────────
  const supplierDefs = [
    { name: "Apple Uganda Authorised Reseller", contact: "James Odongo", email: "orders@appleug.co.ug", phone: "+256414201100", address: "Kampala, Nakasero" },
    { name: "Samsung East Africa Parts", contact: "Wanjiku Kariuki", email: "parts@samsungea.co.ke", phone: "+254722300200", address: "Nairobi, Westlands" },
    { name: "Dell Technologies Africa", contact: "Kwame Mensah", email: "supply@dell-africa.com", phone: "+233244500300", address: "Accra, Airport City" },
    { name: "Kingston Technology Distributors", contact: "Li Wei", email: "orders@kingston-dist.com", phone: "+971509001234", address: "Dubai, UAE" },
    { name: "Tecno Mobile Uganda", contact: "Brian Ssebulime", email: "partssupport@tecno.ug", phone: "+256700400500", address: "Kampala, Lugogo Mall" },
  ];

  const createdSuppliers: string[] = [];
  for (const s of supplierDefs) {
    const existing = await prisma.supplier.findFirst({ where: { name: s.name, orgId: ORG_ID } });
    if (existing) {
      await prisma.supplier.update({ where: { id: existing.id }, data: { contactName: s.contact, email: s.email, phone: s.phone, address: s.address, isActive: true } });
      createdSuppliers.push(existing.id);
    } else {
      const sup = await prisma.supplier.create({ data: { orgId: ORG_ID, name: s.name, contactName: s.contact, email: s.email, phone: s.phone, address: s.address, isActive: true } });
      createdSuppliers.push(sup.id);
    }
  }

  console.log("  ✓ Suppliers seeded");

  // ── 7. Purchase Orders ────────────────────────────────────────────────
  const poDefs = [
    { ref: "PO-EAGLE-2026-001", supplierId: createdSuppliers[0], status: "RECEIVED",  orderedAt: d(2026,4,10), expectedAt: d(2026,4,20), receivedAt: d(2026,4,19) },
    { ref: "PO-EAGLE-2026-002", supplierId: createdSuppliers[1], status: "PARTIAL",   orderedAt: d(2026,4,25), expectedAt: d(2026,5,5)                           },
    { ref: "PO-EAGLE-2026-003", supplierId: createdSuppliers[2], status: "ORDERED",   orderedAt: d(2026,5,8),  expectedAt: d(2026,5,18)                          },
    { ref: "PO-EAGLE-2026-004", supplierId: createdSuppliers[3], status: "DRAFT"                                                                                 },
    { ref: "PO-EAGLE-2026-005", supplierId: createdSuppliers[4], status: "CANCELLED", orderedAt: d(2026,5,1)                                                     },
  ];

  for (const po of poDefs) {
    const existing = await prisma.purchaseOrder.findFirst({ where: { reference: po.ref, orgId: ORG_ID } });
    const data: Record<string, unknown> = {
      orgId: ORG_ID,
      supplierId: po.supplierId,
      status: po.status,
      reference: po.ref,
      orderedAt: po.orderedAt ?? null,
      expectedAt: po.expectedAt ?? null,
      receivedAt: po.receivedAt ?? null,
    };
    if (!existing) {
      await prisma.purchaseOrder.create({ data: data as never });
    } else {
      await prisma.purchaseOrder.update({ where: { id: existing.id }, data });
    }
  }

  console.log("  ✓ Purchase orders seeded");

  // ── 8. POS Sales ─────────────────────────────────────────────────────
  const saleDefs = [
    { num: "SALE-DEMO-001", client: c1,  items: [{ desc: "iPhone 14 Battery Replacement", qty: 1, price: 190000 }, { desc: "Screwdriver kit", qty: 1, price: 15000 }], paid: 205000, method: "MOBILE_MONEY" },
    { num: "SALE-DEMO-002", client: c2,  items: [{ desc: "MacBook screen cleaning kit", qty: 2, price: 12000 }, { desc: "USB-C Cable 2m", qty: 1, price: 18000 }], paid: 42000, method: "CASH" },
    { num: "SALE-DEMO-003", client: c3,  items: [{ desc: "Tempered glass screen protector (iPhone 13)", qty: 1, price: 25000 }, { desc: "Phone case (leather)", qty: 1, price: 35000 }], paid: 60000, method: "CASH" },
    { num: "SALE-DEMO-004", client: c4,  items: [{ desc: "Wireless Bluetooth Earbuds", qty: 1, price: 120000 }], paid: 120000, method: "MOBILE_MONEY" },
    { num: "SALE-DEMO-005", client: c5,  items: [{ desc: "USB-C to HDMI Adapter", qty: 1, price: 45000 }, { desc: "Laptop bag 15\"", qty: 1, price: 85000 }], paid: 0, method: "CASH" },   // unpaid
    { num: "SALE-DEMO-006", client: c6,  items: [{ desc: "Kingston 16GB RAM (DDR4)", qty: 2, price: 145000 }, { desc: "SATA SSD 480GB", qty: 1, price: 180000 }], paid: 470000, method: "BANK_TRANSFER" },
    { num: "SALE-DEMO-007", client: c7,  items: [{ desc: "Samsung Galaxy S24 Screen Protector", qty: 1, price: 22000 }, { desc: "Fast charger 65W", qty: 1, price: 65000 }], paid: 87000, method: "CASH" },
    { num: "SALE-DEMO-008", client: c8,  items: [{ desc: "Laptop keyboard (Lenovo T14)", qty: 1, price: 110000 }], paid: 110000, method: "MOBILE_MONEY" },
    { num: "SALE-DEMO-009", client: c9,  items: [{ desc: "Phone repair toolkit", qty: 1, price: 55000 }, { desc: "Anti-static wrist strap", qty: 2, price: 8000 }], paid: 71000, method: "CASH" },
    { num: "SALE-DEMO-010", client: c10, items: [{ desc: "Dell power adapter 65W", qty: 1, price: 95000 }], paid: 95000, method: "MOBILE_MONEY" },
  ];

  for (const s of saleDefs) {
    const existing = await prisma.sale.findFirst({ where: { saleNumber: s.num, orgId: ORG_ID } });
    const subtotal = s.items.reduce((sum, i) => sum + i.qty * i.price, 0);
    const status = s.paid >= subtotal ? "PAID" : "OPEN";

    let saleId: string;
    if (existing) {
      await prisma.sale.update({
        where: { id: existing.id },
        data: {
          clientId: s.client.id,
          subtotal,
          discountAmount: 0,
          vatAmount: 0,
          totalAmount: subtotal,
          paidAmount: s.paid,
          paidAt: s.paid >= subtotal ? d(2026, 5, 10) : null,
          status,
        },
      });
      saleId = existing.id;
    } else {
      const created = await prisma.sale.create({
        data: {
          orgId: ORG_ID,
          clientId: s.client.id,
          saleNumber: s.num,
          billingMode: "CASH",
          currency: "UGX",
          subtotal,
          discountAmount: 0,
          vatAmount: 0,
          totalAmount: subtotal,
          paidAmount: s.paid,
          paidAt: s.paid >= subtotal ? d(2026, 5, 10) : null,
          status,
          createdById: adminId,
        },
      });
      saleId = created.id;
    }

    // Sale items
    const existingItems = await prisma.saleItem.findMany({ where: { saleId } });
    if (existingItems.length === 0) {
      for (const item of s.items) {
        await prisma.saleItem.create({
          data: {
            saleId,
            description: item.desc,
            quantity: item.qty,
            unitPrice: item.price,
            lineTotal: item.qty * item.price,
          },
        });
      }
    }

    // Payment
    if (s.paid > 0) {
      const existingPay = await prisma.payment.findFirst({ where: { saleId, orgId: ORG_ID } });
      if (!existingPay) {
        await prisma.payment.create({
          data: {
            orgId: ORG_ID,
            saleId,
            currency: "UGX",
            amount: s.paid,
            method: s.method as never,
            receivedAt: d(2026, 5, 10),
            createdById: adminId,
          },
        });
      }
    }
  }

  console.log("  ✓ POS sales seeded");

  // ── 9. Update jan-mar trend jobs to use Eagle org ─────────────────────
  await prisma.job.updateMany({
    where: { jobNumber: { startsWith: "SEED-2026-" } },
    data: { orgId: ORG_ID, createdById: adminId },
  });

  console.log("  ✓ Jan–Mar trend jobs updated to Eagle org");
  console.log("\nDone! All Eagle Info Solutions demo data seeded.");
  console.log("Login: george@eagleinfosolutions.com / Demo1234!");
  console.log("Staff: brenda@eagleinfosolutions.com, james@eagleinfosolutions.com / Demo1234!");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
