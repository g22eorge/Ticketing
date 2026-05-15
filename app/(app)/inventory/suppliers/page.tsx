import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const { user, orgId } = await requireOrgSession();
  if (!can.manageUsers(user)) redirect("/inventory");

  const suppliers = await prisma.supplier.findMany({
    where: { orgId },
    orderBy: { name: "asc" },
    include: { _count: { select: { purchaseOrders: true } } },
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="panel-shadow rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--accent)]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </div>
            <div className="min-w-0">
              <p className="truncate text-xl font-black text-[var(--ink)]">Suppliers</p>
              <p className="mt-0.5 truncate text-xs text-[var(--ink-muted)]">{suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""} · manage purchase order contacts</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/inventory" className="inline-flex items-center rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">
              ← Inventory
            </Link>
            <Link href="/inventory/suppliers/new" className="btn-premium rounded-full px-4 py-2 text-sm">
              Add Supplier
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--line)]">
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
