"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { setPlanAction, setBillingStatusAction } from "./actions";

const STATUS_CHIP: Record<string, string> = {
  TRIALING:  "bg-blue-100  text-blue-700  border-blue-200",
  ACTIVE:    "bg-emerald-100 text-emerald-700 border-emerald-200",
  PAST_DUE:  "bg-red-100   text-red-700   border-red-200",
  CANCELLED: "bg-[var(--panel-strong)] text-[var(--ink-muted)] border-[var(--line)]",
};

const PLAN_CHIP: Record<string, string> = {
  STARTER:    "bg-[var(--panel-strong)] text-[var(--ink-muted)] border-[var(--line)]",
  STANDARD:   "bg-sky-100    text-sky-700    border-sky-200",
  GROWTH:     "bg-amber-100  text-amber-700  border-amber-200",
  PREMIUM:    "bg-violet-100 text-violet-700 border-violet-200",
  ENTERPRISE: "bg-purple-100 text-purple-700 border-purple-200",
};

export type OrgRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  billingStatus: string;
  isActive: boolean;
  trialEndsAt: Date | null;
  planRenewsAt: Date | null;
  createdAt: Date;
  _count: { users: number; jobs: number };
};

function TrialBadge({ trialEndsAt }: { trialEndsAt: Date | null }) {
  if (!trialEndsAt) return <span className="text-[var(--ink-muted)]">—</span>;
  const days = Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return <span className="font-semibold text-red-600">Expired</span>;
  if (days <= 3) return <span className="font-semibold text-red-500">{days}d left</span>;
  if (days <= 7) return <span className="font-semibold text-amber-500">{days}d left</span>;
  return <span className="text-[var(--ink-muted)]">{days}d left</span>;
}

function fmt(d: Date | null | string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" });
}

export function OrgTable({ orgs }: { orgs: OrgRow[] }) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");

  const filtered = useMemo(() => {
    const lq = q.toLowerCase();
    return orgs.filter((org) => {
      if (lq && !org.name.toLowerCase().includes(lq) && !org.slug.toLowerCase().includes(lq)) return false;
      if (statusFilter !== "all" && org.billingStatus !== statusFilter) return false;
      if (planFilter !== "all" && org.plan !== planFilter) return false;
      return true;
    });
  }, [orgs, q, statusFilter, planFilter]);

  const hasFilter = q !== "" || statusFilter !== "all" || planFilter !== "all";

  return (
    <div className="space-y-3">
      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-muted)]" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd"/>
          </svg>
          <input
            type="search"
            placeholder="Search name or slug…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-52 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] pl-8 pr-3 py-1.5 text-sm text-[var(--ink)] placeholder-[var(--ink-muted)]/60 focus:outline-none focus:ring-1 focus:ring-[var(--gold)]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--gold)]"
        >
          <option value="all">All statuses</option>
          <option value="TRIALING">Trialing</option>
          <option value="ACTIVE">Active</option>
          <option value="PAST_DUE">Past Due</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value)}
          className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--gold)]"
        >
          <option value="all">All plans</option>
          <option value="STARTER">Starter</option>
          <option value="STANDARD">Standard</option>
          <option value="GROWTH">Growth</option>
          <option value="PREMIUM">Premium</option>
          <option value="ENTERPRISE">Enterprise</option>
        </select>
        {hasFilter && (
          <button
            onClick={() => { setQ(""); setStatusFilter("all"); setPlanFilter("all"); }}
            className="text-xs font-semibold text-[var(--ink-muted)] underline hover:text-[var(--ink)]"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-[var(--ink-muted)]">
          {hasFilter ? `${filtered.length} of ${orgs.length}` : `${orgs.length} orgs`}
        </span>
      </div>

      {/* ── Table ── */}
      <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-left text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                <th className="px-4 py-3">Organisation</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center">Users</th>
                <th className="px-4 py-3 text-center">Jobs</th>
                <th className="px-4 py-3 hidden lg:table-cell">Trial / Renews</th>
                <th className="px-4 py-3 hidden md:table-cell">Joined</th>
                <th className="px-4 py-3">Quick change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {filtered.map((org) => (
                <tr
                  key={org.id}
                  className={`transition-colors hover:bg-[var(--gold)]/5 ${!org.isActive ? "opacity-40" : ""}`}
                >
                  <td className="px-4 py-3">
                    <Link href={`/platform/orgs/${org.id}`} className="group block">
                      <p className="font-semibold text-[var(--ink)] group-hover:underline">{org.name}</p>
                      <p className="text-[11px] text-[var(--ink-muted)]">/{org.slug}</p>
                    </Link>
                  </td>

                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${PLAN_CHIP[org.plan] ?? ""}`}>
                      {org.plan}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_CHIP[org.billingStatus] ?? ""}`}>
                      {org.billingStatus}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-center font-mono text-sm text-[var(--ink-muted)]">{org._count.users}</td>
                  <td className="px-4 py-3 text-center font-mono text-sm text-[var(--ink-muted)]">{org._count.jobs}</td>

                  <td className="hidden px-4 py-3 text-sm lg:table-cell">
                    {org.billingStatus === "TRIALING"
                      ? <TrialBadge trialEndsAt={org.trialEndsAt} />
                      : <span className="text-[var(--ink-muted)]">{fmt(org.planRenewsAt)}</span>
                    }
                  </td>

                  <td className="hidden px-4 py-3 text-sm text-[var(--ink-muted)] md:table-cell">{fmt(org.createdAt)}</td>

                  {/* ── Inline quick actions ── */}
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* Plan */}
                      <form action={setPlanAction} className="flex items-center gap-1">
                        <input type="hidden" name="orgId" value={org.id} />
                        <select
                          name="plan"
                          defaultValue={org.plan}
                          className="rounded border border-[var(--line)] bg-[var(--bg)] px-1.5 py-0.5 text-[11px] text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--gold)]"
                        >
                          <option value="STARTER">Starter</option>
                          <option value="STANDARD">Standard</option>
                          <option value="GROWTH">Growth</option>
                          <option value="PREMIUM">Premium</option>
                          <option value="ENTERPRISE">Enterprise</option>
                        </select>
                        <button type="submit" className="rounded border border-[var(--line)] bg-[var(--panel-strong)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--ink-muted)] hover:border-[var(--gold)]/60 hover:text-[var(--gold)]">
                          Plan
                        </button>
                      </form>

                      {/* Status */}
                      <form action={setBillingStatusAction} className="flex items-center gap-1">
                        <input type="hidden" name="orgId" value={org.id} />
                        <select
                          name="status"
                          defaultValue={org.billingStatus}
                          className="rounded border border-[var(--line)] bg-[var(--bg)] px-1.5 py-0.5 text-[11px] text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--gold)]"
                        >
                          <option value="TRIALING">Trialing</option>
                          <option value="ACTIVE">Active</option>
                          <option value="PAST_DUE">Past Due</option>
                          <option value="CANCELLED">Cancelled</option>
                        </select>
                        <button type="submit" className="rounded border border-[var(--line)] bg-[var(--panel-strong)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--ink-muted)] hover:border-sky-400/60 hover:text-sky-600">
                          Status
                        </button>
                      </form>

                      <Link
                        href={`/platform/orgs/${org.id}`}
                        className="rounded border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ink-muted)] transition-colors hover:border-[var(--accent)]/50 hover:text-[var(--ink)]"
                      >
                        →
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-[var(--ink-muted)]">
                    {hasFilter ? "No organisations match the current filter." : "No organisations yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
