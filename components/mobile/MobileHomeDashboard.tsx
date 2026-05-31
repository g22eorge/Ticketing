/**
 * MobileHomeDashboard — Moniepoint / Revolut Business-style mobile home.
 *
 * ONE primary metric front-and-centre (total revenue today — repairs + POS).
 * Secondary strip: 3 live counts (Active | Due | Ready).
 * Needs-attention list only when something is urgent.
 * Quick actions = big icon + one word only.
 */
import Link from "next/link";

export type MobileHomeProps = {
  userName: string;
  orgName: string;

  // Today
  receivedToday: number;
  completedToday: number;
  cashTodayValue: number;       // from invoice payments
  cashYesterdayValue: number;
  salesTodayValue: number;      // from POS
  revenueTodayValue: number;    // cashToday + salesToday

  // Status counts
  inRepairCount: number;
  readyForPickupCount: number;
  awaitingApprovalCount: number;
  receivedCount: number;
  activeJobsCount?: number;

  // Urgency
  overdueCount: number;
  completedUnpaidCount: number;

  // Month / financial
  revenueMtd: number;
  outstandingValue: number;

  currency: string;
};

function hero(v: number, currency: string) {
  if (v >= 1_000_000) return `${currency} ${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `${currency} ${(v / 1_000).toFixed(1)}K`;
  return `${currency} ${v.toLocaleString()}`;
}
function compact(v: number, currency: string) {
  if (v >= 1_000_000) return `${currency} ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${currency} ${Math.round(v / 1_000)}K`;
  return `${currency} ${v.toLocaleString()}`;
}
function pct(cur: number, prev: number) {
  if (prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}
function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18l6-6-6-6"/>
    </svg>
  );
}

export function MobileHomeDashboard(p: MobileHomeProps) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
  const firstName = p.userName.split(" ")[0];
  const revPct = pct(p.revenueTodayValue, p.cashYesterdayValue);
  const activeJobs = p.activeJobsCount ?? (p.receivedCount + p.inRepairCount + p.awaitingApprovalCount);
  const urgentItems = [
    p.awaitingApprovalCount > 0 && { href: "/jobs?status=AWAITING_APPROVAL", label: `${p.awaitingApprovalCount} awaiting approval`, color: "text-amber-400" },
    p.readyForPickupCount > 0   && { href: "/jobs?status=READY_FOR_PICKUP",  label: `${p.readyForPickupCount} ready for pickup`,   color: "text-[var(--accent)]" },
    p.completedUnpaidCount > 0  && { href: "/jobs?status=COMPLETED",         label: `${p.completedUnpaidCount} completed, unpaid`,  color: "text-amber-400" },
    p.overdueCount > 0          && { href: "/jobs?overdue=1",                 label: `${p.overdueCount} overdue`,                    color: "text-red-400" },
  ].filter(Boolean) as { href: string; label: string; color: string }[];

  return (
    <div className="lg:hidden -mx-4 px-4 space-y-4 pb-4">

      {/* ── Greeting ──────────────────────────────────────────────── */}
      <div className="pt-1">
        <p className="text-[21px] font-black text-[var(--ink)] leading-tight">
          Good {greeting}, {firstName}
        </p>
        <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">
          {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          {" · "}<span className="font-semibold text-[var(--accent)]">{p.orgName}</span>
        </p>
      </div>

      {/* ── Hero: total revenue today (repairs + POS) ─────────────── */}
      <div className="rounded-3xl bg-[var(--panel)] px-6 py-7 text-center">
        <p className="text-[13px] font-medium text-[var(--ink-muted)]">
          Revenue Today
        </p>
        <p className="mt-2 text-[36px] font-black leading-none tracking-tight text-[var(--ink)]">
          {hero(p.revenueTodayValue, p.currency)}
        </p>
        {/* Gradient underline */}
        <div className="mx-auto mt-2 h-[3px] w-24 rounded-full bg-gradient-to-r from-[var(--accent)] to-emerald-400 opacity-80" aria-hidden />
        {/* Breakdown chips */}
        <div className="mt-3 flex items-center justify-center gap-3">
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[12px] font-bold text-emerald-500">
            Repairs {compact(p.cashTodayValue, p.currency)}
          </span>
          {p.salesTodayValue > 0 && (
            <span className="rounded-full bg-violet-500/10 px-2.5 py-0.5 text-[12px] font-bold text-violet-400">
              Sales {compact(p.salesTodayValue, p.currency)}
            </span>
          )}
        </div>
        {revPct !== null && (
          <p className={`mt-2 text-[12px] font-bold ${revPct >= 0 ? "text-emerald-500" : "text-red-400"}`}>
            {revPct >= 0 ? "↑" : "↓"} {Math.abs(revPct)}% vs yesterday
          </p>
        )}
      </div>

      {/* ── Secondary strip: Active | Due | Ready ─────────────────── */}
      <div className="grid grid-cols-3 divide-x divide-[var(--line)] overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
        <Link href="/jobs" className="flex flex-col items-center gap-0.5 py-4 active:bg-[var(--panel-strong)]">
          <span className={`text-[22px] font-black leading-none ${activeJobs > 0 ? "text-sky-400" : "text-[var(--ink-muted)]/25"}`}>
            {activeJobs}
          </span>
          <span className="text-[13px] font-bold font-medium text-[var(--ink-muted)]">Active</span>
        </Link>
        <Link href="/documents/invoices?status=ISSUED" className="flex flex-col items-center gap-0.5 py-4 active:bg-[var(--panel-strong)]">
          <span className={`text-[18px] font-black leading-none ${p.outstandingValue > 0 ? "text-amber-400" : "text-[var(--ink-muted)]/25"}`}>
            {compact(p.outstandingValue, p.currency)}
          </span>
          <span className="text-[13px] font-bold font-medium text-[var(--ink-muted)]">Due</span>
        </Link>
        <Link href="/jobs?status=READY_FOR_PICKUP" className="flex flex-col items-center gap-0.5 py-4 active:bg-[var(--panel-strong)]">
          <span className={`text-[22px] font-black leading-none ${p.readyForPickupCount > 0 ? "text-[var(--accent)]" : "text-[var(--ink-muted)]/25"}`}>
            {p.readyForPickupCount}
          </span>
          <span className="text-[13px] font-bold font-medium text-[var(--ink-muted)]">Ready</span>
        </Link>
      </div>

      {/* ── Needs action — 3 hero numbers, colour-coded by urgency ──── */}
      <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
          <p className="text-sm font-semibold text-[var(--ink)]">Needs action</p>
          <Link href="/jobs" className="text-[12px] font-semibold text-[var(--accent)]">All jobs →</Link>
        </div>
        <div className="grid grid-cols-3 divide-x divide-[var(--line)]">
          {/* Awaiting approval */}
          <Link href="/jobs?status=AWAITING_APPROVAL"
            className={`flex flex-col items-center gap-1 px-2 py-4 text-center transition active:bg-[var(--panel-strong)] ${p.awaitingApprovalCount > 0 ? "bg-[var(--accent)]/6" : ""}`}>
            <p className={`text-[32px] font-black leading-none tabular-nums ${p.awaitingApprovalCount > 0 ? "text-[var(--accent)]" : "text-[var(--ink-muted)]/30"}`}>
              {p.awaitingApprovalCount}
            </p>
            <p className="mt-1 whitespace-pre-line text-[12px] leading-tight text-[var(--ink-muted)]">{"Awaiting\napproval"}</p>
          </Link>
          {/* Ready for pickup */}
          <Link href="/jobs?status=READY_FOR_PICKUP"
            className={`flex flex-col items-center gap-1 px-2 py-4 text-center transition active:bg-[var(--panel-strong)] ${p.readyForPickupCount > 0 ? "bg-emerald-500/6" : ""}`}>
            <p className={`text-[32px] font-black leading-none tabular-nums ${p.readyForPickupCount > 0 ? "text-emerald-500" : "text-[var(--ink-muted)]/30"}`}>
              {p.readyForPickupCount}
            </p>
            <p className="mt-1 whitespace-pre-line text-[12px] leading-tight text-[var(--ink-muted)]">{"Ready for\npickup"}</p>
          </Link>
          {/* Overdue */}
          <Link href="/jobs?overdue=1"
            className={`flex flex-col items-center gap-1 px-2 py-4 text-center transition active:bg-[var(--panel-strong)] ${p.overdueCount > 0 ? "bg-red-500/6" : ""}`}>
            <p className={`text-[32px] font-black leading-none tabular-nums ${p.overdueCount > 0 ? "text-red-500" : "text-[var(--ink-muted)]/30"}`}>
              {p.overdueCount}
            </p>
            <p className="mt-1 text-[12px] leading-tight text-[var(--ink-muted)]">Overdue</p>
          </Link>
        </div>
        {/* Secondary alerts if any */}
        {(p.completedUnpaidCount > 0) && (
          <div className="border-t border-[var(--line)]">
            <Link href="/jobs?status=COMPLETED"
              className="flex items-center justify-between px-4 py-2.5 active:bg-[var(--panel-strong)]">
              <p className="text-[13px] text-[var(--ink-muted)]">
                <span className="font-bold text-red-400">{p.completedUnpaidCount}</span> completed unpaid
              </p>
              <Chevron />
            </Link>
          </div>
        )}
      </div>

      {/* ── Quick actions ─────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        {([
          { href: "/jobs/new",           label: "New Job",
            bg: "bg-[var(--accent)]",      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> },
          { href: "/documents/receipts", label: "Collect",
            bg: "bg-emerald-500/15",        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> },
          { href: "/pos",                label: "Sale",
            bg: "bg-violet-500/15",         icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg> },
          { href: "/documents/invoices", label: "Invoice",
            bg: "bg-amber-500/15",          icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> },
        ] as const).map((a) => (
          <Link key={a.href} href={a.href} className="flex flex-col items-center gap-2">
            <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${a.bg}`}>
              {a.icon}
            </span>
            <span className="text-[12px] font-semibold text-[var(--ink-muted)]">{a.label}</span>
          </Link>
        ))}
      </div>

      {/* ── MTD summary row ───────────────────────────────────────── */}
      <Link href="/reports"
        className="flex items-center justify-between rounded-2xl bg-[var(--panel)] px-4 py-3.5 active:opacity-80">
        <div>
          <p className="text-[12px] font-medium text-[var(--ink-muted)]">Month to date</p>
          <p className="mt-0.5 text-[18px] font-black text-[var(--accent)]">
            {compact(p.revenueMtd, p.currency)}
          </p>
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--ink-muted)]/40" aria-hidden><path d="M9 18l6-6-6-6"/></svg>
      </Link>

    </div>
  );
}
