export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
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

  // Optional related data for display
  const invoiceNumber = receipt.invoiceId
    ? (await prisma.invoice.findUnique({ where: { id: receipt.invoiceId }, select: { invoiceNumber: true } }))?.invoiceNumber ?? null
    : null;

  const clientName = receipt.clientId
    ? (await prisma.client.findUnique({ where: { id: receipt.clientId }, select: { fullName: true } }))?.fullName ?? null
    : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--ink-muted)]">
        <Link href="/documents/receipts" className="inline-flex items-center gap-1 transition hover:text-[var(--ink)]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          All Receipts
        </Link>
      </div>
      <ReceiptDetailView
        id={receipt.id}
        receiptNumber={receipt.receiptNumber}
        amount={receipt.amount}
        currency={receipt.currency}
        issuedAt={receipt.issuedAt}
        voidedAt={receipt.voidedAt}
        invoiceNumber={invoiceNumber}
        clientName={clientName}
      />
    </div>
  );
}
