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
    assertOrgCanMutate({ access: org.access, userRole: user.role, kind: "PAYMENT" });

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
    assertOrgCanMutate({ access: org.access, userRole: user.role, kind: "PAYMENT" });

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

  return (
    <section className="space-y-4">
      <div className="panel-shadow overflow-hidden rounded-2xl border border-[var(--line)] bg-gradient-to-r from-sky-100 via-white to-orange-100 p-4 text-slate-950 sm:p-6 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 dark:text-[var(--ink)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Receipts</h1>
            <p className="mt-1 text-sm text-slate-700 dark:text-[var(--ink-muted)]">Track sales receipts and payment confirmations.</p>
          </div>
          <Link href="/jobs/new" className="btn-premium rounded-full px-4 py-2 text-sm text-white">New Job</Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Total Receipts</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{receiptsTotal}</p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">This month: {thisMonth.length}</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Total Amount</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{formatMoney(totalAmountBase, org.baseCurrency)}</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">This Month</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{formatMoney(thisMonthAmountBase, org.baseCurrency)}</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Cash Payments</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{cashPaymentsCount}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--line)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel-strong)] text-xs uppercase tracking-wide text-[var(--ink-muted)]">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Amount</th>
              <th className="hidden px-3 py-2 md:table-cell">Method</th>
              <th className="hidden px-3 py-2 lg:table-cell">Reference</th>
              <th className="px-3 py-2">For</th>
              <th className="px-3 py-2">Action</th>
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
                <tr key={p.id} className="border-t border-[var(--line)]">
                  <td className="px-3 py-2 text-[var(--ink-muted)]">{p.receivedAt.toLocaleString()}</td>
                  <td className="px-3 py-2 mono font-semibold text-[var(--ink)]">{formatMoney(p.amount, currency)}</td>
                  <td className="hidden px-3 py-2 text-[var(--ink-muted)] md:table-cell">{p.method.replaceAll("_", " ")}</td>
                  <td className="hidden px-3 py-2 text-[var(--ink-muted)] lg:table-cell">{p.reference ?? "-"}</td>
                  <td className="px-3 py-2">
                    {linkHref ? (
                      <Link href={linkHref} className="font-medium text-[var(--ink)] transition hover:text-[var(--accent)]">
                        {label}
                      </Link>
                    ) : (
                      <span className="text-[var(--ink-muted)]">{label}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <details className="relative inline-block">
                      <summary className="inline-flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink)] transition hover:border-[var(--accent)]/40">
                        <span className="sr-only">Actions</span>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <circle cx="5" cy="12" r="1.8" />
                          <circle cx="12" cy="12" r="1.8" />
                          <circle cx="19" cy="12" r="1.8" />
                        </svg>
                      </summary>
                      <div className="panel-shadow absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
                        <div className="py-1">
                          {linkHref ? (
                            <Link href={linkHref} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--panel-strong)]">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
                              View
                            </Link>
                          ) : (
                            <span className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--ink-muted)]">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
                              View
                            </span>
                          )}
                          <a href={`/api/payments/${p.id}/receipt`} target="_blank" rel="noreferrer" className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--panel-strong)]">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                            Download PDF
                          </a>
                          <details className="border-t border-[var(--line)]">
                            <summary className="flex w-full cursor-pointer list-none items-center gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--panel-strong)]">
                              Edit Receipt
                            </summary>
                            <form action={updateReceiptAction} className="space-y-2 px-4 pb-3">
                              <input type="hidden" name="paymentId" value={p.id} />
                              <input name="amount" inputMode="decimal" defaultValue={p.amount} className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                              <select name="method" defaultValue={p.method} className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50">
                                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replaceAll("_", " ")}</option>)}
                              </select>
                              <input name="reference" defaultValue={p.reference ?? ""} placeholder="Reference" className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                              <textarea name="note" defaultValue={p.note ?? ""} placeholder="Receipt note" className="min-h-16 w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                              <button className="btn-premium w-full rounded-md px-2.5 py-1.5 text-xs text-white">Save</button>
                            </form>
                          </details>
                          <form action={deleteReceiptAction} className="border-t border-[var(--line)] px-4 py-3">
                            <input type="hidden" name="paymentId" value={p.id} />
                            <ConfirmSubmitButton message="Delete this receipt/payment? Totals will be recalculated." className="text-left text-sm font-semibold text-red-600 transition hover:text-red-700">Delete Receipt</ConfirmSubmitButton>
                          </form>
                        </div>
                      </div>
                    </details>
                  </td>
                </tr>
              );
            })}
            {payments.length === 0 ? (
              <tr className="border-t border-[var(--line)]">
                <td className="px-3 py-6 text-sm text-[var(--ink-muted)]" colSpan={6}>
                  No payments yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/pos" className="btn-premium-secondary rounded-lg px-3 py-2 text-sm">Open POS</Link>
        <Link href="/documents/invoices" className="btn-premium-secondary rounded-lg px-3 py-2 text-sm">Open Invoices</Link>
      </div>
    </section>
  );
}
