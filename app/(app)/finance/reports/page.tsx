import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function FinanceReportsPage() {
  const { user } = await getCurrentUserRole();
  if (!can.viewFinancials(user)) redirect("/dashboard");

  const reports = [
    {
      href: "/finance/reports/pl",
      title: "Profit & Loss",
      desc: "Income vs expenses by period with category breakdown and net profit.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden>
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
        </svg>
      ),
    },
    {
      href: "/finance/reports/balance-sheet",
      title: "Balance Sheet",
      desc: "Assets, liabilities and equity snapshot with financial ratios.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden>
          <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
        </svg>
      ),
    },
    {
      href: "/finance/reports/cash-flow",
      title: "Cash Flow",
      desc: "Operating inflows and outflows, bank activity and expense breakdown.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden>
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
      ),
    },
    {
      href: "/finance/reports/customer-statement",
      title: "Customer Statement",
      desc: "Per-client running ledger — invoiced, paid, and balance due.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
        </svg>
      ),
    },
    {
      href: "/finance/reports/aged-receivables",
      title: "Aged Receivables",
      desc: "Outstanding invoices grouped by 0–30, 31–60, 61–90, 90+ days overdue.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden>
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
      ),
    },
    {
      href: "/finance/reports/inventory-value",
      title: "Inventory Valuation",
      desc: "Total stock value at cost, broken down by category and location.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden>
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="space-y-5 p-4 md:p-5">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">Finance</p>
        <h1 className="mt-0.5 text-xl font-bold text-[var(--ink)]">Financial Reports</h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">Statements, analysis and export tools</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="panel-shadow flex flex-col gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 transition hover:border-[var(--accent)]/40 hover:bg-[var(--panel-strong)]"
          >
            <span className="text-[var(--accent)]">{r.icon}</span>
            <p className="font-semibold text-[var(--ink)]">{r.title}</p>
            <p className="text-xs text-[var(--ink-muted)]">{r.desc}</p>
            <p className="mt-auto text-[11px] font-semibold text-[var(--accent)]">Open Report →</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
