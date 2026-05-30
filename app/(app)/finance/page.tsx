export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { orgDb } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { formatMoneyCompact } from "@/lib/currency";

/* ─── quick-action tiles ─────────────────────────────── */
const QUICK_ACTIONS = [
  { label: "Invoices",   href: "/documents/invoices",    icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M16 13H8|M16 17H8|M10 9H8",  color: "text-amber-500" },
  { label: "Receipts",   href: "/documents/receipts",    icon: "M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z|M9 12h6|M9 16h6|M9 8h2",   color: "text-emerald-500" },
  { label: "Expenses",   href: "/finance/expenses",      icon: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-8 2a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z", color: "text-rose-500" },
  { label: "Payments",   href: "/payout-followups",      icon: "M12 2v20|M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",                                           color: "text-sky-500"   },
  { label: "Recurring",  href: "/finance/recurring",     icon: "M17 1l4 4-4 4|M3 11V9a4 4 0 0 1 4-4h14|M7 23l-4-4 4-4|M21 13v2a4 4 0 0 1-4 4H3",                      color: "text-violet-500"},
  { label: "Bank",       href: "/finance/bank",          icon: "M3 22h18|M6 18V9|M10 18V9|M14 18V9|M18 18V9|M12 2l9 7H3l9-7Z",                                         color: "text-blue-500"  },
  { label: "Accounts",   href: "/finance/accounts",      icon: "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z|M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z",               color: "text-indigo-500"},
  { label: "Reports",    href: "/finance/reports",       icon: "M3 3v18h18|m19 9-5 5-4-4-3 3",                                                                          color: "text-pink-500"  },
  { label: "Quotes",     href: "/documents/quotations",  icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M10 13h4|M8 17h8|M8 9h2",       color: "text-teal-500"  },
  { label: "Tax Rates",  href: "/finance/tax-rates",     icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M9 13l6 0|M9 9h1|M9 17h1",      color: "text-orange-500"},
] as const;

function NavIcon({ d, color }: { d: string; color: string }) {
  const paths = d.split("|");
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={color} aria-hidden="true">
      {paths.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

export default async function FinancePage() {
  const { user, orgId } = await requireOrgSession();
  if (!can.viewFinancials(user)) redirect("/dashboard");

  const db = orgDb(orgId);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currency = (user as { org?: { baseCurrency?: string } }).org?.baseCurrency ?? "UGX";

  // Fetch summary stats
  const [expensesMtd, invoicesPaid, receiptsCount] = await Promise.all([
    db.expense.aggregate({
      where: { orgId, date: { gte: monthStart } },
      _sum: { amount: true },
    }).catch(() => ({ _sum: { amount: null } })),
    db.invoice.aggregate({
      where: { orgId, status: "PAID", paidAt: { gte: monthStart } },
      _sum: { totalAmount: true },
    }).catch(() => ({ _sum: { totalAmount: null } })),
    db.receipt.count({ where: { orgId, createdAt: { gte: monthStart } } }).catch(() => 0),
  ]);

  const expTotal  = expensesMtd._sum.amount ?? 0;
  const revTotal  = invoicesPaid._sum.totalAmount ?? 0;

  const STATS = [
    { label: "Revenue MTD",  value: formatMoneyCompact(revTotal,  currency), color: "text-emerald-600 dark:text-emerald-400" },
    { label: "Expenses MTD", value: formatMoneyCompact(expTotal,  currency), color: "text-rose-600 dark:text-rose-400"       },
    { label: "Receipts",     value: String(receiptsCount),                   color: "text-sky-600 dark:text-sky-400"         },
    { label: "Net",          value: formatMoneyCompact(revTotal - expTotal, currency), color: revTotal - expTotal >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400" },
  ];

  // Month-over-month revenue (last month for % change)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
  const invoicesPaidLastMonth = await db.invoice.aggregate({
    where: { orgId, status: "PAID", paidAt: { gte: lastMonthStart, lt: lastMonthEnd } },
    _sum: { totalAmount: true },
  }).catch(() => ({ _sum: { totalAmount: null } }));
  const revLastMonth = invoicesPaidLastMonth._sum.totalAmount ?? 0;
  const revPct = revLastMonth > 0 ? Math.round(((revTotal - revLastMonth) / revLastMonth) * 100) : null;

  return (
    <div className="space-y-5 pb-24 lg:pb-6">

      {/* ── Mobile Hero: Revenue this month (Revolut-style) ──────── */}
      <div className="lg:hidden flex flex-col items-center gap-1 rounded-3xl bg-[var(--panel)] px-6 py-7">
        <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Month Revenue</p>
        <p className="mt-1 text-[32px] font-black leading-none tracking-tight text-[var(--ink)]">
          {formatMoneyCompact(revTotal, currency)}
        </p>
        {/* Accent underline */}
        <div className="mt-1 h-[3px] w-20 rounded-full bg-gradient-to-r from-emerald-400 to-[var(--accent)] opacity-80" aria-hidden="true" />
        {revPct !== null && (
          <p className={`mt-2 text-[12px] font-bold ${revPct >= 0 ? "text-emerald-500" : "text-red-400"}`}>
            {revPct >= 0 ? "↑" : "↓"} {Math.abs(revPct)}% vs last month
          </p>
        )}
      </div>

      {/* ── Desktop page header ───────────────────────────────────── */}
      <div className="panel-shadow hidden overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] lg:block">
        <div className="px-4 py-4">
          <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Finance</p>
          <p className="text-[15px] font-bold text-[var(--ink)]">Finance Hub</p>
          <p className="text-[13px] text-[var(--ink-muted)]">
            {now.toLocaleDateString("en-UG", { month: "long", year: "numeric" })}
          </p>
        </div>
      </div>

      {/* ── Mobile stats strip ───────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2.5 lg:hidden">
        {STATS.map((s) => (
          <div key={s.label} className="rounded-2xl bg-[var(--panel)] px-4 py-3.5">
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">{s.label}</p>
            <p className={`mt-1 text-[20px] font-black leading-none ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Quick actions grid ────────────────────────────────────── */}
      {/* Mobile: 2 columns, icon row on left + label */}
      <section>
        <div className="grid grid-cols-2 gap-2.5 lg:hidden">
          {QUICK_ACTIONS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-2xl bg-[var(--panel)] px-4 py-3.5 transition-all active:opacity-80"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--panel-strong)]">
                <NavIcon d={item.icon} color={item.color} />
              </span>
              <span className="text-[13px] font-semibold leading-snug text-[var(--ink)]">{item.label}</span>
            </Link>
          ))}
        </div>
        {/* Desktop: original compact grid */}
        <div className="hidden gap-2 lg:grid lg:grid-cols-5">
          {QUICK_ACTIONS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-2 py-4 text-center transition-all hover:border-[var(--accent)]/30 hover:bg-[var(--panel-strong)] active:scale-[0.97]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--panel-strong)]">
                <NavIcon d={item.icon} color={item.color} />
              </span>
              <span className="text-[13px] font-semibold leading-tight text-[var(--ink)]">{item.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Desktop stats ─────────────────────────────────────────── */}
      <div className="hidden gap-4 lg:grid lg:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-4">
            <p className="text-[13px] text-[var(--ink-muted)]">{s.label}</p>
            <p className={`mt-1 text-2xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
