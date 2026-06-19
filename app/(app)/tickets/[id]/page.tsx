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
  OPEN: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  WAITING_ON_CUSTOMER: "bg-purple-100 text-purple-800",
  WAITING_FOR_APPROVAL: "bg-amber-100 text-amber-800",
  WAITING_FOR_PAYMENT: "bg-pink-100 text-pink-800",
  RESOLVED: "bg-green-100 text-green-800",
  CLOSED: "bg-gray-100 text-gray-800",
  CANCELLED: "bg-red-100 text-red-700",
};

const PRIORITY_COLOR: Record<string, string> = {
  LOW: "bg-blue-100 text-blue-800",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  HIGH: "bg-orange-100 text-orange-800",
  CRITICAL: "bg-red-100 text-red-800",
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
        <Link href="/tickets" className="text-sm text-stone-500 hover:text-stone-700">&larr; Tickets</Link>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-100 px-6 py-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-amber-600">{ticket.ticketNumber}</span>
                {isSLA && (
                  <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">SLA COVERED</span>
                )}
              </div>
              <h1 className="mt-2 text-xl font-bold text-stone-900">{ticket.subject}</h1>
              <p className="mt-1 text-sm text-stone-500">Created {formatEATDate(ticket.createdAt)}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className={"inline-flex rounded-full px-3 py-1 text-xs font-bold " + (PRIORITY_COLOR[ticket.priority] || "bg-stone-100 text-stone-800")}>
                {ticket.priority}
              </span>
              <span className={"inline-flex rounded-full px-3 py-1 text-xs font-bold " + (STATUS_COLOR[ticket.status] || "bg-stone-100 text-stone-800")}>
                {STATUS_LABEL[ticket.status] ?? ticket.status.replace(/_/g, " ")}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 border-b border-stone-100 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Client</p>
            {ticket.client ? (
              <div className="mt-1">
                <p className="text-sm font-medium text-stone-800">{ticket.client.fullName}</p>
                <p className="text-sm text-stone-500">{ticket.client.phone}</p>
                {ticket.client.email && <p className="text-sm text-stone-500">{ticket.client.email}</p>}
                <p className="mt-1 text-xs text-stone-400 capitalize">{ticket.client.clientType.toLowerCase()}</p>
              </div>
            ) : (
              <div className="mt-1">
                <p className="text-sm font-medium text-stone-800">{ticket.reporterName}</p>
                <p className="text-sm text-stone-500">{ticket.reporterPhone}</p>
                {ticket.reporterEmail && <p className="text-sm text-stone-500">{ticket.reporterEmail}</p>}
                {ticket.reporterCompany && <p className="text-sm text-stone-500">{ticket.reporterCompany}</p>}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Details</p>
            <p className="mt-1 text-sm font-medium text-stone-800">{ticket.category.replace(/_/g, " ")}</p>
            {ticket.deviceInfo && (
              <p className="text-sm text-stone-500">Device: {ticket.deviceInfo}</p>
            )}
            {ticket.estimatedCost != null && (
              <p className="text-sm text-stone-700">Est. cost: {formatMoney(ticket.estimatedCost, currency)}</p>
            )}
            {ticket.assignedTo && (
              <p className="text-sm text-stone-500">Assigned: {ticket.assignedTo.name}</p>
            )}
          </div>
        </div>

        <div className="border-b border-stone-100 px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Description</p>
          <p className="mt-2 text-sm leading-relaxed text-stone-700 whitespace-pre-wrap">{ticket.description}</p>
          {ticket.resolution && (
            <>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-stone-400">Resolution</p>
              <p className="mt-1 text-sm leading-relaxed text-stone-700 whitespace-pre-wrap">{ticket.resolution}</p>
            </>
          )}
          {ticket.notes && (
            <>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-stone-400">Internal Notes</p>
              <p className="mt-1 text-sm leading-relaxed text-stone-700 whitespace-pre-wrap">{ticket.notes}</p>
            </>
          )}
        </div>

        {/* Linked Documents */}
        <div className="border-b border-stone-100 px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-3">Linked Documents</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Quotation</p>
              {hasQuotation ? (
                <div className="mt-1">
                  <Link href={"/documents/quotations"} className="text-sm font-semibold text-amber-600 hover:underline">
                    {ticket.quotation!.quoteNumber}
                  </Link>
                  <p className="text-xs text-stone-500">{formatMoney(ticket.quotation!.totalAmount, ticket.quotation!.currency)} &middot; {ticket.quotation!.status}</p>
                </div>
              ) : (
                <p className="mt-1 text-xs text-stone-400">None</p>
              )}
            </div>
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Invoice</p>
              {hasInvoice ? (
                <div className="mt-1">
                  <Link href={"/documents/invoices"} className="text-sm font-semibold text-amber-600 hover:underline">
                    {ticket.invoice!.invoiceNumber}
                  </Link>
                  <p className="text-xs text-stone-500">{formatMoney(ticket.invoice!.totalAmount, ticket.invoice!.currency)} &middot; {ticket.invoice!.status}</p>
                </div>
              ) : (
                <p className="mt-1 text-xs text-stone-400">None</p>
              )}
            </div>
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Receipt</p>
              {hasReceipt ? (
                <div className="mt-1">
                  <Link href={"/documents/receipts"} className="text-sm font-semibold text-amber-600 hover:underline">
                    {ticket.receipt!.receiptNumber}
                  </Link>
                  <p className="text-xs text-stone-500">{formatMoney(ticket.receipt!.amount, ticket.receipt!.currency)}</p>
                </div>
              ) : (
                <p className="mt-1 text-xs text-stone-400">None</p>
              )}
            </div>
          </div>
        </div>

        {/* Workflow Actions */}
        {!isClosed && (
          <div className="border-b border-stone-100 px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-3">Actions</p>
            <div className="flex flex-wrap gap-2">
              {!hasQuotation && !isSLA && (
                <Link
                  href={`/tickets/${id}/create-quotation`}
                  className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 shadow-sm transition hover:border-stone-300 hover:text-stone-900"
                >
                  Create Quotation
                </Link>
              )}
              {!hasInvoice && !isSLA && (
                hasQuotation && ticket.quotation?.status === "ACCEPTED" ? (
                  <Link
                    href={`/tickets/${id}/create-invoice`}
                    className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800"
                  >
                    Convert to Invoice
                  </Link>
                ) : !hasQuotation ? (
                  <Link
                    href={`/tickets/${id}/create-invoice`}
                    className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 shadow-sm transition hover:border-stone-300 hover:text-stone-900"
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
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-3">Update Ticket</p>
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
