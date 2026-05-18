import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { formatMoney } from "@/lib/currency";

export const dynamic = "force-dynamic";

export default async function PLPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { user, orgId, org } = await requireOrgSession();
  if (!["ADMIN", "MANAGER", "FINANCE"].includes(user.role)) redirect("/dashboard");

  const sp = await searchParams;
  const currency = org.baseCurrency ?? "UGX";
  const now = new Date();
  const year  = parseInt(sp.year  ?? String(now.getFullYear()));
  const month = parseInt(sp.month ?? String(now.getMonth() + 1));

  const from = new Date(year, month - 1, 1);
  const to   = new Date(year, month, 0, 23, 59, 59);

  // Fetch posted journal lines for this period grouped by account
  const lines = await prisma.journalLine.findMany({
    where: {
      journalEntry: { orgId, status: "POSTED", date: { gte: from, lte: to } },
    },
    include: { account: true, journalEntry: { select: { date: true } } },
  });

  // Group by account, net = credits - debits for REVENUE; debits - credits for EXPENSE
  type AccountSummary = { code: string; name: string; amount: number };

  function summarise(type: "REVENUE" | "EXPENSE"): AccountSummary[] {
    const map = new Map<string, AccountSummary>();
    for (const l of lines) {
      if (l.account.type !== type) continue;
      const existing = map.get(l.accountId);
      const net = type === "REVENUE" ? l.credit - l.debit : l.debit - l.credit;
      if (existing) existing.amount += net;
      else map.set(l.accountId, { code: l.account.code, name: l.account.name, amount: net });
    }
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
  }

  const revenues = summarise("REVENUE");
  const expenses = summarise("EXPENSE");

  const totalRevenue = revenues.reduce((s, r) => s + r.amount, 0);
  const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
  const netIncome    = totalRevenue - totalExpense;

  const hasData = lines.length > 0;

  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--ink)]">Profit & Loss</h1>
          <p className="text-sm text-[var(--ink-muted)]">{months[month - 1]} {year}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/finance/reports/balance-sheet?year=${year}&month=${month}`}
            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--panel)]">
            Balance Sheet →
          </Link>
        </div>
      </div>

      {/* Period selector */}
      <form method="GET" className="flex items-center gap-3">
        <select name="month" defaultValue={month} className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm">
          {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select name="year" defaultValue={year} className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm">
          {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button type="submit" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black">
          View
        </button>
      </form>

      {!hasData ? (
        <div className="rounded-xl border border-dashed border-[var(--line)] py-14 text-center space-y-2">
          <p className="text-sm font-medium text-[var(--ink-muted)]">No posted journal entries for this period.</p>
          <Link href="/finance/journal" className="text-xs text-[var(--accent)] underline">Go to Journal Entries</Link>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--line)] overflow-hidden">
          {/* Revenue */}
          <div className="border-b border-[var(--line)]">
            <div className="bg-green-500/5 px-5 py-2.5">
              <p className="text-xs font-bold uppercase tracking-wide text-green-700">Revenue</p>
            </div>
            {revenues.length === 0 ? (
              <p className="px-5 py-3 text-sm text-[var(--ink-muted)]">No revenue accounts with activity</p>
            ) : (
              revenues.map((r) => (
                <div key={r.code} className="flex items-center justify-between px-5 py-2.5 odd:bg-[var(--bg)] even:bg-[var(--panel)]/40">
                  <div>
                    <span className="font-mono text-xs text-[var(--accent)] mr-2">{r.code}</span>
                    <span className="text-sm text-[var(--ink)]">{r.name}</span>
                  </div>
                  <span className="text-sm font-medium tabular-nums">{formatMoney(r.amount, currency)}</span>
                </div>
              ))
            )}
            <div className="flex items-center justify-between bg-green-500/10 px-5 py-3">
              <span className="text-sm font-bold text-green-800">Total Revenue</span>
              <span className="text-sm font-bold text-green-800 tabular-nums">{formatMoney(totalRevenue, currency)}</span>
            </div>
          </div>

          {/* Expenses */}
          <div className="border-b border-[var(--line)]">
            <div className="bg-red-500/5 px-5 py-2.5">
              <p className="text-xs font-bold uppercase tracking-wide text-red-700">Expenses</p>
            </div>
            {expenses.length === 0 ? (
              <p className="px-5 py-3 text-sm text-[var(--ink-muted)]">No expense accounts with activity</p>
            ) : (
              expenses.map((e) => (
                <div key={e.code} className="flex items-center justify-between px-5 py-2.5 odd:bg-[var(--bg)] even:bg-[var(--panel)]/40">
                  <div>
                    <span className="font-mono text-xs text-[var(--accent)] mr-2">{e.code}</span>
                    <span className="text-sm text-[var(--ink)]">{e.name}</span>
                  </div>
                  <span className="text-sm font-medium tabular-nums">{formatMoney(e.amount, currency)}</span>
                </div>
              ))
            )}
            <div className="flex items-center justify-between bg-red-500/10 px-5 py-3">
              <span className="text-sm font-bold text-red-800">Total Expenses</span>
              <span className="text-sm font-bold text-red-800 tabular-nums">{formatMoney(totalExpense, currency)}</span>
            </div>
          </div>

          {/* Net Income */}
          <div className={`flex items-center justify-between px-5 py-4 ${netIncome >= 0 ? "bg-green-500/15" : "bg-red-500/15"}`}>
            <span className="text-base font-bold text-[var(--ink)]">Net {netIncome >= 0 ? "Income" : "Loss"}</span>
            <span className={`text-lg font-bold tabular-nums ${netIncome >= 0 ? "text-green-700" : "text-red-700"}`}>
              {formatMoney(Math.abs(netIncome), currency)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
