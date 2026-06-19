export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/currency";
import { formatEATDate } from "@/lib/date-eat";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SimpleTable, PageLayout } from "@/components/ui/SimpleTable";

type QuotationRow = {
  id: string;
  quoteNumber: string;
  clientName: string | null;
  device: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
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

  const statusVariant = (s: string) => {
    if (s === "ACCEPTED") return "success" as const;
    if (s === "REJECTED") return "error" as const;
    if (s === "EXPIRED") return "neutral" as const;
    return "warning" as const;
  };

  const rows: QuotationRow[] = quotations.map((q) => ({
    id: q.id,
    quoteNumber: q.quoteNumber,
    clientName: q.client?.fullName ?? null,
    device: [q.job?.brand, q.job?.model].filter(Boolean).join(" ") || "—",
    date: formatEATDate(q.createdAt),
    amount: q.totalAmount,
    currency: q.currency ?? baseCurrency,
    status: q.status,
  }));

  return (
    <PageLayout
      title="Quotations"
      subtitle="Quotes issued to clients."
      action={
        <Link
          href="/sales/quotations/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800"
        >
          + New Quotation
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
            description="Generate a quotation from a ticket to see it here."
            action={{ label: "New Quotation", href: "/sales/quotations/new" }}
          />
        }
        columns={[
          {
            header: "Quote #",
            render: (r) => <span className="font-medium text-stone-900">{r.quoteNumber}</span>,
          },
          { header: "Client", render: (r) => r.clientName ?? "—" },
          { header: "Device", render: (r) => r.device },
          { header: "Date", render: (r) => <span className="text-stone-500">{r.date}</span> },
          { header: "Amount", render: (r) => <span className="font-medium text-stone-900">{formatMoney(r.amount, r.currency)}</span> },
          {
            header: "Status",
            render: (r) => <StatusBadge label={r.status} variant={statusVariant(r.status)} />,
          },
          {
            header: "Actions",
            align: "right",
            render: (r) => (
              <Link
                href={`/api/quotations/${r.id}`}
                className="text-sm font-medium text-stone-600 transition hover:text-stone-900"
              >
                Download
              </Link>
            ),
          },
        ]}
      />
    </PageLayout>
  );
}
