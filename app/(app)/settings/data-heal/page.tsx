import Link from "next/link";
import { redirect } from "next/navigation";

import { runDataHeal } from "@/lib/data-heal";
import { prisma } from "@/lib/prisma";
import { getCurrentUserRole } from "@/lib/session";

export default async function DataHealPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; fixed?: string; pending?: string; checked?: string; dry?: string; at?: string }>;
}) {
  const { user } = await getCurrentUserRole();
  if (user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const feedback = await searchParams;

  const [unresolved, lastHealedAt, preview] = await Promise.all([
    prisma.job.count({
      where: { OR: [{ brand: "Unknown" }, { model: "Unknown" }, { deviceType: "OTHER" }] },
    }),
    prisma.auditLog.findFirst({
      where: { action: "DATA_HEAL_JOB_DEVICE_FIELDS" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    runDataHeal(prisma, { dryRun: true, limit: 25 }),
  ]);

  async function runDry() {
    "use server";
    const { user: actor } = await getCurrentUserRole();
    if (actor.role !== "ADMIN") return;
    const result = await runDataHeal(prisma, { dryRun: true, actorUserId: actor.id });
    redirect(
      `/settings/data-heal?mode=dry&checked=${result.checked}&fixed=${result.fixed}&pending=${result.pending}&at=${Date.now()}`,
    );
  }

  async function runApply() {
    "use server";
    const { user: actor } = await getCurrentUserRole();
    if (actor.role !== "ADMIN") return;
    const result = await runDataHeal(prisma, { dryRun: false, actorUserId: actor.id });
    redirect(
      `/settings/data-heal?mode=apply&checked=${result.checked}&fixed=${result.fixed}&pending=${result.pending}&at=${Date.now()}`,
    );
  }

  return (
    <div className="space-y-4">
      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Data Heal</p>
        <h1 className="mt-1 text-lg font-semibold text-[var(--ink)]">Device Placeholder Recovery</h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          Repairs jobs with placeholder values (`Unknown` / `OTHER`) using linked device and repair request data.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${unresolved > 0 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {unresolved} unresolved
          </span>
          <span className="rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1 text-[11px] text-[var(--ink-muted)]">
            Last heal: {lastHealedAt ? new Date(lastHealedAt.createdAt).toLocaleString() : "Never"}
          </span>
        </div>
      </section>

      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        {feedback.mode ? (
          <div className="mb-3 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-xs text-[var(--ink)]">
            {feedback.mode === "dry" ? "Dry check complete" : "Heal run complete"}: checked {feedback.checked ?? "0"},
            fixable {feedback.fixed ?? "0"}, pending {feedback.pending ?? "0"}
            {feedback.at ? ` (run ${new Date(Number(feedback.at)).toLocaleTimeString()})` : ""}.
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <form action={runDry}>
            <button className="btn-premium-secondary rounded-lg px-3 py-2 text-sm">Run Dry Check</button>
          </form>
          <form action={runApply}>
            <button className="btn-premium rounded-lg px-3 py-2 text-sm font-semibold text-white">Run Heal Now</button>
          </form>
        </div>
      </section>

      <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="border-b border-[var(--line)] px-4 py-3">
          <p className="text-sm font-semibold text-[var(--ink)]">Dry-run Preview</p>
          <p className="text-xs text-[var(--ink-muted)]">Showing up to 25 rows that can be healed right now.</p>
        </div>
        {preview.changes.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[var(--ink-muted)]">No healable placeholder rows found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--panel-strong)] text-xs uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Job #</th>
                  <th className="px-4 py-2 text-left font-medium">From</th>
                  <th className="px-4 py-2 text-left font-medium">To</th>
                </tr>
              </thead>
              <tbody>
                {preview.changes.map((change) => (
                  <tr key={change.id} className="border-t border-[var(--line)]">
                    <td className="px-4 py-2">
                      <Link href={`/jobs/${change.id}`} className="mono font-bold text-[var(--ink)] transition-colors hover:text-[var(--accent)]">{change.jobNumber}</Link>
                    </td>
                    <td className="px-4 py-2 text-[var(--ink-muted)]">{change.from.brand} / {change.from.model} / {change.from.deviceType}</td>
                    <td className="px-4 py-2 text-[var(--ink)]">{change.to.brand} / {change.to.model} / {change.to.deviceType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
