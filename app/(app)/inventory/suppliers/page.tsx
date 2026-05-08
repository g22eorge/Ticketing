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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--ink)]">Suppliers</h1>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">{suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}</p>
        </div>
        <Link
          href="/inventory/suppliers/new"
          className="btn-premium rounded-lg px-4 py-2 text-sm font-semibold"
        >
          + Add supplier
        </Link>
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
        {suppliers.length === 0 ? (
          <div className="py-16 text-center text-sm text-[var(--ink-muted)]">
            No suppliers yet. Add your first supplier to start raising purchase orders.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                <th className="px-4 py-2.5 text-left">Name</th>
                <th className="px-4 py-2.5 text-left hidden sm:table-cell">Contact</th>
                <th className="px-4 py-2.5 text-left hidden md:table-cell">Phone</th>
                <th className="px-4 py-2.5 text-center">POs</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {suppliers.map((s) => (
                <tr key={s.id} className="hover:bg-[var(--gold)]/5">
                  <td className="px-4 py-2.5 font-medium text-[var(--ink)]">{s.name}</td>
                  <td className="px-4 py-2.5 text-[var(--ink-muted)] hidden sm:table-cell">{s.contactName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-[var(--ink-muted)] hidden md:table-cell">{s.phone ?? "—"}</td>
                  <td className="px-4 py-2.5 text-center text-[var(--ink-muted)]">{s._count.purchaseOrders}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      s.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}>
                      {s.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link href={`/inventory/suppliers/${s.id}`} className="text-xs font-semibold text-[var(--gold)] hover:underline">
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
