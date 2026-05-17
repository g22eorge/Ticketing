import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function GoodsReceivedPage() {
  const { user, orgId } = await requireOrgSession();
  if (!can.manageInventory(user)) redirect("/inventory");

  const notes = await prisma.goodsReceived.findMany({
    where: { orgId },
    include: {
      supplier: { select: { name: true } },
      po: { select: { id: true, reference: true } },
      location: { select: { name: true, code: true } },
      items: { select: { quantity: true, unitCost: true } },
    },
    orderBy: { receivedAt: "desc" },
    take: 100,
  });

  const fmt = (d: Date) => d.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="space-y-4">
      <div className="panel-shadow flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
        <div>
          <Link href="/inventory" className="text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]">
            ← Inventory
          </Link>
          <p className="mt-1 text-[13px] font-bold text-[var(--ink)]">
            Goods Received <span className="font-normal text-[var(--ink-muted)]">· {notes.length} notes</span>
          </p>
        </div>
        <Link href="/inventory/purchase-orders" className="inline-flex items-center rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">
          Receive from PO
        </Link>
      </div>

      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                <th className="px-4 py-3 text-left">GRN</th>
                <th className="px-4 py-3 text-left">Supplier</th>
                <th className="px-4 py-3 text-left hidden md:table-cell">PO</th>
                <th className="px-4 py-3 text-left hidden sm:table-cell">Location</th>
                <th className="px-4 py-3 text-right">Value</th>
                <th className="px-4 py-3 text-right">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {notes.map((grn) => {
                const total = grn.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
                return (
                  <tr key={grn.id} className="hover:bg-[var(--bg)]/70">
                    <td className="px-4 py-3">
                      <Link href={`/inventory/goods-received/${grn.id}`} className="font-semibold text-[var(--ink)] hover:text-[var(--gold)]">
                        {grn.grnNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[var(--ink)]">{grn.supplier.name}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-[var(--ink-muted)]">
                      {grn.po ? (
                        <Link href={`/inventory/purchase-orders/${grn.po.id}`} className="hover:text-[var(--gold)]">
                          {grn.po.reference ?? `PO-${grn.po.id.slice(-6).toUpperCase()}`}
                        </Link>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-xs text-[var(--ink-muted)]">
                      {grn.location.name}{grn.location.code ? ` (${grn.location.code})` : ""}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--ink)]">{total.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-xs text-[var(--ink-muted)]">{fmt(grn.receivedAt)}</td>
                  </tr>
                );
              })}
              {notes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--ink-muted)]">
                    No goods received yet. Open a purchase order to receive stock.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
