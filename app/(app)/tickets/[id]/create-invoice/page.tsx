import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { CreateInvoiceForm } from "@/components/tickets/CreateInvoiceForm";

export const dynamic = "force-dynamic";

export default async function CreateInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { orgId, org } = await requireOrgSession();
  const { id } = await params;
  const currency = org.baseCurrency || "UGX";

  const ticket = await prisma.ticket.findFirst({
    where: { id, orgId },
    select: {
      id: true,
      ticketNumber: true,
      subject: true,
      clientId: true,
      estimatedCost: true,
      invoiceId: true,
      client: { select: { id: true, fullName: true } },
      quotation: {
        select: {
          status: true,
          items: { select: { description: true, quantity: true, unitPrice: true } },
        },
      },
    },
  });

  if (!ticket || ticket.invoiceId) notFound();

  const existingItems = ticket.quotation?.status === "ACCEPTED"
    ? ticket.quotation.items
    : undefined;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-4">
        <Link href={`/tickets/${id}`} className="text-sm font-semibold text-[var(--ink-muted)] transition hover:text-[var(--ink)]">Back to ticket</Link>
        <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]">Ticket Document</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--ink)]">Create Invoice</h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">Bill the client for approved ticket work.</p>
      </div>
      <CreateInvoiceForm
        ticketId={ticket.id}
        ticketNumber={ticket.ticketNumber}
        subject={ticket.subject}
        clientId={ticket.clientId}
        clientName={ticket.client?.fullName ?? null}
        estimatedCost={ticket.estimatedCost}
        currency={currency}
        existingQuotationItems={existingItems}
      />
    </div>
  );
}
