import Link from "next/link";
import { redirect } from "next/navigation";
import { orgDb, prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { getCurrentUserRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const { user } = await getCurrentUserRole();
  const db = orgDb(user.orgId);
  if (!can.manageUsers(user)) redirect("/inventory");

  const now = new Date();

  const [suppliers, totalActive, outstandingBills, overdueBills] = await Promise.all([
    db.supplier.findMany({
      where: {},
      orderBy: { name: "asc" },
      include: { _count: { select: { purchaseOrders: true } } },
    }),
    db.supplier.count({ where: { isActive: true } }).catch(() => 0),
    db.supplierBill.count({ where: { status: { in: ["POSTED", "PART_PAID"] } } }).catch(() => 0),
    db.supplierBill.count({ where: { dueAt: { lt: now }, status: { notIn: ["PAID", "CANCELLED"] } } }).catch(() => 0),
  ]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="panel-shadow flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
        <p className="text-[13px] font-bold text-[var(--ink)]">
          Suppliers · <span className="font-normal text-[var(--ink-muted)]">{suppliers.length}</span>
        </p>
        <div className="flex items-center gap-2">
          <Link href="/inventory" className="inline-flex items-center rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">
            ← Inventory
          </Link>
          <Link href="/inventory/suppliers/new" className="btn-premium rounded-lg px-3 py-1.5 text-[12px]">
            Add Supplier
          </Link>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Total Suppliers</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{suppliers.length}</p>
          <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">registered</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Active</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-green-600">{totalActive}</p>
          <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">currently active</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Outstanding Bills</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-amber-600">{outstandingBills}</p>
          <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">posted or part-paid</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Overdue Bills</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-red-500">{overdueBills}</p>
          <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">past due date</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
        {suppliers.length === 0 ? (
          <div className="py-16 text-center text-sm text-[var(--ink-muted)]">
            No suppliers yet. Add your first supplier to start raising purchase orders.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[var(--panel-strong)] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              <tr>
                <th className="px-4 py-2.5 text-left">Name</th>
                <th className="hidden px-4 py-2.5 text-left sm:table-cell">Contact</th>
                <th className="hidden px-4 py-2.5 text-left md:table-cell">Phone</th>
                <th className="px-4 py-2.5 text-center">POs</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="border-t border-[var(--line)] align-middle hover:bg-[var(--panel-strong)]/40">
                  <td className="px-4 py-3 font-semibold text-[var(--ink)]">{s.name}</td>
                  <td className="hidden px-4 py-3 text-[var(--ink-muted)] sm:table-cell">{s.contactName ?? "—"}</td>
                  <td className="hidden px-4 py-3 text-[var(--ink-muted)] md:table-cell">{s.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-center text-[var(--ink-muted)]">{s._count.purchaseOrders}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                      s.isActive
                        ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700"
                        : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]"
                    }`}>
                      {s.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/inventory/suppliers/${s.id}`} className="inline-flex items-center rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">
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
