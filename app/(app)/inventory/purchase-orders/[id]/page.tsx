import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { ReceiveStockForm } from "./ReceiveStockForm";
import { POMetaForm } from "./POMetaForm";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, string> = {
  DRAFT:     "border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",
  ORDERED:   "border border-blue-400/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  PARTIAL:   "border border-amber-400/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  RECEIVED:  "border border-green-400/30 bg-green-500/10 text-green-700 dark:text-green-400",
  CANCELLED: "border border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-400",
};

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, orgId } = await requireOrgSession();
  if (!can.manageUsers(user)) redirect("/inventory");

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, name: true } },
      goodsReceivedNotes: {
        include: {
          location: { select: { name: true, code: true } },
          items: { select: { id: true, quantity: true, unitCost: true } },
        },
        orderBy: { receivedAt: "desc" },
      },
      items: {
        include: { part: { select: { id: true, name: true, sku: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!po || po.orgId !== orgId) notFound();

  const fmt = (d: Date | null) =>
    d ? d.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" }) : "—";

  const totalOrdered = po.items.reduce((s, i) => s + i.qtyOrdered * i.unitCost, 0);
  const canReceive = ["ORDERED", "PARTIAL"].includes(po.status);
  const locations = await prisma.stockLocation.findMany({
    where: { orgId, isActive: true },
    select: { id: true, name: true, code: true },
    orderBy: [{ name: "asc" }],
  });

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Inventory · Purchase Order</p>
          <p className="mt-0.5 font-mono text-[13px] font-bold text-[var(--ink)]">
            {po.reference ?? `PO-${po.id.slice(-6).toUpperCase()}`}
          </p>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
            Supplier:{" "}
            <Link href={`/inventory/suppliers/${po.supplier.id}`} className="text-[var(--gold)] hover:underline">
              {po.supplier.name}
            </Link>
          </p>
        </div>
        <span className={`mt-1 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLORS[po.status] ?? ""}`}>
          {po.status}
        </span>
      </div>

      {/* Meta info */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Ordered", value: fmt(po.orderedAt) },
          { label: "Expected", value: fmt(po.expectedAt) },
          { label: "Received", value: fmt(po.receivedAt) },
          { label: "Created", value: fmt(po.createdAt) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">{label}</p>
            <p className="mt-0.5 text-sm font-semibold text-[var(--ink)]">{value}</p>
          </div>
        ))}
      </div>

      {/* Edit meta */}
      {po.status !== "RECEIVED" && po.status !== "CANCELLED" && (
        <POMetaForm po={{ id: po.id, reference: po.reference, orderedAt: po.orderedAt, expectedAt: po.expectedAt, notes: po.notes, status: po.status }} />
      )}

      {/* Items table */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--line)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
            Line Items ({po.items.length})
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                <th className="px-4 py-2 text-left">Description</th>
                <th className="px-4 py-2 text-left hidden sm:table-cell">Part</th>
                <th className="px-4 py-2 text-right">Ordered</th>
                <th className="px-4 py-2 text-right">Received</th>
                <th className="px-4 py-2 text-right">Unit Cost</th>
                <th className="px-4 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {po.items.map((item) => (
                <tr key={item.id} className={item.qtyReceived >= item.qtyOrdered ? "bg-green-50/40" : ""}>
                  <td className="px-4 py-2 text-[var(--ink)]">{item.description}</td>
                  <td className="px-4 py-2 text-xs text-[var(--ink-muted)] hidden sm:table-cell font-mono">
                    {item.part ? `${item.part.sku}` : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-[var(--ink-muted)]">{item.qtyOrdered}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    <span className={item.qtyReceived >= item.qtyOrdered ? "text-green-600 font-semibold" : "text-amber-600"}>
                      {item.qtyReceived}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-[var(--ink-muted)]">
                    {item.unitCost.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-[var(--ink)]">
                    {(item.qtyOrdered * item.unitCost).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--line)] bg-[var(--gold)]/5">
                <td colSpan={5} className="px-4 py-2 text-right text-xs font-semibold text-[var(--ink-muted)]">Total Order Value</td>
                <td className="px-4 py-2 text-right text-sm font-bold text-[var(--ink)] tabular-nums">
                  {totalOrdered.toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Notes */}
      {po.notes && (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)] mb-1">Notes</p>
          <p className="text-sm text-[var(--ink)] whitespace-pre-wrap">{po.notes}</p>
        </div>
      )}

      {po.goodsReceivedNotes.length > 0 && (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--line)] flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Goods Received</p>
            <Link href="/inventory/goods-received" className="text-xs font-semibold text-[var(--gold)] hover:underline">
              View all
            </Link>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {po.goodsReceivedNotes.map((grn) => {
              const total = grn.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
              return (
                <Link key={grn.id} href={`/inventory/goods-received/${grn.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-[var(--bg)]">
                  <div>
                    <p className="font-semibold text-[var(--ink)]">{grn.grnNumber}</p>
                    <p className="text-xs text-[var(--ink-muted)]">
                      {fmt(grn.receivedAt)} · {grn.location.name}{grn.location.code ? ` (${grn.location.code})` : ""}
                    </p>
                  </div>
                  <p className="font-semibold tabular-nums text-[var(--ink)]">{total.toLocaleString()}</p>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Receive stock */}
      {canReceive && locations.length > 0 && (
        <ReceiveStockForm
          poId={po.id}
          locations={locations}
          items={po.items.map((i) => ({
            id: i.id,
            description: i.description,
            qtyOrdered: i.qtyOrdered,
            qtyReceived: i.qtyReceived,
          }))}
        />
      )}
      {canReceive && locations.length === 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-700">
          Create an active stock location before receiving this purchase order.
        </div>
      )}
    </div>
  );
}
