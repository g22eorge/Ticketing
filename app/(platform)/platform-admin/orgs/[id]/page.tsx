// @ts-nocheck
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getBillingEventsByOrg } from "@/lib/billing-events";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { setPlanAction, toggleOrgActive, setOrgSmsSenderAction, updateOrgDetailsAction } from "../../../platform/actions";
import { getSmsUsage, SMS_PLAN_QUOTAS } from "@/lib/notifications/sms-quota";
import { getOrgWhatsAppConfig } from "@/lib/org-whatsapp-config";
import { planLabel } from "@/lib/plan-labels";

export const dynamic = "force-dynamic";

const PLAN_CHIP: Record<string, string> = {
  FREE:         "bg-[var(--panel-strong)] text-[var(--ink-muted)] border-[var(--line)]",
  STARTER:      "bg-sky-500/10    text-sky-700    border-sky-400/30    dark:text-sky-400",
  PROFESSIONAL: "bg-amber-500/10  text-amber-700  border-amber-400/30  dark:text-amber-400",
  ENTERPRISE:   "bg-purple-500/10 text-purple-700 border-purple-400/30 dark:text-purple-400",
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]">{children}</p>;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">{label}</p>
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
      id: true, name: true, slug: true, plan: true,
      isActive: true, createdAt: true, updatedAt: true,
      tagline: true, website: true, phone: true, email: true,
      address: true, timezone: true, currency: true,
      logoUrl: true, enableRepairModule: true,
      users: { select: { id: true } },
    },
  }).catch(() => null);

  if (!org) notFound();

  // Counts that aren't on the relation (Job has orgId but Organisation has no jobs[] relation)
  const [orgUsers, jobCount, billingHistory, smsUsed, orgWaCfg] = await Promise.all([
    prisma.user.findMany({
      where: { orgId: id },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }).catch(() => []),
    prisma.job.count({ where: { orgId: id } }).catch(() => 0),
    getBillingEventsByOrg(id).catch(() => [] as Awaited<ReturnType<typeof getBillingEventsByOrg>>),
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

      {/* Back */}
      <Link href="/platform-admin" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        Organisations
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[var(--ink)]">{org.name}</h1>
            <span className={`rounded-full border px-2.5 py-0.5 text-[13px] font-semibold ${PLAN_CHIP[org.plan] ?? ""}`}>
              {planLabel(org.plan)}
            </span>
            {!org.isActive && (
              <span className="rounded-full border border-red-400/30 bg-red-500/10 px-2.5 py-0.5 text-[13px] font-semibold text-red-700 dark:text-red-400">
                INACTIVE
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">/{org.slug} · created {fmt(org.createdAt)}</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Users",   value: orgUsers.length },
          { label: "Jobs",    value: jobCount },
          { label: "Total Paid", value: fmtMoney(totalPaid) },
          { label: `SMS ${smsUsed}/${smsLimit}`, value: `${smsPct}%` },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
            <p className="text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">{m.label}</p>
            <p className="mt-1 text-xl font-bold text-[var(--ink)]">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Org info */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-3">
        <SectionTitle>Organisation Info</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name"     value={org.name} />
          <Field label="Slug"     value={<span className="font-mono text-xs">/{org.slug}</span>} />
          <Field label="Tagline"  value={org.tagline ?? "—"} />
          <Field label="Phone"    value={org.phone ?? "—"} />
          <Field label="Email"    value={org.email ?? "—"} />
          <Field label="Website"  value={org.website ?? "—"} />
          <Field label="Address"  value={org.address ?? "—"} />
          <Field label="Timezone" value={org.timezone} />
          <Field label="Currency" value={org.currency} />
        </div>
      </div>

      {/* Edit org details */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-4">
        <SectionTitle>Edit Organisation Details</SectionTitle>
        <form action={updateOrgDetailsAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="orgId" value={org.id} />
          {[
            { name: "name",     label: "Name",     defaultValue: org.name,     type: "text" },
            { name: "tagline",  label: "Tagline",  defaultValue: org.tagline ?? "", type: "text" },
            { name: "website",  label: "Website",  defaultValue: org.website ?? "", type: "url" },
            { name: "phone",    label: "Phone",    defaultValue: org.phone ?? "",   type: "tel" },
            { name: "email",    label: "Email",    defaultValue: org.email ?? "",   type: "email" },
            { name: "address",  label: "Address",  defaultValue: org.address ?? "", type: "text" },
          ].map((f) => (
            <div key={f.name}>
              <label className="block text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)] mb-1">{f.label}</label>
              <input
                type={f.type} name={f.name} defaultValue={f.defaultValue}
                className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--gold)]"
              />
            </div>
          ))}
          <div className="flex items-center gap-3 sm:col-span-2">
            <label className="text-xs font-semibold text-[var(--ink-muted)]">Repair module</label>
            <select name="enableRepairModule" defaultValue={String(org.enableRepairModule)}
              className="rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-xs text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--gold)]">
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
            <button type="submit" className="ml-auto rounded-lg bg-[var(--gold)]/20 px-4 py-1.5 text-xs font-semibold text-[var(--gold)] transition-colors hover:bg-[var(--gold)]/30">
              Save Details
            </button>
          </div>
        </form>
      </div>

      {/* Plan control */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-4">
        <SectionTitle>Plan</SectionTitle>
        <form action={setPlanAction} className="flex items-center gap-3">
          <input type="hidden" name="orgId" value={org.id} />
          <select name="plan" defaultValue={org.plan}
            className="rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-xs text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--gold)]">
            <option value="FREE">Ekyenfuna</option>
            <option value="STARTER">Okutandika</option>
            <option value="PROFESSIONAL">Enkola</option>
            <option value="ENTERPRISE">Obugabi</option>
          </select>
          <button type="submit" className="rounded-lg bg-[var(--gold)]/20 px-3 py-1.5 text-xs font-semibold text-[var(--gold)] transition-colors hover:bg-[var(--gold)]/30">
            Set Plan
          </button>
        </form>
      </div>

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

      {/* Users */}
      <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="border-b border-[var(--line)] px-5 py-3">
          <SectionTitle>Users ({orgUsers.length})</SectionTitle>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              <th className="px-4 py-2.5 text-left">Name</th>
              <th className="px-4 py-2.5 text-left">Email</th>
              <th className="px-4 py-2.5 text-left">Role</th>
              <th className="px-4 py-2.5 text-left">Status</th>
              <th className="hidden px-4 py-2.5 text-left sm:table-cell">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {orgUsers.map((u) => (
              <tr key={u.id} className="hover:bg-[var(--gold)]/5">
                <td className="px-4 py-2.5 font-medium text-[var(--ink)]">{u.name}</td>
                <td className="px-4 py-2.5 text-[var(--ink-muted)]">{u.email}</td>
                <td className="px-4 py-2.5">
                  <span className="rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-0.5 text-[13px] font-semibold text-[var(--ink-muted)]">
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full border px-2 py-0.5 text-[13px] font-semibold ${u.isActive ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]"}`}>
                    {u.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="hidden px-4 py-2.5 text-[var(--ink-muted)] sm:table-cell">{fmt(u.createdAt)}</td>
              </tr>
            ))}
            {orgUsers.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-[var(--ink-muted)]">No users yet.</td></tr>
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
              <tr className="border-b border-[var(--line)] text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                <th className="px-4 py-2.5 text-left">Date</th>
                <th className="px-4 py-2.5 text-left">Event</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="hidden px-4 py-2.5 text-left md:table-cell">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {billingHistory.map((e) => (
                <tr key={e.id} className="hover:bg-[var(--gold)]/5">
                  <td className="px-4 py-2 text-[var(--ink-muted)]">{fmt(e.createdAt)}</td>
                  <td className="px-4 py-2 text-[var(--ink)]">{e.event}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[13px] font-semibold ${e.status === "successful" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-400"}`}>
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
      <div className="rounded-xl border border-red-400/30 bg-red-500/5 p-5 space-y-3">
        <SectionTitle>Danger Zone</SectionTitle>
        <div className="flex flex-wrap items-center gap-4">
          <form action={toggleOrgActive}>
            <input type="hidden" name="orgId" value={org.id} />
            <input type="hidden" name="isActive" value={String(org.isActive)} />
            <button
              type="submit"
              className={`rounded-lg border px-4 py-2 text-xs font-semibold transition-colors ${
                org.isActive
                  ? "border-red-400/30 bg-red-500/10 text-red-700 hover:bg-red-500/20 dark:text-red-400"
                  : "border-emerald-400/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
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
