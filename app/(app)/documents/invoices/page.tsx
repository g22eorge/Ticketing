import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { PaymentMethod } from "@prisma/client";

import { formatMoney, isSupportedCurrency, normalizeCurrency, toBaseAmount } from "@/lib/currency";
import { canGenerateInvoiceForStatus } from "@/lib/documents";
import { JobStatus } from "@/lib/job-status";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { assertOrgCanMutate } from "@/lib/org-write";

const PAYMENT_METHODS = Object.values(PaymentMethod);

export default async function InvoicesPage() {
  const { user, orgId, org } = await requireOrgSession();
  if (!("ADMIN" === user.role || "OPS" === user.role || can.approveInvoices(user))) {
    redirect("/dashboard");
  }

  let dbNeedsFix = false;

  async function addPaymentAction(formData: FormData) {
    "use server";
    const { user, orgId, session, org } = await requireOrgSession();
    if (!("ADMIN" === user.role || "OPS" === user.role || can.approveInvoices(user))) return;
    assertOrgCanMutate({ access: org.access, userRole: user.role, kind: "PAYMENT" });

    const invoiceId = String(formData.get("invoiceId") ?? "").trim();
    const rawAmount = String(formData.get("amount") ?? "").trim();
    const method = String(formData.get("method") ?? "CASH").trim();
    const reference = String(formData.get("reference") ?? "").trim();
    const currency = normalizeCurrency(formData.get("currency"), org.baseCurrency);
    const exchangeRateToBaseRaw = String(formData.get("exchangeRateToBase") ?? "").trim();
    if (!invoiceId) return;

    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    if (!isSupportedCurrency(currency)) return;
    const exchangeRateToBase = currency === org.baseCurrency
      ? null
      : (exchangeRateToBaseRaw ? Number(exchangeRateToBaseRaw) : null);
    if (currency !== org.baseCurrency) {
      if (!exchangeRateToBase || !Number.isFinite(exchangeRateToBase) || exchangeRateToBase <= 0) return;
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, orgId },
      select: { id: true, totalAmount: true, jobId: true },
    });
    if (!invoice) return;

    const safeMethod: PaymentMethod = PAYMENT_METHODS.includes(method as PaymentMethod)
      ? (method as PaymentMethod)
      : PaymentMethod.OTHER;

    await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          orgId,
          invoiceId: invoice.id,
          currency,
          exchangeRateToBase,
          amount,
          method: safeMethod,
          reference: reference || null,
          createdById: session.user.id,
        },
      });

      // If multi-currency payments are present, recompute using stored exchange rates.
      const payments = await tx.payment.findMany({
        where: { invoiceId: invoice.id, orgId },
        select: { amount: true, currency: true, exchangeRateToBase: true },
      });
      const paidAmount = payments.reduce(
        (sum, p) => sum + toBaseAmount({ amount: p.amount, currency: p.currency, baseCurrency: org.baseCurrency, exchangeRateToBase: p.exchangeRateToBase }),
        0,
      );
      const isPaid = invoice.totalAmount > 0 && paidAmount >= invoice.totalAmount;

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount,
          paidAt: isPaid ? new Date() : null,
          status: invoice.totalAmount <= 0 ? "PAID" : isPaid ? "PAID" : "ISSUED",
        },
      });

      // Keep legacy job flags in sync for now.
      await tx.job.update({
        where: { id: invoice.jobId },
        data: {
          clientPaid: isPaid,
          clientPaidAt: isPaid ? new Date() : null,
          clientPaidById: isPaid ? session.user.id : null,
          clientPaymentRef: reference || null,
        },
      });
    });

    revalidatePath("/documents/invoices");
  }

  let invoices: Array<{
    id: string;
    invoiceNumber: string;
    issuedAt: Date;
    currency: string | null;
    totalAmount: number;
    paidAmount: number;
    status: string;
    job: { id: string; jobNumber: string; status: JobStatus; client: { fullName: string } };
  }> = [];
  try {
    invoices = await prisma.invoice.findMany({
      where: { orgId },
      orderBy: { issuedAt: "desc" },
      take: 100,
      select: {
        id: true,
        invoiceNumber: true,
        issuedAt: true,
        currency: true,
        totalAmount: true,
        paidAmount: true,
        status: true,
        job: {
          select: {
            id: true,
            jobNumber: true,
            status: true,
            client: { select: { fullName: true } },
          },
        },
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("no such table") && msg.includes("Invoice")) dbNeedsFix = true;
    invoices = [];
  }

  const readyJobs = await prisma.job
    .findMany({
      where: {
        orgId,
        status: { in: ["READY_FOR_PICKUP", "COMPLETED", "CLOSED"] },
        invoiceIssuedAt: null,
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        jobNumber: true,
      },
    })
    .catch(() => []);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const totalCount = invoices.length;
  const thisMonthCount = invoices.filter((i) => i.issuedAt >= monthStart).length;
  const outstandingCount = invoices.filter((i) => i.totalAmount > i.paidAmount).length;
  const totalOutstanding = invoices.reduce((sum, i) => sum + Math.max(0, i.totalAmount - i.paidAmount), 0);

  return (
    <section className="space-y-4">
      <div className="panel-shadow overflow-hidden rounded-2xl border border-[var(--line)] bg-gradient-to-r from-sky-100 via-white to-orange-100 p-4 text-slate-950 sm:p-6 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 dark:text-[var(--ink)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Invoices</h1>
            <p className="mt-1 text-sm text-slate-700 dark:text-[var(--ink-muted)]">Generate invoices and record partial payments.</p>
          </div>
          <Link href="/documents/receipts" className="btn-premium rounded-full px-4 py-2 text-sm text-white">Receipts</Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Total Invoices</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{totalCount}</p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">This month: {thisMonthCount}</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Outstanding</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{outstandingCount}</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Outstanding Amount</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{formatMoney(totalOutstanding, org.baseCurrency)}</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Ready Jobs</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{readyJobs.length}</p>
        </div>
      </div>

      {dbNeedsFix ? (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <p className="font-semibold text-amber-50">Invoice tables are missing in the database.</p>
          <p className="mt-1 text-amber-100/90">
            Run <span className="mono">/api/admin/db-fix</span> as the platform admin to create <span className="mono">Invoice</span> and <span className="mono">Payment</span>.
          </p>
          <a
            className="mt-3 inline-flex rounded-lg border border-amber-500/30 bg-black/20 px-3 py-2 text-xs font-semibold text-amber-50 hover:bg-black/30"
            href="/api/admin/db-fix"
            target="_blank"
            rel="noreferrer"
          >
            Open DB Fix
          </a>
        </div>
      ) : null}

      {readyJobs.length > 0 ? (
        <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Ready</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {readyJobs.slice(0, 10).map((job) => (
              <a
                key={job.id}
                href={`/api/jobs/${job.id}/invoice`}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] hover:border-[var(--accent)]/40"
              >
                {job.jobNumber}
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-lg border border-[var(--line)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel-strong)] text-xs uppercase tracking-wide text-[var(--ink-muted)]">
            <tr>
              <th className="px-3 py-2">Invoice</th>
              <th className="hidden px-3 py-2 md:table-cell">Job</th>
              <th className="px-3 py-2">Total</th>
              <th className="hidden px-3 py-2 md:table-cell">Paid</th>
              <th className="hidden px-3 py-2 lg:table-cell">Balance</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const balance = Math.max(0, inv.totalAmount - inv.paidAmount);
              const invoiceCurrency = normalizeCurrency(inv.currency, org.baseCurrency);
              return (
                <tr key={inv.id} className="border-t border-[var(--line)] align-top">
                  <td className="px-3 py-2">
                    <p className="mono font-bold text-[var(--ink)]">{inv.invoiceNumber}</p>
                    <p className="text-xs text-[var(--ink-muted)]">{inv.issuedAt.toLocaleDateString()}</p>
                  </td>
                  <td className="hidden px-3 py-2 md:table-cell">
                    <Link className="mono font-bold text-[var(--ink)] transition-colors hover:text-[var(--accent)]" href={`/jobs/${inv.job.id}`}>
                      {inv.job.jobNumber}
                    </Link>
                    <p className="text-xs text-[var(--ink-muted)]">{inv.job.client.fullName}</p>
                  </td>
                  <td className="px-3 py-2">{formatMoney(inv.totalAmount, invoiceCurrency)}</td>
                  <td className="hidden px-3 py-2 md:table-cell text-[var(--ink-muted)]">
                    {inv.paidAmount > 0 ? formatMoney(inv.paidAmount, invoiceCurrency) : "-"}
                  </td>
                  <td className="hidden px-3 py-2 lg:table-cell text-[var(--ink-muted)]">
                    {balance > 0 ? formatMoney(balance, invoiceCurrency) : "0"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
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
                            <Link href={`/jobs/${inv.job.id}`} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--panel-strong)]">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
                              View
                            </Link>
                            {canGenerateInvoiceForStatus(inv.job.status) ? (
                              <a href={`/api/jobs/${inv.job.id}/invoice`} target="_blank" rel="noreferrer" className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--panel-strong)]">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                                Download PDF
                              </a>
                            ) : (
                              <span className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--ink-muted)]">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                                Download PDF
                              </span>
                            )}
                          </div>
                        </div>
                      </details>

                      {balance > 0 ? (
                        <form action={addPaymentAction} className="flex items-center gap-1">
                          <input type="hidden" name="invoiceId" value={inv.id} />
                          <input
                            name="amount"
                            inputMode="decimal"
                            placeholder="Amt"
                            className="w-24 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1 text-xs outline-none focus:border-[var(--accent)]/50"
                          />
                          <select
                            name="currency"
                            defaultValue={invoiceCurrency}
                            className="rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1 text-xs outline-none focus:border-[var(--accent)]/50"
                            title={invoiceCurrency === org.baseCurrency ? "" : "If not base currency, also provide exchange rate"}
                          >
                            {org.supportedCurrencies.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                          <input
                            name="exchangeRateToBase"
                            inputMode="decimal"
                            placeholder={invoiceCurrency === org.baseCurrency ? "Rate" : `1 ${invoiceCurrency} = ? ${org.baseCurrency}`}
                            className="w-36 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1 text-xs outline-none focus:border-[var(--accent)]/50"
                            title={`Only required when currency differs from ${org.baseCurrency}`}
                          />
                          <select
                            name="method"
                            defaultValue="CASH"
                            className="rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1 text-xs outline-none focus:border-[var(--accent)]/50"
                          >
                            {PAYMENT_METHODS.map((m) => (
                              <option key={m} value={m}>{m.replaceAll("_", " ")}</option>
                            ))}
                          </select>
                          <input
                            name="reference"
                            placeholder="Ref"
                            className="hidden w-28 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1 text-xs outline-none focus:border-[var(--accent)]/50 md:block"
                          />
                          <button className="btn-premium rounded-md px-2.5 py-1 text-xs text-white">Add</button>
                        </form>
                      ) : (
                        <span className="text-xs font-semibold text-emerald-600">Paid</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {invoices.length === 0 ? (
              <tr className="border-t border-[var(--line)]">
                <td className="px-3 py-6 text-sm text-[var(--ink-muted)]" colSpan={6}>
                  No invoices yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/jobs" className="btn-premium-secondary rounded-lg px-3 py-2 text-sm">
          Jobs
        </Link>
        <Link href="/payout-followups" className="btn-premium-secondary rounded-lg px-3 py-2 text-sm">
          Payments
        </Link>
      </div>
    </section>
  );
}
