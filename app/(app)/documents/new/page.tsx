export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { List, ArrowRight } from "lucide-react";

import { getAppCurrency } from "@/lib/currency";
import { getDocumentBrandingSettings } from "@/lib/document-branding";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { NewQuotationForm } from "../../sales/quotations/new/NewQuotationForm";
import { NewInvoiceForm } from "./NewInvoiceForm";

const DOCUMENT_TYPES = [
  {
    key: "quotation",
    label: "Quotation",
    href: "/documents/new?type=quotation",
    listHref: "/documents/quotations",
    description: "Create a standalone customer quotation.",
    detail: "Select a client, add quoted items, and create a draft without opening a ticket.",
    cta: "Create quotation",
    allowed: (user: Awaited<ReturnType<typeof requireOrgSession>>["user"]) => can.createQuotations(user),
  },
  {
    key: "invoice",
    label: "Invoice",
    href: "/documents/new?type=invoice",
    listHref: "/documents/invoices",
    description: "Create a standalone client invoice.",
    detail: "Select a client, add invoice lines, and issue it without opening a ticket.",
    cta: "Create invoice",
    allowed: (user: Awaited<ReturnType<typeof requireOrgSession>>["user"]) => can.createInvoices(user),
  },
  {
    key: "receipt",
    label: "Receipt",
    href: "/documents/invoices",
    listHref: "/documents/receipts",
    description: "Record payment from an issued invoice.",
    detail: "Find the invoice or ticket payment action, then record payment.",
    cta: "Find invoice",
    allowed: (user: Awaited<ReturnType<typeof requireOrgSession>>["user"]) =>
      can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role),
  },
] as const;

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { user, orgId } = await requireOrgSession();
  const params = await searchParams;
  const selectedType = (params.type ?? "quotation").toLowerCase();
  const selected = DOCUMENT_TYPES.find((item) => item.key === selectedType) ?? DOCUMENT_TYPES[0];

  if (!selected.allowed(user)) {
    redirect("/documents");
  }

  const needsDocumentForm = selected.key === "quotation" || selected.key === "invoice";
  const currency = getAppCurrency();
  const [clients, branding] = needsDocumentForm
    ? await Promise.all([
      prisma.client.findMany({
        where: { orgId },
        orderBy: { fullName: "asc" },
        take: 300,
        select: { id: true, fullName: true, phone: true, email: true, organization: true, address: true },
      }),
      getDocumentBrandingSettings(orgId),
    ])
    : ([
      [],
      null,
    ] as const);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-4">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">New Document</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">{selected.label}</h1>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">{selected.description}</p>
          </div>
          <Link href={selected.listHref} className="inline-flex items-center gap-1.5 justify-center rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--ink-muted)] transition hover:text-[var(--ink)]">
            <List className="h-4 w-4" aria-hidden="true" /> View {selected.label}s
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {DOCUMENT_TYPES.filter((item) => item.allowed(user)).map((item) => (
          <Link
            key={item.key}
            href={`/documents/new?type=${item.key}`}
            className={
              "panel-shadow rounded-xl border px-4 py-4 transition " +
              (item.key === selected.key
                ? "border-[var(--accent)] bg-[var(--accent)] text-black"
                : "border-[var(--line)] bg-[var(--panel)] text-[var(--ink)] hover:border-[var(--accent)]/45")
            }
          >
            <span className="text-sm font-bold">{item.label}</span>
            <span className={item.key === selected.key ? "mt-1 block text-xs text-black/70" : "mt-1 block text-xs text-[var(--ink-muted)]"}>
              {item.description}
            </span>
          </Link>
        ))}
      </div>

      {selected.key === "quotation" && branding ? (
        <NewQuotationForm
          currency={currency}
          canOverrideDiscount={can.overrideDiscount(user)}
          clients={clients}
          defaultTaxApplicable={branding.vatDefaultApplicable}
          defaultTaxRate={branding.vatRatePercent}
          defaultTaxLabel={branding.vatLabel}
        />
      ) : selected.key === "invoice" && branding ? (
        <NewInvoiceForm
          currency={currency}
          clients={clients}
          defaultTaxApplicable={branding.vatDefaultApplicable}
          defaultTaxRate={branding.vatRatePercent}
          defaultTaxLabel={branding.vatLabel}
        />
      ) : (
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-[var(--ink)]">Continue to {selected.label}</h2>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">{selected.detail}</p>
            </div>
            <Link
              href={selected.href}
              className="btn-premium inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-bold"
            >
              <ArrowRight className="h-4 w-4" aria-hidden="true" /> {selected.cta}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
