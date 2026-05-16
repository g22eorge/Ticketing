import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PaymentMethod } from "@prisma/client";

import { formatMoney, normalizeCurrency, toBaseAmount } from "@/lib/currency";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { assertOrgCanMutate } from "@/lib/org-write";
import { ConfirmSubmitButton } from "@/components/shared/ConfirmSubmitButton";
import { writeSystemAuditEvent } from "@/lib/commercial/audit";
import { RowActionsMenu, MenuSection, MenuDestructiveRow } from "@/components/shared/RowActionsMenu";

const PAYMENT_METHODS = Object.values(PaymentMethod);

export default async function ReceiptsPage() {
  const { user, orgId, org } = await requireOrgSession();
  if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role))) {
    redirect("/dashboard");
  }

  async function updateReceiptAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!(can.viewFinancials(user) || ["ADMIN", "OPS"].includes(user.role))) return;
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "PAYMENT" });

    const paymentId = String(formData.get("paymentId") ?? "").trim();
    const amount = Number(String(formData.get("amount") ?? "").trim());
    const methodRaw = String(formData.get("method") ?? "CASH").trim();
    const reference = String(formData.get("reference") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();
    if (!paymentId || !Number.isFinite(amount) || amount <= 0) return;

    const method = PAYMENT_METHODS.includes(methodRaw as PaymentMethod) ? (methodRaw as PaymentMethod) : PaymentMethod.OTHER;

    const source = await prisma.payment.findFirst({
      where: { id: paymentId, orgId },
      select: { invoiceId: true, saleId: true },
    });
    if (!source) return;

    await prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: { id: paymentId, orgId },
        data: { amount, method, reference: reference || null, note: note || null },
      });

      if (source.invoiceId) {
        const invoice = await tx.invoice.findFirst({ where: { id: source.invoiceId, orgId }, select: { id: true, totalAmount: true, jobId: true } });
        if (invoice) {
          const payments = await tx.payment.findMany({ where: { invoiceId: invoice.id, orgId }, select: { amount: true, currency: true, exchangeRateToBase: true } });
          const paidAmount = payments.reduce((sum, p) => sum + toBaseAmount({ amount: p.amount, currency: p.currency, baseCurrency: org.baseCurrency, exchangeRateToBase: p.exchangeRateToBase }), 0);
          const isPaid = invoice.totalAmount > 0 && paidAmount >= invoice.totalAmount;
          await tx.invoice.updateMany({ where: { id: invoice.id, orgId }, data: { paidAmount, paidAt: isPaid ? new Date() : null, status: invoice.totalAmount <= 0 ? "PAID" : isPaid ? "PAID" : "ISSUED" } });
          await tx.job.updateMany({ where: { id: invoice.jobId, orgId }, data: { clientPaid: isPaid, clientPaidAt: isPaid ? new Date() : null, clientPaidById: isPaid ? user.id : null } });
        }
      }

      if (source.saleId) {
        const sale = await tx.sale.findFirst({ where: { id: source.saleId, orgId }, select: { id: true, totalAmount: true } });
        if (sale) {
          const agg = await tx.payment.aggregate({ where: { saleId: sale.id, orgId }, _sum: { amount: true } });
          const paidAmount = agg._sum.amount ?? 0;
          const isPaid = sale.totalAmount > 0 && paidAmount >= sale.totalAmount;
          await tx.sale.updateMany({ where: { id: sale.id, orgId }, data: { paidAmount, paidAt: isPaid ? new Date() : null, status: isPaid ? "PAID" : "OPEN" } });
        }
      }
    });
    await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Payment", entityId: paymentId, action: "RECEIPT_UPDATED", summary: "Receipt/payment updated" });

    revalidatePath("/documents/receipts");
    revalidatePath("/documents/invoices");
  }

  async function deleteReceiptAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!("ADMIN" === user.role || can.approveInvoices(user))) return;
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "PAYMENT" });

    const paymentId = String(formData.get("paymentId") ?? "").trim();
    if (!paymentId) return;

    const source = await prisma.payment.findFirst({
      where: { id: paymentId, orgId },
      select: { invoiceId: true, saleId: true },
    });
    if (!source) return;

    await prisma.$transaction(async (tx) => {
      await tx.payment.deleteMany({ where: { id: paymentId, orgId } });

      if (source.invoiceId) {
        const invoice = await tx.invoice.findFirst({ where: { id: source.invoiceId, orgId }, select: { id: true, totalAmount: true, jobId: true } });
        if (invoice) {
          const payments = await tx.payment.findMany({ where: { invoiceId: invoice.id, orgId }, select: { amount: true, currency: true, exchangeRateToBase: true } });
          const paidAmount = payments.reduce((sum, p) => sum + toBaseAmount({ amount: p.amount, currency: p.currency, baseCurrency: org.baseCurrency, exchangeRateToBase: p.exchangeRateToBase }), 0);
          const isPaid = invoice.totalAmount > 0 && paidAmount >= invoice.totalAmount;
          await tx.invoice.updateMany({ where: { id: invoice.id, orgId }, data: { paidAmount, paidAt: isPaid ? new Date() : null, status: invoice.totalAmount <= 0 ? "PAID" : isPaid ? "PAID" : "ISSUED" } });
          await tx.job.updateMany({ where: { id: invoice.jobId, orgId }, data: { clientPaid: isPaid, clientPaidAt: isPaid ? new Date() : null, clientPaidById: isPaid ? user.id : null } });
        }
      }

      if (source.saleId) {
        const sale = await tx.sale.findFirst({ where: { id: source.saleId, orgId }, select: { id: true, totalAmount: true } });
        if (sale) {
          const agg = await tx.payment.aggregate({ where: { saleId: sale.id, orgId }, _sum: { amount: true } });
          const paidAmount = agg._sum.amount ?? 0;
          const isPaid = sale.totalAmount > 0 && paidAmount >= sale.totalAmount;
          await tx.sale.updateMany({ where: { id: sale.id, orgId }, data: { paidAmount, paidAt: isPaid ? new Date() : null, status: isPaid ? "PAID" : "OPEN" } });
        }
      }
    });
    await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Payment", entityId: paymentId, action: "RECEIPT_DELETED", summary: "Receipt/payment deleted" });

    revalidatePath("/documents/receipts");
    revalidatePath("/documents/invoices");
  }

  const payments = await prisma.payment.findMany({
    where: { orgId },
    orderBy: { receivedAt: "desc" },
    take: 120,
    select: {
      id: true,
      amount: true,
      currency: true,
      exchangeRateToBase: true,
      method: true,
      reference: true,
      note: true,
      receivedAt: true,
      sale: { select: { id: true, saleNumber: true } },
      invoice: { select: { id: true, invoiceNumber: true, job: { select: { id: true, jobNumber: true } } } },
    },
  });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const receiptsTotal = payments.length;
  const totalAmountBase = payments.reduce(
    (sum, p) =>
      sum +
        toBaseAmount({
          amount: p.amount,
          currency: normalizeCurrency(p.currency, org.baseCurrency),
          baseCurrency: org.baseCurrency,
          exchangeRateToBase: p.exchangeRateToBase,
        }),
    0,
  );
  const thisMonth = payments.filter((p) => p.receivedAt >= monthStart);
  const thisMonthAmountBase = thisMonth.reduce(
    (sum, p) =>
      sum +
        toBaseAmount({
          amount: p.amount,
          currency: normalizeCurrency(p.currency, org.baseCurrency),
          baseCurrency: org.baseCurrency,
          exchangeRateToBase: p.exchangeRateToBase,
        }),
    0,
  );
  const cashPaymentsCount = payments.filter((p) => p.method === "CASH").length;

  function methodBadge(method: string) {
    switch (method) {
      case "CASH":          return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700";
      case "MOBILE_MONEY":  return "border-sky-500/30 bg-sky-500/15 text-sky-700";
      case "CARD":          return "border-purple-500/30 bg-purple-500/15 text-purple-700";
      case "BANK_TRANSFER": return "border-indigo-500/30 bg-indigo-500/15 text-indigo-700";
      default:              return "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]";
    }
  }

  return (
    <section className="space-y-4">
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2.5">
          <p className="text-[13px] font-bold text-[var(--ink)]">Receipts</p>
          <Link href="/jobs/new" className="btn-premium rounded-lg px-3 py-1.5 text-[12px]">New Job</Link>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--line)] sm:grid-cols-4 sm:divide-y-0">
          <div className="px-4 py-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Total</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--ink)]">{receiptsTotal}</p>
            <p className="text-[10px] text-[var(--ink-muted)]">this month: {thisMonth.length}</p>
          </div>
          <div className="px-4 py-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Total Amount</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--ink)]">{formatMoney(totalAmountBase, org.baseCurrency)}</p>
          </div>
          <div className="px-4 py-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">This Month</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--accent)]">{formatMoney(thisMonthAmountBase, org.baseCurrency)}</p>
          </div>
          <div className="px-4 py-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Cash</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--ink)]">{cashPaymentsCount}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--line)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel-strong)] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            <tr>
              <th className="px-3 py-2.5">Date</th>
              <th className="px-3 py-2.5">Amount</th>
              <th className="hidden px-3 py-2.5 md:table-cell">Method</th>
              <th className="hidden px-3 py-2.5 lg:table-cell">Reference</th>
              <th className="px-3 py-2.5">For</th>
              <th className="px-3 py-2.5">Action</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => {
              const currency = normalizeCurrency(p.currency, org.baseCurrency);
              const label = p.invoice?.job?.jobNumber
                ? `Repair ${p.invoice.job.jobNumber}`
                : p.sale?.saleNumber
                  ? `Sale ${p.sale.saleNumber}`
                  : p.invoice?.invoiceNumber
                    ? `Invoice ${p.invoice.invoiceNumber}`
                    : "Payment";

              const linkHref = p.invoice?.job?.id
                ? `/jobs/${p.invoice.job.id}`
                : p.sale?.id
                  ? `/pos/${p.sale.id}`
                  : null;

              return (
                <tr key={p.id} className="border-t border-[var(--line)] align-middle hover:bg-[var(--panel-strong)]/40">
                  <td className="px-3 py-2.5 text-[var(--ink-muted)]">{p.receivedAt.toLocaleDateString()}<br /><span className="text-[10px]">{p.receivedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></td>
                  <td className="px-3 py-2.5 mono font-bold text-[var(--ink)]">{formatMoney(p.amount, currency)}</td>
                  <td className="hidden px-3 py-2.5 md:table-cell">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${methodBadge(p.method)}`}>
                      {p.method.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="hidden px-3 py-2.5 text-[var(--ink-muted)] lg:table-cell">{p.reference ?? "-"}</td>
                  <td className="px-3 py-2.5">
                    {linkHref ? (
                      <Link href={linkHref} className="font-medium text-[var(--ink)] transition hover:text-[var(--accent)]">
                        {label}
                      </Link>
                    ) : (
                      <span className="text-[var(--ink-muted)]">{label}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      {linkHref ? (
                        <Link href={linkHref} className="inline-flex items-center rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">
                          View
                        </Link>
                      ) : null}
                      <a href={`/api/payments/${p.id}/receipt`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2.5 py-1.5 text-xs font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)]/20">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                        PDF
                      </a>
                      <RowActionsMenu label="Receipt actions">
                        <MenuSection label="Edit Receipt" />
                        <form action={updateReceiptAction} className="space-y-2 p-3">
                          <input type="hidden" name="paymentId" value={p.id} />
                          <input name="amount" inputMode="decimal" defaultValue={p.amount} className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                          <select name="method" defaultValue={p.method} className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50">
                            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replaceAll("_", " ")}</option>)}
                          </select>
                          <input name="reference" defaultValue={p.reference ?? ""} placeholder="Reference" className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                          <textarea name="note" defaultValue={p.note ?? ""} placeholder="Note" className="min-h-14 w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                          <button className="btn-premium w-full rounded-lg px-3 py-1.5 text-xs font-semibold">Save</button>
                        </form>
                        <MenuDestructiveRow>
                          <form action={deleteReceiptAction}>
                            <input type="hidden" name="paymentId" value={p.id} />
                            <ConfirmSubmitButton message="Delete this receipt/payment? Totals will be recalculated." className="text-xs font-semibold text-red-600 transition hover:text-red-700">Delete Receipt</ConfirmSubmitButton>
                          </form>
                        </MenuDestructiveRow>
                      </RowActionsMenu>
                    </div>
                  </td>
                </tr>
              );
            })}
            {payments.length === 0 ? (
              <tr className="border-t border-[var(--line)]">
                <td className="px-3 py-8 text-sm text-[var(--ink-muted)]" colSpan={6}>
                  No payments yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
