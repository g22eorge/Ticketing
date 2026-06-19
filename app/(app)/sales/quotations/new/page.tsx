import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { getAppCurrency } from "@/lib/currency";
import { getDocumentBrandingSettings } from "@/lib/document-branding";
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

  const [clientName, clients, branding] = await Promise.all([
    params.clientId
      ? prisma.client.findFirst({ where: { id: params.clientId, orgId }, select: { fullName: true } }).then((c) => c?.fullName ?? null)
      : Promise.resolve(null),
    prisma.client.findMany({
      where: { orgId },
      orderBy: { fullName: "asc" },
      take: 300,
      select: { id: true, fullName: true, phone: true, email: true, organization: true, address: true },
    }),
    getDocumentBrandingSettings(orgId),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-col gap-1">
        <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Sales · Documents</p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">New Quotation</h1>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Select a client, add what you are quoting, and create a draft.
              {clientName ? ` Client: ${clientName}.` : ""}
            </p>
          </div>
        </div>
      </div>

      <NewQuotationForm
        clientId={params.clientId}
        currency={currency}
        canOverrideDiscount={canOverrideDiscount}
        clients={clients}
        defaultTaxApplicable={branding.vatDefaultApplicable}
        defaultTaxRate={branding.vatRatePercent}
        defaultTaxLabel={branding.vatLabel}
      />
    </div>
  );
}
