import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";

export const dynamic = "force-dynamic";

function compactJson(value: string | null) {
  if (!value) return "-";
  try {
    return JSON.stringify(JSON.parse(value), null, 0).slice(0, 180);
  } catch {
    return value.slice(0, 180);
  }
}

export default async function SettingsAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  const { user, orgId } = await requireOrgSession();
  if (user.role !== "ADMIN") redirect("/settings");

  const params = await searchParams;
  const action = typeof params.action === "string" ? params.action.trim() : "";
  const exportHref = `/api/audit/export${action ? `?action=${encodeURIComponent(action)}` : ""}`;

  const events = await prisma.systemAuditEvent
    .findMany({
      where: {
        orgId,
        ...(action ? { action } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 150,
      select: {
        id: true,
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
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds }, orgId }, select: { id: true, name: true, email: true } }).catch(() => [])
    : [];
  const actorMap = new Map(actors.map((actor) => [actor.id, actor]));
  const actionOptions = Array.from(new Set(events.map((event) => event.action))).sort();

  const fmt = (d: Date) => d.toLocaleString("en-UG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-4">
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[13px] font-bold text-[var(--ink)]">Audit Timeline</p>
          </div>
          <a href={exportHref} className="btn-premium-secondary rounded-lg px-3 py-1.5 text-xs font-semibold">
            ↓ Export CSV
          </a>
        </div>
      </div>

      <form className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <select name="action" defaultValue={action} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)]">
            <option value="">All actions</option>
            {actionOptions.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <button type="submit" className="btn-premium-secondary rounded-lg px-4 py-2 text-sm font-semibold">
            Apply filter
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">After</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {events.map((event) => {
              const actor = event.actorUserId ? actorMap.get(event.actorUserId) : null;
              return (
                <tr key={event.id} className="align-top hover:bg-[var(--panel-strong)]/50">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--ink-muted)]">{fmt(event.createdAt)}</td>
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs font-semibold text-[var(--ink)]">{event.action}</p>
                    <p className="mt-1 max-w-[240px] text-xs text-[var(--ink-muted)]">{event.summary ?? "-"}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--ink-muted)]">
                    {actor ? <span>{actor.name}<br /><span className="font-mono">{actor.email}</span></span> : event.actorUserId ?? "-"}
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
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--ink-muted)]">
                  No audit events found. New commercial and admin actions will appear here once recorded.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
