import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { formatEATDate } from "@/lib/date-eat";
import { formatMoney } from "@/lib/currency";
import { TicketUpdateForm } from "@/components/tickets/TicketUpdateForm";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING_ON_CUSTOMER: "Waiting on Client",
  WAITING_FOR_APPROVAL: "Awaiting Approval",
  WAITING_FOR_PAYMENT: "Awaiting Payment",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

const STATUS_COLOR: Record<string, string> = {
  OPEN: "bg-blue-900/50 text-blue-300 border border-blue-700/50",
  IN_PROGRESS: "bg-yellow-900/50 text-yellow-300 border border-yellow-700/50",
  WAITING_ON_CUSTOMER: "bg-purple-900/50 text-purple-300 border border-purple-700/50",
  WAITING_FOR_APPROVAL: "bg-amber-900/50 text-amber-300 border border-amber-700/50",
  WAITING_FOR_PAYMENT: "bg-pink-900/50 text-pink-300 border border-pink-700/50",
  RESOLVED: "bg-green-900/50 text-green-300 border border-green-700/50",
  CLOSED: "bg-[var(--panel-strong)] text-[var(--ink)] border border-[var(--line)]",
  CANCELLED: "bg-red-900/50 text-red-300 border border-red-700/50",
};

const PRIORITY_COLOR: Record<string, string> = {
  LOW: "bg-blue-900/50 text-blue-300 border border-blue-700/50",
  MEDIUM: "bg-yellow-900/50 text-yellow-300 border border-yellow-700/50",
  HIGH: "bg-orange-900/50 text-orange-300 border border-orange-700/50",
  CRITICAL: "bg-red-900/50 text-red-300 border border-red-700/50",
};

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { orgId, org } = await requireOrgSession();
  const { id } = await params;
  const currency = org.baseCurrency || "UGX";

  const ticket = await prisma.ticket.findFirst({
    where: { id, orgId },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      client: { select: { id: true, fullName: true, phone: true, email: true, isSLACovered: true, clientType: true } },
      quotation: { select: { id: true, quoteNumber: true, status: true, totalAmount: true, currency: true } },
      invoice: { select: { id: true, invoiceNumber: true, status: true, totalAmount: true, currency: true, paidAmount: true } },
      receipt: { select: { id: true, receiptNumber: true, amount: true, currency: true, issuedAt: true } },
    },
  });

  if (!ticket) notFound();

  const users = await prisma.user.findMany({
    where: { orgId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const hasQuotation = !!ticket.quotation;
  const hasInvoice = !!ticket.invoice;
  const hasReceipt = !!ticket.receipt;
  const isClosed = ticket.status === "CLOSED" || ticket.status === "CANCELLED";
  const isSLA = ticket.isSLACovered;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/tickets" className="text-sm text-[var(--ink-muted)] hover:text-[var(--ink)]">&larr; Tickets</Link>
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-sm">
        <div className="border-b border-[var(--line)] px-6 py-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-amber-600">{ticket.ticketNumber}</span>
                {isSLA && (
                  <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">SLA COVERED</span>
                )}
              </div>
              <h1 className="mt-2 text-xl font-bold text-[var(--ink)]">{ticket.subject}</h1>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">Created {formatEATDate(ticket.createdAt)}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className={"inline-flex rounded-full px-3 py-1 text-xs font-bold " + (PRIORITY_COLOR[ticket.priority] || "bg-[var(--panel-strong)] text-[var(--ink)]")}>
                {ticket.priority}
              </span>
              <span className={"inline-flex rounded-full px-3 py-1 text-xs font-bold " + (STATUS_COLOR[ticket.status] || "bg-[var(--panel-strong)] text-[var(--ink)]")}>
                {STATUS_LABEL[ticket.status] ?? ticket.status.replace(/_/g, " ")}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 border-b border-[var(--line)] px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">Client</p>
            {ticket.client ? (
              <div className="mt-1">
                <Link href={`/clients/${ticket.client.id}`} className="text-sm font-medium text-[var(--ink)] hover:text-[var(--accent)] hover:underline">
                  {ticket.client.fullName}
                </Link>
                <p className="text-sm text-[var(--ink-muted)]">{ticket.client.phone}</p>
                {ticket.client.email && <p className="text-sm text-[var(--ink-muted)]">{ticket.client.email}</p>}
                <p className="mt-1 text-xs text-[var(--ink-muted)] capitalize">{ticket.client.clientType.toLowerCase()}</p>
              </div>
            ) : (
              <div className="mt-1">
                <p className="text-sm font-medium text-[var(--ink)]">{ticket.reporterName}</p>
                <p className="text-sm text-[var(--ink-muted)]">{ticket.reporterPhone}</p>
                {ticket.reporterEmail && <p className="text-sm text-[var(--ink-muted)]">{ticket.reporterEmail}</p>}
                {ticket.reporterCompany && <p className="text-sm text-[var(--ink-muted)]">{ticket.reporterCompany}</p>}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">Details</p>
            <p className="mt-1 text-sm font-medium text-[var(--ink)]">{ticket.category.replace(/_/g, " ")}</p>
            {ticket.deviceInfo && (
              <p className="text-sm text-[var(--ink-muted)]">Device: {ticket.deviceInfo}</p>
            )}
            {ticket.estimatedCost != null && (
              <p className="text-sm text-[var(--ink)]">Est. cost: {formatMoney(ticket.estimatedCost, currency)}</p>
            )}
            {ticket.assignedTo && (
              <p className="text-sm text-[var(--ink-muted)]">Assigned: {ticket.assignedTo.name}</p>
            )}
          </div>
        </div>

        <div className="border-b border-[var(--line)] px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">Description</p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--ink)] whitespace-pre-wrap">{ticket.description}</p>
          {ticket.resolution && (
            <>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">Resolution</p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--ink)] whitespace-pre-wrap">{ticket.resolution}</p>
            </>
          )}
          {ticket.notes && (
            <>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">Internal Notes</p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--ink)] whitespace-pre-wrap">{ticket.notes}</p>
            </>
          )}
        </div>

        {/* Linked Documents */}
        <div className="border-b border-[var(--line)] px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-3">Linked Documents</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">Quotation</p>
              {hasQuotation ? (
                <div className="mt-1">
                  <Link href={"/documents/quotations"} className="text-sm font-semibold text-amber-600 hover:underline">
                    {ticket.quotation!.quoteNumber}
                  </Link>
                  <p className="text-xs text-[var(--ink-muted)]">{formatMoney(ticket.quotation!.totalAmount, ticket.quotation!.currency)} &middot; {ticket.quotation!.status}</p>
                </div>
              ) : (
                <p className="mt-1 text-xs text-[var(--ink-muted)]">None</p>
              )}
            </div>
            <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">Invoice</p>
              {hasInvoice ? (
                <div className="mt-1">
                  <Link href={"/documents/invoices"} className="text-sm font-semibold text-amber-600 hover:underline">
                    {ticket.invoice!.invoiceNumber}
                  </Link>
                  <p className="text-xs text-[var(--ink-muted)]">{formatMoney(ticket.invoice!.totalAmount, ticket.invoice!.currency)} &middot; {ticket.invoice!.status}</p>
                </div>
              ) : (
                <p className="mt-1 text-xs text-[var(--ink-muted)]">None</p>
              )}
            </div>
            <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">Receipt</p>
              {hasReceipt ? (
                <div className="mt-1">
                  <Link href={"/documents/receipts"} className="text-sm font-semibold text-amber-600 hover:underline">
                    {ticket.receipt!.receiptNumber}
                  </Link>
                  <p className="text-xs text-[var(--ink-muted)]">{formatMoney(ticket.receipt!.amount, ticket.receipt!.currency)}</p>
                </div>
              ) : (
                <p className="mt-1 text-xs text-[var(--ink-muted)]">None</p>
              )}
            </div>
          </div>
        </div>

        {/* Workflow Actions */}
        {!isClosed && (
          <div className="border-b border-[var(--line)] px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-3">Actions</p>
            <div className="flex flex-wrap gap-2">
              {!hasQuotation && !isSLA && (
                <Link
                  href={`/tickets/${id}/create-quotation`}
                  className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-sm font-semibold text-[var(--ink)] shadow-sm transition hover:border-[var(--accent)]/40 hover:text-[var(--ink)]"
                >
                  Create Quotation
                </Link>
              )}
              {!hasInvoice && !isSLA && (
                hasQuotation && ticket.quotation?.status === "ACCEPTED" ? (
                  <Link
                    href={`/tickets/${id}/create-invoice`}
                    className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
                  >
                    Convert to Invoice
                  </Link>
                ) : !hasQuotation ? (
                  <Link
                    href={`/tickets/${id}/create-invoice`}
                    className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-sm font-semibold text-[var(--ink)] shadow-sm transition hover:border-[var(--accent)]/40 hover:text-[var(--ink)]"
                  >
                    Create Invoice
                  </Link>
                ) : null
              )}
              {!hasReceipt && hasInvoice && (
                <Link
                  href={`/tickets/${id}/create-receipt`}
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm transition hover:border-emerald-300"
                >
                  Record Payment
                </Link>
              )}
              {isSLA && !hasInvoice && (
                <Link
                  href={`/tickets/${id}/create-invoice`}
                  className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:border-blue-300"
                >
                  Track SLA Value
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Update Form */}
        <div className="px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-3">Update Ticket</p>
          <TicketUpdateForm
            ticketId={ticket.id}
            currentStatus={ticket.status}
            currentPriority={ticket.priority}
            currentAssignedToId={ticket.assignedToId}
            currentResolution={ticket.resolution}
            currentNotes={ticket.notes}
            currentIsSLACovered={ticket.isSLACovered}
            currentEstimatedCost={ticket.estimatedCost}
            users={users}
          />
        </div>
      </div>
    </div>
  );
}
