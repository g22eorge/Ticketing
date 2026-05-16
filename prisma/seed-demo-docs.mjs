/**
 * prisma/seed-demo-docs.mjs
 *
 * Seeds demo data for Local Org so all document pages are populated:
 *   - Invoices (ISSUED + PAID)
 *   - Payments / Receipts (CASH, MOBILE_MONEY, CARD)
 *   - Delivery Notes
 *   - POS Sales with items and payments
 *   - Parts inventory
 *
 * Run:  node prisma/seed-demo-docs.mjs
 */

import Database from "better-sqlite3";
import { randomBytes } from "crypto";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, "../prisma/dev.db");
const db = new Database(DB_PATH);

function cuid() {
  return "c" + randomBytes(11).toString("hex");
}

function now() {
  return new Date().toISOString();
}

function daysAgo(n) {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

// ── IDs for Local Org ─────────────────────────────────────────────────────────
const ORG_ID  = "cmoy4xrgv00002lwnhahpyyb3";
const ADMIN   = "cmoy4xrh400042lwnpc2gn2it";
const OPS     = "cmoy4xrjo00082lwnrlcu6zs9";

// ── Existing jobs ─────────────────────────────────────────────────────────────
const JOBS = {
  "LO-2025-0011": "cmp5yh2cf000l2lvffupd9w0r",   // COMPLETED, IN_HOUSE, Grace Atim
  "LO-2025-0012": "cmp5yh2ch000n2lvf5trhkdej",   // COMPLETED, IN_HOUSE, Robert Tumwine
  "LO-2025-0013": "cmp5yh2cj000p2lvfi95dpcbr",   // CLOSED, Mercy Acan
};

// ── Clients ───────────────────────────────────────────────────────────────────
const CLIENTS = {};
const clientRows = db.prepare("SELECT id, fullName FROM Client WHERE orgId = ?").all(ORG_ID);
for (const c of clientRows) CLIENTS[c.fullName] = c.id;

function ensureClient(fullName, phone, email) {
  if (CLIENTS[fullName]) return CLIENTS[fullName];
  const existing = db.prepare("SELECT id FROM Client WHERE phone = ? AND orgId = ?").get(phone, ORG_ID);
  if (existing) { CLIENTS[fullName] = existing.id; return existing.id; }
  const id = cuid();
  db.prepare("INSERT INTO Client (id, orgId, fullName, phone, email, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?)")
    .run(id, ORG_ID, fullName, phone, email ?? null, now(), now());
  CLIENTS[fullName] = id;
  return id;
}

// ── Step 1: Set finalCost on completed jobs ────────────────────────────────────
console.log("Setting finalCost on completed jobs...");
const billUpdates = [
  { jobNumber: "LO-2025-0011", finalCost: 180000, costEstimate: 0 },
  { jobNumber: "LO-2025-0012", finalCost: 250000, costEstimate: 0 },
  { jobNumber: "LO-2025-0013", finalCost: 95000,  costEstimate: 0 },
];
for (const u of billUpdates) {
  db.prepare("UPDATE Job SET finalCost = ?, updatedAt = ? WHERE jobNumber = ? AND orgId = ?")
    .run(u.finalCost, now(), u.jobNumber, ORG_ID);
}

// ── Step 2: Create Invoices for completed/closed jobs ─────────────────────────
console.log("Creating invoices...");

function upsertInvoice(jobId, invoiceNumber, totalAmount, status, issuedAt, paidAmount, paidAt) {
  const existing = db.prepare("SELECT id FROM Invoice WHERE jobId = ?").get(jobId);
  if (existing) return existing.id;
  const id = cuid();
  db.prepare(`
    INSERT INTO Invoice (id, orgId, jobId, invoiceNumber, currency, status, issuedAt, totalAmount, paidAmount, paidAt, createdAt, updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(id, ORG_ID, jobId, invoiceNumber, "UGX", status, issuedAt, totalAmount, paidAmount, paidAt ?? null, now(), now());
  db.prepare("UPDATE Job SET invoiceNumber = ?, invoiceIssuedAt = ?, updatedAt = ? WHERE id = ?")
    .run(invoiceNumber, issuedAt, now(), jobId);
  return id;
}

const inv1Id = upsertInvoice(JOBS["LO-2025-0011"], "INV-2025-0001", 180000, "PAID",   daysAgo(12), 180000, daysAgo(11));
const inv2Id = upsertInvoice(JOBS["LO-2025-0012"], "INV-2025-0002", 250000, "ISSUED", daysAgo(8),  0,      null);
const inv3Id = upsertInvoice(JOBS["LO-2025-0013"], "INV-2025-0003", 95000,  "PAID",   daysAgo(20), 95000,  daysAgo(19));

// ── Step 3: Create Payments (Receipts) ────────────────────────────────────────
console.log("Creating payments...");

function upsertPayment(invoiceId, saleId, amount, method, reference, receivedAt) {
  const existing = invoiceId
    ? db.prepare("SELECT id FROM Payment WHERE invoiceId = ? AND orgId = ?").get(invoiceId, ORG_ID)
    : null;
  if (existing) return existing.id;
  const id = cuid();
  db.prepare(`
    INSERT INTO Payment (id, orgId, invoiceId, saleId, currency, amount, method, reference, receivedAt, createdById, createdAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(id, ORG_ID, invoiceId ?? null, saleId ?? null, "UGX", amount, method, reference ?? null, receivedAt, ADMIN, now());
  return id;
}

const pay1Id = upsertPayment(inv1Id, null, 180000, "MOBILE_MONEY", "MTN-884723",    daysAgo(11));
const pay3Id = upsertPayment(inv3Id, null, 95000,  "CASH",         "CASH-REF-0019", daysAgo(19));

// ── Step 4: Delivery Notes ────────────────────────────────────────────────────
console.log("Creating delivery notes...");

function upsertDeliveryNote(invoiceId, number, deliveredByName, receivedByName, method, deliveredAt) {
  const existing = db.prepare("SELECT id FROM DeliveryNote WHERE deliveryNoteNumber = ?").get(number);
  if (existing) return existing.id;
  const id = cuid();
  db.prepare(`
    INSERT INTO DeliveryNote (id, orgId, invoiceId, deliveryNoteNumber, deliveredAt, deliveryMethod, deliveredByName, receivedByName, createdById, createdAt)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(id, ORG_ID, invoiceId, number, deliveredAt, method, deliveredByName, receivedByName, ADMIN, now());
  return id;
}

upsertDeliveryNote(inv1Id, "DN-2025-0001", "Admin",    "Grace Atim",   "IN_STORE",  daysAgo(10));
upsertDeliveryNote(inv3Id, "DN-2025-0002", "Ops User", "Mercy Acan",   "COURIER",   daysAgo(18));

// ── Step 5: Parts ─────────────────────────────────────────────────────────────
console.log("Creating parts inventory...");

const PARTS = [
  { sku: "SCRN-IP13-BLK", name: "iPhone 13 Screen (Black)",     unitCost: 85000,  qtyOnHand: 4,  reorderLevel: 2 },
  { sku: "BATT-SS-A53",   name: "Samsung A53 Battery",          unitCost: 35000,  qtyOnHand: 7,  reorderLevel: 3 },
  { sku: "CHRG-USB-C-65", name: "USB-C Charging Port (65W)",    unitCost: 18000,  qtyOnHand: 12, reorderLevel: 5 },
  { sku: "SCRN-SS-A32",   name: "Samsung A32 Screen (OLED)",    unitCost: 92000,  qtyOnHand: 2,  reorderLevel: 2 },
  { sku: "BATT-IP14",     name: "iPhone 14 Battery",            unitCost: 75000,  qtyOnHand: 5,  reorderLevel: 2 },
  { sku: "CAM-SS-S21",    name: "Samsung S21 Camera Module",    unitCost: 120000, qtyOnHand: 1,  reorderLevel: 1 },
  { sku: "SPEAK-IP12",    name: "iPhone 12 Earpiece Speaker",   unitCost: 22000,  qtyOnHand: 9,  reorderLevel: 3 },
  { sku: "HEAT-PASTE-5G", name: "Thermal Paste 5g (Laptop)",    unitCost: 8000,   qtyOnHand: 20, reorderLevel: 5 },
  { sku: "KEYB-HP-G5",    name: "HP ProBook Keyboard (Gen 5)",  unitCost: 55000,  qtyOnHand: 3,  reorderLevel: 2 },
  { sku: "RAM-DDR4-8GB",  name: "DDR4 8GB RAM (2666MHz)",       unitCost: 68000,  qtyOnHand: 6,  reorderLevel: 2 },
];

const partIds = {};
for (const p of PARTS) {
  const existing = db.prepare("SELECT id FROM Part WHERE sku = ? AND orgId = ?").get(p.sku, ORG_ID);
  if (existing) {
    partIds[p.sku] = existing.id;
    continue;
  }
  const id = cuid();
  db.prepare(`
    INSERT INTO Part (id, orgId, sku, name, unitCost, qtyOnHand, reorderLevel, isActive, createdAt, updatedAt)
    VALUES (?,?,?,?,?,?,?,1,?,?)
  `).run(id, ORG_ID, p.sku, p.name, p.unitCost, p.qtyOnHand, p.reorderLevel, now(), now());
  partIds[p.sku] = id;
}

// ── Step 6: POS Sales ─────────────────────────────────────────────────────────
console.log("Creating POS sales...");

const POS_CLIENTS = [
  ensureClient("David Ochieng",  "+256701112233", "david@email.com"),
  ensureClient("Susan Nalwoga",  "+256752223344", null),
  ensureClient("Moses Kibuuka",  "+256703334455", "moses.k@gmail.com"),
  ensureClient("Fatuma Nalule",  "+256774445566", null),
  ensureClient("James Mwangi",   "+254710556677", "james@email.com"),
];

function createSale({ saleNumber, clientId, status, items, paymentAmount, paymentMethod, paymentRef, createdAt, paidAt }) {
  const existing = db.prepare("SELECT id FROM Sale WHERE saleNumber = ? AND orgId = ?").get(saleNumber, ORG_ID);
  if (existing) return existing.id;

  const saleId = cuid();
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  const vatAmount = Math.round(subtotal * 0.18);
  const totalAmount = subtotal + vatAmount;
  const paidAmt = paymentAmount ?? 0;
  const saleStatus = paidAmt >= totalAmount ? "PAID" : (paidAmt > 0 ? "OPEN" : "OPEN");

  db.prepare(`
    INSERT INTO Sale (id, orgId, clientId, saleNumber, status, billingMode, currency,
      subtotal, discountAmount, vatAmount, totalAmount, paidAmount, paidAt,
      createdById, createdAt, updatedAt)
    VALUES (?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,?)
  `).run(saleId, ORG_ID, clientId ?? null, saleNumber, paidAmt >= totalAmount ? "PAID" : "OPEN",
    "CASH", "UGX", subtotal, vatAmount, totalAmount,
    paidAmt, paidAmt >= totalAmount ? (paidAt ?? now()) : null,
    ADMIN, createdAt ?? now(), now());

  for (const item of items) {
    const itemId = cuid();
    const lineTotal = item.qty * item.price;
    db.prepare(`
      INSERT INTO SaleItem (id, saleId, partId, description, quantity, unitPrice, lineTotal, createdAt)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(itemId, saleId, item.partId ?? null, item.desc, item.qty, item.price, lineTotal, now());
  }

  if (paymentAmount && paymentAmount > 0) {
    const payId = cuid();
    db.prepare(`
      INSERT INTO Payment (id, orgId, saleId, currency, amount, method, reference, receivedAt, createdById, createdAt)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(payId, ORG_ID, saleId, "UGX", paymentAmount, paymentMethod ?? "CASH",
      paymentRef ?? null, paidAt ?? now(), ADMIN, now());
  }

  return saleId;
}

const sale1 = createSale({
  saleNumber: "S-202505-0001",
  clientId: POS_CLIENTS[0],
  items: [
    { desc: "Samsung A53 Battery Replacement", qty: 1, price: 75000, partId: partIds["BATT-SS-A53"] },
    { desc: "Labour – battery swap",            qty: 1, price: 25000 },
  ],
  paymentAmount: 118000, paymentMethod: "CASH", paymentRef: "CASH-001",
  createdAt: daysAgo(14), paidAt: daysAgo(14),
});

const sale2 = createSale({
  saleNumber: "S-202505-0002",
  clientId: POS_CLIENTS[1],
  items: [
    { desc: "USB-C Charging Port (65W)",  qty: 1, price: 18000, partId: partIds["CHRG-USB-C-65"] },
    { desc: "USB-C Replacement Labour",   qty: 1, price: 30000 },
  ],
  paymentAmount: 56640, paymentMethod: "MOBILE_MONEY", paymentRef: "MTN-993021",
  createdAt: daysAgo(10), paidAt: daysAgo(10),
});

const sale3 = createSale({
  saleNumber: "S-202505-0003",
  clientId: POS_CLIENTS[2],
  items: [
    { desc: "DDR4 8GB RAM Upgrade",          qty: 1, price: 68000, partId: partIds["RAM-DDR4-8GB"] },
    { desc: "Laptop RAM installation",        qty: 1, price: 20000 },
    { desc: "Thermal paste application",      qty: 1, price: 15000, partId: partIds["HEAT-PASTE-5G"] },
  ],
  paymentAmount: 121540, paymentMethod: "CARD", paymentRef: "VISA-44821",
  createdAt: daysAgo(7), paidAt: daysAgo(7),
});

// Partial payment — still outstanding
const sale4 = createSale({
  saleNumber: "S-202505-0004",
  clientId: POS_CLIENTS[3],
  items: [
    { desc: "iPhone 13 Screen Replacement", qty: 1, price: 180000, partId: partIds["SCRN-IP13-BLK"] },
    { desc: "Screen replacement labour",    qty: 1, price: 40000 },
  ],
  paymentAmount: 100000, paymentMethod: "MOBILE_MONEY", paymentRef: "AIRTEL-771023",
  createdAt: daysAgo(3), paidAt: null,
});

// Open sale — no payment yet
const sale5 = createSale({
  saleNumber: "S-202505-0005",
  clientId: POS_CLIENTS[4],
  items: [
    { desc: "HP ProBook Keyboard",   qty: 1, price: 55000, partId: partIds["KEYB-HP-G5"] },
    { desc: "Keyboard installation", qty: 1, price: 15000 },
  ],
  paymentAmount: 0, paymentMethod: null, paymentRef: null,
  createdAt: daysAgo(1), paidAt: null,
});

// ── Step 7: Additional repair-linked payments (for receipts page variety) ─────
console.log("Creating additional repair receipts...");

// Partial advance on invoice 2 (LO-2025-0012, still ISSUED/outstanding)
const pay2aId = (() => {
  const existing = db.prepare(
    "SELECT id FROM Payment WHERE invoiceId = ? AND method = 'MOBILE_MONEY' AND orgId = ?"
  ).get(inv2Id, ORG_ID);
  if (existing) return existing.id;
  const id = cuid();
  db.prepare(`
    INSERT INTO Payment (id, orgId, invoiceId, currency, amount, method, reference, receivedAt, createdById, createdAt)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(id, ORG_ID, inv2Id, "UGX", 100000, "MOBILE_MONEY", "MTN-558812", daysAgo(5), OPS, now());
  db.prepare("UPDATE Invoice SET paidAmount = 100000, updatedAt = ? WHERE id = ?").run(now(), inv2Id);
  return id;
})();

// ── Done ──────────────────────────────────────────────────────────────────────
console.log("\n✓ Seed complete. Summary:");
console.log(`  Invoices:       ${db.prepare("SELECT COUNT(*) as c FROM Invoice WHERE orgId = ?").get(ORG_ID).c}`);
console.log(`  Payments:       ${db.prepare("SELECT COUNT(*) as c FROM Payment WHERE orgId = ?").get(ORG_ID).c}`);
console.log(`  Delivery Notes: ${db.prepare("SELECT COUNT(*) as c FROM DeliveryNote WHERE orgId = ?").get(ORG_ID).c}`);
console.log(`  Sales:          ${db.prepare("SELECT COUNT(*) as c FROM Sale WHERE orgId = ?").get(ORG_ID).c}`);
console.log(`  Parts:          ${db.prepare("SELECT COUNT(*) as c FROM Part WHERE orgId = ?").get(ORG_ID).c}`);
console.log(`  Jobs:           ${db.prepare("SELECT COUNT(*) as c FROM Job WHERE orgId = ?").get(ORG_ID).c}`);

db.close();
