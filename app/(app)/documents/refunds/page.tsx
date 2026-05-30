import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { PaymentMethod } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { formatMoney, normalizeCurrency } from "@/lib/currency";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { requireModule, OrgModule } from "@/lib/module-access";
import { assertOrgCanMutate } from "@/lib/org-write";
import { ConfirmSubmitButton } from "@/components/shared/ConfirmSubmitButton";

const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "OTHER"];

export const dynamic = "force-dynamic";

export default async function RefundsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; method?: string; type?: string }>;
}) {
  await requireModule(OrgModule.INVOICING);
  const { user, orgId, org } = await requireOrgSession();
  if (!can.viewFinancials(user) && !["ADMIN", "OPS", "MANAGER", "FINANCE"].includes(user.role)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const methodFilter = params.method ?? "all";
  const typeFilter = params.type ?? "all";

  // ── Server actions ───────────────────────────────────────────────────────────

  async function createRefundAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!["ADMIN", "OPS", "MANAGER", "FINANCE"].includes(user.role)) return;
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "PAYMENT" });

    const invoiceId = String(formData.get("invoiceId") ?? "").trim() || null;
    const saleId = String(formData.get("saleId") ?? "").trim() || null;
    const creditNoteId = String(formData.get("creditNoteId") ?? "").trim() || null;
    const amountRaw = Number(String(formData.get("amount") ?? "").trim());
    const methodRaw = String(formData.get("method") ?? "CASH").trim();
    const reference = String(formData.get("reference") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();

    if (!invoiceId && !saleId) return;
    if (!Number.isFinite(amountRaw) || amountRaw <= 0) return;

    const method = PAYMENT_METHODS.includes(methodRaw as PaymentMethod)
      ? (methodRaw as PaymentMethod)
      : "CASH" as PaymentMethod;

    if (invoiceId) {
      const inv = await prisma.invoice.findFirst({ where: { id: invoiceId, orgId }, select: { id: true } });
      if (!inv) return;
    }
    if (saleId) {
      const sale = await prisma.sale.findFirst({ where: { id: saleId, orgId }, select: { id: true } });
      if (!sale) return;
    }

    await prisma.refund.create({
      data: {
        orgId,
        invoiceId: invoiceId || null,
        saleId: saleId || null,
        creditNoteId: creditNoteId || null,
        amount: amountRaw,
        method,
        reference: reference || null,
        note: note || null,
        createdById: user.id,
      },
    });
    revalidatePath("/documents/refunds");
  }

  async function deleteRefundAction(formData: FormData) {
    "use server";
    const { user, orgId } = await requireOrgSession();
    if (user.role !== "ADMIN") return;

    const refundId = String(formData.get("refundId") ?? "").trim();
    if (!refundId) return;

    const refund = await prisma.refund.findFirst({ where: { id: refundId, orgId }, select: { id: true } });
    if (!refund) return;

    await prisma.refund.delete({ where: { id: refundId } });
    revalidatePath("/documents/refunds");
  }

  // ── Data fetching ────────────────────────────────────────────────────────────

  const baseWhere: Prisma.RefundWhereInput = { orgId };
  if (methodFilter !== "all") baseWhere.method = methodFilter as PaymentMethod;
  if (typeFilter === "invoice") baseWhere.invoiceId = { not: null };
  if (typeFilter === "sale") baseWhere.saleId = { not: null };

  const [refunds, kpiData, invoiceRefundTotal, saleRefundTotal] = await Promise.all([
    prisma.refund.findMany({
      where: baseWhere,
      orderBy: { refundedAt: "desc" },
      take: 100,
      select: {
        id: true,
        amount: true,
        currency: true,
        method: true,
        reference: true,
        note: true,
        refundedAt: true,
        createdAt: true,
        invoiceId: true,
        saleId: true,
        creditNoteId: true,
        invoice: { select: { invoiceNumber: true, job: { select: { client: { select: { fullName: true } } } } } },
        sale: { select: { saleNumber: true, client: { select: { fullName: true } } } },
        creditNote: { select: { creditNoteNumber: true } },
        createdBy: { select: { name: true } },
      },
    }).catch(() => [] as never[]),
    prisma.refund.aggregate({
      where: { orgId },
      _count: { id: true },
      _sum: { amount: true },
    }).catch(() => ({ _count: { id: 0 }, _sum: { amount: null } })),
    prisma.refund.aggregate({
      where: { orgId, invoiceId: { not: null } },
      _sum: { amount: true },
    }).catch(() => ({ _sum: { amount: null } })),
    prisma.refund.aggregate({
      where: { orgId, saleId: { not: null } },
      _sum: { amount: true },
    }).catch(() => ({ _sum: { amount: null } })),
  ]);

  const filtered = q
    ? refunds.filter((r) => {
        const search = q.toLowerCase();
        return (
          r.invoice?.invoiceNumber?.toLowerCase().includes(search) ||
          r.sale?.saleNumber?.toLowerCase().includes(search) ||
          r.creditNote?.creditNoteNumber?.toLowerCase().includes(search) ||
          r.invoice?.job?.client?.fullName?.toLowerCase().includes(search) ||
          r.sale?.client?.fullName?.toLowerCase().includes(search) ||
          r.reference?.toLowerCase().includes(search) ||
          r.note?.toLowerCase().includes(search)
        );
      })
    : refunds;

  const currency = org.baseCurrency;
  const totalRefunds = kpiData._count.id ?? 0;
  const totalAmount = kpiData._sum.amount ?? 0;
  const invoiceAmount = invoiceRefundTotal._sum.amount ?? 0;
  const saleAmount = saleRefundTotal._sum.amount ?? 0;

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header + KPI panel */}
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2.5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Documents</p>
            <p className="text-[13px] font-bold text-[var(--ink)]">Refunds</p>
            <p className="text-[11px] text-[var(--ink-muted)]">All cash refunds issued against invoices and sales</p>
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--line)] sm:grid-cols-4 sm:divide-y-0">
          <div className="px-4 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Total Refunds</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--ink)]">{totalRefunds}</p>
            <p className="text-[10px] text-[var(--ink-muted)]">all time</p>
          </div>
          <div className="px-4 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Total Refunded</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--ink)]">{formatMoney(totalAmount, currency)}</p>
          </div>
          <div className="px-4 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Invoice Refunds</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--ink)]">{formatMoney(invoiceAmount, currency)}</p>
          </div>
          <div className="px-4 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Sale Refunds</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--accent)]">{formatMoney(saleAmount, currency)}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <form method="GET" className="hidden lg:flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search invoice, sale, client, reference…"
          className="h-8 flex-1 min-w-[160px] rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
        <select
          name="type"
          defaultValue={typeFilter}
          className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
        >
          <option value="all">All Types</option>
          <option value="invoice">Invoice Refunds</option>
          <option value="sale">Sale Refunds</option>
        </select>
        <select
          name="method"
          defaultValue={methodFilter}
          className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
        >
          <option value="all">All Methods</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>{m.replace(/_/g, " ")}</option>
          ))}
        </select>
        <button
          type="submit"
          className="h-8 rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-white"
        >
          Filter
        </button>
        {(q || methodFilter !== "all" || typeFilter !== "all") && (
          <Link href="/documents/refunds" className="flex h-8 items-center rounded-lg border border-[var(--border)] px-3 text-sm text-[var(--ink-muted)]">
            Clear
          </Link>
        )}
      </form>

      {/* Table */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-[var(--ink-muted)]">No refunds found</div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="divide-y divide-[var(--line)] lg:hidden">
              {filtered.map((r) => {
                const refundCurrencyM = normalizeCurrency(r.currency, currency);
                const sourceLabelM = r.invoice ? r.invoice.invoiceNumber : r.sale ? r.sale.saleNumber : "—";
                const sourceHrefM = r.invoiceId ? `/documents/invoices?id=${r.invoiceId}` : r.saleId ? `/sales/${r.saleId}` : null;
                const clientNameM = r.invoice?.job?.client?.fullName ?? r.sale?.client?.fullName ?? "—";
                return (
                  <div key={`m-${r.id}`} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {sourceHrefM ? (
                          <Link href={sourceHrefM} className="font-mono text-xs font-semibold text-[var(--accent)] hover:underline">{sourceLabelM}</Link>
                        ) : (
                          <span className="font-mono text-xs font-semibold text-[var(--ink)]">{sourceLabelM}</span>
                        )}
                        <span className={`rounded px-1 py-0.5 text-[10px] font-semibold ${r.invoiceId ? "border border-blue-400/30 bg-blue-500/10 text-blue-700 dark:text-blue-400" : "border border-violet-400/30 bg-violet-500/10 text-violet-700 dark:text-violet-400"}`}>
                          {r.invoiceId ? "Invoice" : "Sale"}
                        </span>
                      </div>
                      <span className="shrink-0 rounded border border-[var(--line)] bg-[var(--panel-strong)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--ink-muted)]">{r.method.replace(/_/g, " ")}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
                      <span className="font-medium text-[var(--ink)]">{clientNameM}</span>
                      <span className="font-bold tabular-nums text-[var(--ink)]">{formatMoney(r.amount, refundCurrencyM)}</span>
                      <span className="text-[var(--ink-muted)]">{r.refundedAt.toLocaleDateString()}</span>
                    </div>
                    {(r.reference || r.note) && (
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-[var(--ink-muted)]">
                        {r.reference && <span>Ref: <span className="font-mono">{r.reference}</span></span>}
                        {r.note && <span className="line-clamp-1">{r.note}</span>}
                      </div>
                    )}
                    <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--ink-muted)]">
                      <span>By: {r.createdBy?.name ?? "—"}</span>
                      {user.role === "ADMIN" && (
                        <form action={deleteRefundAction}>
                          <input type="hidden" name="refundId" value={r.id} />
                          <ConfirmSubmitButton message="Delete this refund? This cannot be undone." confirmLabel="Delete" className="rounded border border-red-400/30 px-2 py-0.5 text-[11px] font-semibold text-red-600 hover:bg-red-500/10 dark:text-red-400">Delete</ConfirmSubmitButton>
                        </form>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Source</th>
                    <th className="px-4 py-3 text-left">Client</th>
                    <th className="px-4 py-3 text-left">Method</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-left">Reference</th>
                    <th className="px-4 py-3 text-left">Note</th>
                    <th className="px-4 py-3 text-left">Issued By</th>
                    {user.role === "ADMIN" && <th className="px-4 py-3" />}
                  </tr>
                </thead>
              <tbody>
                {filtered.map((r) => {
                  const refundCurrency = normalizeCurrency(r.currency, currency);
                  const sourceLabel = r.invoice
                    ? r.invoice.invoiceNumber
                    : r.sale
                    ? r.sale.saleNumber
                    : "—";
                  const sourceHref = r.invoiceId
                    ? `/documents/invoices?id=${r.invoiceId}`
                    : r.saleId
                    ? `/sales/${r.saleId}`
                    : null;
                  const clientName =
                    r.invoice?.job?.client?.fullName ??
                    r.sale?.client?.fullName ??
                    "—";

                  return (
                    <tr key={r.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-raised)]">
                      <td className="whitespace-nowrap px-4 py-3 text-[var(--ink-muted)]">
                        {r.refundedAt.toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          {sourceHref ? (
                            <Link href={sourceHref} className="font-mono text-xs font-semibold text-[var(--accent)] hover:underline">
                              {sourceLabel}
                            </Link>
                          ) : (
                            <span className="font-mono text-xs font-semibold">{sourceLabel}</span>
                          )}
                          {r.creditNote && (
                            <span className="text-[10px] text-[var(--ink-muted)]">
                              CN: {r.creditNote.creditNoteNumber}
                            </span>
                          )}
                          <span className={`inline-flex w-fit rounded px-1 py-0.5 text-[10px] font-semibold ${r.invoiceId ? "border border-blue-400/30 bg-blue-500/10 text-blue-700 dark:text-blue-400" : "border border-violet-400/30 bg-violet-500/10 text-violet-700 dark:text-violet-400"}`}>
                            {r.invoiceId ? "Invoice" : "Sale"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--ink)]">{clientName}</td>
                      <td className="px-4 py-3">
                        <span className="rounded border border-[var(--line)] bg-[var(--panel-strong)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--ink-muted)]">
                          {r.method.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-[var(--ink)]">
                        {formatMoney(r.amount, refundCurrency)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--ink-muted)]">
                        {r.reference || "—"}
                      </td>
                      <td className="max-w-[160px] truncate px-4 py-3 text-[var(--ink-muted)]">
                        {r.note || "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[var(--ink-muted)]">
                        {r.createdBy?.name ?? "—"}
                      </td>
                      {user.role === "ADMIN" && (
                        <td className="px-4 py-3">
                          <form action={deleteRefundAction}>
                            <input type="hidden" name="refundId" value={r.id} />
                            <ConfirmSubmitButton
                              message="Delete this refund? This cannot be undone."
                              confirmLabel="Delete"
                              className="rounded border border-red-400/30 px-2 py-0.5 text-[11px] font-semibold text-red-600 hover:bg-red-500/10 dark:text-red-400"
                            >Delete</ConfirmSubmitButton>
                          </form>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>

      {/* Issue new refund */}
      {["ADMIN", "OPS", "MANAGER", "FINANCE"].includes(user.role) && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="mb-3 text-sm font-bold text-[var(--ink)]">Issue New Refund</h2>
          <form action={createRefundAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                Invoice ID
              </label>
              <input
                name="invoiceId"
                placeholder="Invoice ID (or leave blank for sale)"
                className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                Sale ID (if not invoice)
              </label>
              <input
                name="saleId"
                placeholder="Sale ID"
                className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                Amount ({currency})
              </label>
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                required
                className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                Method
              </label>
              <select
                name="method"
                className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{m.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                Reference (optional)
              </label>
              <input
                name="reference"
                placeholder="Transaction ref"
                className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                Note (optional)
              </label>
              <input
                name="note"
                placeholder="Reason for refund"
                className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>
            <div className="flex items-end sm:col-span-2 lg:col-span-3">
              <button
                type="submit"
                className="h-9 rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-white hover:opacity-90"
              >
                Issue Refund
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
