import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { CreateQuotationForm } from "@/components/tickets/CreateQuotationForm";

export const dynamic = "force-dynamic";

export default async function CreateQuotationPage({
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
      isSLACovered: true,
      quotationId: true,
      client: { select: { id: true, fullName: true } },
    },
  });

  if (!ticket || ticket.quotationId || ticket.isSLACovered) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-4">
        <Link href={`/tickets/${id}`} className="text-sm font-semibold text-[var(--ink-muted)] transition hover:text-[var(--ink)]">Back to ticket</Link>
        <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]">Ticket Document</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--ink)]">Create Quotation</h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">Prepare a client quote from this ticket.</p>
      </div>
      <CreateQuotationForm
        ticketId={ticket.id}
        ticketNumber={ticket.ticketNumber}
        subject={ticket.subject}
        clientId={ticket.clientId}
        clientName={ticket.client?.fullName ?? null}
        estimatedCost={ticket.estimatedCost}
        currency={currency}
      />
    </div>
  );
}
