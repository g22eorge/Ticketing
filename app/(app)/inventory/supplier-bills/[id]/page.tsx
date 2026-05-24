import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { cancelSupplierBillAction, createSupplierPaymentAction, deleteSupplierPaymentAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function SupplierBillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, orgId } = await requireOrgSession();
  if (!can.manageInventory(user)) redirect("/inventory");

  const bill = await prisma.supplierBill.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, name: true } },
      po: { select: { id: true, reference: true } },
      grn: { select: { id: true, grnNumber: true } },
      createdBy: { select: { name: true, email: true } },
      items: { orderBy: { createdAt: "asc" } },
      payments: {
        include: { createdBy: { select: { name: true, email: true } } },
        orderBy: { paidAt: "desc" },
      },
    },
  }).catch(() => null);
  if (!bill || bill.orgId !== orgId) notFound();

  const fmt = (d: Date | null) => d ? d.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" }) : "-";
  const balance = bill.totalAmount - bill.paidAmount;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/inventory/supplier-bills" className="text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]">← Supplier Bills</Link>
          <h1 className="mt-1 text-xl font-bold text-[var(--ink)]">{bill.billNumber}</h1>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">Supplier: <Link href={`/inventory/suppliers/${bill.supplier.id}`} className="text-[var(--gold)] hover:underline">{bill.supplier.name}</Link></p>
        </div>
        <span className="mt-1 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">{bill.status}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Issued</p><p className="mt-0.5 text-sm font-semibold text-[var(--ink)]">{fmt(bill.issuedAt)}</p></div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Due</p><p className="mt-0.5 text-sm font-semibold text-[var(--ink)]">{fmt(bill.dueAt)}</p></div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Total</p><p className="mt-0.5 text-sm font-semibold text-[var(--ink)] tabular-nums">{bill.currency} {bill.totalAmount.toLocaleString()}</p></div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Balance</p><p className="mt-0.5 text-sm font-semibold text-[var(--ink)] tabular-nums">{bill.currency} {balance.toLocaleString()}</p></div>
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--line)] flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Bill Lines</p>
          <div className="flex gap-2 text-xs font-semibold">
            {bill.po ? <Link href={`/inventory/purchase-orders/${bill.po.id}`} className="text-[var(--gold)] hover:underline">{bill.po.reference ?? "Purchase Order"}</Link> : null}
            {bill.grn ? <Link href={`/inventory/goods-received/${bill.grn.id}`} className="text-[var(--gold)] hover:underline">{bill.grn.grnNumber}</Link> : null}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[var(--line)] text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]"><th className="px-4 py-2 text-left">Description</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Unit Cost</th><th className="px-4 py-2 text-right">Total</th></tr></thead>
            <tbody className="divide-y divide-[var(--line)]">{bill.items.map((item) => <tr key={item.id}><td className="px-4 py-2 text-[var(--ink)]">{item.description}</td><td className="px-4 py-2 text-right tabular-nums text-[var(--ink-muted)]">{item.quantity}</td><td className="px-4 py-2 text-right tabular-nums text-[var(--ink-muted)]">{item.unitCost.toLocaleString()}</td><td className="px-4 py-2 text-right tabular-nums font-semibold text-[var(--ink)]">{item.lineTotal.toLocaleString()}</td></tr>)}</tbody>
            <tfoot><tr className="border-t border-[var(--line)] bg-[var(--gold)]/5"><td colSpan={3} className="px-4 py-2 text-right text-xs font-semibold text-[var(--ink-muted)]">Subtotal</td><td className="px-4 py-2 text-right font-bold text-[var(--ink)] tabular-nums">{bill.subtotal.toLocaleString()}</td></tr><tr><td colSpan={3} className="px-4 py-2 text-right text-xs font-semibold text-[var(--ink-muted)]">Tax</td><td className="px-4 py-2 text-right font-bold text-[var(--ink)] tabular-nums">{bill.taxAmount.toLocaleString()}</td></tr></tfoot>
          </table>
        </div>
      </div>

      {bill.notes ? <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-5 py-4"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)] mb-1">Notes</p><p className="text-sm text-[var(--ink)] whitespace-pre-wrap">{bill.notes}</p></div> : null}

      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--line)] flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Payments ({bill.payments.length})</p>
          <p className="text-xs font-semibold text-[var(--ink-muted)]">Paid {bill.currency} {bill.paidAmount.toLocaleString()}</p>
        </div>
        {balance > 0 && bill.status !== "CANCELLED" ? (
          <form action={createSupplierPaymentAction} className="grid gap-2 border-b border-[var(--line)] p-4 sm:grid-cols-[0.8fr_0.8fr_1fr_1fr_auto]">
            <input type="hidden" name="billId" value={bill.id} />
            <input name="amount" type="number" min={0.01} max={balance} step={0.01} placeholder={`Max ${balance.toLocaleString()}`} required className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-right text-[13px] outline-none focus:border-[var(--accent)]/60" />
            <select name="method" defaultValue="BANK_TRANSFER" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60">
              <option value="CASH">Cash</option>
              <option value="MOBILE_MONEY">Mobile money</option>
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="CARD">Card</option>
              <option value="OTHER">Other</option>
            </select>
            <input name="reference" placeholder="Reference" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60" />
            <input name="paidAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60" />
            <button type="submit" className="btn-premium rounded-lg px-4 py-1.5 text-[13px] font-semibold">Record</button>
            <input name="note" placeholder="Payment note" className="sm:col-span-5 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60" />
          </form>
        ) : null}
        {bill.payments.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--ink-muted)]">No payments recorded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Method</th>
                <th className="px-4 py-2 text-left hidden sm:table-cell">Reference</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {bill.payments.map((payment) => (
                <tr key={payment.id} className="hover:bg-[var(--gold)]/5">
                  <td className="px-4 py-2 text-[var(--ink)]">{fmt(payment.paidAt)}</td>
                  <td className="px-4 py-2 text-xs font-semibold text-[var(--ink-muted)]">{payment.method}</td>
                  <td className="px-4 py-2 hidden sm:table-cell text-xs text-[var(--ink-muted)]">{payment.reference ?? "-"}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums text-[var(--ink)]">{payment.currency} {payment.amount.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right">
                    <form action={deleteSupplierPaymentAction}>
                      <input type="hidden" name="id" value={payment.id} />
                      <input type="hidden" name="billId" value={bill.id} />
                      <button type="submit" className="text-xs font-semibold text-red-600 hover:text-red-700">Delete</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--ink-muted)]">
        <p>Posted by {bill.createdBy.name || bill.createdBy.email}.</p>
        {bill.status !== "CANCELLED" && bill.paidAmount === 0 ? <form action={cancelSupplierBillAction}><input type="hidden" name="id" value={bill.id} /><button type="submit" className="font-semibold text-red-600 hover:text-red-700">Cancel bill</button></form> : null}
      </div>
    </div>
  );
}
