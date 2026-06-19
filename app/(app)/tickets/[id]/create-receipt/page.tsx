import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { CreateReceiptForm } from "@/components/tickets/CreateReceiptForm";

export const dynamic = "force-dynamic";

export default async function CreateReceiptPage({
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
      client: { select: { id: true, fullName: true } },
      invoice: { select: { id: true, invoiceNumber: true, totalAmount: true, currency: true } },
    },
  });

  if (!ticket) notFound();

  const existingReceipt = await prisma.receipt.findFirst({
    where: { ticketId: id },
    select: { id: true },
  });
  if (existingReceipt) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-4">
        <Link href={`/tickets/${id}`} className="text-sm font-semibold text-[var(--ink-muted)] transition hover:text-[var(--ink)]">Back to ticket</Link>
        <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]">Ticket Document</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--ink)]">Record Payment</h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">Create a receipt and update the invoice payment record.</p>
      </div>
      <CreateReceiptForm
        ticketId={ticket.id}
        ticketNumber={ticket.ticketNumber}
        subject={ticket.subject}
        clientId={ticket.clientId}
        clientName={ticket.client?.fullName ?? null}
        invoiceTotal={ticket.invoice?.totalAmount ?? null}
        invoiceNumber={ticket.invoice?.invoiceNumber ?? null}
        currency={ticket.invoice?.currency ?? currency}
      />
    </div>
  );
}
