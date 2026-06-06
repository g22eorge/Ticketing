import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma, QuotationStatus } from "@prisma/client";

import { CopyButton } from "@/components/shared/CopyButton";
import { MenuActionButton, MenuActionLink, MenuSection, RowActionsMenu } from "@/components/shared/RowActionsMenu";
import { ensureInvoiceFromQuotation } from "@/lib/commercial/document-workflow";
import { writeSystemAuditEvent } from "@/lib/commercial/audit";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { formatEATDate, formatEATDateTime } from "@/lib/date-eat";
import { formatMoney } from "@/lib/currency";
import {
  addQuotationItem,
  deleteQuotation,
  removeQuotationItem,
  updateQuotationDetails,
  updateQuotationItem,
  updateQuotationStatus,
} from "../../actions";

const QUOTATION_STATUS_COLORS: Record<QuotationStatus, string> = {
  DRAFT:    "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",
  SENT:     "border-blue-400/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  ACCEPTED: "border-green-400/30 bg-green-500/10 text-green-700 dark:text-green-400",
  REJECTED: "border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-400",
  EXPIRED:  "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",
};

export default async function QuotationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ editError?: string }>;
}) {
  const { id } = await params;
  const filters = await searchParams;
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
      lead: { select: { id: true, fullName: true, phone: true, email: true, organization: true } },
      client: { select: { id: true, fullName: true, phone: true, email: true, organization: true } },
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
  const canEditDraft = can.createQuotations(user) && quotation.status === "DRAFT" && !quotation.convertedToInvoiceId;
  const canConvert = can.createInvoices(user) && quotation.status === "ACCEPTED" && !quotation.convertedToInvoiceId;
  const canOverrideDiscount = can.overrideDiscount(user);
  const recipientName = quotation.client?.fullName ?? quotation.lead?.fullName ?? null;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const pdfHref = `/api/quotations/${quotation.id}`;
  const pdfUrl = `${appUrl}${pdfHref}`;
  const recipientPhone = (quotation.client?.phone ?? quotation.lead?.phone ?? "").replace(/\D/g, "");
  const whatsappPhone = recipientPhone.startsWith("0") ? `256${recipientPhone.slice(1)}` : recipientPhone;
  const emailTo = quotation.client?.email ?? quotation.lead?.email ?? "";
  const shareText = `Hi ${recipientName ?? "there"}, quotation ${quotation.quoteNumber} is ready.\n\nTotal: ${formatMoney(quotation.totalAmount, currency)}\nPDF: ${pdfUrl}`;
  const mailSubject = encodeURIComponent(`Quotation ${quotation.quoteNumber}`);
  const mailBody = encodeURIComponent(`${shareText}\n\nRegards,\n${user.name}`);
  const whatsappText = encodeURIComponent(shareText);

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

  async function updateDetailsAction(formData: FormData) {
    "use server";
    try {
      await updateQuotationDetails(id, {
        validUntil: String(formData.get("validUntil") ?? ""),
        notes: String(formData.get("notes") ?? ""),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update quotation";
      redirect(`/sales/quotations/${id}?editError=${encodeURIComponent(msg)}`);
    }
    redirect(`/sales/quotations/${id}`);
  }

  async function addItemAction(formData: FormData) {
    "use server";
    try {
      await addQuotationItem(id, {
        description: String(formData.get("description") ?? ""),
        quantity: Number(formData.get("quantity") ?? 1),
        unitPrice: Number(formData.get("unitPrice") ?? 0),
        discount: Number(formData.get("discount") ?? 0),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to add item";
      redirect(`/sales/quotations/${id}?editError=${encodeURIComponent(msg)}`);
    }
    redirect(`/sales/quotations/${id}`);
  }

  async function updateItemAction(formData: FormData) {
    "use server";
    const itemId = String(formData.get("itemId") ?? "");
    try {
      await updateQuotationItem(itemId, {
        description: String(formData.get("description") ?? ""),
        quantity: Number(formData.get("quantity") ?? 1),
        unitPrice: Number(formData.get("unitPrice") ?? 0),
        discount: Number(formData.get("discount") ?? 0),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update item";
      redirect(`/sales/quotations/${id}?editError=${encodeURIComponent(msg)}`);
    }
    redirect(`/sales/quotations/${id}`);
  }

  async function removeItemAction(formData: FormData) {
    "use server";
    const itemId = String(formData.get("itemId") ?? "");
    try {
      await removeQuotationItem(itemId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to remove item";
      redirect(`/sales/quotations/${id}?editError=${encodeURIComponent(msg)}`);
    }
    redirect(`/sales/quotations/${id}`);
  }

  async function deleteAction() {
    "use server";
    try {
      await deleteQuotation(id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to delete quotation";
      redirect(`/sales/quotations/${id}?editError=${encodeURIComponent(msg)}`);
    }
  }

  async function convertToInvoiceAction() {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!can.createInvoices(user)) redirect(`/sales/quotations/${id}`);

    const quotation = await prisma.quotation.findFirst({
      where: {
        id,
        orgId,
        status: "ACCEPTED",
        convertedToInvoiceId: null,
        ...(!can.viewAllSales(user) && !can.approveInvoices(user) ? { createdById: user.id } : {}),
      },
      select: { id: true },
    });
    if (!quotation) redirect(`/sales/quotations/${id}`);

    const invoice = await prisma.$transaction(async (tx) => (
      ensureInvoiceFromQuotation(tx, { orgId, quotationId: id, currency: org.baseCurrency })
    ));
    if (invoice) {
      await writeSystemAuditEvent({
        orgId,
        actorUserId: user.id,
        entityType: "Invoice",
        entityId: invoice.id,
        action: "QUOTATION_CONVERTED_TO_INVOICE",
        summary: `Quotation converted to ${invoice.invoiceNumber}`,
      });
      revalidatePath("/documents/invoices");
      revalidatePath("/documents/quotations");
      redirect(`/documents/invoices?pay=${invoice.id}`);
    }
    redirect(`/sales/quotations/${id}`);
  }
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Sales · Quotation</p>
            <p className="font-mono text-[13px] font-bold text-[var(--ink)]">{quotation.quoteNumber}</p>
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
          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[13px] font-semibold ${QUOTATION_STATUS_COLORS[quotation.status]}`}>
            {quotation.status}
          </span>
        </div>
      </div>

      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
        <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Document Actions</p>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={pdfHref}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-2 text-[12px] font-bold text-[var(--ink)] transition hover:border-[var(--accent)]/40"
          >
            Download PDF
          </a>
          <RowActionsMenu label={`Quotation actions for ${quotation.quoteNumber}`}>
            <div className="py-1 text-left">
              <MenuActionLink href={pdfHref} external icon="quote" tone="accent">
                Download Quotation PDF
              </MenuActionLink>
              {quotation.job ? (
                <MenuActionLink href={`/jobs/${quotation.job.id}`} icon="job">
                  Open Job
                </MenuActionLink>
              ) : null}
            </div>
            <MenuSection label="Share" />
            <MenuActionLink href={`mailto:${emailTo}?subject=${mailSubject}&body=${mailBody}`} icon="open">
              Email quotation
            </MenuActionLink>
            {whatsappPhone ? (
              <MenuActionLink href={`https://wa.me/${whatsappPhone}?text=${whatsappText}`} external icon="whatsapp" tone="success">
                Send via WhatsApp
              </MenuActionLink>
            ) : null}
            <div className="px-3 py-1.5">
              <CopyButton
                text={pdfUrl}
                label="Copy PDF link"
                title="Copy quotation PDF link"
                className="flex w-full rounded-md px-2 py-1.5 text-left text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--panel-strong)]"
              />
            </div>
            {canSend ? (
              <>
                <MenuSection label="Status" />
                <div className="px-3 py-1.5">
              <form action={sendAction}>
                <MenuActionButton icon="save" tone="accent">
                  Send to Client
                </MenuActionButton>
              </form>
                </div>
              </>
            ) : null}
            {canAccept ? (
              <>
                {!canSend ? <MenuSection label="Status" /> : null}
                <div className="px-3 py-1.5">
              <form action={acceptAction}>
                <MenuActionButton icon="save" tone="success">
                  Mark Accepted
                </MenuActionButton>
              </form>
                </div>
              </>
            ) : null}
            {canReject ? (
              <div className="px-3 py-1.5">
              <form action={rejectAction}>
                <MenuActionButton icon="close" tone="danger">
                  Mark Rejected
                </MenuActionButton>
              </form>
              </div>
            ) : null}
            {canConvert ? (
              <>
                <MenuSection label="Convert" />
                <div className="px-3 py-1.5">
                  <form action={convertToInvoiceAction}>
                    <MenuActionButton icon="invoice" tone="accent">
                      Convert to Invoice
                    </MenuActionButton>
                  </form>
                </div>
              </>
            ) : quotation.convertedToInvoiceId ? (
              <>
                <MenuSection label="Invoice" />
                <MenuActionLink href="/documents/invoices" icon="invoice" tone="success">
                  Invoice Created
                </MenuActionLink>
              </>
            ) : null}
          </RowActionsMenu>
        </div>
      </div>

      {filters.editError ? (
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">{filters.editError}</div>
      ) : null}

      {canEditDraft ? (
        <details className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
          <summary className="cursor-pointer list-none text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)] [&::-webkit-details-marker]:hidden">
            Edit Quote
          </summary>
          <form action={updateDetailsAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-[12px] font-semibold text-[var(--ink-muted)]">
              Valid Until
              <input
                type="date"
                name="validUntil"
                defaultValue={quotation.validUntil ? quotation.validUntil.toISOString().slice(0, 10) : ""}
                className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm font-normal text-[var(--ink)] outline-none focus:border-[var(--accent)]/50"
              />
            </label>
            <label className="space-y-1 text-[12px] font-semibold text-[var(--ink-muted)] sm:col-span-2">
              Notes
              <textarea
                name="notes"
                rows={3}
                defaultValue={quotation.notes ?? ""}
                className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm font-normal text-[var(--ink)] outline-none focus:border-[var(--accent)]/50"
              />
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className="btn-premium rounded-lg px-4 py-2 text-[12px] font-bold">
                Save Quote
              </button>
            </div>
          </form>
          <form action={deleteAction} className="mt-3 border-t border-[var(--line)] pt-3">
            <button type="submit" className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-2 text-[12px] font-bold text-red-700 transition hover:bg-red-500/20 dark:text-red-400">
              Delete Draft
            </button>
          </form>
        </details>
      ) : null}

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
                <th className="w-16 px-4 py-2.5 text-right">Disc %</th>
                <th className="w-28 px-4 py-2.5 text-right">Total</th>
                {canEditDraft ? <th className="w-28 px-4 py-2.5 text-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {quotation.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 text-[var(--ink)]">
                    {canEditDraft ? (
                      <input form={`quote-item-${item.id}`} name="description" defaultValue={item.description} className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50" />
                    ) : item.description}
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--ink-muted)]">
                    {canEditDraft ? (
                      <input form={`quote-item-${item.id}`} name="quantity" type="number" min="1" step="any" defaultValue={item.quantity} className="w-20 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-right text-sm outline-none focus:border-[var(--accent)]/50" />
                    ) : item.quantity}
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--ink-muted)]">
                    {canEditDraft ? (
                      <input form={`quote-item-${item.id}`} name="unitPrice" type="number" min="0" step="any" defaultValue={item.unitPrice} className="w-28 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-right text-sm outline-none focus:border-[var(--accent)]/50" />
                    ) : formatMoney(item.unitPrice, currency)}
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--ink-muted)]">
                    {canEditDraft && canOverrideDiscount ? (
                      <input form={`quote-item-${item.id}`} name="discount" type="number" min="0" max="100" step="any" defaultValue={item.discount} className="w-20 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-right text-sm outline-none focus:border-[var(--accent)]/50" />
                    ) : item.discount > 0 ? `${item.discount}%` : <span className="opacity-40">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-[var(--ink)]">{formatMoney(item.lineTotal, currency)}</td>
                  {canEditDraft ? (
                    <td className="px-4 py-3 text-right">
                      <form id={`quote-item-${item.id}`} action={updateItemAction} className="inline">
                        <input type="hidden" name="itemId" value={item.id} />
                        {!canOverrideDiscount ? <input type="hidden" name="discount" value="0" /> : null}
                        <button type="submit" className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-[12px] font-semibold text-[var(--ink)]">Save</button>
                      </form>
                      <form action={removeItemAction} className="ml-1 inline">
                        <input type="hidden" name="itemId" value={item.id} />
                        <button type="submit" className="rounded-lg border border-red-400/30 px-2.5 py-1 text-[12px] font-semibold text-red-600">Remove</button>
                      </form>
                    </td>
                  ) : null}
                </tr>
              ))}
              {quotation.items.length === 0 ? (
                <tr>
                  <td colSpan={canEditDraft ? 6 : 5} className="px-4 py-6 text-center text-sm text-[var(--ink-muted)]">No items</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {canEditDraft ? (
          <form action={addItemAction} className="grid gap-2 border-t border-[var(--line)] px-4 py-3 md:grid-cols-[1fr_80px_120px_90px_auto]">
            <input name="description" placeholder="New item description" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50" />
            <input name="quantity" type="number" min="1" step="any" defaultValue="1" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50" />
            <input name="unitPrice" type="number" min="0" step="any" defaultValue="0" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50" />
            {canOverrideDiscount ? (
              <input name="discount" type="number" min="0" max="100" step="any" defaultValue="0" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50" />
            ) : <input type="hidden" name="discount" value="0" />}
            <button type="submit" className="btn-premium-secondary rounded-lg px-4 py-2 text-[12px] font-semibold">
              Add Item
            </button>
          </form>
        ) : null}
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
        <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Details</p>
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
            <p className="mb-1 text-[13px] font-semibold text-[var(--ink-muted)]">Notes</p>
            <p className="whitespace-pre-wrap text-[12px] text-[var(--ink)]">{quotation.notes}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
