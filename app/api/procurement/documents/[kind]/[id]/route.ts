import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type Kind = "purchase-request" | "purchase-order" | "goods-received" | "supplier-bill";

function esc(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function money(value: number, currency = "UGX") {
  return `${currency} ${value.toLocaleString("en-UG", { maximumFractionDigits: 2 })}`;
}

function fmt(date: Date | null | undefined) {
  return date ? date.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" }) : "-";
}

function lineRows(rows: Array<{ description: string; quantity: number; unitCost: number | null; total: number }>, currency = "UGX") {
  return rows.map((row) => `
    <tr>
      <td>${esc(row.description)}</td>
      <td class="num">${row.quantity}</td>
      <td class="num">${row.unitCost == null ? "-" : esc(money(row.unitCost, currency))}</td>
      <td class="num">${esc(money(row.total, currency))}</td>
    </tr>
  `).join("");
}

function documentShell(input: {
  title: string;
  number: string;
  status: string;
  subtitle: string;
  meta: Array<[string, string]>;
  rows: Array<{ description: string; quantity: number; unitCost: number | null; total: number }>;
  total: number;
  currency?: string;
  notes?: string | null;
}) {
  const currency = input.currency ?? "UGX";
  const generatedAt = new Date().toLocaleString("en-UG", { dateStyle: "medium", timeStyle: "short" });
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(input.title)} ${esc(input.number)}</title>
  <style>
    :root { color-scheme: light; --ink:#161616; --muted:#666; --line:#d9d9d9; --soft:#f7f7f4; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #ececea; color: var(--ink); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .sheet { max-width: 900px; margin: 24px auto; background: white; min-height: 100vh; padding: 42px; box-shadow: 0 24px 80px rgba(0,0,0,.12); }
    .toolbar { max-width: 900px; margin: 18px auto 0; display: flex; justify-content: flex-end; gap: 8px; }
    button { border: 1px solid #111; background: #111; color: white; border-radius: 8px; padding: 9px 14px; font-weight: 700; cursor: pointer; }
    .ghost { background: white; color: #111; }
    header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #111; padding-bottom: 18px; }
    .brand { font-size: 15px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
    .doc-title { margin-top: 28px; display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
    h1 { margin: 0; font-size: 30px; line-height: 1; letter-spacing: .02em; text-transform: uppercase; }
    .number { margin-top: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 800; }
    .status { border: 1px solid var(--line); border-radius: 999px; padding: 7px 12px; font-size: 12px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
    .subtitle { margin-top: 8px; color: var(--muted); font-size: 13px; }
    .meta { margin-top: 24px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--line); }
    .meta div { padding: 12px; border-right: 1px solid var(--line); }
    .meta div:nth-child(4n) { border-right: 0; }
    .label { color: var(--muted); font-size: 10px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; }
    .value { margin-top: 5px; font-size: 13px; font-weight: 750; }
    table { width: 100%; border-collapse: collapse; margin-top: 28px; font-size: 13px; }
    th { background: var(--soft); color: var(--muted); font-size: 10px; letter-spacing: .12em; text-transform: uppercase; text-align: left; }
    th, td { border-bottom: 1px solid var(--line); padding: 11px 10px; vertical-align: top; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    tfoot td { font-weight: 900; border-bottom: 0; }
    .notes { margin-top: 26px; padding: 16px; border: 1px solid var(--line); background: var(--soft); white-space: pre-wrap; font-size: 13px; }
    footer { margin-top: 48px; display: flex; justify-content: space-between; color: var(--muted); font-size: 11px; }
    @media print {
      body { background: white; }
      .toolbar { display: none; }
      .sheet { margin: 0; box-shadow: none; max-width: none; min-height: auto; }
    }
  </style>
</head>
<body>
  <div class="toolbar"><button class="ghost" onclick="history.back()">Back</button><button onclick="window.print()">Print / Save PDF</button></div>
  <main class="sheet">
    <header>
      <div>
        <div class="brand">Service Desk</div>
        <div class="subtitle">Procurement document export</div>
      </div>
      <div class="subtitle">Generated ${esc(generatedAt)}</div>
    </header>
    <section class="doc-title">
      <div>
        <h1>${esc(input.title)}</h1>
        <div class="number">${esc(input.number)}</div>
        <div class="subtitle">${esc(input.subtitle)}</div>
      </div>
      <div class="status">${esc(input.status)}</div>
    </section>
    <section class="meta">
      ${input.meta.map(([label, value]) => `<div><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div>`).join("")}
    </section>
    <table>
      <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit Cost</th><th class="num">Total</th></tr></thead>
      <tbody>${lineRows(input.rows, currency)}</tbody>
      <tfoot><tr><td colspan="3" class="num">Document Total</td><td class="num">${esc(money(input.total, currency))}</td></tr></tfoot>
    </table>
    ${input.notes ? `<section class="notes"><div class="label">Notes</div><div>${esc(input.notes)}</div></section>` : ""}
    <footer><span>Prepared by Service Desk</span><span>${esc(input.number)}</span></footer>
  </main>
</body>
</html>`;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { user, orgId } = await requireOrgSession();
  if (!can.manageInventory(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { kind, id } = await params;
  const documentKind = kind as Kind;

  if (documentKind === "purchase-request") {
    const request = await prisma.purchaseRequest.findFirst({
      where: { id, orgId },
      include: { supplier: { select: { name: true } }, requestedBy: { select: { name: true, email: true } }, items: true },
    });
    if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const rows = request.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitCost: item.estimatedUnitCost ?? null,
      total: item.quantity * (item.estimatedUnitCost ?? 0),
    }));
    return new NextResponse(documentShell({
      title: "Purchase Request",
      number: request.requestNumber,
      status: request.status,
      subtitle: `Requested by ${request.requestedBy.name ?? request.requestedBy.email}`,
      meta: [["Supplier", request.supplier?.name ?? "No preference"], ["Priority", request.priority], ["Needed by", fmt(request.neededBy)], ["Created", fmt(request.createdAt)]],
      rows,
      total: rows.reduce((sum, row) => sum + row.total, 0),
      notes: [request.reason, request.notes, request.reviewNote].filter(Boolean).join("\n\n") || null,
    }), { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  if (documentKind === "purchase-order") {
    const order = await prisma.purchaseOrder.findFirst({
      where: { id, orgId },
      include: { supplier: { select: { name: true } }, items: true },
    });
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const rows = order.items.map((item) => ({
      description: item.description,
      quantity: item.qtyOrdered,
      unitCost: item.unitCost,
      total: item.qtyOrdered * item.unitCost,
    }));
    return new NextResponse(documentShell({
      title: "Purchase Order",
      number: order.reference ?? `PO-${order.id.slice(-6).toUpperCase()}`,
      status: order.status,
      subtitle: `Supplier: ${order.supplier.name}`,
      meta: [["Supplier", order.supplier.name], ["Ordered", fmt(order.orderedAt)], ["Expected", fmt(order.expectedAt)], ["Received", fmt(order.receivedAt)]],
      rows,
      total: rows.reduce((sum, row) => sum + row.total, 0),
      notes: order.notes,
    }), { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  if (documentKind === "goods-received") {
    const grn = await prisma.goodsReceived.findFirst({
      where: { id, orgId },
      include: { supplier: { select: { name: true } }, po: { select: { id: true, reference: true } }, location: { select: { name: true, code: true } }, items: true },
    });
    if (!grn) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const rows = grn.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitCost: item.unitCost,
      total: item.quantity * item.unitCost,
    }));
    return new NextResponse(documentShell({
      title: "Goods Received Note",
      number: grn.grnNumber,
      status: grn.status,
      subtitle: `Supplier: ${grn.supplier.name}`,
      meta: [["Supplier", grn.supplier.name], ["PO", grn.po ? grn.po.reference ?? `PO-${grn.po.id.slice(-6).toUpperCase()}` : "-"], ["Location", `${grn.location.name}${grn.location.code ? ` (${grn.location.code})` : ""}`], ["Received", fmt(grn.receivedAt)]],
      rows,
      total: rows.reduce((sum, row) => sum + row.total, 0),
      notes: grn.note,
    }), { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  if (documentKind === "supplier-bill") {
    const bill = await prisma.supplierBill.findFirst({
      where: { id, orgId },
      include: { supplier: { select: { name: true } }, po: { select: { id: true, reference: true } }, grn: { select: { grnNumber: true } }, items: true },
    });
    if (!bill) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const rows = bill.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitCost: item.unitCost,
      total: item.lineTotal,
    }));
    return new NextResponse(documentShell({
      title: "Supplier Bill",
      number: bill.billNumber,
      status: bill.status,
      subtitle: `Supplier: ${bill.supplier.name}`,
      meta: [["Supplier", bill.supplier.name], ["Supplier ref", bill.supplierRef ?? "-"], ["Issued", fmt(bill.issuedAt)], ["Due", fmt(bill.dueAt)]],
      rows,
      total: bill.totalAmount,
      currency: bill.currency,
      notes: bill.notes,
    }), { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  return NextResponse.json({ error: "Invalid document kind" }, { status: 400 });
}
