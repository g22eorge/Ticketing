/**
 * MobileHomeDashboard — Revolut / Moniepoint-style mobile home.
 *
 * Principles:
 *  • ONE primary metric front-and-centre — centred hero balance
 *  • Secondary strip: 3 numbers (Active | Outstanding | Ready)
 *  • Needs-attention list only renders when something is urgent
 *  • Quick actions = icon + one word only
 *  • No section headers — content speaks for itself
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

  // Active jobs (non-terminal)
  activeJobsCount?: number;

  // Month
  revenueMtd: number;
  outstandingValue: number;

  currency: string;
};

function fmtHero(v: number, currency: string) {
  // Full-precision for hero number — always show currency prefix
  if (v >= 1_000_000) return `${currency} ${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${currency} ${(v / 1_000).toFixed(1)}K`;
  return `${currency} ${v.toLocaleString()}`;
}

function fmt(v: number, currency: string) {
  if (v >= 1_000_000) return `${currency} ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${currency} ${Math.round(v / 1_000)}K`;
  return `${currency} ${v.toLocaleString()}`;
}

function pct(current: number, previous: number) {
  if (previous === 0) return null;
  const p = Math.round(((current - previous) / previous) * 100);
  return p;
}

// Chevron right icon — reusable inline
function ChevronRight({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

export function MobileHomeDashboard(p: MobileHomeProps) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
  const firstName = p.userName.split(" ")[0];
  const cashPct = pct(p.cashTodayValue, p.cashYesterdayValue);

  // Active = everything not COMPLETED / CLOSED / DELIVERED
  const activeJobs = p.activeJobsCount ?? (p.receivedCount + p.inRepairCount + p.awaitingApprovalCount);

  const urgentCount =
    (p.awaitingApprovalCount > 0 ? 1 : 0) +
    (p.readyForPickupCount > 0 ? 1 : 0) +
    (p.overdueCount > 0 ? 1 : 0) +
    (p.completedUnpaidCount > 0 ? 1 : 0);

  return (
    <div className="lg:hidden -mx-4 px-4 space-y-5 pb-4">

      {/* ── Greeting ─────────────────────────────────────────────────── */}
      <div className="pt-1">
        <p className="text-[22px] font-black text-[var(--ink)] leading-tight">
          Good {greeting}, {firstName}
        </p>
        <p className="text-[12px] text-[var(--ink-muted)] mt-0.5">
          {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          {" · "}<span className="text-[var(--accent)] font-semibold">{p.orgName}</span>
        </p>
      </div>

      {/* ── Hero: centred cash balance (Revolut-style) ───────────────── */}
      <Link
        href="/documents/receipts"
        className="flex flex-col items-center gap-1 rounded-3xl bg-[var(--panel)] px-6 py-7 active:opacity-80"
      >
        {/* Hero number */}
        <p className="text-[32px] font-black leading-none tracking-tight text-[var(--ink)]">
          {fmtHero(p.cashTodayValue, p.currency)}
        </p>
        {/* Gold underline accent */}
        <div className="mt-1 h-[3px] w-20 rounded-full bg-gradient-to-r from-[var(--accent)] to-emerald-400 opacity-80" aria-hidden="true" />
        <p className="mt-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
          Cash Collected Today
        </p>
        {cashPct !== null && (
          <p className={`mt-1 text-[12px] font-bold ${cashPct >= 0 ? "text-emerald-500" : "text-red-400"}`}>
            {cashPct >= 0 ? "↑" : "↓"} {Math.abs(cashPct)}% vs yesterday
          </p>
        )}
      </Link>

      {/* ── Secondary strip: Active | Outstanding | Ready ────────────── */}
      <div className="grid grid-cols-3 divide-x divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
        <Link
          href="/jobs"
          className="flex flex-col items-center gap-0.5 py-4 active:bg-[var(--panel-strong)]"
        >
          <span className={`text-[20px] font-black leading-none ${activeJobs > 0 ? "text-sky-400" : "text-[var(--ink-muted)]/30"}`}>
            {activeJobs}
          </span>
          <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--ink-muted)]">Active</span>
        </Link>
        <Link
          href="/documents/invoices?status=ISSUED"
          className="flex flex-col items-center gap-0.5 py-4 active:bg-[var(--panel-strong)]"
        >
          <span className={`text-[20px] font-black leading-none ${p.outstandingValue > 0 ? "text-amber-400" : "text-[var(--ink-muted)]/30"}`}>
            {fmt(p.outstandingValue, p.currency)}
          </span>
          <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--ink-muted)]">Due</span>
        </Link>
        <Link
          href="/jobs?status=READY_FOR_PICKUP"
          className="flex flex-col items-center gap-0.5 py-4 active:bg-[var(--panel-strong)]"
        >
          <span className={`text-[20px] font-black leading-none ${p.readyForPickupCount > 0 ? "text-[var(--accent)]" : "text-[var(--ink-muted)]/30"}`}>
            {p.readyForPickupCount}
          </span>
          <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--ink-muted)]">Ready</span>
        </Link>
      </div>

      {/* ── Needs attention ──────────────────────────────────────────── */}
      {urgentCount > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/8 p-4">
          <p className="mb-3 text-[11px] font-black uppercase tracking-[0.15em] text-amber-500">
            ⚠ {urgentCount} need{urgentCount === 1 ? "s" : ""} your attention
          </p>
          <div className="space-y-2.5">
            {p.awaitingApprovalCount > 0 && (
              <Link href="/jobs?status=AWAITING_APPROVAL" className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-[var(--ink)]">
                  {p.awaitingApprovalCount} awaiting approval
                </span>
                <ChevronRight className="text-amber-500" />
              </Link>
            )}
            {p.readyForPickupCount > 0 && (
              <Link href="/jobs?status=READY_FOR_PICKUP" className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-[var(--ink)]">
                  {p.readyForPickupCount} ready for pickup
                </span>
                <ChevronRight className="text-amber-500" />
              </Link>
            )}
            {p.completedUnpaidCount > 0 && (
              <Link href="/jobs?status=COMPLETED" className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-[var(--ink)]">
                  {p.completedUnpaidCount} completed but unpaid
                </span>
                <ChevronRight className="text-amber-500" />
              </Link>
            )}
            {p.overdueCount > 0 && (
              <Link href="/jobs?overdue=1" className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-red-500">
                  {p.overdueCount} overdue job{p.overdueCount !== 1 ? "s" : ""}
                </span>
                <ChevronRight className="text-red-500" />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── Quick actions ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        {([
          {
            href: "/jobs/new",
            label: "New Job",
            color: "bg-[var(--accent)]",
            iconColor: "text-black",
            icon: (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            ),
          },
          {
            href: "/documents/receipts",
            label: "Collect",
            color: "bg-emerald-500/15",
            iconColor: "text-emerald-500",
            icon: (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
              </svg>
            ),
          },
          {
            href: "/documents/invoices",
            label: "Invoice",
            color: "bg-violet-500/15",
            iconColor: "text-violet-500",
            icon: (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              </svg>
            ),
          },
          {
            href: "/pos",
            label: "Sale",
            color: "bg-sky-500/15",
            iconColor: "text-sky-500",
            icon: (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            ),
          },
        ] as const).map((a) => (
          <Link key={a.href} href={a.href} className="flex flex-col items-center gap-2">
            <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${a.color} ${a.iconColor}`}>
              {a.icon}
            </span>
            <span className="text-[10px] font-semibold text-[var(--ink-muted)]">{a.label}</span>
          </Link>
        ))}
      </div>

      {/* ── MTD revenue — small, secondary ────────────────────────────── */}
      <Link
        href="/reports"
        className="flex items-center justify-between rounded-2xl bg-[var(--panel)] px-4 py-3.5 active:opacity-80"
      >
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Month to date</p>
          <p className="mt-0.5 text-[18px] font-black text-[var(--accent)]">
            {fmt(p.revenueMtd, p.currency)}
          </p>
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--ink-muted)]/40">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </Link>

    </div>
  );
}
