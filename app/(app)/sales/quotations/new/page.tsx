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

  const [leadName, clientName, clients, leads, jobs, parts, taxRates, branding] = await Promise.all([
    params.leadId
      ? prisma.lead.findFirst({
          where: {
            id: params.leadId,
            orgId,
            ...(!can.viewAllSales(user) ? { OR: [{ assignedToId: user.id }, { createdById: user.id }] } : {}),
          },
          select: { fullName: true },
        }).then((l) => l?.fullName ?? null).catch(() => null)
      : Promise.resolve(null),
    params.clientId
      ? prisma.client.findFirst({ where: { id: params.clientId, orgId }, select: { fullName: true } }).then((c) => c?.fullName ?? null)
      : Promise.resolve(null),
    prisma.client.findMany({
      where: { orgId },
      orderBy: { fullName: "asc" },
      take: 300,
      select: { id: true, fullName: true, phone: true, email: true, organization: true, address: true },
    }),
    prisma.lead.findMany({
      where: {
        orgId,
        status: { notIn: ["LOST", "STALE"] },
        ...(!can.viewAllSales(user) ? { OR: [{ assignedToId: user.id }, { createdById: user.id }] } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 150,
      select: { id: true, fullName: true, phone: true, organization: true, interest: true },
    }),
    prisma.job.findMany({
      where: {
        orgId,
        status: { notIn: ["CLOSED"] },
        ...(!can.viewAllSales(user) ? { OR: [{ assignedToId: user.id }, { createdById: user.id }] } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 150,
      select: { id: true, jobNumber: true, brand: true, model: true, client: { select: { fullName: true, phone: true, address: true } } },
    }),
    prisma.part.findMany({
      where: { orgId, isActive: true },
      orderBy: [{ name: "asc" }],
      take: 500,
      select: { id: true, sku: true, name: true, unitCost: true, qtyOnHand: true },
    }),
    prisma.taxRate.findMany({
      where: { orgId, isActive: true, appliesToSales: true },
      orderBy: [{ isDefault: "desc" }, { code: "asc" }],
      select: { id: true, name: true, code: true, rate: true, isDefault: true },
    }),
    getDocumentBrandingSettings(orgId),
  ]);

  const defaultTaxRate = taxRates.find((rate) => rate.isDefault) ?? null;

  return (
    <div className="space-y-4">
      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Sales · Documents</p>
            <p className="text-[13px] font-bold text-[var(--ink)]">New Quotation</p>
            <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">Build a quote for products, services, leads, clients, or a repair job.</p>
            {leadName ? <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">Lead: {leadName}</p> : null}
            {clientName ? <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">Client: {clientName}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-muted)]">{clients.length} clients</span>
            <span className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-muted)]">{parts.length} products</span>
          </div>
        </div>
      </div>

      <NewQuotationForm
        leadId={params.leadId}
        clientId={params.clientId}
        jobId={params.jobId}
        currency={currency}
        canOverrideDiscount={canOverrideDiscount}
        clients={clients}
        leads={leads}
        jobs={jobs}
        parts={parts}
        taxRates={taxRates}
        defaultTaxApplicable={branding.vatDefaultApplicable}
        defaultTaxRate={defaultTaxRate?.rate ?? branding.vatRatePercent}
        defaultTaxLabel={defaultTaxRate?.code ?? branding.vatLabel}
      />
    </div>
  );
}
