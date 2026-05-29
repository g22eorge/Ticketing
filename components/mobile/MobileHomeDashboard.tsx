/**
 * MobileHomeDashboard — Airtel Money / Revolut-inspired mobile home screen.
 * Shown only on mobile (< lg). The full desktop dashboard renders above lg.
 *
 * Design language:
 *   - Premium dark cards (#101010 / #161616)
 *   - Gold (#D4AF37) accent
 *   - Clean 2-col metric grids with trend indicators
 *   - Colorful icon buttons for quick actions
 */
import Link from "next/link";

const GOLD = "var(--accent)";

// ── Tiny helpers ──────────────────────────────────────────────────────────────

function TrendBadge({ value, yesterday }: { value: number; yesterday: number }) {
  if (yesterday === 0 && value === 0) return null;
  const pct = yesterday === 0 ? (value > 0 ? 100 : 0) : Math.round(((value - yesterday) / yesterday) * 100);
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${up ? "text-emerald-400" : "text-red-400"}`}>
      {up ? "↑" : "↓"} {Math.abs(pct)}%
    </span>
  );
}

function TrendBadgeMoney({ value, yesterday }: { value: number; yesterday: number }) {
  if (yesterday === 0 && value === 0) return null;
  const pct = yesterday === 0 ? (value > 0 ? 100 : 0) : Math.round(((value - yesterday) / yesterday) * 100);
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${up ? "text-emerald-400" : "text-red-400"}`}>
      {up ? "↑" : "↓"} {Math.abs(pct)}% vs yesterday
    </span>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type MobileHomeProps = {
  userName: string;
  orgName: string;

  // Business overview
  receivedToday: number;
  receivedYesterday: number;
  completedToday: number;
  completedYesterday: number;
  inRepairCount: number;
  readyForPickupCount: number;

  // Financial snapshot
  cashTodayValue: number;
  cashYesterdayValue: number;
  depositsHeld: number;
  outstandingValue: number;
  expensesTodayValue: number;
  expensesYesterdayValue: number;

  // Monthly
  revenueMtd: number;
  profitMtd: number;

  currency: string;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function MobileHomeDashboard(p: MobileHomeProps) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = p.userName.split(" ")[0];

  function fmt(v: number) {
    if (v >= 1_000_000) return `${p.currency} ${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000)     return `${p.currency} ${(v / 1_000).toFixed(0)}K`;
    return `${p.currency} ${v.toLocaleString()}`;
  }

  return (
    <div className="lg:hidden space-y-4 pb-4">

      {/* ── Greeting ──────────────────────────────────────────────────── */}
      <div className="px-1 pt-1">
        <p className="text-[15px] text-[var(--ink-muted)]">
          {greeting}, <span className="font-bold text-[var(--ink)]">{firstName}</span> 👋
        </p>
        <p className="text-[11px] font-semibold text-[var(--accent)] tracking-wide mt-0.5">
          {p.orgName}
        </p>
      </div>

      {/* ── Quick Actions ─────────────────────────────────────────────── */}
      <section>
        <p className="mb-2.5 text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]">
          Quick Actions
        </p>
        <div className="grid grid-cols-5 gap-2">
          {([
            { href: "/jobs/new",          label: "New Job",        bg: "bg-sky-500/20",     icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
              </svg>) },
            { href: "/pos",               label: "Sale",           bg: "bg-violet-500/20",  icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
              </svg>) },
            { href: "/documents/invoices",label: "Invoice",        bg: "bg-amber-500/20",   icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
              </svg>) },
            { href: "/documents/receipts",label: "Payment",        bg: "bg-emerald-500/20", icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
              </svg>) },
            { href: "/finance/expenses",  label: "Expense",        bg: "bg-red-500/20",     icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>) },
          ] as const).map((a) => (
            <Link key={a.href} href={a.href}
              className="flex flex-col items-center gap-1.5">
              <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${a.bg} border border-white/5`}>
                {a.icon}
              </span>
              <span className="text-[9px] font-semibold text-[var(--ink-muted)] leading-tight text-center">
                {a.label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Business Overview ─────────────────────────────────────────── */}
      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]">
            Business Overview
          </p>
          <Link href="/jobs" className="text-[10px] font-semibold text-[var(--accent)]">
            View all
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {([
            {
              label: "Jobs Received",
              value: p.receivedToday,
              sub: `↕ Yesterday: ${p.receivedYesterday}`,
              href: "/jobs?status=RECEIVED",
              icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
                </svg>
              ),
              iconBg: "bg-sky-500/15",
              trend: <TrendBadge value={p.receivedToday} yesterday={p.receivedYesterday} />,
            },
            {
              label: "Jobs Completed",
              value: p.completedToday,
              sub: `↕ Yesterday: ${p.completedYesterday}`,
              href: "/jobs?status=COMPLETED",
              icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ),
              iconBg: "bg-emerald-500/15",
              trend: <TrendBadge value={p.completedToday} yesterday={p.completedYesterday} />,
            },
            {
              label: "In Repair",
              value: p.inRepairCount,
              sub: "Active jobs",
              href: "/jobs?status=IN_REPAIR",
              icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                </svg>
              ),
              iconBg: "bg-amber-500/15",
              trend: null,
            },
            {
              label: "Ready for Pickup",
              value: p.readyForPickupCount,
              sub: "Awaiting client",
              href: "/jobs?status=READY_FOR_PICKUP",
              icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              ),
              iconBg: "bg-violet-500/15",
              trend: null,
            },
          ] as const).map((item) => (
            <Link key={item.label} href={item.href}
              className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[var(--panel)] p-4 transition-colors active:bg-[var(--panel-strong)]">
              {/* Icon top-right */}
              <div className={`absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-xl ${item.iconBg}`}>
                {item.icon}
              </div>
              {/* Label */}
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)] mb-2">
                {item.label}
              </p>
              {/* Value */}
              <p className="text-3xl font-black leading-none text-[var(--ink)]">
                {item.value}
              </p>
              {/* Sub */}
              <div className="mt-1.5 flex items-center gap-1.5">
                {item.trend}
                <p className="text-[10px] text-[var(--ink-muted)]">{item.sub}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Financial Snapshot ────────────────────────────────────────── */}
      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]">
            Financial Snapshot
          </p>
          <Link href="/finance/expenses" className="text-[10px] font-semibold text-[var(--accent)]">
            View all
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {([
            {
              label: "Cash Collected",
              value: fmt(p.cashTodayValue),
              trend: <TrendBadgeMoney value={p.cashTodayValue} yesterday={p.cashYesterdayValue} />,
              href: "/documents/receipts",
              accent: "text-emerald-400",
              dot: "bg-emerald-500",
            },
            {
              label: "Deposits Held",
              value: fmt(p.depositsHeld),
              trend: <span className="text-[10px] text-[var(--ink-muted)]">— no change</span>,
              href: "/documents/invoices",
              accent: "text-[var(--accent)]",
              dot: "bg-[var(--accent)]",
            },
            {
              label: "Outstanding Balances",
              value: fmt(p.outstandingValue),
              trend: <span className="text-[10px] text-[var(--ink-muted)]">{p.outstandingValue > 0 ? "Needs collection" : "All clear"}</span>,
              href: "/documents/invoices?status=ISSUED",
              accent: p.outstandingValue > 100_000 ? "text-amber-400" : "text-emerald-400",
              dot: p.outstandingValue > 100_000 ? "bg-amber-500" : "bg-emerald-500",
            },
            {
              label: "Expenses Today",
              value: fmt(p.expensesTodayValue),
              trend: <TrendBadgeMoney value={p.expensesTodayValue} yesterday={p.expensesYesterdayValue} />,
              href: "/finance/expenses",
              accent: p.expensesTodayValue > 0 ? "text-red-400" : "text-[var(--ink-muted)]",
              dot: "bg-red-500",
            },
          ] as const).map((item) => (
            <Link key={item.label} href={item.href}
              className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[var(--panel)] p-4 transition-colors active:bg-[var(--panel-strong)]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)] mb-2">
                {item.label}
              </p>
              <p className={`text-xl font-black leading-none ${item.accent}`}>
                {item.value}
              </p>
              <div className="mt-1.5">{item.trend}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Monthly Performance ──────────────────────────────────────── */}
      <section>
        <p className="mb-2.5 text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]">
          Month to Date
        </p>
        <div className="rounded-2xl border border-white/[0.06] bg-[var(--panel)] overflow-hidden">
          <div className="grid grid-cols-2 divide-x divide-[var(--line)]">
            <Link href="/reports" className="p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)] mb-2">Revenue</p>
              <p className="text-xl font-black text-[var(--accent)]">{fmt(p.revenueMtd)}</p>
              <p className="mt-1 text-[10px] text-[var(--ink-muted)]">All streams</p>
            </Link>
            <Link href="/reports" className="p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)] mb-2">Gross Profit</p>
              <p className={`text-xl font-black ${p.profitMtd >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {fmt(p.profitMtd)}
              </p>
              <p className="mt-1 text-[10px] text-[var(--ink-muted)]">
                {p.revenueMtd > 0 ? `${Math.round(p.profitMtd / p.revenueMtd * 100)}% margin` : "—"}
              </p>
            </Link>
          </div>
          <div className="border-t border-[var(--line)] px-4 py-3 flex items-center justify-between">
            <p className="text-[11px] text-[var(--ink-muted)]">Full financial reports</p>
            <Link href="/reports" className="text-[11px] font-bold text-[var(--accent)]">View →</Link>
          </div>
        </div>
      </section>

    </div>
  );
}
