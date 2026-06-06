export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { orgDb } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { formatMoneyCompact } from "@/lib/currency";
import { loadCashCollectionsByChannel, loadExpensesTotal } from "@/lib/finance/reconciliation";

/* ─── nav groups ─────────────────────────────────────────────────────────── */

type TileItem = { label: string; href: string; icon: string; color: string };

const GROUPS: { label: string; tiles: TileItem[] }[] = [
  {
    label: "Documents",
    tiles: [
      { label: "Invoices",      href: "/documents/invoices",     icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M16 13H8|M16 17H8|M10 9H8",  color: "text-amber-500"  },
      { label: "Receipts",      href: "/documents/receipts",     icon: "M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z|M9 12h6|M9 16h6|M9 8h2",  color: "text-emerald-500"},
      { label: "Quotes",        href: "/documents/quotations",   icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M10 13h4|M8 17h8|M8 9h2",      color: "text-teal-500"   },
      { label: "Credit Notes",  href: "/documents/credit-notes", icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M9 15l2 2 4-4|M9 9h6",         color: "text-cyan-500"   },
      { label: "Refunds",       href: "/documents/refunds",      icon: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8|M3 3v5h5|M12 7v5l4 2",                             color: "text-orange-400" },
    ],
  },
  {
    label: "Transactions",
    tiles: [
      { label: "Expenses",          href: "/finance/expenses",       icon: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-8 2a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z", color: "text-rose-500"   },
      { label: "Collections",       href: "/payout-followups",       icon: "M12 2v20|M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",                                     color: "text-sky-500"    },
      { label: "Cashier Shifts",    href: "/pos/shifts",             icon: "M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z|M3 9l2.45-4.9A2 2 0 0 1 7.24 3h9.52a2 2 0 0 1 1.8 1.1L21 9|M12 3v6", color: "text-violet-500" },
      { label: "Recurring",         href: "/finance/recurring",      icon: "M17 1l4 4-4 4|M3 11V9a4 4 0 0 1 4-4h14|M7 23l-4-4 4-4|M21 13v2a4 4 0 0 1-4 4H3",               color: "text-purple-500" },
    ],
  },
  {
    label: "Accounting",
    tiles: [
      { label: "Bank",              href: "/finance/bank",           icon: "M3 22h18|M6 18V9|M10 18V9|M14 18V9|M18 18V9|M12 2l9 7H3l9-7Z",                                   color: "text-blue-500"   },
      { label: "Chart of Accounts", href: "/finance/accounts",       icon: "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z|M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z",         color: "text-indigo-500" },
      { label: "Journal Entries",   href: "/finance/journal",        icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M8 13h2|M14 13h2|M8 17h2|M14 17h2", color: "text-slate-400"  },
      { label: "Tax Rates",         href: "/finance/tax-rates",      icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M9 13l6 0|M9 9h1|M9 17h1", color: "text-orange-500" },
    ],
  },
  {
    label: "Insights",
    tiles: [
      { label: "Reports",     href: "/reports",               icon: "M3 3v18h18|m19 9-5 5-4-4-3 3",                                                                           color: "text-pink-500"   },
      { label: "P&L",         href: "/finance/reports/pl",    icon: "M3 3v18h18|M7 16l4-8 4 4 4-6",                                                                           color: "text-emerald-500"},
      { label: "Balance Sheet",href: "/finance/reports/balance-sheet", icon: "M12 2v20|M2 12h20|M17 7l-5 5-5-5|M7 17l5-5 5 5",                                                color: "text-sky-400"    },
      { label: "Targets",     href: "/targets",               icon: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z|M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z|M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z", color: "text-yellow-500" },
      { label: "AI Insights", href: "/ai-insights",           icon: "M12 2a5 5 0 0 1 5 5c0 2.76-2.24 5-5 5S7 9.76 7 7a5 5 0 0 1 5-5z|M2 22c0-4.41 4.03-8 9-8 1.45 0 2.82.35 4 .96|M18 14l-1 4h-2l-1-4|M16 22v-8|M20 18h-8", color: "text-fuchsia-500" },
    ],
  },
];

function NavIcon({ d, color }: { d: string; color: string }) {
  const paths = d.split("|");
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={color} aria-hidden="true">
      {paths.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

export default async function FinancePage() {
  const { user, orgId, org } = await requireOrgSession();
  if (!can.viewFinancials(user)) redirect("/dashboard");

  const db = orgDb(orgId);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currency = org.baseCurrency;

  const [expensesTotal, collectionsMtd, receiptsCount] = await Promise.all([
    loadExpensesTotal({ orgId, range: { start: monthStart } }).catch(() => 0),
    loadCashCollectionsByChannel({ orgId, baseCurrency: currency, range: { start: monthStart } }).catch(() => ({ total: 0 })),
    db.payment.count({ where: { receivedAt: { gte: monthStart }, kind: "PAYMENT" } }).catch(() => 0),
  ]);

  const expTotal = expensesTotal;
  const revTotal = collectionsMtd.total;

  const STATS = [
    { label: "Revenue MTD",  value: formatMoneyCompact(revTotal,  currency), color: "text-emerald-600 dark:text-emerald-400" },
    { label: "Expenses MTD", value: formatMoneyCompact(expTotal,  currency), color: "text-rose-600 dark:text-rose-400"       },
    { label: "Receipts",     value: String(receiptsCount),                   color: "text-sky-600 dark:text-sky-400"         },
    { label: "Net",          value: formatMoneyCompact(revTotal - expTotal, currency), color: revTotal - expTotal >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400" },
  ];

  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 1);
  const collectionsLastMonth = await loadCashCollectionsByChannel({
    orgId, baseCurrency: currency, range: { start: lastMonthStart, end: lastMonthEnd },
  }).catch(() => ({ total: 0 }));
  const revPct = collectionsLastMonth.total > 0
    ? Math.round(((revTotal - collectionsLastMonth.total) / collectionsLastMonth.total) * 100)
    : null;

  return (
    <div className="space-y-6 pb-24 lg:pb-6">

      {/* ── Mobile hero ──────────────────────────────────────────── */}
      <div className="lg:hidden flex flex-col items-center gap-1 rounded-3xl bg-[var(--panel)] px-6 py-7">
        <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Month Revenue</p>
        <p className="mt-1 text-[32px] font-black leading-none tracking-tight text-[var(--ink)]">
          {formatMoneyCompact(revTotal, currency)}
        </p>
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

      {/* ── Stats ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
        {STATS.map((s) => (
          <div key={s.label} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3.5 lg:py-4">
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)] lg:text-[13px] lg:normal-case lg:tracking-normal lg:font-normal">{s.label}</p>
            <p className={`mt-1 text-[20px] font-black leading-none lg:text-lg ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Grouped tiles ─────────────────────────────────────────── */}
      <div className="space-y-5">
        {GROUPS.map((group) => (
          <section key={group.label}>
            <h2 className="mb-2.5 px-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              {group.label}
            </h2>
            {/* Mobile: 2-col list rows */}
            <div className="grid grid-cols-2 gap-2 lg:hidden">
              {group.tiles.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 rounded-2xl bg-[var(--panel)] px-4 py-3 transition-all active:opacity-75"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--panel-strong)]">
                    <NavIcon d={item.icon} color={item.color} />
                  </span>
                  <span className="text-[13px] font-semibold leading-snug text-[var(--ink)]">{item.label}</span>
                </Link>
              ))}
            </div>
            {/* Desktop: compact icon grid */}
            <div className="hidden gap-2 lg:grid lg:grid-cols-6">
              {group.tiles.map((item) => (
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
        ))}
      </div>

    </div>
  );
}
