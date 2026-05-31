import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";

const prisma = new PrismaClient();

async function ensureCredentialAccount(userId, password) {
  const existing = await prisma.account.findFirst({
    where: { userId, providerId: "credential" },
    select: { id: true },
  });

  const hashed = await hashPassword(password);
  if (existing) {
    await prisma.account.update({ where: { id: existing.id }, data: { password: hashed } });
    return;
  }

  await prisma.account.create({
    data: { accountId: userId, providerId: "credential", userId, password: hashed },
  });
}

async function ensureUser({ name, email, role, orgId, password }) {
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, role, orgId, isActive: true, emailVerified: true },
    create: { name, email, role, orgId, isActive: true, emailVerified: true },
    select: { id: true, email: true, role: true },
  });
  await ensureCredentialAccount(user.id, password);
  return user;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function main() {
  const password = process.env.SEED_PASSWORD || "Password123!";
  const slug = process.env.SEED_ORG_SLUG || "local";
  const orgName = process.env.SEED_ORG_NAME || "Local Org";

  const org = await prisma.organization.upsert({
    where: { slug },
    update: { name: orgName, isActive: true },
    create: { name: orgName, slug, billingStatus: "ACTIVE", plan: "GROWTH", isActive: true },
    select: { id: true, slug: true, name: true },
  });
  const orgId = org.id;

  await prisma.documentBrandingSettings.upsert({
    where: { orgId },
    update: {},
    create: { orgId },
  });

  // ── Users ─────────────────────────────────────────────────────────────────
  const userDefs = [
    { name: "Admin",            email: "admin@local.test",          role: Role.ADMIN },
    { name: "Ops",              email: "ops@local.test",            role: Role.OPS },
    { name: "Front Desk",       email: "frontdesk@local.test",      role: Role.FRONT_DESK },
    { name: "Internal Tech",    email: "tech.internal@local.test",  role: Role.TECHNICIAN_INTERNAL },
    { name: "External Tech",    email: "tech.external@local.test",  role: Role.TECHNICIAN_EXTERNAL },
    { name: "Sales Manager",    email: "sales.manager@local.test",  role: Role.SALES },
    { name: "Tech Manager",     email: "tech.manager@local.test",   role: Role.TECH_MANAGER },
  ];
  const seededUsers = {};
  for (const u of userDefs) {
    seededUsers[u.email] = await ensureUser({ ...u, orgId, password });
  }
  const adminId        = seededUsers["admin@local.test"].id;
  const opsId          = seededUsers["ops@local.test"].id;
  const salesManagerId = seededUsers["sales.manager@local.test"].id;
  const intTechId      = seededUsers["tech.internal@local.test"].id;
  const extTechId = seededUsers["tech.external@local.test"].id;

  // ── Branches ──────────────────────────────────────────────────────────────
  async function ensureBranch(name, address, isDefault) {
    const ex = await prisma.branch.findFirst({ where: { orgId, name } });
    if (ex) return ex;
    return prisma.branch.create({ data: { orgId, name, address, isDefault } });
  }
  const mainBranch = await ensureBranch("Main Branch", "Plot 12, Kampala Road, Kampala", true);
  await ensureBranch("Ntinda Branch", "Ntinda Shopping Centre, Kampala", false);

  // ── Clients ───────────────────────────────────────────────────────────────
  async function ensureClient(fullName, phone, email, organization) {
    const ex = await prisma.client.findFirst({ where: { phone, orgId } });
    if (ex) return prisma.client.update({ where: { id: ex.id }, data: { fullName, email: email ?? null, organization: organization ?? null } });
    return prisma.client.create({ data: { orgId, fullName, phone, email: email ?? null, organization: organization ?? null } });
  }
  const clients = await Promise.all([
    ensureClient("Aisha Namukasa",     "0701100001", "aisha@gmail.com"),
    ensureClient("Brian Kavuma",       "0701100002"),
    ensureClient("Cynthia Tendo",      "0701100003", "cynthia@corp.ug"),
    ensureClient("Daniel Ssempala",    "0701100004"),
    ensureClient("Esther Namata",      "0701100005", "esther.n@email.com"),
    ensureClient("Frank Wasswa",       "0701100006"),
    ensureClient("Grace Nakimuli",     "0701100007", "grace@work.ug"),
    ensureClient("Hassan Ssembuusi",   "0701100008"),
    ensureClient("Irene Akello",       "0701100009", "irene.a@gmail.com"),
    ensureClient("James Mukiibi",      "0701100010"),
    ensureClient("Kampala Tech Hub",   "0701100011", "info@kth.ug", "Kampala Tech Hub"),
    ensureClient("Lydia Nambatya",     "0701100012", "lydia@school.ac.ug"),
    ensureClient("Moses Kiggundu",     "0701100013"),
    ensureClient("Norah Atim",         "0701100014"),
    ensureClient("Patrick Onyango",    "0701100015", "pat.o@email.com"),
    ensureClient("Rita Nakabuubi",     "0701100016"),
    ensureClient("Samuel Ochieng",     "0701100017"),
    ensureClient("Tabitha Nantongo",   "0701100018", "tabitha@biz.ug", "Nantongo Traders"),
    ensureClient("Uganda Office Store","0701100019", "orders@ugoffice.ug", "Uganda Office Store"),
    ensureClient("Victoria Nassali",   "0701100020"),
  ]);

  // ── Parts ─────────────────────────────────────────────────────────────────
  async function ensurePart(sku, name, unitCost, qtyOnHand, reorderLevel) {
    const ex = await prisma.part.findUnique({ where: { sku_orgId: { sku, orgId } } });
    if (ex) return ex;
    return prisma.part.create({ data: { orgId, sku, name, unitCost, qtyOnHand, reorderLevel } });
  }
  const parts = {
    lcdIp14:   await ensurePart("LCD-IP14",       "LCD iPhone 14 Screen",            180000,  5, 3),
    lcdIp13:   await ensurePart("LCD-IP13",       "LCD iPhone 13 Screen",            155000,  4, 3),
    lcdSa23:   await ensurePart("LCD-SA23",       "Samsung A23 Display Assembly",     95000,  7, 4),
    batSa53:   await ensurePart("BAT-SA53",       "Samsung A53 Battery",              45000, 12, 5),
    batIp12:   await ensurePart("BAT-IP12",       "iPhone 12 Battery",                55000,  9, 4),
    batDell:   await ensurePart("BAT-DELL-LAT",   "Dell Latitude Battery 65Wh",       88000,  6, 3),
    portUsbc:  await ensurePart("PORT-USBC",      "USB-C Charging Port",              15000, 20, 8),
    ramDdr4:   await ensurePart("RAM-DDR4-8GB",   "8GB DDR4 Laptop RAM",              65000, 10, 4),
    ssd512:    await ensurePart("SSD-512-NVMe",   "512GB NVMe SSD",                  120000,  8, 3),
    ssd256:    await ensurePart("SSD-256-NVMe",   "256GB NVMe SSD",                   72000, 11, 4),
    kbMbp:     await ensurePart("KB-MBP-M1",      "MacBook Pro Keyboard",             95000,  2, 3),  // below reorder
    fanDell:   await ensurePart("FAN-DELL-5520",  "Dell 5520 CPU Fan",                42000,  5, 3),
    pasteTx:   await ensurePart("PASTE-TX",       "Thermal Paste 5g",                  8000, 25, 8),
    flexIp14:  await ensurePart("FLEX-IP14-PWR",  "iPhone 14 Power Button Flex",      18000,  1, 4),  // below reorder
    isopropyl: await ensurePart("CHEM-IPA-99",    "IPA 99% Cleaning Solution 500ml",   9500, 18, 6),
    screwKit:  await ensurePart("TOOL-SCREW-KIT", "Precision Screwdriver Set",        25000,  4, 2),
  };

  // ── Suppliers ─────────────────────────────────────────────────────────────
  async function ensureSupplier(name, contactName, phone, email) {
    const ex = await prisma.supplier.findFirst({ where: { orgId, name } });
    if (ex) return ex;
    return prisma.supplier.create({ data: { orgId, name, contactName, phone, email } });
  }
  const supplier1 = await ensureSupplier("TechParts Uganda",  "Isaac Buyondo",  "+256752100200", "orders@techparts.ug");
  const supplier2 = await ensureSupplier("Gadget Zone KLA",   "Diana Nakato",   "+256775200300", "supply@gadgetzone.ug");

  // ── Purchase Orders ───────────────────────────────────────────────────────
  async function ensurePO(reference, supplierId, status, orderedAt, receivedAt, items) {
    const ex = await prisma.purchaseOrder.findFirst({ where: { orgId, reference } });
    if (ex) return ex;
    return prisma.purchaseOrder.create({
      data: { orgId, supplierId, reference, status, orderedAt, receivedAt: receivedAt ?? null, items: { create: items } },
    });
  }
  await ensurePO("PO-LOCAL-001", supplier1.id, "RECEIVED", daysAgo(20), daysAgo(15), [
    { partId: parts.lcdIp14.id,  description: "LCD iPhone 14",     qtyOrdered: 5,  qtyReceived: 5,  unitCost: 180000 },
    { partId: parts.batSa53.id,  description: "Samsung A53 Batt",  qtyOrdered: 12, qtyReceived: 12, unitCost: 45000 },
    { partId: parts.ssd512.id,   description: "512GB NVMe SSD",    qtyOrdered: 8,  qtyReceived: 8,  unitCost: 120000 },
  ]);
  await ensurePO("PO-LOCAL-002", supplier2.id, "ORDERED", daysAgo(3), null, [
    { partId: parts.lcdIp13.id,  description: "LCD iPhone 13",     qtyOrdered: 4, qtyReceived: 0, unitCost: 155000 },
    { partId: parts.lcdSa23.id,  description: "Samsung A23 LCD",   qtyOrdered: 6, qtyReceived: 0, unitCost: 95000 },
    { partId: parts.flexIp14.id, description: "iPhone 14 Pwr Flex",qtyOrdered: 8, qtyReceived: 0, unitCost: 18000 },
  ]);

  // ── Jobs ──────────────────────────────────────────────────────────────────
  // Dates spread across Jan–May 2026 so trend chart has data every month
  const d = (y, m, day) => new Date(y, m - 1, day); // month is 1-based

  const jobDefs = [
    // ── January 2026 (3 completed) ────────────────────────────────────────
    { n: "LOC-001", status: "COMPLETED",        client: 0,  dev: "PHONE_IPHONE",  brand: "Apple",   model: "iPhone 14",        issue: "Cracked screen, touch unresponsive",          diag: "LCD + digitizer replaced",          bill: 320000, work: "OEM screen fitted. 30-day warranty.", path: "IN_HOUSE", assignee: intTechId, recv: d(2026,1, 5), comp: d(2026,1,10) },
    { n: "LOC-005", status: "COMPLETED",        client: 4,  dev: "PHONE_ANDROID", brand: "Samsung", model: "Galaxy S21",        issue: "Charging port not working",                  diag: "USB-C port replaced",               bill: 95000,  work: "New port soldered. Tested.",          path: "IN_HOUSE", assignee: intTechId, recv: d(2026,1,14), comp: d(2026,1,18) },
    { n: "LOC-018", status: "COMPLETED",        client: 17, dev: "PHONE_IPHONE",  brand: "Apple",   model: "iPhone SE 2022",   issue: "Won't turn on",                              diag: "Battery fully dead, replaced",      bill: 120000, work: "Battery replaced, phone booting.",     path: "IN_HOUSE", assignee: intTechId, recv: d(2026,1,22), comp: d(2026,1,28) },

    // ── February 2026 (3 completed) ───────────────────────────────────────
    { n: "LOC-007", status: "COMPLETED",        client: 6,  dev: "PHONE_IPHONE",  brand: "Apple",   model: "iPhone 12",        issue: "Battery swollen, back glass cracked",         diag: "Battery + back glass replaced",     bill: 180000, work: "Parts sourced and fitted.",           path: "IN_HOUSE", assignee: intTechId, recv: d(2026,2, 3), comp: d(2026,2, 9) },
    { n: "LOC-012", status: "COMPLETED",        client: 11, dev: "MAC",           brand: "Apple",   model: "MacBook Pro 2019", issue: "Fan making loud noise",                       diag: "Thermal paste dried + fan clogged", bill: 95000,  work: "Cleaned + new thermal paste.",        path: "IN_HOUSE", assignee: intTechId, recv: d(2026,2,12), comp: d(2026,2,18) },
    { n: "LOC-016", status: "COMPLETED",        client: 15, dev: "PHONE_ANDROID", brand: "Xiaomi",  model: "Redmi Note 12",    issue: "Speaker crackling at high volume",            diag: "Speaker module replaced",           bill: 65000,  work: "New speaker fitted.",                 path: "IN_HOUSE", assignee: intTechId, recv: d(2026,2,20), comp: d(2026,2,26) },

    // ── March 2026 (3 completed + 1 closed) ──────────────────────────────
    { n: "LOC-010", status: "COMPLETED",        client: 9,  dev: "PHONE_ANDROID", brand: "Tecno",   model: "Spark 9",          issue: "Camera not working",                         diag: "Rear camera module replaced",       bill: 75000,  work: "Camera replaced, all lenses tested.", path: "IN_HOUSE", assignee: intTechId, recv: d(2026,3, 4), comp: d(2026,3,10) },
    { n: "LOC-020", status: "COMPLETED",        client: 19, dev: "WINDOWS_PC",    brand: "Acer",    model: "Aspire 5",         issue: "Overheating and shutting down",               diag: "Thermal paste + fan replacement",   bill: 110000, work: "Cooling system serviced.",            path: "IN_HOUSE", assignee: intTechId, recv: d(2026,3,15), comp: d(2026,3,22), extBill: 80000, extPaid: true },
    { n: "LOC-011", status: "CLOSED",           client: 10, dev: "WINDOWS_PC",    brand: "Asus",    model: "VivoBook 15",      issue: "Power button stuck",                         diag: "Client declined repair",            bill: 20000,  work: null,                                  path: "IN_HOUSE", assignee: null,      recv: d(2026,3,25), closed: d(2026,3,28) },

    // ── April 2026 (2 completed + 4 open) ────────────────────────────────
    { n: "LOC-014", status: "COMPLETED",        client: 13, dev: "TABLET",        brand: "iPad",    model: "iPad Air 5",       issue: "Charging very slow",                         diag: "Charging IC fault",                 bill: 220000, work: "IC replaced by specialist.",          path: "EXTERNAL", assignee: extTechId, recv: d(2026,4, 2), comp: d(2026,4,14), extBill: 150000, extPaid: false },
    { n: "LOC-009", status: "READY_FOR_PICKUP", client: 8,  dev: "WINDOWS_PC",    brand: "Lenovo",  model: "ThinkPad E14",     issue: "Keyboard keys sticking",                     diag: "Keyboard assembly replaced",        bill: 145000, work: "New keyboard fitted and tested.",     path: "IN_HOUSE", assignee: intTechId, recv: d(2026,4, 7), comp: d(2026,4,20) },
    { n: "LOC-006", status: "REFERRED",         client: 5,  dev: "WINDOWS_PC",    brand: "HP",      model: "ProBook 450",      issue: "Blue screen of death intermittently",         diag: "Motherboard fault suspected",       bill: null,   work: null,                                  path: "EXTERNAL", assignee: extTechId, recv: d(2026,4,10) },
    { n: "LOC-008", status: "DIAGNOSING",        client: 7,  dev: "TABLET",        brand: "Samsung", model: "Tab S8",            issue: "Screen flickering, touch issues",             diag: "Running diagnostics",               bill: null,   work: null,                                  path: "IN_HOUSE", assignee: intTechId, recv: d(2026,4,18) },
    { n: "LOC-013", status: "IN_REPAIR",         client: 12, dev: "PHONE_IPHONE",  brand: "Apple",   model: "iPhone 15",        issue: "Face ID not working",                        diag: "TrueDepth camera damage confirmed", bill: 380000, work: null,                                  path: "EXTERNAL", assignee: extTechId, recv: d(2026,4,22) },
    { n: "LOC-015", status: "AWAITING_APPROVAL", client: 14, dev: "WINDOWS_PC",    brand: "Dell",    model: "XPS 15",           issue: "Display showing lines",                      diag: "LCD cable loose, screen cracked",   bill: 450000, work: null,                                  path: "IN_HOUSE", assignee: intTechId, recv: d(2026,4,25) },

    // ── May 2026 (current — open jobs + 1 completed) ─────────────────────
    { n: "LOC-002", status: "IN_REPAIR",         client: 1,  dev: "WINDOWS_PC",    brand: "Dell",    model: "Latitude 5520",    issue: "Not booting, fans spin then stop",            diag: "Faulty RAM — replacing",            bill: null,   work: null,                                  path: "IN_HOUSE", assignee: intTechId, recv: d(2026,5, 6) },
    { n: "LOC-003", status: "AWAITING_APPROVAL", client: 2,  dev: "PHONE_ANDROID", brand: "Samsung", model: "Galaxy A53",        issue: "Battery drains fast, overheats",             diag: "Battery health 41%, recommend replacement", bill: 85000, work: null,                          path: "IN_HOUSE", assignee: intTechId, recv: d(2026,5, 9) },
    { n: "LOC-017", status: "IN_REPAIR",         client: 16, dev: "WINDOWS_PC",    brand: "HP",      model: "Pavilion 15",      issue: "Running very slow",                          diag: "HDD failing — upgrading to SSD",    bill: 185000, work: null,                                  path: "IN_HOUSE", assignee: intTechId, recv: d(2026,5,12) },
    { n: "LOC-004", status: "RECEIVED",          client: 3,  dev: "MAC",           brand: "Apple",   model: "MacBook Air M1",   issue: "Some keys not working after liquid spill",   diag: null,                                bill: null,   work: null,                                  path: null,       assignee: null,      recv: d(2026,5,13) },
    { n: "LOC-019", status: "RECEIVED",          client: 18, dev: "OTHER",         brand: "Canon",   model: "Pixma G3410",      issue: "Printer not printing, ink clogged",          diag: null,                                bill: null,   work: null,                                  path: null,       assignee: null,      recv: d(2026,5,14) },
  ];

  const createdJobs = {};
  for (const j of jobDefs) {
    const ex = await prisma.job.findUnique({ where: { jobNumber: j.n }, select: { id: true } });
    const data = {
      orgId,
      status: j.status,
      repairPath: j.path ?? null,
      clientId: clients[j.client].id,
      createdById: opsId,
      assignedToId: j.assignee ?? null,
      deviceType: j.dev,
      brand: j.brand,
      model: j.model,
      issueDescription: j.issue,
      diagnosisNotes: j.diag ?? null,
      clientBill: j.bill ?? null,
      workDone: j.work ?? null,
      externalTechBill: j.extBill ?? null,
      externalPaid: j.extPaid ?? false,
      clientApproved: j.status === "AWAITING_APPROVAL" ? null : j.status === "CLOSED" ? false : j.diag ? true : null,
      receivedAt: j.recv,
      completedAt: j.comp ?? null,
      closedAt: j.closed ?? null,
    };
    if (ex) {
      createdJobs[j.n] = await prisma.job.update({ where: { id: ex.id }, data });
    } else {
      createdJobs[j.n] = await prisma.job.create({ data: { jobNumber: j.n, ...data } });
    }
  }
  console.log(`Seeded ${jobDefs.length} jobs.`);

  // ── Audit logs ────────────────────────────────────────────────────────────
  for (const j of jobDefs) {
    const job = createdJobs[j.n];
    if (!job) continue;
    const _ex = await prisma.auditLog.findFirst({ where: { jobId: job.id, action: "JOB_CREATED" } });
    if (!_ex) await prisma.auditLog.create({ data: { jobId: job.id, userId: adminId, action: "JOB_CREATED", detail: JSON.stringify({ seeded: true }) } });
  }

  // ── Complaints ────────────────────────────────────────────────────────────
  const complaintDefs = [
    { num: "CMP-LOC-0001", status: "RECEIVED",      category: "REPAIR_DELAY",    channel: "WHATSAPP", name: "Aisha Namukasa",   phone: "0701100001", desc: "My phone has been in repair for 2 weeks with no update." },
    { num: "CMP-LOC-0002", status: "ACKNOWLEDGED",  category: "SERVICE_QUALITY", channel: "WALK_IN",  name: "Brian Kavuma",     phone: "0701100002", desc: "The technician was rude when I asked about my laptop." },
    { num: "CMP-LOC-0003", status: "INVESTIGATING", category: "BILLING",         channel: "EMAIL",    name: "Cynthia Tendo",    phone: "0701100003", desc: "I was charged twice for the same repair job." },
    { num: "CMP-LOC-0004", status: "RESOLVED",      category: "UNRESOLVED_FAULT",channel: "PHONE",    name: "Daniel Ssempala",  phone: "0701100004", desc: "Phone was returned but the original fault is still present.", resolution: "Device re-examined. Additional fault found and fixed at no charge." },
    { num: "CMP-LOC-0005", status: "RECEIVED",      category: "DAMAGE_CAUSED",   channel: "WHATSAPP", name: "Esther Namata",    phone: "0701100005", desc: "New scratch on back cover not present when I brought device in." },
  ];
  for (const c of complaintDefs) {
    const ex = await prisma.complaint.findUnique({ where: { complaintNumber: c.num } });
    if (!ex) await prisma.complaint.create({
      data: { orgId, complaintNumber: c.num, status: c.status, category: c.category, channel: c.channel, clientName: c.name, clientPhone: c.phone, description: c.desc, resolution: c.resolution ?? null },
    });
  }
  console.log("Seeded complaints.");

  // ── Repair Requests (Intake) ──────────────────────────────────────────────
  const rrDefs = [
    { num: "REQ-LOC-0001", status: "PENDING_FRONT_DESK", name: "Frank Wasswa",    phone: "0701100006", dev: "PHONE_ANDROID",  brand: "Samsung", model: "Galaxy A14",    prob: "Screen cracked, phone still works." },
    { num: "REQ-LOC-0002", status: "PENDING_FRONT_DESK", name: "Grace Nakimuli",  phone: "0701100007", dev: "WINDOWS_PC",     brand: "HP",      model: "Pavilion x360", prob: "Touchscreen not responding after drop." },
    { num: "REQ-LOC-0003", status: "APPROVED",           name: "Hassan Ssembuusi",phone: "0701100008", dev: "PHONE_IPHONE",   brand: "Apple",   model: "iPhone 11",     prob: "Water damage — stopped working." },
    { num: "REQ-LOC-0004", status: "CONVERTED_TO_JOB",   name: "Irene Akello",    phone: "0701100009", dev: "MAC",            brand: "Apple",   model: "MacBook Air",   prob: "Battery not holding charge." },
    { num: "REQ-LOC-0005", status: "PENDING_INTAKE",     name: "James Mukiibi",   phone: "0701100010", dev: "TABLET",         brand: "Samsung", model: "Tab A8",        prob: "Power button stuck, device won't turn on." },
  ];
  for (const r of rrDefs) {
    const ex = await prisma.repairRequest.findUnique({ where: { requestNumber: r.num } });
    if (!ex) await prisma.repairRequest.create({
      data: { orgId, requestNumber: r.num, requestStatus: r.status, customerName: r.name, phone: r.phone, deviceType: r.dev, brand: r.brand, model: r.model, problemDescription: r.prob, handoverMethod: "SELF_DROPOFF" },
    });
  }
  console.log("Seeded repair requests.");

  // ── Invoices ──────────────────────────────────────────────────────────────
  // Spread across Jan–May 2026 to match job completion dates
  const invoiceDefs = [
    { num: "INV-LOC-001", jobKey: "LOC-001", status: "PAID",  amount: 320000, issuedAt: d(2026,1,10), paidAt: d(2026,1,12) },
    { num: "INV-LOC-002", jobKey: "LOC-005", status: "PAID",  amount: 95000,  issuedAt: d(2026,1,18), paidAt: d(2026,1,20) },
    { num: "INV-LOC-003", jobKey: "LOC-018", status: "PAID",  amount: 120000, issuedAt: d(2026,1,28), paidAt: d(2026,1,30) },
    { num: "INV-LOC-004", jobKey: "LOC-007", status: "PAID",  amount: 180000, issuedAt: d(2026,2, 9), paidAt: d(2026,2,11) },
    { num: "INV-LOC-005", jobKey: "LOC-012", status: "PAID",  amount: 95000,  issuedAt: d(2026,2,18), paidAt: d(2026,2,20) },
    { num: "INV-LOC-006", jobKey: "LOC-016", status: "ISSUED",amount: 65000,  issuedAt: d(2026,2,26), paidAt: null },
    { num: "INV-LOC-007", jobKey: "LOC-010", status: "PAID",  amount: 75000,  issuedAt: d(2026,3,10), paidAt: d(2026,3,12) },
    { num: "INV-LOC-008", jobKey: "LOC-020", status: "PAID",  amount: 110000, issuedAt: d(2026,3,22), paidAt: d(2026,3,24) },
    { num: "INV-LOC-009", jobKey: "LOC-014", status: "PAID",  amount: 220000, issuedAt: d(2026,4,14), paidAt: d(2026,4,16) },
    { num: "INV-LOC-010", jobKey: "LOC-009", status: "ISSUED",amount: 145000, issuedAt: d(2026,4,20), paidAt: null },
  ];
  const createdInvoices = {};
  for (const inv of invoiceDefs) {
    const ex = await prisma.invoice.findUnique({ where: { invoiceNumber: inv.num } });
    const job = createdJobs[inv.jobKey];
    if (!job) continue;
    // Check no other invoice for this job
    const jobInv = await prisma.invoice.findUnique({ where: { jobId: job.id } });
    if (ex) { createdInvoices[inv.num] = ex; continue; }
    if (jobInv) { createdInvoices[inv.num] = jobInv; continue; }
    createdInvoices[inv.num] = await prisma.invoice.create({
      data: { orgId, invoiceNumber: inv.num, jobId: job.id, status: inv.status, totalAmount: inv.amount, paidAmount: inv.status === "PAID" ? inv.amount : 0, issuedAt: inv.issuedAt, paidAt: inv.paidAt ?? null },
    });
  }
  console.log("Seeded invoices.");

  // ── POS Sales ─────────────────────────────────────────────────────────────
  const saleDefs = [
    { num: "SAL-LOC-001", status: "PAID",  client: 0,  branch: mainBranch.id, total: 45000,  paid: 45000,  mode: "CASH",    items: [{ description: "Samsung A53 Battery replacement", quantity: 1, unitPrice: 45000, lineTotal: 45000 }] },
    { num: "SAL-LOC-002", status: "PAID",  client: 2,  branch: mainBranch.id, total: 120000, paid: 120000, mode: "CASH",    items: [{ description: "USB-C port repair", quantity: 1, unitPrice: 80000, lineTotal: 80000 }, { description: "Screen cleaning", quantity: 1, unitPrice: 40000, lineTotal: 40000 }] },
    { num: "SAL-LOC-003", status: "PAID",  client: 5,  branch: null,          total: 15000,  paid: 15000,  mode: "MOBILE_MONEY", items: [{ description: "USB-C Charging Cable", quantity: 1, unitPrice: 15000, lineTotal: 15000 }] },
    { num: "SAL-LOC-004", status: "OPEN",  client: 8,  branch: mainBranch.id, total: 95000,  paid: 0,      mode: "CASH",    items: [{ description: "Laptop diagnostic fee", quantity: 1, unitPrice: 50000, lineTotal: 50000 }, { description: "Thermal paste application", quantity: 1, unitPrice: 45000, lineTotal: 45000 }] },
    { num: "SAL-LOC-005", status: "PAID",  client: 11, branch: null,          total: 65000,  paid: 65000,  mode: "BANK_TRANSFER", items: [{ description: "iPhone 12 battery replacement", quantity: 1, unitPrice: 65000, lineTotal: 65000 }] },
  ];
  const createdSales = {};
  for (const s of saleDefs) {
    const ex = await prisma.sale.findUnique({ where: { saleNumber: s.num } });
    if (ex) { createdSales[s.num] = ex; continue; }
    createdSales[s.num] = await prisma.sale.create({
      data: {
        orgId, saleNumber: s.num, status: s.status,
        clientId: clients[s.client].id, branchId: s.branch,
        billingMode: "CASH", totalAmount: s.total, paidAmount: s.paid, subtotal: s.total,
        items: { create: s.items },
      },
    });
  }
  console.log("Seeded POS sales.");

  // ── Payments ──────────────────────────────────────────────────────────────
  const paymentDefs = [
    { invoiceNum: "INV-LOC-001", amount: 320000, method: "CASH",          ref: "RCPT-LOC-001",  at: d(2026,1,12) },
    { invoiceNum: "INV-LOC-002", amount: 95000,  method: "MOBILE_MONEY",  ref: "MM-789012345",  at: d(2026,1,20) },
    { invoiceNum: "INV-LOC-003", amount: 120000, method: "CASH",          ref: "RCPT-LOC-003",  at: d(2026,1,30) },
    { invoiceNum: "INV-LOC-004", amount: 180000, method: "CASH",          ref: "RCPT-LOC-004",  at: d(2026,2,11) },
    { invoiceNum: "INV-LOC-005", amount: 95000,  method: "MOBILE_MONEY",  ref: "MM-789099901",  at: d(2026,2,20) },
    { invoiceNum: "INV-LOC-007", amount: 75000,  method: "CASH",          ref: "RCPT-LOC-007",  at: d(2026,3,12) },
    { invoiceNum: "INV-LOC-008", amount: 110000, method: "MOBILE_MONEY",  ref: "MM-789055511",  at: d(2026,3,24) },
    { invoiceNum: "INV-LOC-009", amount: 220000, method: "BANK_TRANSFER", ref: "BNK-2026-4521", at: d(2026,4,16) },
    { saleNum:    "SAL-LOC-001", amount: 45000,  method: "CASH",          ref: null,            at: d(2026,4,10) },
    { saleNum:    "SAL-LOC-002", amount: 120000, method: "CASH",          ref: null,            at: d(2026,4,15) },
    { saleNum:    "SAL-LOC-005", amount: 65000,  method: "BANK_TRANSFER", ref: "BNK-2026-4999", at: d(2026,5, 2) },
  ];
  for (const p of paymentDefs) {
    const invoiceId = p.invoiceNum ? createdInvoices[p.invoiceNum]?.id ?? null : null;
    const saleId    = p.saleNum    ? createdSales[p.saleNum]?.id    ?? null : null;
    if (!invoiceId && !saleId) continue;
    const ex = await prisma.payment.findFirst({ where: { orgId, amount: p.amount, method: p.method, ...(invoiceId ? { invoiceId } : {}), ...(saleId ? { saleId } : {}) } });
    if (!ex) await prisma.payment.create({
      data: { orgId, invoiceId, saleId, amount: p.amount, method: p.method, reference: p.ref ?? null, receivedAt: p.at },
    });
  }
  console.log("Seeded payments.");

  // ── Delivery Notes ────────────────────────────────────────────────────────
  const dnDefs = [
    { num: "DN-LOC-001", invoiceNum: "INV-LOC-001", deliveredBy: "Brian Kavuma",     receivedBy: "Aisha Namukasa",   method: "PICKUP",   at: d(2026,1,12) },
    { num: "DN-LOC-002", invoiceNum: "INV-LOC-002", deliveredBy: "Ops Staff",        receivedBy: "Brian Kavuma",     method: "DELIVERY", at: d(2026,1,20) },
    { num: "DN-LOC-003", saleNum:    "SAL-LOC-001", deliveredBy: "Front Desk Staff", receivedBy: "Aisha Namukasa",   method: "PICKUP",   at: d(2026,4,10) },
  ];
  for (const dn of dnDefs) {
    const ex = await prisma.deliveryNote.findUnique({ where: { deliveryNoteNumber: dn.num } });
    if (ex) continue;
    const invoiceId = dn.invoiceNum ? createdInvoices[dn.invoiceNum]?.id ?? null : null;
    const saleId    = dn.saleNum    ? createdSales[dn.saleNum]?.id    ?? null : null;
    if (!invoiceId && !saleId) continue;
    await prisma.deliveryNote.create({
      data: { orgId, deliveryNoteNumber: dn.num, invoiceId, saleId, deliveredByName: dn.deliveredBy, receivedByName: dn.receivedBy, deliveryMethod: dn.method, deliveredAt: dn.at },
    });
  }
  console.log("Seeded delivery notes.");

  // ── Outbound Messages ─────────────────────────────────────────────────────
  const msgDefs = [
    { channel: "WHATSAPP", type: "JOB_CREATED",        to: "0701100001", body: "Hi Aisha, your repair job LOC-001 has been created. We'll keep you updated.",                        status: "SENT",    at: daysAgo(14) },
    { channel: "WHATSAPP", type: "JOB_COMPLETED",       to: "0701100001", body: "Hi Aisha, your iPhone 14 repair is complete. Please visit us to collect it.",                        status: "SENT",    at: daysAgo(10) },
    { channel: "WHATSAPP", type: "JOB_STATUS_UPDATE",   to: "0701100002", body: "Hi Brian, your laptop repair is in progress. Estimated completion: 2 days.",                         status: "SENT",    at: daysAgo(3) },
    { channel: "EMAIL",    type: "JOB_CREATED",         to: "cynthia@corp.ug", body: "Your repair request LOC-003 has been received. Our team will diagnose within 24 hours.",         status: "FAILED",  at: daysAgo(2) },
    { channel: "WHATSAPP", type: "READY_FOR_PICKUP_NUDGE_1", to: "0701100009", body: "Hi Irene, friendly reminder: your Lenovo ThinkPad E14 is ready for pickup at our shop.",         status: "SENT",    at: daysAgo(1) },
    { channel: "EMAIL",    type: "ADMIN_TEST",           to: "admin@local.test", body: "This is a test notification from the system.",                                                  status: "SENT",    at: daysAgo(1) },
  ];
  for (const m of msgDefs) {
    const ex = await prisma.outboundMessage.findFirst({ where: { orgId: orgId, to: m.to, type: m.type } });
    if (!ex) await prisma.outboundMessage.create({
      data: { orgId: orgId, channel: m.channel, type: m.type, to: m.to, body: m.body, status: m.status, sentAt: m.status !== "PENDING" ? m.at : null },
    });
  }
  console.log("Seeded outbound messages.");

  // ── Communication Templates ───────────────────────────────────────────────
  const tplDefs = [
    { key: "job_created",        channel: "WHATSAPP", label: "Job Created",           body: "Hi {{customerName}}, your repair job {{jobNumber}} has been created. We will update you on progress." },
    { key: "job_completed",      channel: "WHATSAPP", label: "Job Completed",          body: "Hi {{customerName}}, great news! Your {{deviceName}} is repaired and ready for pickup." },
    { key: "awaiting_approval",  channel: "WHATSAPP", label: "Awaiting Your Approval", body: "Hi {{customerName}}, we have diagnosed your device. Repair cost: {{amount}}. Reply YES to approve." },
    { key: "job_created",        channel: "EMAIL",    label: "Job Created (Email)",    subject: "Your Repair Job {{jobNumber}} Has Been Received", body: "Dear {{customerName}},\n\nYour device has been received. Job reference: {{jobNumber}}.\n\nWe will contact you with updates." },
    { key: "ready_for_pickup",   channel: "WHATSAPP", label: "Ready for Pickup",       body: "Hi {{customerName}}, your {{deviceName}} is ready for collection. Bring your job receipt." },
  ];
  for (const t of tplDefs) {
    const ex = await prisma.communicationTemplate.findFirst({ where: { key: t.key, channel: t.channel, orgId } });
    if (!ex) await prisma.communicationTemplate.create({
      data: { orgId, key: t.key, channel: t.channel, label: t.label, body: t.body, subject: t.subject ?? null, isActive: true },
    });
  }
  console.log("Seeded communication templates.");

  // ── Sales Targets ─────────────────────────────────────────────────────────
  // Team-level targets (userId = null) + individual targets for OPS/Sales staff
  async function ensureSalesTarget(userId, period, targetRevenue, targetJobs) {
    // The unique constraint treats null userId specially; use findFirst for nulls
    const existing = userId
      ? await prisma.salesTarget.findFirst({ where: { orgId, userId, period } })
      : await prisma.salesTarget.findFirst({ where: { orgId, userId: null, period } });
    if (existing) return existing;
    return prisma.salesTarget.create({
      data: { orgId, userId: userId ?? null, period, targetRevenue, targetJobs },
    });
  }

  const targetPeriods = ["2026-01","2026-02","2026-03","2026-04","2026-05"];
  // Team targets (escalating month-on-month)
  const teamTargets = [900000, 950000, 1000000, 1050000, 1100000];
  for (let i = 0; i < targetPeriods.length; i++) {
    await ensureSalesTarget(null, targetPeriods[i], teamTargets[i], 20);
  }
  // Individual targets — OPS and Sales Manager
  const opsTargets  = [400000, 420000, 450000, 470000, 500000];
  const salesTargets= [300000, 320000, 340000, 360000, 380000];
  for (let i = 0; i < targetPeriods.length; i++) {
    await ensureSalesTarget(opsId,          targetPeriods[i], opsTargets[i],   10);
    await ensureSalesTarget(salesManagerId, targetPeriods[i], salesTargets[i],  8);
  }
  console.log("Seeded sales targets.");

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════");
  console.log(`  Local Org seed complete`);
  console.log(`  Org: ${org.name} (${org.slug})`);
  console.log(`  Password for all accounts: ${password}`);
  console.log("──────────────────────────────────────────");
  for (const u of userDefs) console.log(`  ${u.role.padEnd(22)} ${u.email}`);
  console.log("══════════════════════════════════════════\n");
}

await main()
  .catch((err) => {
    console.error("seed-local-users failed:", err);
    if (err.stack) console.error(err.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
