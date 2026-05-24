import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Prisma, QuotationStatus } from "@prisma/client";

import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { formatEATDate, formatEATDateTime } from "@/lib/date-eat";
import { formatMoney } from "@/lib/currency";
import { updateQuotationStatus } from "../../actions";

const QUOTATION_STATUS_COLORS: Record<QuotationStatus, string> = {
  DRAFT: "border-slate-200 bg-slate-50 text-slate-600",
  SENT: "border-blue-200 bg-blue-50 text-blue-700",
  ACCEPTED: "border-green-200 bg-green-50 text-green-700",
  REJECTED: "border-red-200 bg-red-50 text-red-600",
  EXPIRED: "border-slate-200 bg-slate-100 text-slate-500",
};

export default async function QuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, orgId } = await requireOrgSession();

  if (!can.createQuotations(user) && !can.viewAllSales(user)) {
    redirect("/dashboard");
  }

  const quotationWhere: Prisma.QuotationWhereInput = {
    id,
    orgId,
    ...(!can.viewAllSales(user) ? { createdById: user.id } : {}),
  };

  const quotation = await prisma.quotation.findFirst({
    where: quotationWhere,
    include: {
      lead: { select: { id: true, fullName: true } },
      client: { select: { id: true, fullName: true } },
      job: { select: { id: true, jobNumber: true } },
      createdBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      items: { orderBy: { createdAt: "asc" } },
    },
  }).catch(() => null);

  if (!quotation) notFound();

  const currency = quotation.currency;
  const canSend = can.createQuotations(user) && quotation.status === "DRAFT";
  const canAccept = can.approveQuotations(user) && quotation.status === "SENT";
  const canReject = can.createQuotations(user) && quotation.status === "SENT";

  async function sendAction() {
    "use server";
    try {
      await updateQuotationStatus(id, "SENT");
    } catch {
      redirect(`/sales/quotations/${id}`);
    }
    redirect(`/sales/quotations/${id}`);
  }

  async function acceptAction() {
    "use server";
    try {
      await updateQuotationStatus(id, "ACCEPTED");
    } catch {
      redirect(`/sales/quotations/${id}`);
    }
    redirect(`/sales/quotations/${id}`);
  }

  async function rejectAction() {
    "use server";
    try {
      await updateQuotationStatus(id, "REJECTED");
    } catch {
      redirect(`/sales/quotations/${id}`);
    }
    redirect(`/sales/quotations/${id}`);
  }

  const recipientName = quotation.client?.fullName ?? quotation.lead?.fullName ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1">
              <Link href="/sales?tab=quotations" className="text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:underline">
                ← Quotations
              </Link>
            </div>
            <h1 className="font-mono text-lg font-bold text-[var(--ink)]">{quotation.quoteNumber}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[var(--ink-muted)]">
              {recipientName ? <span>For: {recipientName}</span> : null}
              {quotation.job ? (
                <>
                  {recipientName ? <span className="opacity-40">·</span> : null}
                  <span>Job: <Link href={`/jobs/${quotation.job.id}`} className="text-[var(--accent)] hover:underline">{quotation.job.jobNumber}</Link></span>
                </>
              ) : null}
              <span className="opacity-40">·</span>
              <span>By {quotation.createdBy?.name ?? "Unknown"}</span>
            </div>
          </div>
          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold ${QUOTATION_STATUS_COLORS[quotation.status]}`}>
            {quotation.status}
          </span>
        </div>
      </div>

      {canSend || canAccept || canReject ? (
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Actions</p>
          <div className="flex flex-wrap gap-2">
            {canSend ? (
              <form action={sendAction}>
                <button
                  type="submit"
                  className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)] px-4 py-2 text-[12px] font-bold text-white shadow-sm transition hover:bg-[var(--accent)]/90"
                >
                  Send to Client
                </button>
              </form>
            ) : null}
            {canAccept ? (
              <form action={acceptAction}>
                <button
                  type="submit"
                  className="rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-[12px] font-bold text-green-700 shadow-sm transition hover:bg-green-100"
                >
                  Mark Accepted
                </button>
              </form>
            ) : null}
            {canReject ? (
              <form action={rejectAction}>
                <button
                  type="submit"
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-[12px] font-bold text-red-600 shadow-sm transition hover:bg-red-100"
                >
                  Mark Rejected
                </button>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="border-b border-[var(--line)] px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Line Items</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead className="bg-[var(--panel-strong)]/50 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">
              <tr className="border-b border-[var(--line)]">
                <th className="px-4 py-2.5">Description</th>
                <th className="w-16 px-4 py-2.5 text-right">Qty</th>
                <th className="w-28 px-4 py-2.5 text-right">Unit Price</th>
                <th className="w-16 px-4 py-2.5 text-right">Disc %</th>
                <th className="w-28 px-4 py-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {quotation.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 text-[var(--ink)]">{item.description}</td>
                  <td className="px-4 py-3 text-right text-[var(--ink-muted)]">{item.quantity}</td>
                  <td className="px-4 py-3 text-right text-[var(--ink-muted)]">{formatMoney(item.unitPrice, currency)}</td>
                  <td className="px-4 py-3 text-right text-[var(--ink-muted)]">{item.discount > 0 ? `${item.discount}%` : <span className="opacity-40">—</span>}</td>
                  <td className="px-4 py-3 text-right font-medium text-[var(--ink)]">{formatMoney(item.lineTotal, currency)}</td>
                </tr>
              ))}
              {quotation.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-[var(--ink-muted)]">No items</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="border-t border-[var(--line)] px-4 py-3">
          <div className="flex flex-col items-end gap-1 text-[13px]">
            {quotation.discountAmount > 0 ? (
              <div className="flex gap-4">
                <span className="text-[var(--ink-muted)]">Discount</span>
                <span className="font-medium text-red-600">-{formatMoney(quotation.discountAmount, currency)}</span>
              </div>
            ) : null}
            {quotation.vatAmount > 0 ? (
              <div className="flex gap-4">
                <span className="text-[var(--ink-muted)]">VAT</span>
                <span className="font-medium text-[var(--ink)]">{formatMoney(quotation.vatAmount, currency)}</span>
              </div>
            ) : null}
            <div className="flex gap-4 border-t border-[var(--line)] pt-2">
              <span className="font-semibold text-[var(--ink)]">Total</span>
              <span className="text-[15px] font-bold text-[var(--ink)]">{formatMoney(quotation.totalAmount, currency)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-4">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Details</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] sm:grid-cols-3">
          <div>
            <dt className="text-[var(--ink-muted)]">Created</dt>
            <dd className="font-medium text-[var(--ink)]">{formatEATDateTime(quotation.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-[var(--ink-muted)]">Created by</dt>
            <dd className="font-medium text-[var(--ink)]">{quotation.createdBy?.name ?? "Unknown"}</dd>
          </div>
          {quotation.validUntil ? (
            <div>
              <dt className="text-[var(--ink-muted)]">Valid until</dt>
              <dd className="font-medium text-[var(--ink)]">{formatEATDate(quotation.validUntil)}</dd>
            </div>
          ) : null}
          {quotation.sentAt ? (
            <div>
              <dt className="text-[var(--ink-muted)]">Sent</dt>
              <dd className="font-medium text-[var(--ink)]">{formatEATDateTime(quotation.sentAt)}</dd>
            </div>
          ) : null}
          {quotation.acceptedAt ? (
            <div>
              <dt className="text-[var(--ink-muted)]">Accepted</dt>
              <dd className="font-medium text-green-700">{formatEATDateTime(quotation.acceptedAt)}</dd>
            </div>
          ) : null}
          {quotation.rejectedAt ? (
            <div>
              <dt className="text-[var(--ink-muted)]">Rejected</dt>
              <dd className="font-medium text-red-600">{formatEATDateTime(quotation.rejectedAt)}</dd>
            </div>
          ) : null}
          {quotation.approvedBy ? (
            <div>
              <dt className="text-[var(--ink-muted)]">Approved by</dt>
              <dd className="font-medium text-[var(--ink)]">{quotation.approvedBy.name}</dd>
            </div>
          ) : null}
          {quotation.lead ? (
            <div>
              <dt className="text-[var(--ink-muted)]">Lead</dt>
              <dd>
                <Link href={`/sales/leads/${quotation.lead.id}`} className="font-medium text-[var(--accent)] hover:underline">
                  {quotation.lead.fullName}
                </Link>
              </dd>
            </div>
          ) : null}
        </dl>
        {quotation.notes ? (
          <div className="mt-3 border-t border-[var(--line)] pt-3">
            <p className="mb-1 text-[11px] font-semibold text-[var(--ink-muted)]">Notes</p>
            <p className="whitespace-pre-wrap text-[12px] text-[var(--ink)]">{quotation.notes}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
