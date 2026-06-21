export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/currency";
import { formatEATDate } from "@/lib/date-eat";
import { StatusBadge, invoiceStatusVariant } from "@/components/ui/StatusBadge";
import { InvoiceActionCell } from "./InvoiceActionCell";
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
  ticketId: string | null;
  hasReceipt: boolean;
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
        ticket: { select: { id: true, receipt: { select: { id: true } } } },
      },
      orderBy: { issuedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.invoice.count({ where }),
  ]);

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const baseCurrency = org.baseCurrency || "UGX";


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
    ticketId: inv.ticket?.id ?? null,
    hasReceipt: Boolean(inv.ticket?.receipt),
  }));

  return (
    <PageLayout
      title="Invoices"
      subtitle="Standalone and ticket invoices billed to clients."
      action={
        <Link
          href="/documents/new?type=invoice"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> New Invoice
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
            description="Create a standalone invoice or generate one from a ticket to see it here."
            action={{ label: "New Invoice", href: "/documents/new?type=invoice" }}
          />
        }
        columns={[
          {
            header: "Invoice #",
            render: (r) => (
              <Link
                href={`/documents/invoices/${encodeURIComponent(r.invoiceNumber)}`}
                className="font-medium text-[var(--ink)] hover:text-[var(--accent)] hover:underline"
              >
                {r.invoiceNumber}
              </Link>
            ),
          },
          { header: "Client", render: (r) => <span className="text-[var(--ink-muted)]">{r.clientName ?? "—"}</span> },
          { header: "Device", render: (r) => <span className="text-[var(--ink-muted)]">{r.device}</span> },
          { header: "Date", render: (r) => <span className="text-[var(--ink-muted)]">{r.date}</span> },
          { header: "Amount", render: (r) => <span className="font-medium text-[var(--ink)]">{formatMoney(r.amount, r.currency)}</span> },
          {
            header: "Status",
            render: (r) => <StatusBadge label={r.status} variant={invoiceStatusVariant(r.status)} />,
          },
          {
            header: "Actions",
            align: "right",
            render: (r) => (
              <InvoiceActionCell
                id={r.id}
                invoiceNumber={r.invoiceNumber}
                status={r.status}
                userRole={user.role}
                ticketId={r.ticketId}
                hasReceipt={r.hasReceipt}
              />
            ),
          },
        ]}
      />
    </PageLayout>
  );
}
