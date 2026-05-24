// @ts-nocheck
import Link from "next/link";
import { getCurrentUserRole } from "@/lib/session";
import { redirect } from "next/navigation";
import { orgDb, prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/currency";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, string> = {
  DRAFT:     "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",
  ORDERED:   "border-sky-500/30 bg-sky-500/15 text-sky-700",
  PARTIAL:   "border-amber-400/30 bg-amber-400/15 text-amber-700",
  RECEIVED:  "border-emerald-500/30 bg-emerald-500/15 text-emerald-700",
  CANCELLED: "border-red-500/20 bg-red-500/10 text-red-600",
};

export default async function PurchaseOrdersPage() {
  const { user } = await getCurrentUserRole();
  const db = orgDb(user.orgId);
  if (!can.manageUsers(user)) redirect("/inventory");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [orders, pendingCount, thisMonthCount, pendingItems] = await Promise.all([
    db.purchaseOrder.findMany({
      where: {},
      orderBy: { createdAt: "desc" },
      include: {
        supplier: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
    db.purchaseOrder.count({ where: { status: { in: ["DRAFT", "ORDERED", "PARTIAL"] } } }).catch(() => 0),
    db.purchaseOrder.count({ where: { createdAt: { gte: monthStart } } }).catch(() => 0),
    prisma.purchaseOrderItem.findMany({
      where: { po: { status: { in: ["DRAFT", "ORDERED", "PARTIAL"] } } },
      select: { qtyOrdered: true, unitCost: true },
    }).catch(() => [] as { qtyOrdered: number; unitCost: number }[]),
  ]);

  const pendingValue = pendingItems.reduce((sum, item) => sum + item.qtyOrdered * item.unitCost, 0);

  const fmt = (d: Date | null) =>
    d ? d.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" }) : "—";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="panel-shadow flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
        <p className="text-[13px] font-bold text-[var(--ink)]">
          Purchase Orders · <span className="font-normal text-[var(--ink-muted)]">{orders.length}</span>
        </p>
        <div className="flex items-center gap-2">
          <Link href="/inventory" className="inline-flex items-center rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">
            ← Inventory
          </Link>
          <Link href="/inventory/purchase-orders/new" className="btn-premium rounded-lg px-3 py-1.5 text-[12px]">
            New PO
          </Link>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Total Orders</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{orders.length}</p>
          <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">all time</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Pending</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-amber-600">{pendingCount}</p>
          <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">draft, ordered, partial</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">This Month</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{thisMonthCount}</p>
          <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">raised this month</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Total Value Pending</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{formatMoney(pendingValue)}</p>
          <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">open order value</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
        {orders.length === 0 ? (
          <div className="py-16 text-center text-sm text-[var(--ink-muted)]">
            No purchase orders yet. Create one to start ordering stock.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[var(--panel-strong)] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              <tr>
                <th className="px-4 py-2.5 text-left">Reference</th>
                <th className="px-4 py-2.5 text-left">Supplier</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="hidden px-4 py-2.5 text-left sm:table-cell">Ordered</th>
                <th className="hidden px-4 py-2.5 text-left md:table-cell">Expected</th>
                <th className="px-4 py-2.5 text-center">Items</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {orders.map((po) => (
                <tr key={po.id} className="border-t border-[var(--line)] align-middle hover:bg-[var(--panel-strong)]/40">
                  <td className="px-4 py-3">
                    <p className="mono text-sm font-bold text-[var(--ink)]">{po.reference ?? po.id.slice(-6).toUpperCase()}</p>
                  </td>
                  <td className="px-4 py-3 font-medium text-[var(--ink)]">{po.supplier.name}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_COLORS[po.status] ?? "border-[var(--line)] text-[var(--ink-muted)]"}`}>
                      {po.status}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-[var(--ink-muted)] sm:table-cell">{fmt(po.orderedAt)}</td>
                  <td className="hidden px-4 py-3 text-[var(--ink-muted)] md:table-cell">{fmt(po.expectedAt)}</td>
                  <td className="px-4 py-3 text-center text-[var(--ink-muted)]">{po._count.items}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/inventory/purchase-orders/${po.id}`} className="inline-flex items-center rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
