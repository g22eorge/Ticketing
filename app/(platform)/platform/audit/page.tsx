import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/platform-admin";

export const dynamic = "force-dynamic";

function compactJson(value: string | null) {
  if (!value) return "—";
  try {
    return JSON.stringify(JSON.parse(value), null, 0).slice(0, 220);
  } catch {
    return value.slice(0, 220);
  }
}

export default async function PlatformAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ orgId?: string; action?: string }>;
}) {
  await requirePlatformAdmin();

  const params = await searchParams;
  const orgId = typeof params.orgId === "string" ? params.orgId.trim() : "";
  const action = typeof params.action === "string" ? params.action.trim() : "";
  const exportParams = new URLSearchParams({ scope: "platform" });
  if (orgId) exportParams.set("orgId", orgId);
  if (action) exportParams.set("action", action);
  const exportHref = `/api/audit/export?${exportParams.toString()}`;

  const events = await prisma.systemAuditEvent
    .findMany({
      where: {
        ...(orgId ? { orgId } : {}),
        ...(action ? { action } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        orgId: true,
        actorUserId: true,
        entityType: true,
        entityId: true,
        action: true,
        summary: true,
        beforeJson: true,
        afterJson: true,
        createdAt: true,
      },
    })
    .catch(() => []);

  const actorIds = Array.from(new Set(events.map((event) => event.actorUserId).filter(Boolean))) as string[];
  const orgIds = Array.from(new Set(events.map((event) => event.orgId).filter(Boolean))) as string[];
  const [actors, orgs] = await Promise.all([
    actorIds.length
      ? prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } }).catch(() => [])
      : Promise.resolve([]),
    orgIds.length
      ? prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true, slug: true } }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const actorMap = new Map(actors.map((actor) => [actor.id, actor]));
  const orgMap = new Map(orgs.map((org) => [org.id, org]));
  const actionOptions = Array.from(new Set(events.map((event) => event.action))).sort();

  const fmt = (d: Date) => d.toLocaleString("en-UG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ink)]">System Audit</h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">Recent commercial and platform-sensitive events.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={exportHref} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]">
            Export CSV
          </a>
          <Link href="/platform" className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]">
            Organisations
          </Link>
        </div>
      </div>

      <form className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <input name="orgId" defaultValue={orgId} placeholder="Filter by org ID" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)]" />
          <select name="action" defaultValue={action} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)]">
            <option value="">All actions</option>
            {actionOptions.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <button type="submit" className="rounded-lg bg-[var(--gold)]/20 px-3 py-2 text-sm font-semibold text-[var(--gold)] hover:bg-[var(--gold)]/30">
            Apply filters
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Org</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">After</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {events.map((event) => {
              const org = event.orgId ? orgMap.get(event.orgId) : null;
              const actor = event.actorUserId ? actorMap.get(event.actorUserId) : null;
              return (
                <tr key={event.id} className="align-top hover:bg-[var(--gold)]/5">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--ink-muted)]">{fmt(event.createdAt)}</td>
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs font-semibold text-[var(--ink)]">{event.action}</p>
                    <p className="mt-1 max-w-[220px] text-xs text-[var(--ink-muted)]">{event.summary ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3">
                    {org ? (
                      <Link href={`/platform/orgs/${org.id}`} className="font-medium text-[var(--ink)] hover:underline">{org.name}</Link>
                    ) : (
                      <span className="font-mono text-xs text-[var(--ink-muted)]">{event.orgId ?? "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--ink-muted)]">
                    {actor ? <span>{actor.name}<br /><span className="font-mono">{actor.email}</span></span> : event.actorUserId ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <p className="font-semibold text-[var(--ink)]">{event.entityType}</p>
                    <p className="font-mono text-[var(--ink-muted)]">{event.entityId}</p>
                  </td>
                  <td className="max-w-[260px] px-4 py-3 font-mono text-xs text-[var(--ink-muted)]">{compactJson(event.afterJson)}</td>
                </tr>
              );
            })}
            {events.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--ink-muted)]">
                  No audit events found. If the table is missing, run <span className="font-mono">/api/admin/db-fix</span> or deploy the latest schema.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
