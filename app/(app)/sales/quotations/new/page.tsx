import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { getAppCurrency } from "@/lib/currency";
import { NewQuotationForm } from "./NewQuotationForm";

export default async function NewQuotationPage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string; clientId?: string; jobId?: string }>;
}) {
  const { user, orgId } = await requireOrgSession();

  if (!can.createQuotations(user)) {
    redirect("/sales");
  }

  const params = await searchParams;
  const currency = getAppCurrency();
  const canOverrideDiscount = can.overrideDiscount(user);

  const [leadName, clientName] = await Promise.all([
    params.leadId
      ? prisma.lead.findFirst({
          where: {
            id: params.leadId,
            orgId,
            ...(!can.viewAllSales(user) ? { OR: [{ assignedToId: user.id }, { createdById: user.id }] } : {}),
          },
          select: { fullName: true },
        }).then((l) => l?.fullName ?? null)
      : Promise.resolve(null),
    params.clientId
      ? prisma.client.findFirst({ where: { id: params.clientId, orgId }, select: { fullName: true } }).then((c) => c?.fullName ?? null)
      : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        <h1 className="text-base font-bold text-[var(--ink)]">New Quotation</h1>
        {leadName ? <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">Lead: {leadName}</p> : null}
        {clientName ? <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">Client: {clientName}</p> : null}
      </div>

      <NewQuotationForm
        leadId={params.leadId}
        clientId={params.clientId}
        jobId={params.jobId}
        currency={currency}
        canOverrideDiscount={canOverrideDiscount}
      />
    </div>
  );
}
