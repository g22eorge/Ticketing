export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { ReceiptDetailView } from "../ReceiptDetailView";

export default async function ReceiptDetailPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = await params;
  const documentRef = decodeURIComponent(number);
  const { user, orgId } = await requireOrgSession();

  if (!can.viewFinancials(user) && !["ADMIN", "OPS", "FRONT_DESK"].includes(user.role)) {
    redirect("/dashboard");
  }

  const receipt = await prisma.receipt.findFirst({
    where: {
      orgId,
      OR: [{ id: documentRef }, { receiptNumber: documentRef }],
    },
    select: {
      id: true,
      receiptNumber: true,
      amount: true,
      currency: true,
      issuedAt: true,
      voidedAt: true,
      voidReason: true,
      invoiceId: true,
      paymentId: true,
      clientId: true,
      ticketId: true,
    },
  });

  if (!receipt) notFound();

  const [invoiceNumber, clientData] = await Promise.all([
    receipt.invoiceId
      ? prisma.invoice.findUnique({ where: { id: receipt.invoiceId }, select: { invoiceNumber: true } }).then(r => r?.invoiceNumber ?? null)
      : null,
    receipt.clientId
      ? prisma.client.findUnique({ where: { id: receipt.clientId }, select: { fullName: true, phone: true, email: true, address: true, organization: true } })
      : null,
  ]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--ink-muted)]">
        <Link href="/documents/receipts" className="inline-flex items-center gap-1 transition hover:text-[var(--ink)]">
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> All Receipts
        </Link>
      </div>
      <ReceiptDetailView
        id={receipt.id}
        receiptNumber={receipt.receiptNumber}
        amount={receipt.amount}
        currency={receipt.currency}
        issuedAt={receipt.issuedAt}
        voidedAt={receipt.voidedAt}
        voidReason={receipt.voidReason}
        invoiceNumber={invoiceNumber}
        clientName={clientData?.fullName ?? null}
        clientPhone={clientData?.phone ?? null}
        clientEmail={clientData?.email ?? null}
        clientAddress={clientData?.address ?? null}
        clientOrganization={clientData?.organization ?? null}
      />
    </div>
  );
}
