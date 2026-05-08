import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, string> = {
  DRAFT:     "bg-gray-100 text-gray-600",
  ORDERED:   "bg-blue-100 text-blue-700",
  PARTIAL:   "bg-amber-100 text-amber-700",
  RECEIVED:  "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-600",
};

export default async function PurchaseOrdersPage() {
  const { user, orgId } = await requireOrgSession();
  if (!can.manageUsers(user)) redirect("/inventory");

  const orders = await prisma.purchaseOrder.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    include: {
      supplier: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });

  const fmt = (d: Date | null) =>
    d ? d.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" }) : "—";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--ink)]">Purchase Orders</h1>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">{orders.length} order{orders.length !== 1 ? "s" : ""}</p>
        </div>
        <Link
          href="/inventory/purchase-orders/new"
          className="btn-premium rounded-lg px-4 py-2 text-sm font-semibold"
        >
          + New PO
        </Link>
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
        {orders.length === 0 ? (
          <div className="py-16 text-center text-sm text-[var(--ink-muted)]">
            No purchase orders yet. Create one to start ordering stock.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                <th className="px-4 py-2.5 text-left">Reference</th>
                <th className="px-4 py-2.5 text-left">Supplier</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-left hidden sm:table-cell">Ordered</th>
                <th className="px-4 py-2.5 text-left hidden md:table-cell">Expected</th>
                <th className="px-4 py-2.5 text-center">Items</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {orders.map((po) => (
                <tr key={po.id} className="hover:bg-[var(--gold)]/5">
                  <td className="px-4 py-2.5 font-mono text-xs text-[var(--ink)]">
                    {po.reference ?? po.id.slice(-6).toUpperCase()}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-[var(--ink)]">{po.supplier.name}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[po.status] ?? ""}`}>
                      {po.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--ink-muted)] hidden sm:table-cell">{fmt(po.orderedAt)}</td>
                  <td className="px-4 py-2.5 text-[var(--ink-muted)] hidden md:table-cell">{fmt(po.expectedAt)}</td>
                  <td className="px-4 py-2.5 text-center text-[var(--ink-muted)]">{po._count.items}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Link href={`/inventory/purchase-orders/${po.id}`} className="text-xs font-semibold text-[var(--gold)] hover:underline">
                      View →
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
