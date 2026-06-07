// @ts-nocheck — TODO: resolve underlying type issues and remove this pragma
import Link from "next/link";
import { getCurrentUserRole } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { formatMoneyCompact, normalizeCurrency, getAppCurrency } from "@/lib/currency";
import { loadCashCollectionsByChannel } from "@/lib/finance/reconciliation";
import { orgDb, prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { ConfirmSubmitButton } from "@/components/shared/ConfirmSubmitButton";

function monthKey(d: Date) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function nextSaleNumber(db: ReturnType<typeof orgDb>) {
  const prefix = `S-${monthKey(new Date())}-`;
  const last = await db.sale.findFirst({
    where: { saleNumber: { startsWith: prefix } },
    orderBy: { saleNumber: "desc" },
    select: { saleNumber: true },
  });
  const lastSeq = last?.saleNumber.slice(prefix.length);
  const n = lastSeq ? Number.parseInt(lastSeq, 10) : 0;
  const next = Number.isFinite(n) ? n + 1 : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export default async function PosPage() {
  const { user } = await getCurrentUserRole();
  const db = orgDb(user.orgId);
  if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role))) {
    redirect("/dashboard");
  }

  const currency = getAppCurrency();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [kpiTodayCollections, kpiMonthCollections, kpiMonthCount] = await Promise.all([
    loadCashCollectionsByChannel({ orgId: user.orgId, baseCurrency: currency, range: { start: todayStart } }).catch(() => ({ products: 0 })),
    loadCashCollectionsByChannel({ orgId: user.orgId, baseCurrency: currency, range: { start: monthStart } }).catch(() => ({ products: 0 })),
    db.payment.count({ where: { saleId: { not: null }, receivedAt: { gte: monthStart }, kind: "PAYMENT" } }).catch(() => 0),
  ]);
  const kpiTodayTotal = kpiTodayCollections.products ?? 0;
  const kpiMonthTotal = kpiMonthCollections.products ?? 0;
  const kpiAvgSale = kpiMonthCount > 0 ? kpiMonthTotal / kpiMonthCount : 0;

  let dbNeedsFix = false;

  const branches: { id: string; name: string }[] = [];
  const defaultBranchId: string | null = null;

  async function createSaleAction(_formData: FormData) {
    "use server";
    const { user: _u2 } = await getCurrentUserRole();
    const db = orgDb(_u2.orgId);
    if (!(can.viewFinancials(_u2) || ["ADMIN", "OPS", "FRONT_DESK"].includes(_u2.role))) redirect("/dashboard");

    const saleNumber = await nextSaleNumber(db);
    const sale = await db.sale.create({
      data: {
        saleNumber,
        status: "OPEN",
        // currency uses schema default
        createdById: _u2.id,
      },
      select: { id: true },
    });

    revalidatePath("/pos");
    redirect(`/pos/${sale.id}`);
  }

  async function deleteSaleAction(formData: FormData) {
    "use server";
    const { user: _u3 } = await getCurrentUserRole();
    const db = orgDb(_u3.orgId);
    if (_u3.role !== "ADMIN") redirect("/dashboard");

    const saleId = String(formData.get("saleId") ?? "").trim();
    if (!saleId) return;

    const sale = await db.sale.findFirst({
      where: { id: saleId },
      select: {
        id: true,
        status: true,
        invoicedAt: true,
        items: { select: { partId: true, quantity: true, description: true } },
        payments: { select: { id: true }, take: 1 },
        creditNotes: { select: { id: true }, take: 1 },
        refunds: { select: { id: true }, take: 1 },
        deliveryNotes: { select: { id: true }, take: 1 },
      },
    });
    if (!sale || sale.status !== "OPEN" || sale.invoicedAt || sale.payments.length || sale.creditNotes.length || sale.refunds.length || sale.deliveryNotes.length) return;

    await prisma.$transaction(async (tx) => {
      for (const item of sale.items) {
        if (!item.partId) continue;
        const part = await tx.part.findFirst({ where: { id: item.partId }, select: { id: true, qtyOnHand: true } });
        if (!part) continue;
        await tx.part.update({ where: { id: part.id }, data: { qtyOnHand: part.qtyOnHand + Math.abs(item.quantity) } });
        await tx.partStockTransaction.create({
          data: {
            partId: part.id,
            saleId: sale.id,
            type: "IN",
            quantity: Math.abs(item.quantity),
            reason: `POS sale deleted (${item.description})`,
            createdById: _u3.id,
          },
        });
      }
      await tx.sale.deleteMany({ where: { id: sale.id } });
    });

    revalidatePath("/pos");
  }

  let sales: Array<{
    id: string;
    saleNumber: string;
    status: string;
    currency: string | null;
    totalAmount: number;
    paidAmount: number;
    invoicedAt: Date | null;
    createdAt: Date;
    _count: { payments: number; creditNotes: number; refunds: number; deliveryNotes: number };
  }> = [];
  try {
    sales = await db.sale.findMany({
      where: {},
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        saleNumber: true,
        status: true,
        currency: true,
        totalAmount: true,
        paidAmount: true,
        invoicedAt: true,
        createdAt: true,
        _count: { select: { payments: true, creditNotes: true, refunds: true, deliveryNotes: true } },
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("no such table") && msg.includes("Sale")) dbNeedsFix = true;
    sales = [];
  }

  return (
    <div className="space-y-4">
      {dbNeedsFix ? (
        <section className="panel-shadow rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          <p className="font-semibold text-amber-50">POS database tables are missing.</p>
          <p className="mt-1 text-amber-100/90">
            Run <span className="mono">/api/admin/db-fix</span> as the platform admin to create <span className="mono">Sale</span> tables.
          </p>
          <a
            className="mt-3 inline-flex rounded-lg border border-amber-500/30 bg-black/20 px-3 py-2 text-xs font-semibold text-amber-50 hover:bg-black/30"
            href="/api/admin/db-fix"
            target="_blank"
            rel="noreferrer"
          >
            Open DB Fix
          </a>
        </section>
      ) : null}
      {/* ── Page header ── */}
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div>
            <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Point of Sale</p>
            <p className="text-[13px] font-bold text-[var(--ink)]">Sales</p>
            <p className="text-[13px] text-[var(--ink-muted)]">Walk-in and retail transactions</p>
          </div>
          <Link href="/pos/shifts" className="btn-premium-secondary rounded-lg px-3 py-1.5 text-[12px]">Shifts →</Link>
        </div>
      </div>

      {/* ── KPI tiles ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Today&apos;s Sales</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{formatMoneyCompact(kpiTodayTotal, currency)}</p>
          <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">today</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">This Month</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{formatMoneyCompact(kpiMonthTotal, currency)}</p>
          <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">this month</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Transactions This Month</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{kpiMonthCount}</p>
          <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">sales this month</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Avg Sale Value</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{formatMoneyCompact(kpiAvgSale, currency)}</p>
          <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">per transaction</p>
        </div>
      </div>

      <div className="panel-shadow flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
        <p className="text-[13px] font-bold text-[var(--ink)]">Sales</p>
        <form action={createSaleAction} className="flex flex-wrap items-center gap-2">
          <select
            name="branchId"
            defaultValue={defaultBranchId ?? ""}
            className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50"
          >
            <option value="">No branch</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <button type="submit" className="btn-premium rounded-lg px-3 py-1.5 text-[12px]">New Sale</button>
        </form>
      </div>

      <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="border-b border-[var(--line)] bg-[var(--panel-strong)] px-4 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Recent</p>
        </div>
        {sales.length === 0 ? (
          <div className="px-4 py-10 text-sm text-[var(--ink-muted)]">No sales yet.</div>
        ) : (
          <>
            {/* ── Mobile cards ── */}
            <div className="divide-y divide-[var(--line)] lg:hidden">
              {sales.map((s) => {
                const canDeleteSale = user.role === "ADMIN" && s.status === "OPEN" && !s.invoicedAt && s._count.payments === 0 && s._count.creditNotes === 0 && s._count.refunds === 0 && s._count.deliveryNotes === 0;
                const statusCls = s.status === "PAID"
                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : s.status === "VOID"
                    ? "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400"
                    : "border-amber-400/30 bg-amber-400/15 text-amber-700 dark:text-amber-400";
                return (
                  <div key={`m-${s.id}`} className="px-4 py-3">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="mono text-[13px] font-bold text-[var(--ink)]">{s.saleNumber}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[13px] font-semibold ${statusCls}`}>{s.status}</span>
                    </div>
                    <div className="mb-2 flex items-baseline gap-3 text-sm">
                      <span className="font-semibold text-[var(--ink)]">{formatMoneyCompact(s.totalAmount, normalizeCurrency(s.currency, "UGX"))}</span>
                      <span className="text-[13px] text-[var(--ink-muted)]">paid {formatMoneyCompact(s.paidAmount, normalizeCurrency(s.currency, "UGX"))}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/pos/${s.id}`} className="btn-premium-secondary rounded-md px-2.5 py-1.5 text-xs">Open/Edit</Link>
                      {canDeleteSale ? (
                        <form action={deleteSaleAction}>
                          <input type="hidden" name="saleId" value={s.id} />
                          <ConfirmSubmitButton message="Delete this open POS sale? Stock will be restored." className="rounded-md border border-red-400/30 bg-red-500/5 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-500/10 dark:text-red-400">Delete</ConfirmSubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* ── Desktop table ── */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-[var(--line)]">
                  <tr className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                    <th className="px-4 py-2.5">Sale</th>
                    <th className="px-4 py-2.5">Branch</th>
                    <th className="px-4 py-2.5">Total</th>
                    <th className="px-4 py-2.5">Paid</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {sales.map((s) => {
                    const canDeleteSale = user.role === "ADMIN" && s.status === "OPEN" && !s.invoicedAt && s._count.payments === 0 && s._count.creditNotes === 0 && s._count.refunds === 0 && s._count.deliveryNotes === 0;
                    return (
                      <tr key={`d-${s.id}`} className="hover:bg-[var(--panel-strong)]/40">
                        <td className="px-4 py-3 mono font-semibold">{s.saleNumber}</td>
                        <td className="px-4 py-3 text-[var(--ink-muted)]">—</td>
                        <td className="px-4 py-3">{formatMoneyCompact(s.totalAmount, normalizeCurrency(s.currency, "UGX"))}</td>
                        <td className="px-4 py-3">{formatMoneyCompact(s.paidAmount, normalizeCurrency(s.currency, "UGX"))}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2 py-0.5 text-[13px] font-semibold ${
                            s.status === "PAID"
                              ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                              : s.status === "VOID"
                                ? "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400"
                                : "border-amber-400/30 bg-amber-400/15 text-amber-700 dark:text-amber-400"
                          }`}>
                            {s.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={`/pos/${s.id}`} className="btn-premium-secondary rounded-md px-2.5 py-1.5 text-xs">Open/Edit</Link>
                            {canDeleteSale ? (
                              <form action={deleteSaleAction}>
                                <input type="hidden" name="saleId" value={s.id} />
                                <ConfirmSubmitButton message="Delete this open POS sale? Stock will be restored." className="rounded-md border border-red-400/30 bg-red-500/5 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-500/10 dark:text-red-400">Delete</ConfirmSubmitButton>
                              </form>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
