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
