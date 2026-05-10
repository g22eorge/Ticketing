import Link from "next/link";
import { redirect } from "next/navigation";

import { formatMoney, normalizeCurrency } from "@/lib/currency";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";

export default async function ReceiptsPage() {
  const { user, orgId, org } = await requireOrgSession();
  if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role))) {
    redirect("/dashboard");
  }

  const payments = await prisma.payment.findMany({
    where: { orgId },
    orderBy: { receivedAt: "desc" },
    take: 120,
    select: {
      id: true,
      amount: true,
      currency: true,
      method: true,
      reference: true,
      receivedAt: true,
      sale: { select: { id: true, saleNumber: true } },
      invoice: { select: { id: true, invoiceNumber: true, job: { select: { id: true, jobNumber: true } } } },
    },
  });

  return (
    <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">Documents</p>
      <h1 className="mt-1 text-lg font-semibold text-[var(--ink)]">Receipts</h1>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        Each receipt corresponds to a single payment (repairs and sales). Download PDFs per payment.
      </p>

      <div className="mt-4 overflow-hidden rounded-lg border border-[var(--line)]">
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
                    <a
                      href={`/api/payments/${p.id}/receipt`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-premium-secondary inline-flex rounded-md px-2.5 py-1.5 text-xs"
                    >
                      Download
                    </a>
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

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/pos" className="btn-premium-secondary rounded-lg px-3 py-2 text-sm">Open POS</Link>
        <Link href="/documents/invoices" className="btn-premium-secondary rounded-lg px-3 py-2 text-sm">Open Invoices</Link>
      </div>
    </section>
  );
}
