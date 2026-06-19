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

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  clientName: string | null;
  device: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
  jobId: string | null;
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { user, orgId, org } = await requireOrgSession();
  if (!(can.createInvoices(user) || can.viewFinancials(user))) {
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
            { invoiceNumber: { contains: q } },
            { client: { fullName: { contains: q } } },
        ],
        }
      : {}),
  };

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        totalAmount: true,
        currency: true,
        issuedAt: true,
        jobId: true,
        client: { select: { fullName: true } },
        job: { select: { brand: true, model: true } },
      },
      orderBy: { issuedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.invoice.count({ where }),
  ]);

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const baseCurrency = org.baseCurrency || "UGX";

  const statusVariant = (s: string) => {
    if (s === "PAID") return "success" as const;
    if (s === "VOID") return "neutral" as const;
    if (s === "DRAFT") return "warning" as const;
    return "default" as const;
  };

  const rows: InvoiceRow[] = invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    clientName: inv.client?.fullName ?? null,
  device: [inv.job?.brand, inv.job?.model].filter(Boolean).join(" ") || "—",
    date: formatEATDate(inv.issuedAt),
    amount: inv.totalAmount,
    currency: inv.currency ?? baseCurrency,
    status: inv.status,
    jobId: inv.jobId,
  }));

  return (
    <PageLayout
      title="Invoices"
      subtitle="Billed to clients."
      action={
        <Link
          href="/tickets"
          className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800"
        >
          View Jobs
        </Link>
      }
      searchPlaceholder="Search invoices..."
      searchValue={q}
      page={page}
      totalPages={totalPages}
    >
      <SimpleTable
        rows={rows}
        keyExtractor={(r) => r.id}
        emptyState={
          <EmptyState
            title="No invoices found"
            description="Create an invoice from a ticket to see it here."
            action={{ label: "View Jobs", href: "/tickets" }}
          />
        }
        columns={[
          {
            header: "Invoice #",
            render: (r) => <span className="font-medium text-stone-900">{r.invoiceNumber}</span>,
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
                href={`/api/invoices/${r.id}`}
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
