import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function GoodsReceivedDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, orgId } = await requireOrgSession();
  if (!can.manageInventory(user)) redirect("/inventory");

  const grn = await prisma.goodsReceived.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, name: true } },
      po: { select: { id: true, reference: true } },
      location: { select: { name: true, code: true } },
      createdBy: { select: { name: true, email: true } },
      items: { include: { part: { select: { sku: true, name: true } } }, orderBy: { createdAt: "asc" } },
    },
  });

  if (!grn || grn.orgId !== orgId) notFound();

  const fmt = (d: Date) => d.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" });
  const total = grn.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/inventory/goods-received" className="text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]">
            ← Goods Received
          </Link>
          <h1 className="mt-1 text-xl font-bold text-[var(--ink)]">{grn.grnNumber}</h1>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
            Supplier: <Link href={`/inventory/suppliers/${grn.supplier.id}`} className="text-[var(--gold)] hover:underline">{grn.supplier.name}</Link>
          </p>
        </div>
        <span className="mt-1 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">{grn.status}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Received</p>
          <p className="mt-0.5 text-sm font-semibold text-[var(--ink)]">{fmt(grn.receivedAt)}</p>
        </div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Location</p>
          <p className="mt-0.5 text-sm font-semibold text-[var(--ink)]">{grn.location.name}</p>
        </div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">PO</p>
          <p className="mt-0.5 text-sm font-semibold text-[var(--ink)]">
            {grn.po ? <Link href={`/inventory/purchase-orders/${grn.po.id}`} className="hover:text-[var(--gold)]">{grn.po.reference ?? `PO-${grn.po.id.slice(-6).toUpperCase()}`}</Link> : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Total Value</p>
          <p className="mt-0.5 text-sm font-semibold text-[var(--ink)] tabular-nums">{total.toLocaleString()}</p>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--line)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Received Items</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                <th className="px-4 py-2 text-left">Description</th>
                <th className="px-4 py-2 text-left hidden sm:table-cell">Part</th>
                <th className="px-4 py-2 text-right">Qty</th>
                <th className="px-4 py-2 text-right">Unit Cost</th>
                <th className="px-4 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {grn.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2 text-[var(--ink)]">{item.description}</td>
                  <td className="px-4 py-2 hidden sm:table-cell text-xs text-[var(--ink-muted)]">{item.part ? `${item.part.sku} · ${item.part.name}` : "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-[var(--ink)]">{item.quantity}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-[var(--ink-muted)]">{item.unitCost.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-[var(--ink)]">{(item.quantity * item.unitCost).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-[var(--ink-muted)]">Posted by {grn.createdBy.name || grn.createdBy.email}.</p>
    </div>
  );
}
