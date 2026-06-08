import Link from "next/link";
import { getCurrentUserRole } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/currency";
import { deletePurchaseOrderAction, setPurchaseOrderStatusAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",
  ORDERED: "border-sky-500/30 bg-sky-500/10 text-sky-700",
  PARTIAL: "border-amber-400/30 bg-amber-400/10 text-amber-700",
  RECEIVED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  CANCELLED: "border-red-500/20 bg-red-500/10 text-red-600",
};

function fmtDate(d: Date | null) {
  return d ? d.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" }) : "-";
}

function poNumber(po: { reference: string | null; id: string }) {
  return po.reference ?? `PO-${po.id.slice(-6).toUpperCase()}`;
}

export default async function PurchaseOrdersPage() {
  const { user } = await getCurrentUserRole();
  const orgId = user.orgId;
  if (!orgId) redirect("/login");
  if (!can.manageInventory(user)) redirect("/inventory");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [orders, pendingItems] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      include: {
        supplier: { select: { id: true, name: true } },
        items: { select: { qtyOrdered: true, qtyReceived: true, unitCost: true } },
        _count: { select: { goodsReceivedNotes: true, supplierBills: true, purchaseRequests: true } },
      },
    }),
    prisma.purchaseOrderItem.findMany({
      where: { po: { orgId, status: { in: ["DRAFT", "ORDERED", "PARTIAL"] } } },
      select: { qtyOrdered: true, unitCost: true },
    }).catch(() => [] as { qtyOrdered: number; unitCost: number }[]),
  ]);

  const openCount = orders.filter((po) => ["DRAFT", "ORDERED", "PARTIAL"].includes(po.status)).length;
  const receivingCount = orders.filter((po) => ["ORDERED", "PARTIAL"].includes(po.status)).length;
  const overdueCount = orders.filter((po) => ["ORDERED", "PARTIAL"].includes(po.status) && po.expectedAt && po.expectedAt < now).length;
  const thisMonthCount = orders.filter((po) => po.createdAt >= monthStart).length;
  const pendingValue = pendingItems.reduce((sum, item) => sum + item.qtyOrdered * item.unitCost, 0);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Procurement</p>
            <h1 className="text-base font-bold text-[var(--ink)]">Purchase Orders</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/inventory" className="rounded-md border border-[var(--line)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink)] hover:text-[var(--accent)]">Inventory</Link>
            <Link href="/api/procurement/export?type=purchase-orders" className="rounded-md border border-[var(--line)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink)] hover:text-[var(--accent)]">Export CSV</Link>
            <Link href="/inventory/purchase-orders/new" className="btn-premium rounded-md px-2.5 py-1.5 text-xs font-semibold">New PO</Link>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--line)] md:grid-cols-5 md:divide-y-0">
        {[
          ["Total", orders.length],
          ["Open", openCount],
          ["Receiving", receivingCount],
          ["Overdue", overdueCount],
          ["Pending", formatMoney(pendingValue)],
        ].map(([label, value]) => (
          <div key={label} className="px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">{label}</p>
            <p className="text-sm font-bold tabular-nums text-[var(--ink)]">{value}</p>
          </div>
        ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
        {orders.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm">
            <p className="text-[var(--ink-muted)]">No purchase orders yet.</p>
            <Link href="/inventory/purchase-orders/new" className="rounded-md border border-[var(--accent)]/35 bg-[var(--accent)]/10 px-2.5 py-1.5 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/15">
              Create PO
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-[var(--panel-strong)] text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">
                <tr>
                  <th className="px-3 py-2 text-left">PO</th>
                  <th className="px-3 py-2 text-left">Supplier</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Lines</th>
                  <th className="px-3 py-2 text-right">Received</th>
                  <th className="px-3 py-2 text-right">Value</th>
                  <th className="px-3 py-2 text-left">Ordered</th>
                  <th className="px-3 py-2 text-left">Expected</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {orders.map((po) => {
                  const orderedQty = po.items.reduce((sum, item) => sum + item.qtyOrdered, 0);
                  const receivedQty = po.items.reduce((sum, item) => sum + item.qtyReceived, 0);
                  const value = po.items.reduce((sum, item) => sum + item.qtyOrdered * item.unitCost, 0);
                  const isOverdue = ["ORDERED", "PARTIAL"].includes(po.status) && po.expectedAt && po.expectedAt < now;
                  const canDelete = po.status !== "RECEIVED" && receivedQty === 0 && po._count.goodsReceivedNotes === 0 && po._count.supplierBills === 0 && po._count.purchaseRequests === 0;
                  return (
                    <tr key={po.id} className="hover:bg-[var(--panel-strong)]/40">
                      <td className="px-3 py-2">
                        <Link href={`/inventory/purchase-orders/${po.id}`} className="font-mono font-bold text-[var(--ink)] hover:text-[var(--accent)]">{poNumber(po)}</Link>
                      </td>
                      <td className="px-3 py-2 font-medium text-[var(--ink)]">{po.supplier.name}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[po.status] ?? STATUS_STYLES.DRAFT}`}>{po.status}</span>
                        {isOverdue ? <span className="ml-1 rounded-full border border-red-500/25 bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-600">Late</span> : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--ink-muted)]">{po.items.length}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--ink-muted)]">{receivedQty}/{orderedQty}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--ink)]">{formatMoney(value)}</td>
                      <td className="px-3 py-2 text-[var(--ink-muted)]">{fmtDate(po.orderedAt)}</td>
                      <td className="px-3 py-2 text-[var(--ink-muted)]">{fmtDate(po.expectedAt)}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1.5">
                          {po.status === "DRAFT" ? (
                            <form action={setPurchaseOrderStatusAction}>
                              <input type="hidden" name="id" value={po.id} />
                              <input type="hidden" name="status" value="ORDERED" />
                              <button type="submit" className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-xs font-semibold text-sky-700">Issue</button>
                            </form>
                          ) : ["ORDERED", "PARTIAL"].includes(po.status) ? (
                            <Link href={`/inventory/purchase-orders/${po.id}#receive`} className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-700">Receive</Link>
                          ) : null}
                          <Link href={`/api/procurement/documents/purchase-order/${po.id}`} target="_blank" className="rounded-md border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--accent)]">PDF</Link>
                          <Link href={`/inventory/purchase-orders/${po.id}`} className="rounded-md border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--ink)] hover:text-[var(--accent)]">Open</Link>
                          {canDelete ? (
                            <form action={deletePurchaseOrderAction}>
                              <input type="hidden" name="id" value={po.id} />
                              <button type="submit" className="rounded-md border border-red-500/25 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-600">Delete</button>
                            </form>
                          ) : (
                            <span className="rounded-md border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--ink-muted)]">Locked</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-[var(--line)] bg-[var(--panel-strong)]">
                <tr>
                  <td colSpan={8} className="px-3 py-2 text-right text-xs font-semibold text-[var(--ink-muted)]">Raised this month: {thisMonthCount}</td>
                  <td className="px-3 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
