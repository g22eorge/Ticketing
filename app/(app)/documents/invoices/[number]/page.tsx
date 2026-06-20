import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Prisma, InvoiceStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { CopyButton } from "@/components/shared/CopyButton";
import { StatusBadge, type BadgeVariant } from "@/components/ui/StatusBadge";
import { formatMoney } from "@/lib/currency";
import { formatEATDate, formatEATDateTime } from "@/lib/date-eat";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";

export const dynamic = "force-dynamic";

function statusVariant(status: string): BadgeVariant {
  if (status === "PAID") return "success";
  if (status === "VOID") return "neutral";
  if (status === "DRAFT") return "warning";
  return "default";
}

const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  PAID: "Paid",
  VOID: "Void",
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = await params;
  const documentRef = decodeURIComponent(number);
  const { user, orgId } = await requireOrgSession();

  if (!can.createInvoices(user) && !can.viewFinancials(user) && !can.viewAllSales(user)) {
    redirect("/dashboard");
  }

  const where: Prisma.InvoiceWhereInput = {
    orgId,
    OR: [
      { id: documentRef },
      { invoiceNumber: documentRef },
    ],
  };

  const invoice = await prisma.invoice.findFirst({
    where,
    include: {
      client: { select: { id: true, fullName: true, phone: true, email: true, organization: true, address: true } },
      job: { select: { id: true, jobNumber: true, brand: true, model: true } },
      ticket: { select: { id: true, ticketNumber: true, subject: true } },
      lines: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { receivedAt: "desc" }, take: 5 },
    },
  });

  if (!invoice) notFound();

  const invoiceId = invoice.id;
  const invoiceNumber = invoice.invoiceNumber;
  const pdfHref = `/api/invoices/${invoice.id}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const pdfUrl = `${appUrl}${pdfHref}`;
  const currency = invoice.currency;
  const subtotal = invoice.lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const discountTotal = invoice.lines.reduce((sum, line) => sum + line.discountAmount, 0);
  const taxTotal = invoice.lines.reduce((sum, line) => sum + line.taxAmount, 0);
  const balanceDue = Math.max(0, invoice.totalAmount - invoice.paidAmount);
  const sourceLabel = invoice.ticket?.ticketNumber ?? invoice.job?.jobNumber ?? "Standalone";
  const canEditInvoice = can.createInvoices(user) && invoice.status === "ISSUED";

  async function updateStatusAction(formData: FormData) {
    "use server";
    const newStatus = String(formData.get("status") ?? "");
    if (!["DRAFT", "ISSUED", "PAID", "VOID"].includes(newStatus)) return;
    try {
      await prisma.invoice.update({
        where: { id: invoiceId, orgId },
        data: { status: newStatus as InvoiceStatus },
      });
      revalidatePath(`/documents/invoices/${encodeURIComponent(invoiceNumber)}`);
      revalidatePath("/documents/invoices");
    } catch { /* fail silently */ }
  }

  async function updateNotesAction(formData: FormData) {
    "use server";
    const notes = String(formData.get("notes") ?? "").trim();
    try {
      await prisma.invoice.update({
        where: { id: invoiceId, orgId },
        data: { notes: notes || null },
      });
      revalidatePath(`/documents/invoices/${encodeURIComponent(invoiceNumber)}`);
    } catch { /* fail silently */ }
  }

  async function updateLineAction(formData: FormData) {
    "use server";
    const lineId = String(formData.get("lineId") ?? "");
    const description = String(formData.get("description") ?? "").trim();
    const quantity = Number(formData.get("quantity") ?? 1);
    const unitPrice = Number(formData.get("unitPrice") ?? 0);
    if (!description || !lineId) return;
    const lineTotal = quantity * unitPrice;
    try {
      const line = await prisma.invoiceLine.findUnique({ where: { id: lineId } });
      if (!line) return;
      const taxAmount = line.taxAmount;
      await prisma.invoiceLine.update({
        where: { id: lineId },
        data: { description, quantity, unitPrice, lineTotal, taxAmount },
      });
      revalidatePath(`/documents/invoices/${encodeURIComponent(invoiceNumber)}`);
    } catch { /* fail silently */ }
  }

  const isEditable = invoice.status === "ISSUED";

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Documents · Invoice</p>
            <h1 className="mt-1 font-mono text-lg font-bold text-[var(--ink)]">{invoice.invoiceNumber}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[var(--ink-muted)]">
              <span>{invoice.client?.fullName ?? "Client"}</span>
              <span className="opacity-40">·</span>
              <span>{invoice.subject || sourceLabel}</span>
              <span className="opacity-40">·</span>
              <span>{formatEATDate(invoice.issuedAt)}</span>
            </div>
          </div>
          <StatusBadge label={invoice.status} variant={statusVariant(invoice.status)} />
        </div>
      </div>

      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Document Actions</p>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">Open details by invoice number. Download stays separate.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={pdfHref}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-2 text-[12px] font-bold text-[var(--ink)] transition hover:border-[var(--accent)]/40"
            >
              Download PDF
            </a>
            <CopyButton text={pdfUrl} label="Copy PDF link" title="Copy invoice PDF link" />
            {canEditInvoice && (
              <form action={updateStatusAction} className="flex items-center gap-1">
                <select
                  name="status"
                  defaultValue={invoice.status}
                  className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px] font-medium text-[var(--ink)] outline-none"
                >
                  <option value="ISSUED">Confirm</option>
                  <option value="PAID">Mark Paid</option>
                  <option value="VOID">Void</option>
                </select>
                <button type="submit" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px] font-bold text-[var(--ink)] transition hover:border-[var(--accent)]/40">
                  Go
                </button>
              </form>
            )}
            {!canEditInvoice && invoice.status === "DRAFT" && (
              <form action={updateStatusAction}>
                <input type="hidden" name="status" value="ISSUED" />
                <button type="submit" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-[12px] font-bold text-emerald-700 transition hover:bg-emerald-500/20 dark:text-emerald-400">
                  Confirm Invoice
                </button>
              </form>
            )}
            <Link
              href="/documents/invoices"
              className="rounded-lg border border-[var(--line)] px-4 py-2 text-[12px] font-bold text-[var(--ink-muted)] transition hover:text-[var(--ink)]"
            >
              Back to invoices
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            <div className="border-b border-[var(--line)] px-4 py-3">
              <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Line Items</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead className="bg-[var(--panel-strong)]/50 text-left text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">
                  <tr className="border-b border-[var(--line)]">
                    <th className="px-4 py-2.5">Description</th>
                    <th className="w-16 px-4 py-2.5 text-right">Qty</th>
                    <th className="w-28 px-4 py-2.5 text-right">Unit Price</th>
                    <th className="w-28 px-4 py-2.5 text-right">Tax</th>
                    <th className="w-28 px-4 py-2.5 text-right">Total</th>
                    {isEditable ? <th className="w-24 px-4 py-2.5 text-right">Actions</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {invoice.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="px-4 py-3 text-[var(--ink)]">
                        {isEditable ? (
                          <input form={`inv-item-${line.id}`} name="description" defaultValue={line.description} className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50" />
                        ) : line.description}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--ink-muted)]">
                        {isEditable ? (
                          <input form={`inv-item-${line.id}`} name="quantity" type="number" min="1" step="any" defaultValue={line.quantity} className="w-20 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-right text-sm outline-none focus:border-[var(--accent)]/50" />
                        ) : line.quantity}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--ink-muted)]">
                        {isEditable ? (
                          <input form={`inv-item-${line.id}`} name="unitPrice" type="number" min="0" step="any" defaultValue={line.unitPrice} className="w-28 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-right text-sm outline-none focus:border-[var(--accent)]/50" />
                        ) : formatMoney(line.unitPrice, currency)}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--ink-muted)]">
                        {line.taxAmount > 0 ? formatMoney(line.taxAmount, currency) : <span className="opacity-40">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-[var(--ink)]">{formatMoney(line.lineTotal + line.taxAmount, currency)}</td>
                      {isEditable ? (
                        <td className="px-4 py-3 text-right">
                          <form id={`inv-item-${line.id}`} action={updateLineAction} className="inline">
                            <input type="hidden" name="lineId" value={line.id} />
                            <button type="submit" className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-[12px] font-semibold text-[var(--ink)]">Save</button>
                          </form>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                  {invoice.lines.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-sm text-[var(--ink-muted)]">No invoice lines</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="border-t border-[var(--line)] px-4 py-3">
              <div className="flex flex-col items-end gap-1 text-[13px]">
                <div className="flex gap-4">
                  <span className="text-[var(--ink-muted)]">Subtotal</span>
                  <span className="font-medium text-[var(--ink)]">{formatMoney(subtotal, currency)}</span>
                </div>
                {discountTotal > 0 ? (
                  <div className="flex gap-4">
                    <span className="text-[var(--ink-muted)]">Discount</span>
                    <span className="font-medium text-red-600">-{formatMoney(discountTotal, currency)}</span>
                  </div>
                ) : null}
                {taxTotal > 0 ? (
                  <div className="flex gap-4">
                    <span className="text-[var(--ink-muted)]">Tax</span>
                    <span className="font-medium text-[var(--ink)]">{formatMoney(taxTotal, currency)}</span>
                  </div>
                ) : null}
                <div className="flex gap-4 border-t border-[var(--line)] pt-2">
                  <span className="font-semibold text-[var(--ink)]">Total</span>
                  <span className="text-[15px] font-bold text-[var(--ink)]">{formatMoney(invoice.totalAmount, currency)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes — always editable */}
          <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
            <details className="group">
              <summary className="cursor-pointer list-none text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)] [&::-webkit-details-marker]:hidden">
                Notes {invoice.notes ? <span className="ml-1 opacity-50">— click to edit</span> : <span className="ml-1 font-normal normal-case tracking-normal opacity-60">— add notes</span>}
              </summary>
              <form action={updateNotesAction} className="mt-3 space-y-2">
                <textarea
                  name="notes"
                  rows={3}
                  defaultValue={invoice.notes ?? ""}
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm font-normal text-[var(--ink)] outline-none focus:border-[var(--accent)]/50 resize-none"
                  placeholder="Add notes..."
                />
                <button type="submit" className="btn-premium-secondary rounded-lg px-4 py-2 text-[12px] font-semibold">
                  Save Notes
                </button>
              </form>
            </details>
            {invoice.notes ? (
              <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--ink)]">{invoice.notes}</p>
            ) : null}
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-4">
            <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Client</p>
            <p className="text-sm font-bold text-[var(--ink)]">{invoice.client?.fullName ?? "Client"}</p>
            <div className="mt-1 space-y-1 text-xs text-[var(--ink-muted)]">
              {invoice.client?.organization ? <p>{invoice.client.organization}</p> : null}
              {invoice.client?.phone ? <p>{invoice.client.phone}</p> : null}
              {invoice.client?.email ? <p>{invoice.client.email}</p> : null}
              {invoice.client?.address ? <p>{invoice.client.address}</p> : null}
            </div>
            {invoice.client ? (
              <Link href={`/clients/${invoice.client.id}`} className="mt-3 inline-flex text-xs font-bold text-[var(--accent)] hover:underline">
                Open client
              </Link>
            ) : null}
          </div>

          <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-4">
            <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Payment</p>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--ink-muted)]">Paid</dt>
                <dd className="font-semibold text-[var(--ink)]">{formatMoney(invoice.paidAmount, currency)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--ink-muted)]">Balance</dt>
                <dd className="font-semibold text-[var(--ink)]">{formatMoney(balanceDue, currency)}</dd>
              </div>
              {invoice.dueDate ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--ink-muted)]">Due</dt>
                  <dd className="font-semibold text-[var(--ink)]">{formatEATDate(invoice.dueDate)}</dd>
                </div>
              ) : null}
            </dl>
            {invoice.ticket && invoice.status !== "PAID" ? (
              <Link
                href={`/tickets/${invoice.ticket.id}/create-receipt`}
                className="btn-premium mt-4 inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-xs font-bold"
              >
                Record Payment
              </Link>
            ) : null}
          </div>

          <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-4">
            <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Details</p>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-[var(--ink-muted)]">Issued</dt>
                <dd className="font-medium text-[var(--ink)]">{formatEATDateTime(invoice.issuedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--ink-muted)]">Type</dt>
                <dd className="font-medium text-[var(--ink)]">{invoice.invoiceType}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--ink-muted)]">Source</dt>
                <dd className="font-medium text-[var(--ink)]">
                  {invoice.ticket ? (
                    <Link href={`/tickets/${invoice.ticket.id}`} className="text-[var(--accent)] hover:underline">
                      {invoice.ticket.ticketNumber}
                    </Link>
                  ) : invoice.job ? (
                    <Link href={`/jobs/${invoice.job.id}`} className="text-[var(--accent)] hover:underline">
                      {invoice.job.jobNumber}
                    </Link>
                  ) : (
                    "Standalone"
                  )}
                </dd>
              </div>
            </dl>
            {invoice.payments.length > 0 ? (
              <div className="mt-3 border-t border-[var(--line)] pt-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Recent payments</p>
                <div className="space-y-2">
                  {invoice.payments.map((payment) => (
                    <div key={payment.id} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="font-semibold text-[var(--ink)]">{formatMoney(payment.amount, payment.currency)}</span>
                        <span className="text-[var(--ink-muted)]">{formatEATDate(payment.receivedAt)}</span>
                      </div>
                      <p className="mt-1 text-[var(--ink-muted)]">{payment.method}{payment.reference ? ` · ${payment.reference}` : ""}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
