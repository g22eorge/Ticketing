import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOrgSession } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/currency";

// ─── helpers ─────────────────────────────────────────────────────────────────

function getPeriods(): string[] {
  const now = new Date();
  const result: string[] = [];
  for (let offset = -2; offset <= 2; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    result.push(`${y}-${m}`);
  }
  return result;
}

function formatPeriodLabel(period: string): string {
  const [y, m] = period.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    ADMIN: "Admin",
    MANAGER: "Manager",
    TECH_MANAGER: "Tech Manager",
    FINANCE: "Finance",
    SALES: "Sales",
    OPS: "Operations",
    FRONT_DESK: "Front Desk",
  };
  return map[role] ?? role;
}

function roleBadgeColor(role: string): string {
  const map: Record<string, string> = {
    ADMIN: "border-violet-500/30 bg-violet-500/10 text-violet-400",
    MANAGER: "border-blue-500/30 bg-blue-500/10 text-blue-400",
    TECH_MANAGER: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
    FINANCE: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    SALES: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    OPS: "border-orange-500/30 bg-orange-500/10 text-orange-400",
    FRONT_DESK: "border-pink-500/30 bg-pink-500/10 text-pink-400",
  };
  return map[role] ?? "border-[var(--line)] text-[var(--ink-muted)]";
}

const STAFF_ROLES = ["ADMIN", "MANAGER", "TECH_MANAGER", "FINANCE", "SALES", "OPS", "FRONT_DESK"];

// ─── server actions ───────────────────────────────────────────────────────────

async function upsertTarget(formData: FormData) {
  "use server";

  const { user, orgId } = await requireOrgSession();
  if (user.role !== "ADMIN" && user.role !== "SALES") {
    return;
  }

  const userId = (formData.get("userId") as string | null)?.trim() || null;
  const period = (formData.get("period") as string | null)?.trim() ?? "";
  const targetRevenue = parseFloat((formData.get("targetRevenue") as string | null) ?? "0") || 0;
  const targetJobsRaw = (formData.get("targetJobs") as string | null)?.trim();
  const targetJobs = targetJobsRaw ? parseInt(targetJobsRaw, 10) || 0 : 0;

  if (!period || !/^\d{4}-\d{2}$/.test(period)) return;

  if (userId === null) {
    // null userId: unique constraint won't work for upsert — use findFirst + create/update
    const existing = await prisma.salesTarget.findFirst({
      where: { orgId, userId: null, period },
      select: { id: true },
    });
    if (existing) {
      await prisma.salesTarget.update({
        where: { id: existing.id },
        data: { targetRevenue, targetJobs },
      });
    } else {
      await prisma.salesTarget.create({
        data: { orgId, userId: null, period, targetRevenue, targetJobs },
      });
    }
  } else {
    await prisma.salesTarget.upsert({
      where: { orgId_userId_period: { orgId, userId, period } },
      update: { targetRevenue, targetJobs },
      create: { orgId, userId, period, targetRevenue, targetJobs },
    });
  }

  revalidatePath("/settings/targets");
}

async function deleteTarget(formData: FormData) {
  "use server";

  const { user } = await requireOrgSession();
  if (user.role !== "ADMIN" && user.role !== "SALES") {
    return;
  }

  const id = (formData.get("id") as string | null)?.trim();
  if (!id) return;

  await prisma.salesTarget.delete({ where: { id } });
  revalidatePath("/settings/targets");
}

// ─── page ─────────────────────────────────────────────────────────────────────

type SearchParams = { period?: string };

export default async function SalesTargetsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user, orgId, org } = await requireOrgSession();

  if (user.role !== "ADMIN" && user.role !== "SALES") {
    redirect("/settings");
  }

  const params = await searchParams;
  const periods = getPeriods();
  const activePeriod = periods.includes(params.period ?? "") ? (params.period as string) : currentPeriod();

  const [staffUsers, allTargets] = await Promise.all([
    prisma.user.findMany({
      where: { orgId, isActive: true, role: { in: STAFF_ROLES as never[] } },
      select: { id: true, name: true, role: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.salesTarget.findMany({
      where: { orgId, period: { in: periods } },
      select: { id: true, userId: true, period: true, targetRevenue: true, targetJobs: true },
    }).catch(() => []),
  ]);

  // Index targets by userId+period key (null userId uses "__team__")
  const targetIndex = new Map<string, { id: string; targetRevenue: number; targetJobs: number }>();
  for (const t of allTargets) {
    const key = `${t.userId ?? "__team__"}::${t.period}`;
    targetIndex.set(key, { id: t.id, targetRevenue: t.targetRevenue, targetJobs: t.targetJobs });
  }

  const teamTarget = targetIndex.get(`__team__::${activePeriod}`);
  const currency = org.baseCurrency;

  const inputClass =
    "rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] outline-none focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/12 w-full";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        <p className="text-[13px] font-bold text-[var(--ink)]">Sales Targets</p>
        <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">
          Set monthly revenue targets per staff member or for the team.
        </p>
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap gap-1.5">
        {periods.map((p) => (
          <form key={p} method="GET">
            <input type="hidden" name="period" value={p} />
            <button
              type="submit"
              className={`rounded-full border px-3 py-1 text-[12px] font-medium transition ${
                p === activePeriod
                  ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent)]"
                  : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              {formatPeriodLabel(p)}
              {p === currentPeriod() && p !== activePeriod && (
                <span className="ml-1 text-[12px] opacity-60">now</span>
              )}
            </button>
          </form>
        ))}
      </div>

      {/* Team target card */}
      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="border-b border-[var(--line)] px-4 py-2.5">
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/70">
            Team Target — {formatPeriodLabel(activePeriod)}
          </p>
        </div>
        <div className="px-4 py-3">
          {teamTarget ? (
            <div className="mb-3 flex flex-wrap gap-4 text-[13px] text-[var(--ink-muted)]">
              <span>
                Revenue:{" "}
                <span className="font-semibold text-[var(--ink)]">
                  {formatMoney(teamTarget.targetRevenue, currency)}
                </span>
              </span>
              {teamTarget.targetJobs > 0 && (
                <span>
                  Jobs:{" "}
                  <span className="font-semibold text-[var(--ink)]">{teamTarget.targetJobs}</span>
                </span>
              )}
            </div>
          ) : (
            <p className="mb-3 text-[13px] text-[var(--ink-muted)]">No team target set for this period.</p>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <form id="team-upsert-form" action={upsertTarget} className="contents">
              <input type="hidden" name="period" value={activePeriod} />
              <input type="hidden" name="userId" value="" />
            </form>
            <div className="flex-1 min-w-[140px]">
              <label className="mb-1 block text-[13px] font-medium text-[var(--ink-muted)]">
                Target Revenue
              </label>
              <input
                form="team-upsert-form"
                name="targetRevenue"
                type="number"
                min="0"
                step="any"
                defaultValue={teamTarget?.targetRevenue ?? ""}
                placeholder="e.g. 5000000"
                className={inputClass}
              />
            </div>
            <div className="flex-1 min-w-[120px]">
              <label className="mb-1 block text-[13px] font-medium text-[var(--ink-muted)]">
                Target Jobs <span className="opacity-50">(optional)</span>
              </label>
              <input
                form="team-upsert-form"
                name="targetJobs"
                type="number"
                min="0"
                step="1"
                defaultValue={teamTarget?.targetJobs || ""}
                placeholder="e.g. 50"
                className={inputClass}
              />
            </div>
            <button
              form="team-upsert-form"
              type="submit"
              className="shrink-0 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-2 text-[13px] font-medium text-[var(--accent)] transition hover:bg-[var(--accent)]/18"
            >
              {teamTarget ? "Update" : "Set Target"}
            </button>
            {teamTarget && (
              <form action={deleteTarget}>
                <input type="hidden" name="id" value={teamTarget.id} />
                <button
                  type="submit"
                  className="rounded-lg border border-[var(--line)] px-3 py-2 text-[13px] text-[var(--ink-muted)] transition hover:border-red-500/30 hover:text-red-400"
                >
                  Remove
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Individual targets table */}
      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="border-b border-[var(--line)] px-4 py-2.5">
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/70">
            Individual Targets — {formatPeriodLabel(activePeriod)}
          </p>
        </div>

        {staffUsers.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-[var(--ink-muted)]">
            No active staff found.
          </p>
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_auto_160px_120px_auto] items-center gap-3 px-4 py-2">
              <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]/60">Name</p>
              <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]/60 w-24">Role</p>
              <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]/60">Revenue Target</p>
              <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]/60">Jobs Target</p>
              <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]/60 w-24">Actions</p>
            </div>

            {staffUsers.map((member) => {
              const existing = targetIndex.get(`${member.id}::${activePeriod}`);
              const saveFormId = `save-${member.id}`;
              return (
                <div key={member.id} className="grid grid-cols-[1fr_auto_160px_120px_auto] items-center gap-3 px-4 py-2.5">
                  {/* Name */}
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-[var(--ink)]">{member.name}</p>
                    <p className="truncate text-[13px] text-[var(--ink-muted)]">{member.email}</p>
                  </div>

                  {/* Role badge */}
                  <div className="w-24">
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-[12px] font-semibold ${roleBadgeColor(member.role)}`}
                    >
                      {roleLabel(member.role)}
                    </span>
                  </div>

                  {/* Revenue input — belongs to save form via form= attribute */}
                  <input
                    form={saveFormId}
                    name="targetRevenue"
                    type="number"
                    min="0"
                    step="any"
                    defaultValue={existing?.targetRevenue ?? ""}
                    placeholder="Revenue"
                    className={inputClass}
                  />

                  {/* Jobs input */}
                  <input
                    form={saveFormId}
                    name="targetJobs"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={existing?.targetJobs || ""}
                    placeholder="Jobs"
                    className={inputClass}
                  />

                  {/* Actions: Save + Delete as sibling forms */}
                  <div className="flex w-24 items-center gap-1.5">
                    <form id={saveFormId} action={upsertTarget}>
                      <input type="hidden" name="period" value={activePeriod} />
                      <input type="hidden" name="userId" value={member.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2.5 py-1.5 text-[12px] font-medium text-[var(--accent)] transition hover:bg-[var(--accent)]/18"
                      >
                        Save
                      </button>
                    </form>
                    {existing && (
                      <form action={deleteTarget}>
                        <input type="hidden" name="id" value={existing.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-[var(--line)] px-2 py-1.5 text-[12px] text-[var(--ink-muted)] transition hover:border-red-500/30 hover:text-red-400"
                          title="Remove target"
                        >
                          ✕
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
