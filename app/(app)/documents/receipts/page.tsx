export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/currency";
import { formatEATDate } from "@/lib/date-eat";
import { StatusBadge, receiptStatusVariant } from "@/components/ui/StatusBadge";
import { ReceiptActionCell } from "./ReceiptActionCell";
import { EmptyState } from "@/components/ui/EmptyState";
import { SimpleTable, PageLayout } from "@/components/ui/SimpleTable";

type ReceiptRow = {
  id: string;
  receiptNumber: string;
  date: string;
  amount: number;
  currency: string;
  voidedAt: Date | null;
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
        voidedAt: true,
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
    date: formatEATDate(r.issuedAt),
    amount: r.amount,
    currency: r.currency ?? baseCurrency,
    voidedAt: r.voidedAt,
  }));

  return (
    <PageLayout
      title="Receipts"
      subtitle="Payment receipts."
      action={
        <Link
          href="/documents/new?type=receipt"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
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
            render: (r) => (
              <Link
                href={`/documents/receipts/${encodeURIComponent(r.receiptNumber)}`}
                className="font-medium text-[var(--ink)] hover:text-[var(--accent)] hover:underline"
              >
                {r.receiptNumber}
              </Link>
            ),
          },
          { header: "Client", render: (r) => <span className="text-[var(--ink-muted)]">—</span> },
          { header: "Date", render: (r) => <span className="text-[var(--ink-muted)]">{r.date}</span> },
          {
            header: "Amount",
            render: (r) => <span className="font-medium text-[var(--ink)]">{formatMoney(r.amount, r.currency)}</span>,
          },
          {
            header: "Status",
            render: (r) => (
              <StatusBadge
                label={r.voidedAt ? "Voided" : "Issued"}
                variant={receiptStatusVariant(r.voidedAt ? "VOIDED" : "ISSUED")}
              />
            ),
          },
          {
            header: "",
            align: "right",
            render: (r) => (
              <ReceiptActionCell
                id={r.id}
                receiptNumber={r.receiptNumber}
                voidedAt={r.voidedAt}
                userRole={user.role}
              />
            ),
          },
        ]}
      />
    </PageLayout>
  );
}
