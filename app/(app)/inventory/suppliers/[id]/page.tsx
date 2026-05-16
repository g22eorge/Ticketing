import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { SupplierEditForm } from "./SupplierEditForm";

export const dynamic = "force-dynamic";

const PO_STATUS_COLORS: Record<string, string> = {
  DRAFT:      "bg-gray-100 text-gray-600",
  ORDERED:    "bg-blue-100 text-blue-700",
  PARTIAL:    "bg-amber-100 text-amber-700",
  RECEIVED:   "bg-green-100 text-green-700",
  CANCELLED:  "bg-red-100 text-red-600",
};

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, orgId } = await requireOrgSession();
  if (!can.manageUsers(user)) redirect("/inventory");

  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: {
      purchaseOrders: {
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { items: true } } },
      },
    },
  });

  if (!supplier || supplier.orgId !== orgId) notFound();

  const fmt = (d: Date | null) =>
    d ? d.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" }) : "—";

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/inventory/suppliers" className="text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]">
            ← Suppliers
          </Link>
          <h1 className="mt-1 text-xl font-bold text-[var(--ink)]">{supplier.name}</h1>
        </div>
        <span className={`mt-1 rounded-full px-3 py-1 text-xs font-semibold ${supplier.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
          {supplier.isActive ? "Active" : "Inactive"}
        </span>
      </div>

      {/* Edit form */}
      <SupplierEditForm supplier={supplier} />

      {/* Purchase orders */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--line)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
            Purchase Orders ({supplier.purchaseOrders.length})
          </p>
          <Link
            href={`/inventory/purchase-orders/new?supplierId=${supplier.id}`}
            className="rounded-md bg-[var(--gold)]/15 px-3 py-1 text-xs font-semibold text-[var(--gold)] hover:bg-[var(--gold)]/25"
          >
            + New PO
          </Link>
        </div>
        {supplier.purchaseOrders.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--ink-muted)]">No purchase orders yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                <th className="px-4 py-2 text-left">Reference</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left hidden sm:table-cell">Ordered</th>
                <th className="px-4 py-2 text-left hidden sm:table-cell">Expected</th>
                <th className="px-4 py-2 text-center">Items</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {supplier.purchaseOrders.map((po) => (
                <tr key={po.id} className="hover:bg-[var(--gold)]/5">
                  <td className="px-4 py-2 font-mono text-xs text-[var(--ink)]">{po.reference ?? po.id.slice(-6).toUpperCase()}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PO_STATUS_COLORS[po.status] ?? ""}`}>
                      {po.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-[var(--ink-muted)] hidden sm:table-cell">{fmt(po.orderedAt)}</td>
                  <td className="px-4 py-2 text-[var(--ink-muted)] hidden sm:table-cell">{fmt(po.expectedAt)}</td>
                  <td className="px-4 py-2 text-center text-[var(--ink-muted)]">{po._count.items}</td>
                  <td className="px-4 py-2 text-right">
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
