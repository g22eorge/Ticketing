import Link from "next/link";
import { OrgPlan } from "@prisma/client";

import { PLAN_LABELS, PLAN_LIMITS, UPGRADE_PLAN, type PlanLimits } from "@/lib/plan-limits";

type Props = {
  plan: OrgPlan;
  limits: PlanLimits;
  usage: {
    users: number;
    jobsThisMonth: number;
    parts: number;
  };
};

function UsageBar({ current, max, label }: { current: number; max: number; label: string }) {
  const pct = max === Infinity ? 0 : Math.min(100, Math.round((current / max) * 100));
  const isNear = pct >= 80;
  const isHit = pct >= 100;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--ink-muted)]">{label}</span>
        <span className={isHit ? "font-semibold text-red-500" : isNear ? "font-semibold text-amber-500" : "text-[var(--ink-muted)]"}>
          {max === Infinity ? `${current} / ∞` : `${current} / ${max}`}
        </span>
      </div>
      {max !== Infinity && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--border)]">
          <div
            className={`h-full rounded-full transition-all ${isHit ? "bg-red-500" : isNear ? "bg-amber-500" : "bg-[var(--gold)]"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function PlanBanner({ plan, limits, usage }: Props) {
  const upgradeTo = UPGRADE_PLAN[plan];
  const isAtAnyLimit =
    (limits.maxUsers !== Infinity && usage.users >= limits.maxUsers) ||
    (limits.maxJobsPerMonth !== Infinity && usage.jobsThisMonth >= limits.maxJobsPerMonth) ||
    (limits.maxParts !== Infinity && usage.parts >= limits.maxParts);

  return (
    <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Plan</p>
          <p className="mt-0.5 font-semibold text-[var(--ink)]">{PLAN_LABELS[plan]}</p>
        </div>
        {upgradeTo && (
          <Link
            href="/settings/billing"
            className="btn-premium rounded-lg px-3 py-1.5 text-xs text-white"
          >
            Upgrade to {PLAN_LABELS[upgradeTo]}
          </Link>
        )}
      </div>

      <div className="space-y-2.5">
        <UsageBar current={usage.users} max={limits.maxUsers} label="Team members" />
        <UsageBar current={usage.jobsThisMonth} max={limits.maxJobsPerMonth} label="Jobs this month" />
        <UsageBar current={usage.parts} max={limits.maxParts} label="Inventory SKUs" />
      </div>

      {isAtAnyLimit && upgradeTo && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
          You&apos;ve reached one or more plan limits.{" "}
          <Link href="/settings/billing" className="font-semibold underline underline-offset-2">
            Upgrade to {PLAN_LABELS[upgradeTo]}
          </Link>{" "}
          to continue growing.
        </p>
      )}
    </section>
  );
}
