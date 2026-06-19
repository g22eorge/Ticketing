export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/currency";
import { formatEATDate } from "@/lib/date-eat";
import { EmptyState } from "@/components/ui/EmptyState";
import { SimpleTable, PageLayout } from "@/components/ui/SimpleTable";

type ReceiptRow = {
  id: string;
  receiptNumber: string;
  clientName: string | null;
  date: string;
  amount: number;
  currency: string;
  paymentId: string | null;
};

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { user, orgId, org } = await requireOrgSession();
  if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role))) {
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
          OR: [{ receiptNumber: { contains: q } }],
        }
      : {}),
  };

  const [receipts, total] = await Promise.all([
    prisma.receipt.findMany({
      where,
      select: {
        id: true,
        receiptNumber: true,
        amount: true,
        currency: true,
        issuedAt: true,
        paymentId: true,
      },
      orderBy: { issuedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.receipt.count({ where }),
  ]);

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const baseCurrency = org.baseCurrency || "UGX";

  const rows: ReceiptRow[] = receipts.map((r) => ({
    id: r.id,
    receiptNumber: r.receiptNumber,
    clientName: null,
    date: formatEATDate(r.issuedAt),
    amount: r.amount,
    currency: r.currency ?? baseCurrency,
    paymentId: r.paymentId,
  }));

  return (
    <PageLayout
      title="Receipts"
      subtitle="Payment receipts."
      action={
        <Link
          href="/documents/new?type=receipt"
          className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800"
        >
          Record Payment
        </Link>
      }
      searchPlaceholder="Search receipts..."
      searchValue={q}
      page={page}
      totalPages={totalPages}
    >
      <SimpleTable
        rows={rows}
        keyExtractor={(r) => r.id}
        emptyState={
          <EmptyState
            title="No receipts found"
            description="Payments recorded will appear here."
            action={{ label: "Record Payment", href: "/documents/new?type=receipt" }}
          />
        }
        columns={[
          {
            header: "Receipt #",
            render: (r) => <span className="font-medium text-stone-900">{r.receiptNumber}</span>,
          },
          { header: "Client", render: (r) => r.clientName ?? "—" },
          { header: "Date", render: (r) => <span className="text-stone-500">{r.date}</span> },
          {
            header: "Amount",
            render: (r) => <span className="font-medium text-stone-900">{formatMoney(r.amount, r.currency)}</span>,
          },
          {
            header: "Actions",
            align: "right",
            render: (r) => r.paymentId ? (
              <Link
                href={`/api/receipts/${r.id}`}
                className="text-sm font-medium text-stone-600 transition hover:text-stone-900"
              >
                Download
              </Link>
            ) : <span className="text-xs text-stone-400">No payment</span>,
          },
        ]}
      />
    </PageLayout>
  );
}
