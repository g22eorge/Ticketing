/**
 * MobileHomeDashboard — Moniepoint / Revolut-style mobile home.
 *
 * Principles:
 *  • 2–3 numbers maximum visible at a glance
 *  • No section headers — content speaks for itself
 *  • Numbers fill space; labels sit below in tiny caps
 *  • Quick actions = icon + one word only
 *  • Needs-attention strip only appears when something is actually urgent
 */
import Link from "next/link";

export type MobileHomeProps = {
  userName: string;
  orgName: string;

  // Headline metrics
  receivedToday: number;
  completedToday: number;
  cashTodayValue: number;
  cashYesterdayValue: number;

  // Status counts
  inRepairCount: number;
  readyForPickupCount: number;
  awaitingApprovalCount: number;
  receivedCount: number; // total currently in RECEIVED

  // Urgency
  overdueCount: number;
  completedUnpaidCount: number;

  // Month
  revenueMtd: number;
  outstandingValue: number;

  currency: string;
};

function fmt(v: number, currency: string) {
  if (v >= 1_000_000) return `${currency} ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${currency} ${Math.round(v / 1_000)}K`;
  return `${currency} ${v.toLocaleString()}`;
}

function pct(current: number, previous: number) {
  if (previous === 0) return null;
  const p = Math.round(((current - previous) / previous) * 100);
  return p;
}

export function MobileHomeDashboard(p: MobileHomeProps) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
  const firstName = p.userName.split(" ")[0];
  const cashPct = pct(p.cashTodayValue, p.cashYesterdayValue);
  const urgentCount = (p.awaitingApprovalCount > 0 ? 1 : 0) +
                      (p.readyForPickupCount > 0 ? 1 : 0) +
                      (p.overdueCount > 0 ? 1 : 0) +
                      (p.completedUnpaidCount > 0 ? 1 : 0);

  return (
    <div className="lg:hidden -mx-4 px-4 space-y-5 pb-4">

      {/* ── Greeting ──────────────────────────────────────────────────── */}
      <div className="pt-1">
        <p className="text-[22px] font-black text-[var(--ink)] leading-tight">
          Good {greeting}, {firstName}
        </p>
        <p className="text-[12px] text-[var(--ink-muted)] mt-0.5">
          {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          {" · "}<span className="text-[var(--accent)] font-semibold">{p.orgName}</span>
        </p>
      </div>

      {/* ── Hero metrics: 2 numbers side by side ──────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {/* Cash collected today */}
        <Link href="/documents/receipts"
          className="rounded-2xl bg-[var(--panel)] p-4 active:opacity-80">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)] mb-1">Cash Today</p>
          <p className="text-[24px] font-black leading-none text-emerald-500">
            {fmt(p.cashTodayValue, p.currency)}
          </p>
          {cashPct !== null && (
            <p className={`mt-1.5 text-[11px] font-semibold ${cashPct >= 0 ? "text-emerald-500" : "text-red-400"}`}>
              {cashPct >= 0 ? "↑" : "↓"} {Math.abs(cashPct)}% vs yesterday
            </p>
          )}
        </Link>

        {/* Outstanding balances */}
        <Link href="/documents/invoices?status=ISSUED"
          className="rounded-2xl bg-[var(--panel)] p-4 active:opacity-80">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)] mb-1">Outstanding</p>
          <p className={`text-[24px] font-black leading-none ${p.outstandingValue > 0 ? "text-amber-500" : "text-[var(--ink-muted)]"}`}>
            {fmt(p.outstandingValue, p.currency)}
          </p>
          {p.completedUnpaidCount > 0 && (
            <p className="mt-1.5 text-[11px] font-semibold text-amber-500">
              {p.completedUnpaidCount} unpaid job{p.completedUnpaidCount !== 1 ? "s" : ""}
            </p>
          )}
        </Link>
      </div>

      {/* ── Job status strip: 4 tappable status counts ────────────────── */}
      <div className="grid grid-cols-4 gap-2">
        {([
          { count: p.receivedCount,         label: "Received", href: "/jobs?status=RECEIVED",        color: "text-sky-400" },
          { count: p.inRepairCount,         label: "In Repair", href: "/jobs?status=IN_REPAIR",       color: "text-amber-400" },
          { count: p.readyForPickupCount,   label: "Ready",     href: "/jobs?status=READY_FOR_PICKUP", color: "text-[var(--accent)]" },
          { count: p.completedToday,        label: "Done",      href: "/jobs?status=COMPLETED",        color: "text-emerald-400" },
        ] as const).map((s) => (
          <Link key={s.label} href={s.href}
            className="flex flex-col items-center gap-0.5 rounded-2xl bg-[var(--panel)] py-3 active:opacity-80">
            <span className={`text-[22px] font-black leading-none ${s.count > 0 ? s.color : "text-[var(--ink-muted)]/30"}`}>
              {s.count}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--ink-muted)]">
              {s.label}
            </span>
          </Link>
        ))}
      </div>

      {/* ── Needs attention — only renders when there's something urgent ─ */}
      {urgentCount > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/8 p-4">
          <p className="text-[11px] font-black uppercase tracking-[0.15em] text-amber-500 mb-3">
            Needs attention · {urgentCount} item{urgentCount !== 1 ? "s" : ""}
          </p>
          <div className="space-y-2.5">
            {p.awaitingApprovalCount > 0 && (
              <Link href="/jobs?status=AWAITING_APPROVAL" className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-[var(--ink)]">
                  {p.awaitingApprovalCount} awaiting client approval
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500" aria-hidden><path d="M9 18l6-6-6-6"/></svg>
              </Link>
            )}
            {p.readyForPickupCount > 0 && (
              <Link href="/jobs?status=READY_FOR_PICKUP" className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-[var(--ink)]">
                  {p.readyForPickupCount} ready for pickup
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500" aria-hidden><path d="M9 18l6-6-6-6"/></svg>
              </Link>
            )}
            {p.completedUnpaidCount > 0 && (
              <Link href="/jobs?status=COMPLETED" className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-[var(--ink)]">
                  {p.completedUnpaidCount} completed but unpaid
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500" aria-hidden><path d="M9 18l6-6-6-6"/></svg>
              </Link>
            )}
            {p.overdueCount > 0 && (
              <Link href="/jobs?overdue=1" className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-red-500">
                  {p.overdueCount} overdue job{p.overdueCount !== 1 ? "s" : ""}
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500" aria-hidden><path d="M9 18l6-6-6-6"/></svg>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── Quick actions ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        {([
          { href: "/jobs/new",           label: "New Job",  color: "bg-[var(--accent)]",   iconColor: "text-black",
            icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> },
          { href: "/documents/receipts", label: "Collect",  color: "bg-emerald-500/15",    iconColor: "text-emerald-500",
            icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> },
          { href: "/documents/invoices", label: "Invoice",  color: "bg-violet-500/15",     iconColor: "text-violet-500",
            icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> },
          { href: "/pos",                label: "Sale",     color: "bg-sky-500/15",        iconColor: "text-sky-500",
            icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg> },
        ] as const).map((a) => (
          <Link key={a.href} href={a.href}
            className="flex flex-col items-center gap-2">
            <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${a.color} ${a.iconColor}`}>
              {a.icon}
            </span>
            <span className="text-[10px] font-semibold text-[var(--ink-muted)]">{a.label}</span>
          </Link>
        ))}
      </div>

      {/* ── MTD revenue — small, secondary ────────────────────────────── */}
      <Link href="/reports"
        className="flex items-center justify-between rounded-2xl bg-[var(--panel)] px-4 py-3.5 active:opacity-80">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Month to date</p>
          <p className="mt-0.5 text-[18px] font-black text-[var(--accent)]">
            {fmt(p.revenueMtd, p.currency)}
          </p>
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--ink-muted)]/40"><path d="M9 18l6-6-6-6"/></svg>
      </Link>

    </div>
  );
}
