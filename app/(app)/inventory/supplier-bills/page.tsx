import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",
  POSTED: "border-sky-500/30 bg-sky-500/15 text-sky-700",
  PART_PAID: "border-amber-400/30 bg-amber-400/15 text-amber-700",
  PAID: "border-emerald-500/30 bg-emerald-500/15 text-emerald-700",
  CANCELLED: "border-red-500/20 bg-red-500/10 text-red-600",
};

export default async function SupplierBillsPage() {
  const { user, orgId } = await requireOrgSession();
  if (!can.manageInventory(user)) redirect("/inventory");

  const bills = await prisma.supplierBill.findMany({
    where: { orgId },
    include: {
      supplier: { select: { name: true } },
      po: { select: { id: true, reference: true } },
      grn: { select: { id: true, grnNumber: true } },
    },
    orderBy: { issuedAt: "desc" },
    take: 100,
  }).catch(() => []);

  const totalOutstanding = bills
    .filter((bill) => bill.status !== "CANCELLED")
    .reduce((sum, bill) => sum + Math.max(0, bill.totalAmount - bill.paidAmount), 0);

  const fmt = (d: Date | null) => d ? d.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" }) : "-";

  return (
    <div className="space-y-4">
      <div className="panel-shadow flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
        <div>
          <Link href="/inventory" className="text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]">← Inventory</Link>
          <p className="mt-1 text-[13px] font-bold text-[var(--ink)]">Supplier Bills <span className="font-normal text-[var(--ink-muted)]">· {bills.length} · outstanding {totalOutstanding.toLocaleString()}</span></p>
        </div>
        <Link href="/inventory/supplier-bills/new" className="btn-premium rounded-lg px-3 py-1.5 text-[12px]">New Bill</Link>
      </div>

      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--panel-strong)] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              <tr>
                <th className="px-4 py-2.5 text-left">Bill</th>
                <th className="px-4 py-2.5 text-left">Supplier</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="hidden px-4 py-2.5 text-left md:table-cell">Linked Doc</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="hidden px-4 py-2.5 text-right sm:table-cell">Balance</th>
                <th className="hidden px-4 py-2.5 text-right sm:table-cell">Due</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {bills.map((bill) => (
                <tr key={bill.id} className="border-t border-[var(--line)] align-middle hover:bg-[var(--panel-strong)]/40">
                  <td className="px-4 py-3"><p className="mono text-sm font-bold text-[var(--ink)]">{bill.billNumber}</p><p className="text-xs text-[var(--ink-muted)]">{fmt(bill.issuedAt)}</p></td>
                  <td className="px-4 py-3 font-medium text-[var(--ink)]">{bill.supplier.name}</td>
                  <td className="px-4 py-3"><span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_COLORS[bill.status] ?? STATUS_COLORS.POSTED}`}>{bill.status}</span></td>
                  <td className="hidden px-4 py-3 text-xs text-[var(--ink-muted)] md:table-cell">{bill.grn ? bill.grn.grnNumber : bill.po ? bill.po.reference ?? `PO-${bill.po.id.slice(-6).toUpperCase()}` : "-"}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--ink)]">{bill.currency} {bill.totalAmount.toLocaleString()}</td>
                  <td className="hidden px-4 py-3 text-right tabular-nums text-[var(--ink-muted)] sm:table-cell">{(bill.totalAmount - bill.paidAmount).toLocaleString()}</td>
                  <td className="hidden px-4 py-3 text-right text-[var(--ink-muted)] sm:table-cell">{fmt(bill.dueAt)}</td>
                  <td className="px-4 py-3 text-right"><Link href={`/inventory/supplier-bills/${bill.id}`} className="inline-flex items-center rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">View</Link></td>
                </tr>
              ))}
              {bills.length === 0 ? <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-[var(--ink-muted)]">No supplier bills yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
