import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { PaymentMethod } from "@prisma/client";

import { formatMoney } from "@/lib/currency";
import { canGenerateInvoiceForStatus } from "@/lib/documents";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";

const PAYMENT_METHODS = Object.values(PaymentMethod);

export default async function InvoicesPage() {
  const { user, orgId } = await requireOrgSession();
  if (!("ADMIN" === user.role || "OPS" === user.role || can.approveInvoices(user))) {
    redirect("/dashboard");
  }

  async function addPaymentAction(formData: FormData) {
    "use server";
    const { user, orgId, session } = await requireOrgSession();
    if (!("ADMIN" === user.role || "OPS" === user.role || can.approveInvoices(user))) return;

    const invoiceId = String(formData.get("invoiceId") ?? "").trim();
    const rawAmount = String(formData.get("amount") ?? "").trim();
    const method = String(formData.get("method") ?? "CASH").trim();
    const reference = String(formData.get("reference") ?? "").trim();
    if (!invoiceId) return;

    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;

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
          amount,
          method: safeMethod,
          reference: reference || null,
          createdById: session.user.id,
        },
      });

      const agg = await tx.payment.aggregate({
        where: { invoiceId: invoice.id, orgId },
        _sum: { amount: true },
      });
      const paidAmount = agg._sum.amount ?? 0;
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

  const [invoices, readyJobs] = await Promise.all([
    prisma.invoice.findMany({
      where: { orgId },
      orderBy: { issuedAt: "desc" },
      take: 100,
      select: {
        id: true,
        invoiceNumber: true,
        issuedAt: true,
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
    }),
    prisma.job.findMany({
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
    }),
  ]);

  return (
    <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">Documents</p>
      <h1 className="mt-1 text-lg font-semibold text-[var(--ink)]">Invoices</h1>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">Generate invoices and record partial payments.</p>

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
                  <td className="px-3 py-2">{formatMoney(inv.totalAmount)}</td>
                  <td className="hidden px-3 py-2 md:table-cell text-[var(--ink-muted)]">
                    {inv.paidAmount > 0 ? formatMoney(inv.paidAmount) : "-"}
                  </td>
                  <td className="hidden px-3 py-2 lg:table-cell text-[var(--ink-muted)]">
                    {balance > 0 ? formatMoney(balance) : "0"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {canGenerateInvoiceForStatus(inv.job.status) ? (
                        <a
                          href={`/api/jobs/${inv.job.id}/invoice`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-premium-secondary inline-flex rounded-md px-2.5 py-1.5 text-xs"
                        >
                          PDF
                        </a>
                      ) : null}

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
