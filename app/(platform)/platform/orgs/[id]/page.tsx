import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getBillingEventsByOrg } from "@/lib/billing-events";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import {
  setBillingStatusAction,
  setPlanAction,
  extendTrialAction,
  toggleOrgActive,
  setOrgSmsSenderAction,
  setOrgAiModelAction,
} from "../../actions";
import { getSmsUsage, SMS_PLAN_QUOTAS } from "@/lib/notifications/sms-quota";
import { getOrgWhatsAppConfig } from "@/lib/org-whatsapp-config";

export const dynamic = "force-dynamic";

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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]">{children}</p>;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-[var(--ink)]">{value}</p>
    </div>
  );
}

export default async function OrgDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePlatformAdmin();

  const org = await prisma.organization.findUnique({
    where: { id },
    select: {
      id: true, name: true, slug: true, plan: true, billingStatus: true,
      isActive: true, trialEndsAt: true, planRenewsAt: true, planCancelledAt: true,
      flwSubscriptionId: true, flwCustomerId: true, aiModel: true,
      createdAt: true, updatedAt: true,
      _count: { select: { users: true, jobs: true } },
    },
  });

  if (!org) notFound();

  const [orgUsers, billingHistory, smsUsed, orgWaCfg] = await Promise.all([
    prisma.user.findMany({
      where: { orgId: id },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    getBillingEventsByOrg(id).catch(() => []),
    getSmsUsage(id),
    getOrgWhatsAppConfig(id).catch(() => null),
  ]);

  const smsLimit  = SMS_PLAN_QUOTAS[org.plan] ?? 200;
  const smsPct    = Math.min(100, Math.round((smsUsed / smsLimit) * 100));
  const totalPaid = billingHistory
    .filter((e) => e.status === "successful" && e.event === "charge.completed")
    .reduce((s, e) => s + e.amount, 0);

  const fmt = (d: Date | null) =>
    d ? d.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" }) : "—";
  const fmtMoney = (n: number, currency = "UGX") =>
    new Intl.NumberFormat("en-UG", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-6">

      {/* Back + breadcrumb */}
      <Link href="/platform" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        Organisations
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[var(--ink)]">{org.name}</h1>
            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${PLAN_CHIP[org.plan] ?? ""}`}>
              {org.plan}
            </span>
            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_CHIP[org.billingStatus] ?? ""}`}>
              {org.billingStatus}
            </span>
            {!org.isActive && (
              <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-600">
                INACTIVE
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">/{org.slug} · created {fmt(org.createdAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/admin/db-fix"
            target="_blank"
            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-muted)] transition-colors hover:border-amber-400/60 hover:text-amber-600"
          >
            DB Fix
          </a>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Users",            value: org._count.users },
          { label: "Jobs",             value: org._count.jobs },
          { label: "Total Paid",       value: fmtMoney(totalPaid) },
          { label: `SMS ${smsUsed}/${smsLimit}`, value: `${smsPct}%` },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">{m.label}</p>
            <p className="mt-1 text-xl font-bold text-[var(--ink)]">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Billing info */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-3">
        <SectionTitle>Billing Info</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Plan" value={org.plan} />
          <Field label="Trial ends" value={fmt(org.trialEndsAt)} />
          <Field label="Renews" value={fmt(org.planRenewsAt)} />
          <Field label="Pesapal ID" value={<span className="font-mono text-xs">{org.flwSubscriptionId ?? "—"}</span>} />
        </div>
      </div>

      {/* Billing controls */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-4">
        <SectionTitle>Billing Controls</SectionTitle>
        <div className="flex flex-wrap gap-3">

          {/* Set plan */}
          <form action={setPlanAction} className="flex items-center gap-2">
            <input type="hidden" name="orgId" value={org.id} />
            <label className="text-xs font-semibold text-[var(--ink-muted)]">Plan</label>
            <select name="plan" defaultValue={org.plan} className="rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-xs text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--gold)]">
              <option value="STARTER">Starter</option>
              <option value="STANDARD">Standard</option>
              <option value="GROWTH">Growth</option>
              <option value="PREMIUM">Premium</option>
              <option value="ENTERPRISE">Enterprise</option>
            </select>
            <button type="submit" className="rounded-lg bg-[var(--gold)]/20 px-3 py-1.5 text-xs font-semibold text-[var(--gold)] transition-colors hover:bg-[var(--gold)]/30">
              Set Plan
            </button>
          </form>

          <div className="w-px bg-[var(--line)] self-stretch" />

          {/* Set billing status */}
          <form action={setBillingStatusAction} className="flex items-center gap-2">
            <input type="hidden" name="orgId" value={org.id} />
            <label className="text-xs font-semibold text-[var(--ink-muted)]">Status</label>
            <select name="status" defaultValue={org.billingStatus} className="rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-xs text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--gold)]">
              <option value="TRIALING">Trialing</option>
              <option value="ACTIVE">Active</option>
              <option value="PAST_DUE">Past Due</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <button type="submit" className="rounded-lg bg-sky-100 px-3 py-1.5 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-200">
              Set Status
            </button>
          </form>

          <div className="w-px bg-[var(--line)] self-stretch" />

          {/* Extend trial */}
          <form action={extendTrialAction} className="flex items-center gap-2">
            <input type="hidden" name="orgId" value={org.id} />
            <label className="text-xs font-semibold text-[var(--ink-muted)]">Trial</label>
            <select name="days" className="rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-xs text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--gold)]">
              <option value="7">+7 days</option>
              <option value="14">+14 days</option>
              <option value="30">+30 days</option>
              <option value="60">+60 days</option>
              <option value="90">+90 days</option>
            </select>
            <button type="submit" className="rounded-lg bg-purple-100 px-3 py-1.5 text-xs font-semibold text-purple-700 transition-colors hover:bg-purple-200">
              Extend Trial
            </button>
          </form>
        </div>
      </div>

      {/* Integrations */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* SMS Sender */}
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-3">
          <div>
            <SectionTitle>SMS Sender Name</SectionTitle>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">Alphanumeric, max 11 chars. Pre-approved by Africa&apos;s Talking required. Leave blank for platform default.</p>
          </div>
          <form action={setOrgSmsSenderAction} className="flex items-center gap-2">
            <input type="hidden" name="orgId" value={org.id} />
            <input
              type="text" name="senderId"
              defaultValue={orgWaCfg?.atSenderId ?? ""}
              placeholder="e.g. EagleInfo"
              maxLength={11} pattern="[A-Za-z0-9]*"
              className="w-40 rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 font-mono text-xs text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--gold)]"
            />
            <button type="submit" className="rounded-lg bg-[var(--gold)]/20 px-3 py-1.5 text-xs font-semibold text-[var(--gold)] transition-colors hover:bg-[var(--gold)]/30">
              Save
            </button>
            {orgWaCfg?.atSenderId && (
              <span className="text-xs text-[var(--ink-muted)]">Current: <span className="font-mono font-semibold text-[var(--ink)]">{orgWaCfg.atSenderId}</span></span>
            )}
          </form>
        </div>

        {/* AI Model */}
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-3">
          <div>
            <SectionTitle>AI Model Override</SectionTitle>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">Assign a specific Claude model. Leave blank for platform default.</p>
          </div>
          <form action={setOrgAiModelAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="orgId" value={org.id} />
            <select
              name="aiModel" defaultValue={org.aiModel ?? ""}
              className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 font-mono text-xs text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--gold)]"
            >
              <option value="">Platform default</option>
              <option value="claude-haiku-4-5-20251001">Haiku 4.5 — fast / cheap</option>
              <option value="claude-sonnet-4-6">Sonnet 4.6 — balanced</option>
              <option value="claude-opus-4-7">Opus 4.7 — most capable</option>
            </select>
            <button type="submit" className="rounded-lg bg-[var(--gold)]/20 px-3 py-1.5 text-xs font-semibold text-[var(--gold)] transition-colors hover:bg-[var(--gold)]/30">
              Save
            </button>
          </form>
          {org.aiModel && (
            <p className="text-xs text-[var(--ink-muted)]">Active: <span className="font-mono font-semibold text-[var(--ink)]">{org.aiModel}</span></p>
          )}
        </div>
      </div>

      {/* Users */}
      <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="border-b border-[var(--line)] px-5 py-3">
          <SectionTitle>Users ({orgUsers.length})</SectionTitle>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              <th className="px-4 py-2.5 text-left">Name</th>
              <th className="px-4 py-2.5 text-left">Email</th>
              <th className="px-4 py-2.5 text-left">Role</th>
              <th className="px-4 py-2.5 text-left">Status</th>
              <th className="px-4 py-2.5 text-left hidden sm:table-cell">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {orgUsers.map((u) => (
              <tr key={u.id} className="hover:bg-[var(--gold)]/5">
                <td className="px-4 py-2.5 font-medium text-[var(--ink)]">{u.name}</td>
                <td className="px-4 py-2.5 text-[var(--ink-muted)]">{u.email}</td>
                <td className="px-4 py-2.5">
                  <span className="rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ink-muted)]">
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${u.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]"}`}>
                    {u.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="hidden px-4 py-2.5 text-[var(--ink-muted)] sm:table-cell">{fmt(u.createdAt)}</td>
              </tr>
            ))}
            {orgUsers.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-[var(--ink-muted)]">No users.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Payment history */}
      <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="border-b border-[var(--line)] px-5 py-3">
          <SectionTitle>Payment History ({billingHistory.length})</SectionTitle>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                <th className="px-4 py-2.5 text-left">Date</th>
                <th className="px-4 py-2.5 text-left">Event</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5 text-left hidden md:table-cell">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {billingHistory.map((e) => (
                <tr key={e.id} className="hover:bg-[var(--gold)]/5">
                  <td className="px-4 py-2 text-[var(--ink-muted)]">{fmt(e.createdAt)}</td>
                  <td className="px-4 py-2 text-[var(--ink)]">{e.event}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${e.status === "successful" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-[var(--ink)]">
                    {e.amount > 0 ? fmtMoney(e.amount, e.currency) : "—"}
                  </td>
                  <td className="hidden px-4 py-2 font-mono text-xs text-[var(--ink-muted)] md:table-cell">{e.txRef ?? "—"}</td>
                </tr>
              ))}
              {billingHistory.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-[var(--ink-muted)]">No payment records yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Danger zone */}
      <div className="rounded-xl border border-red-200 bg-red-50/40 p-5 space-y-3">
        <SectionTitle>Danger Zone</SectionTitle>
        <div className="flex flex-wrap items-center gap-4">
          <form action={toggleOrgActive}>
            <input type="hidden" name="orgId" value={org.id} />
            <input type="hidden" name="isActive" value={String(org.isActive)} />
            <button
              type="submit"
              className={`rounded-lg border px-4 py-2 text-xs font-semibold transition-colors ${
                org.isActive
                  ? "border-red-200 bg-red-100 text-red-700 hover:bg-red-200"
                  : "border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
              }`}
            >
              {org.isActive ? "Deactivate Organisation" : "Reactivate Organisation"}
            </button>
          </form>
          <p className="text-xs text-red-600/70">
            {org.isActive
              ? "Deactivating blocks all org members from logging in."
              : "Organisation is currently deactivated — members cannot log in."}
          </p>
        </div>
      </div>

    </div>
  );
}
