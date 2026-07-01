export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/currency";
import { formatEATDate } from "@/lib/date-eat";
import { StatusBadge, quotationStatusVariant } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SimpleTable, PageLayout } from "@/components/ui/SimpleTable";
import { QuotationActionCell } from "./QuotationActionCell";

type QuotationRow = {
  id: string;
  quoteNumber: string;
  clientName: string | null;
  device: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
  convertedToInvoiceId: string | null;
};

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { user, orgId, org } = await requireOrgSession();
  if (!(can.createQuotations(user) || can.viewFinancials(user))) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const page = Math.max(Number(params.page ?? "1") || 1, 1);
  const pageSize = 20;

  const where = {
    orgId,
    ...(q
      ? {
          OR: [
            { quoteNumber: { contains: q } },
            { client: { fullName: { contains: q } } },
          ],
        }
      : {}),
  };

  const [quotations, total] = await Promise.all([
    prisma.quotation.findMany({
      where,
      select: {
        id: true,
        quoteNumber: true,
        status: true,
        totalAmount: true,
        currency: true,
        createdAt: true,
        convertedToInvoiceId: true,
        client: { select: { fullName: true } },
        job: { select: { brand: true, model: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.quotation.count({ where }),
  ]);

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const baseCurrency = org.baseCurrency || "UGX";

  const rows: QuotationRow[] = quotations.map((qt) => ({
    id: qt.id,
    quoteNumber: qt.quoteNumber,
    clientName: qt.client?.fullName ?? null,
    device: [qt.job?.brand, qt.job?.model].filter(Boolean).join(" ") || "—",
    date: formatEATDate(qt.createdAt),
    amount: qt.totalAmount,
    currency: qt.currency ?? baseCurrency,
    status: qt.status,
    convertedToInvoiceId: qt.convertedToInvoiceId,
  }));

  return (
    <PageLayout
      title="Quotations"
      subtitle="Standalone and ticket quotations issued to clients."
      action={
        <Link
          href="/documents/new?type=quotation"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg> New Quotation
        </Link>
      }
      searchPlaceholder="Search quotations..."
      searchValue={q}
      page={page}
      totalPages={totalPages}
    >
      <SimpleTable
        rows={rows}
        keyExtractor={(r) => r.id}
        emptyState={
          <EmptyState
            title="No quotations found"
            description="Create a standalone quotation or generate one from a ticket."
            action={{ label: "New Quotation", href: "/documents/new?type=quotation" }}
          />
        }
        columns={[
          {
            header: "Quote #",
            render: (r) => (
              <Link
                href={`/sales/quotations/${encodeURIComponent(r.quoteNumber)}`}
                className="font-medium text-[var(--ink)] hover:text-[var(--accent)] hover:underline"
              >
                {r.quoteNumber}
              </Link>
            ),
          },
          { header: "Client", render: (r) => <span className="text-[var(--ink-muted)]">{r.clientName ?? "—"}</span> },
          { header: "Device", render: (r) => <span className="text-[var(--ink-muted)]">{r.device}</span> },
          { header: "Date", render: (r) => <span className="text-[var(--ink-muted)]">{r.date}</span> },
          { header: "Amount", render: (r) => <span className="font-medium text-[var(--ink)]">{formatMoney(r.amount, r.currency)}</span> },
          {
            header: "Status",
            render: (r) => <StatusBadge label={r.status} variant={quotationStatusVariant(r.status)} />,
          },
          {
            header: "",
            align: "right",
            render: (r) => (
              <QuotationActionCell
                id={r.id}
                quoteNumber={r.quoteNumber}
                status={r.status}
                convertedToInvoiceId={r.convertedToInvoiceId}
                userRole={user.role}
              />
            ),
          },
        ]}
      />
    </PageLayout>
  );
}
