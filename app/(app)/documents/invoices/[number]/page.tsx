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

  const isEditable = invoice.status === "DRAFT" || invoice.status === "ISSUED";

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
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-2 text-[12px] font-bold text-[var(--ink)] transition hover:border-[var(--accent)]/40"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                  <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
                  <path d="M3.5 12.75a.75.75 0 0 1-1.5 0v-6A2.75 2.75 0 0 1 4.75 3h10.5A2.75 2.75 0 0 1 18 6.75v6a.75.75 0 0 1-1.5 0v-6a1.25 1.25 0 0 0-1.25-1.25H4.75a1.25 1.25 0 0 0-1.25 1.25v6Z" />
                </svg> Download PDF
            </a>
            <CopyButton text={pdfUrl} label="Copy PDF link" title="Copy invoice PDF link" />
            {invoice.status === "DRAFT" && can.createInvoices(user) && (
              <form action={updateStatusAction} className="inline-flex items-center gap-1">
                <input type="hidden" name="status" value="ISSUED" />
                <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-[12px] font-bold text-emerald-700 transition hover:bg-emerald-500/20 dark:text-emerald-400">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                    <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                  </svg> Confirm Invoice
                </button>
              </form>
            )}
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
                <button type="submit" className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px] font-bold text-[var(--ink)] transition hover:border-[var(--accent)]/40">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden="true">
                    <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
                  </svg> Go
                </button>
              </form>
            )}
            <Link
              href="/documents/invoices"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-4 py-2 text-[12px] font-bold text-[var(--ink-muted)] transition hover:text-[var(--ink)]"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 0 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
              </svg> Back to invoices
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Line Items</p>
              <span className="rounded-full bg-[var(--panel-strong)] px-2.5 py-0.5 text-[12px] font-bold text-[var(--ink-muted)]">
                {invoice.lines.length} {invoice.lines.length === 1 ? "item" : "items"}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--line)] bg-[var(--panel-strong)]/60 text-left text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">
                    <th className="w-10 px-4 py-2.5">#</th>
                    <th className="px-3 py-2.5">Description</th>
                    <th className="w-16 px-3 py-2.5 text-right">Qty</th>
                    <th className="w-28 px-3 py-2.5 text-right">Unit Price</th>
                    {discountTotal > 0 ? <th className="w-20 px-3 py-2.5 text-right">Disc %</th> : null}
                    <th className="w-32 px-3 py-2.5 text-right">Total</th>
                    {isEditable ? <th className="w-20 px-3 py-2.5 text-right">Action</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {invoice.lines.length === 0 ? (
                    <tr>
                      <td colSpan={isEditable ? 7 : 6} className="px-4 py-8 text-center text-sm text-[var(--ink-muted)]">No line items</td>
                    </tr>
                  ) : invoice.lines.map((line, i) => (
                    <tr key={line.id} className="group hover:bg-[var(--panel-strong)]/30 transition-colors">
                      <td className="px-4 py-2.5 text-[12px] text-[var(--ink-muted)]">{i + 1}</td>
                      <td className="px-3 py-2.5 text-[var(--ink)]">
                        {isEditable ? (
                          <input form={`inv-item-${line.id}`} name="description" defaultValue={line.description} className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50" />
                        ) : <span className="font-medium">{line.description}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[var(--ink-muted)]">
                        {isEditable ? (
                          <input form={`inv-item-${line.id}`} name="quantity" type="number" min="1" step="any" defaultValue={line.quantity} className="w-16 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-right text-sm outline-none focus:border-[var(--accent)]/50 tabular-nums" />
                        ) : line.quantity}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[var(--ink-muted)]">
                        {isEditable ? (
                          <input form={`inv-item-${line.id}`} name="unitPrice" type="number" min="0" step="any" defaultValue={line.unitPrice} className="w-28 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-right text-sm outline-none focus:border-[var(--accent)]/50 tabular-nums" />
                        ) : formatMoney(line.unitPrice, currency)}
                      </td>
                      {discountTotal > 0 ? (
                        <td className="px-3 py-2.5 text-right tabular-nums text-[var(--ink-muted)]">
                          {line.discountAmount > 0 ? `${line.discountAmount}%` : <span className="opacity-30">—</span>}
                        </td>
                      ) : null}
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[var(--ink)]">{formatMoney(line.lineTotal + line.taxAmount, currency)}</td>
                      {isEditable ? (
                        <td className="px-3 py-2.5 text-right">
                          <form id={`inv-item-${line.id}`} action={updateLineAction} className="inline">
                            <input type="hidden" name="lineId" value={line.id} />
                            <button type="submit" className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">
                              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden="true">
                                  <path d="M5 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5Zm0 2h10v10H5V5Z" />
                                  <path d="M7 7h6v1H7V7Zm0 3h6v1H7v-1Z" />
                                </svg> Save
                            </button>
                          </form>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-[var(--line)] bg-[var(--panel-strong)]/30 px-4 py-3">
              <div className="flex flex-col items-end gap-1.5 text-[13px]">
                <div className="flex w-full max-w-[280px] items-center justify-between gap-4">
                  <span className="text-[var(--ink-muted)]">Subtotal</span>
                  <span className="tabular-nums font-medium text-[var(--ink)]">{formatMoney(subtotal, currency)}</span>
                </div>
                {discountTotal > 0 ? (
                  <div className="flex w-full max-w-[280px] items-center justify-between gap-4">
                    <span className="text-[var(--ink-muted)]">Discount</span>
                    <span className="tabular-nums font-medium text-red-500">-{formatMoney(discountTotal, currency)}</span>
                  </div>
                ) : null}
                {taxTotal > 0 ? (
                  <div className="flex w-full max-w-[280px] items-center justify-between gap-4">
                    <span className="text-[var(--ink-muted)]">Tax</span>
                    <span className="tabular-nums font-medium text-[var(--ink)]">{formatMoney(taxTotal, currency)}</span>
                  </div>
                ) : null}
                <div className="flex w-full max-w-[280px] items-center justify-between gap-4 border-t border-[var(--line)] pt-2">
                  <span className="font-semibold text-[var(--ink)]">Total Due</span>
                  <span className="tabular-nums text-[17px] font-black text-[var(--ink)]">{formatMoney(invoice.totalAmount, currency)}</span>
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
                <button type="submit" className="btn-premium-secondary inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-semibold">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                    <path d="M5 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5Zm0 2h10v10H5V5Z" />
                    <path d="M7 7h6v1H7V7Zm0 3h6v1H7v-1Z" />
                  </svg> Save Notes
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
            <div className="mb-3 flex items-center gap-2">
              <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Client</p>
            </div>
            <p className="text-sm font-bold text-[var(--ink)]">{invoice.client?.fullName ?? "—"}</p>
            {invoice.client?.organization ? (
              <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{invoice.client.organization}</p>
            ) : null}
            <div className="mt-2.5 space-y-1 text-xs text-[var(--ink-muted)]">
              {invoice.client?.phone ? <p className="tabular-nums">{invoice.client.phone}</p> : null}
              {invoice.client?.email ? <p>{invoice.client.email}</p> : null}
              {invoice.client?.address ? <p className="mt-1 leading-relaxed">{invoice.client.address}</p> : null}
            </div>
            {invoice.client ? (
              <Link href={`/clients/${invoice.client.id}`} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:underline">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden="true">
                  <path fillRule="evenodd" d="M4.5 5.5a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5v-3.5a.5.5 0 0 0-.5-.5H5Zm7 1.5a.5.5 0 0 1 .5-.5H14a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V9h-2.5a.5.5 0 0 1-.5-.5h-1.5a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5h3.5Z" clipRule="evenodd" />
                </svg> Open client
              </Link>
            ) : null}
          </div>

          <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-4">
            <div className="mb-3 flex items-center gap-2">
              <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Payment</p>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[var(--ink-muted)]">Paid</dt>
                <dd className="tabular-nums font-semibold text-emerald-600">{formatMoney(invoice.paidAmount, currency)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[var(--ink-muted)]">Balance</dt>
                <dd className="tabular-nums font-semibold text-[var(--ink)]">{formatMoney(balanceDue, currency)}</dd>
              </div>
              {invoice.dueDate ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[var(--ink-muted)]">Due</dt>
                  <dd className="tabular-nums font-medium text-[var(--ink)]">{formatEATDate(invoice.dueDate)}</dd>
                </div>
              ) : null}
            </dl>
            {invoice.ticket && invoice.status !== "PAID" ? (
              <Link
                href={`/tickets/${invoice.ticket.id}/create-receipt`}
                className="btn-premium mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-xs font-bold"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.732 5.968a.75.75 0 0 1 1.036.036l.036.036a.75.75 0 0 1-1.072 1.048 1.25 1.25 0 1 0 1.71 1.784.75.75 0 1 1 1.06 1.061 2.75 2.75 0 1 1-3.89-3.89.75.75 0 0 1 .12-.075Zm2.168 7.064a.75.75 0 0 1-1.036-.036l-.036-.036a.75.75 0 0 1 1.072-1.048 1.25 1.25 0 1 0-1.71-1.784.75.75 0 1 1-1.06-1.061 2.75 2.75 0 1 1 3.89 3.89.75.75 0 0 1-.12.075Z" clipRule="evenodd" />
                </svg> Record Payment
              </Link>
            ) : null}
          </div>

          <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-4">
            <div className="mb-3 flex items-center gap-2">
              <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Details</p>
            </div>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-[var(--ink-muted)]">Issued</dt>
                <dd className="tabular-nums font-medium text-[var(--ink)]">{formatEATDateTime(invoice.issuedAt)}</dd>
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
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Recent payments</p>
                <div className="space-y-1.5">
                  {invoice.payments.map((payment) => (
                    <div key={payment.id} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)]/60 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="tabular-nums text-xs font-semibold text-[var(--ink)]">{formatMoney(payment.amount, payment.currency)}</span>
                        <span className="text-[11px] text-[var(--ink-muted)]">{formatEATDate(payment.receivedAt)}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">{payment.method}{payment.reference ? ` · ${payment.reference}` : ""}</p>
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
