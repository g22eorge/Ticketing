export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { PaymentMethod } from "@prisma/client";

import { formatMoney, normalizeCurrency, toBaseAmount } from "@/lib/currency";
import { can } from "@/lib/permissions";
import { orgDb, prisma } from "@/lib/prisma";
import { getCurrentUserRole } from "@/lib/session";
import { ConfirmSubmitButton } from "@/components/shared/ConfirmSubmitButton";
import { writeSystemAuditEvent } from "@/lib/commercial/audit";
import { RowActionsMenu, MenuSection, MenuDestructiveRow } from "@/components/shared/RowActionsMenu";
import { createReceiptForPayment } from "@/lib/commercial/document-workflow";

const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "OTHER"];

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; period?: string }>;
}) {
  const { user } = await getCurrentUserRole();
  const db = orgDb(user.orgId);
  if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role))) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const period = params.period ?? "all";

  async function createReceiptAction(formData: FormData) {
    "use server";
    const { user } = await getCurrentUserRole();
    if (!user.orgId) return;
    const orgId = user.orgId;
    const db = orgDb(orgId);
    if (!(can.viewFinancials(user) || ["ADMIN", "OPS"].includes(user.role))) redirect("/dashboard");

    const invoiceId = String(formData.get("invoiceId") ?? "").trim();
    const amount = Number(String(formData.get("amount") ?? "").trim());
    const methodRaw = String(formData.get("method") ?? "CASH").trim();
    const reference = String(formData.get("reference") ?? "").trim();
    const currency = normalizeCurrency(formData.get("currency"), "UGX");
    if (!invoiceId || !Number.isFinite(amount) || amount <= 0) return;

    const method = PAYMENT_METHODS.includes(methodRaw as PaymentMethod) ? (methodRaw as PaymentMethod) : "OTHER" as PaymentMethod;
    const invoice = await db.invoice.findFirst({ where: { id: invoiceId, status: { not: "VOID" } }, select: { id: true, totalAmount: true, paidAmount: true, clientId: true, jobId: true } });
    if (!invoice || invoice.paidAmount + amount > invoice.totalAmount) return;

    await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({ data: { orgId, invoiceId: invoice.id, amount, method, reference: reference || null, currency, createdById: user.id } });
      await createReceiptForPayment(tx, { orgId, paymentId: payment.id, invoiceId: invoice.id, clientId: invoice.clientId, amount, currency, issuedById: user.id });
      const payments = await tx.payment.findMany({ where: { invoiceId: invoice.id, orgId }, select: { amount: true, currency: true, exchangeRateToBase: true } });
      const paidAmount = payments.reduce((sum, p) => sum + toBaseAmount({ amount: p.amount, currency: p.currency, baseCurrency: "UGX", exchangeRateToBase: p.exchangeRateToBase }), 0);
      const isPaid = invoice.totalAmount > 0 && paidAmount >= invoice.totalAmount;
      await tx.invoice.updateMany({ where: { id: invoice.id, orgId }, data: { paidAmount, paidAt: isPaid ? new Date() : null, status: invoice.totalAmount <= 0 ? "PAID" : isPaid ? "PAID" : "ISSUED" } });
      if (invoice.jobId) await tx.job.updateMany({ where: { id: invoice.jobId, orgId }, data: { clientPaid: isPaid, clientPaidAt: isPaid ? new Date() : null, clientPaidById: isPaid ? user.id : null } });
    });
    await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Invoice", entityId: invoice.id, action: "RECEIPT_CREATED", summary: "Receipt generated from invoice" });
    revalidatePath("/documents/receipts");
    revalidatePath("/documents/invoices");
  }

  async function updateReceiptAction(formData: FormData) {
    "use server";
    const { user: _u } = await getCurrentUserRole();
    const db = orgDb(user.orgId);
    if (!(can.viewFinancials(user) || ["ADMIN", "OPS"].includes(user.role))) redirect("/dashboard");

    const paymentId = String(formData.get("paymentId") ?? "").trim();
    const amount = Number(String(formData.get("amount") ?? "").trim());
    const methodRaw = String(formData.get("method") ?? "CASH").trim();
    const reference = String(formData.get("reference") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();
    if (!paymentId || !Number.isFinite(amount) || amount <= 0) return;

    const method = PAYMENT_METHODS.includes(methodRaw as PaymentMethod) ? (methodRaw as PaymentMethod) : "OTHER" as PaymentMethod;

    const source = await prisma.payment.findFirst({
      where: { id: paymentId },
      select: { invoiceId: true, saleId: true, currency: true, exchangeRateToBase: true },
    });
    if (!source) return;

    if (source.invoiceId) {
      const invoice = await db.invoice.findFirst({ where: { id: source.invoiceId }, select: { id: true, totalAmount: true } });
      if (!invoice) return;
      const otherPayments = await prisma.payment.findMany({
        where: { invoiceId: invoice.id, id: { not: paymentId } },
        select: { amount: true, currency: true, exchangeRateToBase: true },
      });
      const nextPaidAmount = otherPayments.reduce((sum, p) => sum + toBaseAmount({ amount: p.amount, currency: p.currency, baseCurrency: "UGX", exchangeRateToBase: p.exchangeRateToBase }), 0)
        + toBaseAmount({ amount, currency: source.currency, baseCurrency: "UGX", exchangeRateToBase: source.exchangeRateToBase });
      if (nextPaidAmount > invoice.totalAmount) return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: { id: paymentId },
        data: { amount, method, reference: reference || null, note: note || null },
      });

      if (source.invoiceId) {
        const invoice = await tx.invoice.findFirst({ where: { id: source.invoiceId }, select: { id: true, totalAmount: true, jobId: true } });
        if (invoice) {
          const payments = await tx.payment.findMany({ where: { invoiceId: invoice.id }, select: { amount: true, currency: true, exchangeRateToBase: true } });
          const paidAmount = payments.reduce((sum, p) => sum + toBaseAmount({ amount: p.amount, currency: p.currency, baseCurrency: "UGX", exchangeRateToBase: p.exchangeRateToBase }), 0);
          const isPaid = invoice.totalAmount > 0 && paidAmount >= invoice.totalAmount;
          await tx.invoice.updateMany({ where: { id: invoice.id }, data: { paidAmount, paidAt: isPaid ? new Date() : null, status: invoice.totalAmount <= 0 ? "PAID" : isPaid ? "PAID" : "ISSUED" } });
          if (invoice.jobId) await tx.job.updateMany({ where: { id: invoice.jobId }, data: { clientPaid: isPaid, clientPaidAt: isPaid ? new Date() : null, clientPaidById: isPaid ? user.id : null } });
        }
      }

      if (source.saleId) {
        const sale = await tx.sale.findFirst({ where: { id: source.saleId }, select: { id: true, totalAmount: true } });
        if (sale) {
          const agg = await tx.payment.aggregate({ where: { saleId: sale.id }, _sum: { amount: true } });
          const paidAmount = agg._sum.amount ?? 0;
          const isPaid = sale.totalAmount > 0 && paidAmount >= sale.totalAmount;
          await tx.sale.updateMany({ where: { id: sale.id }, data: { paidAmount, paidAt: isPaid ? new Date() : null, status: isPaid ? "PAID" : "OPEN" } });
        }
      }
    });
    await writeSystemAuditEvent({ actorUserId: user.id, entityType: "Payment", entityId: paymentId, action: "RECEIPT_UPDATED", summary: "Receipt/payment updated" });

    revalidatePath("/documents/receipts");
    revalidatePath("/documents/invoices");
  }

  async function deleteReceiptAction(formData: FormData) {
    "use server";
    const { user: _u } = await getCurrentUserRole();
    if (!("ADMIN" === user.role || can.approveInvoices(user))) return;

    const paymentId = String(formData.get("paymentId") ?? "").trim();
    if (!paymentId) return;

    const source = await prisma.payment.findFirst({
      where: { id: paymentId },
      select: { invoiceId: true, saleId: true },
    });
    if (!source) return;

    await prisma.$transaction(async (tx) => {
      await tx.payment.deleteMany({ where: { id: paymentId } });

      if (source.invoiceId) {
        const invoice = await tx.invoice.findFirst({ where: { id: source.invoiceId }, select: { id: true, totalAmount: true, jobId: true } });
        if (invoice) {
          const payments = await tx.payment.findMany({ where: { invoiceId: invoice.id }, select: { amount: true, currency: true, exchangeRateToBase: true } });
          const paidAmount = payments.reduce((sum, p) => sum + toBaseAmount({ amount: p.amount, currency: p.currency, baseCurrency: "UGX", exchangeRateToBase: p.exchangeRateToBase }), 0);
          const isPaid = invoice.totalAmount > 0 && paidAmount >= invoice.totalAmount;
          await tx.invoice.updateMany({ where: { id: invoice.id }, data: { paidAmount, paidAt: isPaid ? new Date() : null, status: invoice.totalAmount <= 0 ? "PAID" : isPaid ? "PAID" : "ISSUED" } });
          if (invoice.jobId) await tx.job.updateMany({ where: { id: invoice.jobId }, data: { clientPaid: isPaid, clientPaidAt: isPaid ? new Date() : null, clientPaidById: isPaid ? user.id : null } });
        }
      }

      if (source.saleId) {
        const sale = await tx.sale.findFirst({ where: { id: source.saleId }, select: { id: true, totalAmount: true } });
        if (sale) {
          const agg = await tx.payment.aggregate({ where: { saleId: sale.id }, _sum: { amount: true } });
          const paidAmount = agg._sum.amount ?? 0;
          const isPaid = sale.totalAmount > 0 && paidAmount >= sale.totalAmount;
          await tx.sale.updateMany({ where: { id: sale.id }, data: { paidAmount, paidAt: isPaid ? new Date() : null, status: isPaid ? "PAID" : "OPEN" } });
        }
      }
    });
    await writeSystemAuditEvent({ actorUserId: user.id, entityType: "Payment", entityId: paymentId, action: "RECEIPT_DELETED", summary: "Receipt/payment deleted" });

    revalidatePath("/documents/receipts");
    revalidatePath("/documents/invoices");
  }

  const now2 = new Date();
  const thisMonthStart = new Date(now2.getFullYear(), now2.getMonth(), 1);
  const lastMonthStart = new Date(now2.getFullYear(), now2.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now2.getFullYear(), now2.getMonth(), 0, 23, 59, 59, 999);
  const last30Start = new Date(now2.getTime() - 30 * 24 * 60 * 60 * 1000);

  const periodFilter =
    period === "this_month" ? { gte: thisMonthStart } :
    period === "last_month" ? { gte: lastMonthStart, lte: lastMonthEnd } :
    period === "last_30"    ? { gte: last30Start } :
    undefined;

  const searchWhere = q
    ? {
        OR: [
          { reference: { contains: q } },
          { note: { contains: q } },
          { invoice: { invoiceNumber: { contains: q } } },
          { sale: { saleNumber: { contains: q } } },
        ],
      }
    : {};

  const payments = await prisma.payment.findMany({
    where: {
      ...(periodFilter ? { receivedAt: periodFilter } : {}),
      ...(q ? searchWhere : {}),
    },
    orderBy: { receivedAt: "desc" },
    take: 200,
    select: {
      id: true,
      amount: true,
      currency: true,
      exchangeRateToBase: true,
      method: true,
      reference: true,
      note: true,
      receivedAt: true,
      sale: { select: { id: true, saleNumber: true } },
      invoice: { select: { id: true, invoiceNumber: true, job: { select: { id: true, jobNumber: true } } } },
    },
  });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const receiptsTotal = payments.length;
  const totalAmountBase = payments.reduce(
    (sum, p) =>
      sum +
        toBaseAmount({
          amount: p.amount,
          currency: normalizeCurrency(p.currency, "UGX"),
          baseCurrency: "UGX",
          exchangeRateToBase: p.exchangeRateToBase,
        }),
    0,
  );
  const thisMonth = payments.filter((p) => p.receivedAt >= monthStart);
  const thisMonthAmountBase = thisMonth.reduce(
    (sum, p) =>
      sum +
        toBaseAmount({
          amount: p.amount,
          currency: normalizeCurrency(p.currency, "UGX"),
          baseCurrency: "UGX",
          exchangeRateToBase: p.exchangeRateToBase,
        }),
    0,
  );
  const cashPaymentsCount = payments.filter((p) => p.method === "CASH").length;
  type InvoiceOption = {
    id: string;
    invoiceNumber: string;
    totalAmount: number;
    paidAmount: number;
    currency: string | null;
    job: { jobNumber: string } | null;
    client: { fullName: string } | null;
  };

  const invoiceOptions: InvoiceOption[] = await db.invoice.findMany({
    where: { status: { not: "VOID" } },
    orderBy: { issuedAt: "desc" },
    take: 80,
    select: { id: true, invoiceNumber: true, totalAmount: true, paidAmount: true, currency: true, job: { select: { jobNumber: true } }, client: { select: { fullName: true } } },
  }).then((rows: InvoiceOption[]) => rows.filter((invoice) => invoice.paidAmount < invoice.totalAmount));

  const methodBreakdown = PAYMENT_METHODS.map((method) => {
    const mp = payments.filter((p) => p.method === method);
    const count = mp.length;
    const amount = mp.reduce(
      (sum, p) =>
        sum + toBaseAmount({
          amount: p.amount,
          currency: normalizeCurrency(p.currency, "UGX"),
          baseCurrency: "UGX",
          exchangeRateToBase: p.exchangeRateToBase,
        }),
      0,
    );
    const pct = receiptsTotal > 0 ? Math.round((count / receiptsTotal) * 100) : 0;
    return { method, count, amount, pct };
  }).filter((m) => m.count > 0);

  const PERIOD_LABELS: Record<string, string> = {
    all: "All Time",
    this_month: "This Month",
    last_month: "Last Month",
    last_30: "Last 30 Days",
  };

  function methodBadge(method: string) {
    switch (method) {
      case "CASH":          return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700";
      case "MOBILE_MONEY":  return "border-sky-500/30 bg-sky-500/15 text-sky-700";
      case "CARD":          return "border-purple-500/30 bg-purple-500/15 text-purple-700";
      case "BANK_TRANSFER": return "border-indigo-500/30 bg-indigo-500/15 text-indigo-700";
      default:              return "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]";
    }
  }

  return (
    <section className="space-y-4">
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2.5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Documents</p>
            <p className="text-[13px] font-bold text-[var(--ink)]">Receipts</p>
          </div>
          <Link href="/documents/invoices" className="btn-premium rounded-lg px-3 py-1.5 text-[12px]">Create Receipt</Link>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--line)] sm:grid-cols-4 sm:divide-y-0">
          <div className="px-4 py-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Total</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--ink)]">{receiptsTotal}</p>
            <p className="text-[10px] text-[var(--ink-muted)]">this month: {thisMonth.length}</p>
          </div>
          <div className="px-4 py-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Total Amount</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--ink)]">{formatMoney(totalAmountBase, "UGX")}</p>
          </div>
          <div className="px-4 py-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">This Month</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--accent)]">{formatMoney(thisMonthAmountBase, "UGX")}</p>
          </div>
          <div className="px-4 py-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Cash</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--ink)]">{cashPaymentsCount}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <form className="panel-shadow flex flex-wrap items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search reference, invoice #, sale #…"
          className="flex-1 min-w-[160px] rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none transition focus:border-[var(--accent)]/50 focus:ring-1 focus:ring-[var(--accent)]/20"
        />
        <div className="flex gap-1">
          {(["all", "this_month", "last_month", "last_30"] as const).map((p) => (
            <button
              key={p}
              type="submit"
              name="period"
              value={p}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${period === p ? "bg-[var(--accent)] text-white" : "bg-[var(--panel-strong)] text-[var(--ink-muted)] hover:text-[var(--ink)]"}`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        {(q || period !== "all") && (
          <Link href="/documents/receipts" className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]">Reset</Link>
        )}
      </form>

      {invoiceOptions.length > 0 ? (
        <details className="group rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <summary className="cursor-pointer select-none px-4 py-2.5 text-[12px] font-semibold text-[var(--ink)] group-open:border-b group-open:border-[var(--line)]">
            Create Receipt from invoice
          </summary>
          <form action={createReceiptAction} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <select name="invoiceId" required className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm sm:col-span-2">
              <option value="">Select invoice...</option>
              {invoiceOptions.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} - {invoice.job?.jobNumber ?? invoice.client?.fullName ?? "Invoice"} - due {formatMoney(invoice.totalAmount - invoice.paidAmount, normalizeCurrency(invoice.currency, "UGX"))}</option>
              ))}
            </select>
            <input name="amount" required inputMode="decimal" placeholder="Amount" className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm" />
            <select name="currency" defaultValue="UGX" className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm">
              <option value="UGX">UGX</option>
            </select>
            <select name="method" defaultValue="CASH" className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm">
              {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method.replaceAll("_", " ")}</option>)}
            </select>
            <input name="reference" placeholder="Reference" className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm" />
            <button type="submit" className="btn-premium h-9 rounded-lg px-5 text-sm font-semibold">Create Receipt</button>
          </form>
        </details>
      ) : null}

      {/* Method Breakdown */}
      {methodBreakdown.length > 0 && (
        <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <div className="border-b border-[var(--line)] bg-[var(--panel-strong)]/60 px-4 py-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
              Payment Method Breakdown
              <span className="ml-2 font-normal text-[var(--ink-muted)]/60">{PERIOD_LABELS[period] ?? period}</span>
            </p>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {methodBreakdown.map((m) => (
              <div key={m.method} className="flex items-center gap-3 px-4 py-2">
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${methodBadge(m.method)}`}>
                  {m.method.replaceAll("_", " ")}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
                    <div
                      className="h-1.5 rounded-full bg-[var(--accent)] transition-all"
                      style={{ width: `${m.pct}%` }}
                    />
                  </div>
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-[var(--ink-muted)]">{m.pct}% · {m.count}</span>
                <span className="shrink-0 text-[11px] font-semibold tabular-nums text-[var(--ink)]">{formatMoney(m.amount, "UGX")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel-strong)] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            <tr>
              <th className="px-3 py-2.5">Date</th>
              <th className="px-3 py-2.5">Amount</th>
              <th className="hidden px-3 py-2.5 md:table-cell">Method</th>
              <th className="hidden px-3 py-2.5 lg:table-cell">Reference</th>
              <th className="px-3 py-2.5">For</th>
              <th className="px-3 py-2.5">Action</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => {
              const currency = normalizeCurrency(p.currency, "UGX");
              const label = p.invoice?.job?.jobNumber
                ? `Repair ${p.invoice.job.jobNumber}`
                : p.sale?.saleNumber
                  ? `Sale ${p.sale.saleNumber}`
                  : p.invoice?.invoiceNumber
                    ? `Invoice ${p.invoice.invoiceNumber}`
                    : "Payment";

              const linkHref = p.invoice?.job?.id
                ? `/jobs/${p.invoice.job.id}`
                : p.sale?.id
                  ? `/pos/${p.sale.id}`
                  : null;

              return (
                <tr key={p.id} className="border-t border-[var(--line)] align-middle hover:bg-[var(--panel-strong)]/40">
                  <td className="px-3 py-2.5 text-[var(--ink-muted)]">{p.receivedAt.toLocaleDateString()}<br /><span className="text-[10px]">{p.receivedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></td>
                  <td className="px-3 py-2.5 mono font-bold text-[var(--ink)]">{formatMoney(p.amount, currency)}</td>
                  <td className="hidden px-3 py-2.5 md:table-cell">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${methodBadge(p.method)}`}>
                      {p.method.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="hidden px-3 py-2.5 text-[var(--ink-muted)] lg:table-cell">{p.reference ?? "-"}</td>
                  <td className="px-3 py-2.5">
                    {linkHref ? (
                      <Link href={linkHref} className="font-medium text-[var(--ink)] transition hover:text-[var(--accent)]">
                        {label}
                      </Link>
                    ) : (
                      <span className="text-[var(--ink-muted)]">{label}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      {linkHref ? (
                        <Link href={linkHref} className="inline-flex items-center rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">
                          View
                        </Link>
                      ) : null}
                      <a href={`/api/payments/${p.id}/receipt`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2.5 py-1.5 text-xs font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)]/20">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                        PDF
                      </a>
                      <RowActionsMenu label="Receipt actions">
                        <MenuSection label="Edit Receipt" />
                        <form action={updateReceiptAction} className="space-y-2 p-3">
                          <input type="hidden" name="paymentId" value={p.id} />
                          <input name="amount" inputMode="decimal" defaultValue={p.amount} className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                          <select name="method" defaultValue={p.method} className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50">
                            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replaceAll("_", " ")}</option>)}
                          </select>
                          <input name="reference" defaultValue={p.reference ?? ""} placeholder="Reference" className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                          <textarea name="note" defaultValue={p.note ?? ""} placeholder="Note" className="min-h-14 w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                          <button type="submit" className="btn-premium w-full rounded-lg px-3 py-1.5 text-xs font-semibold">Save</button>
                        </form>
                        <MenuDestructiveRow>
                          <form action={deleteReceiptAction}>
                            <input type="hidden" name="paymentId" value={p.id} />
                            <ConfirmSubmitButton message="Delete this receipt/payment? Totals will be recalculated." className="text-xs font-semibold text-red-600 transition hover:text-red-700">Delete Receipt</ConfirmSubmitButton>
                          </form>
                        </MenuDestructiveRow>
                      </RowActionsMenu>
                    </div>
                  </td>
                </tr>
              );
            })}
            {payments.length === 0 ? (
              <tr className="border-t border-[var(--line)]">
                <td className="px-3 py-8 text-sm text-[var(--ink-muted)]" colSpan={6}>
                  No payments yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
