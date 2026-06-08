import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type ExportType = "purchase-requests" | "purchase-orders" | "goods-received" | "supplier-bills";

function csvEscape(value: unknown) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function csv(headers: string[], rows: unknown[][]) {
  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

function date(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function download(name: string, body: string) {
  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
    },
  });
}

export async function GET(request: NextRequest) {
  const { user, orgId } = await requireOrgSession();
  if (!can.manageInventory(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const type = request.nextUrl.searchParams.get("type") as ExportType | null;
  const exportedAt = new Date().toISOString();

  if (type === "purchase-requests") {
    const rows = await prisma.purchaseRequest.findMany({
      where: { orgId },
      include: { supplier: { select: { name: true } }, requestedBy: { select: { name: true, email: true } }, _count: { select: { items: true } } },
      orderBy: { createdAt: "desc" },
    });
    return download(
      `purchase-requests-${date(new Date())}.csv`,
      csv(
        ["exportedAt", "requestNumber", "status", "priority", "supplier", "neededBy", "requestedBy", "items", "createdAt", "reason"],
        rows.map((row) => [
          exportedAt,
          row.requestNumber,
          row.status,
          row.priority,
          row.supplier?.name ?? "",
          date(row.neededBy),
          row.requestedBy.name ?? row.requestedBy.email,
          row._count.items,
          date(row.createdAt),
          row.reason ?? "",
        ]),
      ),
    );
  }

  if (type === "purchase-orders") {
    const rows = await prisma.purchaseOrder.findMany({
      where: { orgId },
      include: { supplier: { select: { name: true } }, items: { select: { qtyOrdered: true, qtyReceived: true, unitCost: true } } },
      orderBy: { createdAt: "desc" },
    });
    return download(
      `purchase-orders-${date(new Date())}.csv`,
      csv(
        ["exportedAt", "reference", "status", "supplier", "orderedAt", "expectedAt", "receivedAt", "items", "orderedValue", "outstandingQty", "notes"],
        rows.map((row) => {
          const orderedValue = row.items.reduce((sum, item) => sum + item.qtyOrdered * item.unitCost, 0);
          const outstandingQty = row.items.reduce((sum, item) => sum + Math.max(0, item.qtyOrdered - item.qtyReceived), 0);
          return [
            exportedAt,
            row.reference ?? `PO-${row.id.slice(-6).toUpperCase()}`,
            row.status,
            row.supplier.name,
            date(row.orderedAt),
            date(row.expectedAt),
            date(row.receivedAt),
            row.items.length,
            orderedValue,
            outstandingQty,
            row.notes ?? "",
          ];
        }),
      ),
    );
  }

  if (type === "goods-received") {
    const rows = await prisma.goodsReceived.findMany({
      where: { orgId },
      include: {
        supplier: { select: { name: true } },
        po: { select: { id: true, reference: true } },
        location: { select: { name: true, code: true } },
        items: { select: { quantity: true, unitCost: true } },
      },
      orderBy: { receivedAt: "desc" },
    });
    return download(
      `goods-received-${date(new Date())}.csv`,
      csv(
        ["exportedAt", "grnNumber", "status", "supplier", "purchaseOrder", "location", "receivedAt", "items", "value", "note"],
        rows.map((row) => [
          exportedAt,
          row.grnNumber,
          row.status,
          row.supplier.name,
          row.po ? row.po.reference ?? `PO-${row.po.id.slice(-6).toUpperCase()}` : "",
          `${row.location.name}${row.location.code ? ` (${row.location.code})` : ""}`,
          date(row.receivedAt),
          row.items.length,
          row.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0),
          row.note ?? "",
        ]),
      ),
    );
  }

  if (type === "supplier-bills") {
    const rows = await prisma.supplierBill.findMany({
      where: { orgId },
      include: { supplier: { select: { name: true } }, po: { select: { id: true, reference: true } }, grn: { select: { grnNumber: true } } },
      orderBy: { issuedAt: "desc" },
    });
    return download(
      `supplier-bills-${date(new Date())}.csv`,
      csv(
        ["exportedAt", "billNumber", "supplierRef", "status", "supplier", "linkedPo", "linkedGrn", "issuedAt", "dueAt", "currency", "total", "paid", "balance"],
        rows.map((row) => [
          exportedAt,
          row.billNumber,
          row.supplierRef ?? "",
          row.status,
          row.supplier.name,
          row.po ? row.po.reference ?? `PO-${row.po.id.slice(-6).toUpperCase()}` : "",
          row.grn?.grnNumber ?? "",
          date(row.issuedAt),
          date(row.dueAt),
          row.currency,
          row.totalAmount,
          row.paidAmount,
          Math.max(0, row.totalAmount - row.paidAmount),
        ]),
      ),
    );
  }

  return NextResponse.json({ error: "Invalid export type" }, { status: 400 });
}
