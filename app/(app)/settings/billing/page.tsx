import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { getLimitsForOrg, PLAN_LIMITS, PLAN_LABELS } from "@/lib/plan-limits";
import { getOrCreatePaymentPlan, initializePayment, cancelSubscription, FLW_CURRENCY, FLW_PLAN_PRICES } from "@/lib/flutterwave";
import { formatMoney } from "@/lib/currency";

// ── Server actions ────────────────────────────────────────────────────────────

async function startGrowthTrial(_formData: FormData) {
  "use server";

  const { user, orgId } = await requireOrgSession();
  if (!can.manageUsers(user)) redirect("/settings/billing");

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { plan: true, billingStatus: true },
  });

  // Only available when org is still on Starter (never upgraded) and trial has expired.
  if (!org || org.plan !== "STARTER") redirect("/settings/billing");

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 14);

  await prisma.organization.update({
    where: { id: orgId },
    data: { plan: "GROWTH", billingStatus: "TRIALING", trialEndsAt },
  });

  revalidatePath("/settings/billing");
  redirect("/dashboard");
}

async function subscribeToPlan(formData: FormData) {
  "use server";

  const { user, orgId } = await requireOrgSession();
  if (!can.manageUsers(user)) redirect("/settings/billing");

  const targetPlan = formData.get("plan") as "GROWTH" | "ENTERPRISE";
  if (!["GROWTH", "ENTERPRISE"].includes(targetPlan)) redirect("/settings/billing");

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true, plan: true, flwSubscriptionId: true },
  });
  if (!org) redirect("/settings/billing");

  const flwPlan = await getOrCreatePaymentPlan(targetPlan);

  const txRef = `rmgr-${orgId}-${randomUUID()}`;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const paymentUrl = await initializePayment({
    txRef,
    amount: FLW_PLAN_PRICES[targetPlan],
    email: user.email,
    name: user.name,
    planId: flwPlan.id,
    redirectUrl: `${baseUrl}/api/billing/callback`,
    meta: { orgId, targetPlan, txRef },
  });

  await prisma.organization.update({
    where: { id: orgId },
    data: { flwPlanId: String(flwPlan.id) },
  });

  redirect(paymentUrl);
}

async function cancelPlan(_formData: FormData) {
  "use server";

  const { user, orgId } = await requireOrgSession();
  if (!can.manageUsers(user)) redirect("/settings/billing");

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { flwSubscriptionId: true },
  });

  if (org?.flwSubscriptionId) {
    await cancelSubscription(org.flwSubscriptionId);
  }

  await prisma.organization.update({
    where: { id: orgId },
    data: { billingStatus: "CANCELLED", planCancelledAt: new Date() },
  });

  revalidatePath("/settings/billing");
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ suspended?: string; payment?: string }>;
}) {
  const params = await searchParams;
  const isSuspended = params.suspended === "1";
  const { user, orgId } = await requireOrgSession();
  const isAdmin = can.manageUsers(user);

  const [org, planInfo] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        name: true,
        plan: true,
        billingStatus: true,
        trialEndsAt: true,
        planRenewsAt: true,
        planCancelledAt: true,
        flwSubscriptionId: true,
      },
    }),
    getLimitsForOrg(orgId),
  ]);

  if (!org) redirect("/dashboard");

  const now = new Date();
  const trialDaysLeft = org.trialEndsAt
    ? Math.max(0, Math.ceil((org.trialEndsAt.getTime() - now.getTime()) / 86_400_000))
    : null;

  const isStarterTrialExpired =
    org.plan === "STARTER" &&
    org.billingStatus === "TRIALING" &&
    org.trialEndsAt != null &&
    org.trialEndsAt < now;

  const isGrowthTrialExpired =
    org.plan === "GROWTH" &&
    org.billingStatus === "TRIALING" &&
    org.trialEndsAt != null &&
    org.trialEndsAt < now;

  const isTrialActive =
    org.billingStatus === "TRIALING" &&
    org.trialEndsAt != null &&
    org.trialEndsAt > now;

  // Growth trial is available only when org is still on Starter (never upgraded yet)
  const canStartGrowthTrial = isAdmin && isStarterTrialExpired;

  const isPastDue = org.billingStatus === "PAST_DUE";

  // ── Suspension wall ───────────────────────────────────────────────────────
  if (isSuspended || isStarterTrialExpired || isGrowthTrialExpired || isPastDue) {
    const alertTitle = isGrowthTrialExpired
      ? "Your Growth trial has ended"
      : isPastDue
      ? "Payment overdue"
      : "Your free trial has ended";

    const alertBody = isGrowthTrialExpired
      ? "Subscribe to Growth or Enterprise to restore access to your workspace."
      : isPastDue
      ? "Your last payment failed. Re-subscribe below to restore full access."
      : "Your 30-day free trial has expired. Upgrade to a paid plan to continue using your workspace.";

    return (
      <div className="space-y-6">
        {/* Alert banner */}
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-5 py-5">
          <p className="font-semibold text-red-400 text-lg">{alertTitle}</p>
          <p className="mt-1 text-sm text-red-300/80">{alertBody}</p>
        </div>

        <div>
          <h1 className="text-xl font-bold text-[var(--ink)]">Choose a plan</h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Select a plan to restore access for <span className="font-medium text-[var(--ink)]">{org.name}</span>
          </p>
        </div>

        {!isAdmin && (
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
            <p className="text-sm text-[var(--ink-muted)]">
              Only admins can manage the subscription. Contact your workspace admin to upgrade.
            </p>
          </div>
        )}

        {isAdmin && (
          <div className="grid gap-4 md:grid-cols-2">
            {/* Growth card */}
            <div className="rounded-xl border border-[var(--gold)] bg-[var(--gold)]/5 p-6 space-y-5">
              <div>
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-[var(--ink)] text-lg">Growth</p>
                  <span className="rounded-full bg-[var(--gold)]/20 px-2.5 py-0.5 text-[10px] font-semibold text-[var(--gold)] uppercase tracking-wide">
                    Recommended
                  </span>
                </div>
                <p className="mt-2 text-2xl font-bold text-[var(--ink)]">
                  <span className="text-base font-normal text-[var(--ink-muted)]">UGX </span>
                  {formatMoney(FLW_PLAN_PRICES.GROWTH)}
                  <span className="text-sm font-normal text-[var(--ink-muted)]"> / mo</span>
                </p>
              </div>
              <ul className="space-y-2">
                {[
                  `${PLAN_LIMITS.GROWTH.maxUsers} team members`,
                  `${PLAN_LIMITS.GROWTH.maxJobsPerMonth} jobs / month`,
                  `${PLAN_LIMITS.GROWTH.maxParts} inventory SKUs`,
                  "Custom branding",
                  "Priority support",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
                    <span className="text-[var(--gold)]">✓</span> {f}
                  </li>
                ))}
              </ul>
              <div className="space-y-2">
                <form action={subscribeToPlan}>
                  <input type="hidden" name="plan" value="GROWTH" />
                  <button type="submit" className="btn-premium w-full rounded-lg py-2.5 text-sm font-semibold text-white">
                    Subscribe to Growth
                  </button>
                </form>
                {canStartGrowthTrial && (
                  <form action={startGrowthTrial}>
                    <button
                      type="submit"
                      className="w-full rounded-lg border border-[var(--gold)] py-2.5 text-sm font-semibold text-[var(--gold)] hover:bg-[var(--gold)]/10 transition-colors"
                    >
                      Try Growth free for 14 days
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* Enterprise card */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-6 space-y-5">
              <div>
                <p className="font-semibold text-[var(--ink)] text-lg">Enterprise</p>
                <p className="mt-2 text-2xl font-bold text-[var(--ink)]">
                  <span className="text-base font-normal text-[var(--ink-muted)]">UGX </span>
                  {formatMoney(FLW_PLAN_PRICES.ENTERPRISE)}
                  <span className="text-sm font-normal text-[var(--ink-muted)]"> / mo</span>
                </p>
              </div>
              <ul className="space-y-2">
                {[
                  "Unlimited team members",
                  "Unlimited jobs",
                  "Unlimited inventory",
                  "Custom branding",
                  "Dedicated support",
                  "SLA agreement",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
                    <span className="text-[var(--gold)]">✓</span> {f}
                  </li>
                ))}
              </ul>
              <form action={subscribeToPlan}>
                <input type="hidden" name="plan" value="ENTERPRISE" />
                <button type="submit" className="w-full rounded-lg border border-[var(--line)] py-2.5 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--gold)]/10 transition-colors">
                  Subscribe to Enterprise
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Normal billing page (active trial or paid) ─────────────────────────────
  const plans: Array<{
    key: "STARTER" | "GROWTH" | "ENTERPRISE";
    price: number | null;
    features: string[];
  }> = [
    {
      key: "STARTER",
      price: null,
      features: [
        `${PLAN_LIMITS.STARTER.maxUsers} team members`,
        `${PLAN_LIMITS.STARTER.maxJobsPerMonth} jobs / month`,
        `${PLAN_LIMITS.STARTER.maxParts} inventory SKUs`,
        "Invite links",
        "Standard branding",
      ],
    },
    {
      key: "GROWTH",
      price: FLW_PLAN_PRICES.GROWTH,
      features: [
        `${PLAN_LIMITS.GROWTH.maxUsers} team members`,
        `${PLAN_LIMITS.GROWTH.maxJobsPerMonth} jobs / month`,
        `${PLAN_LIMITS.GROWTH.maxParts} inventory SKUs`,
        "Custom branding",
        "Priority support",
      ],
    },
    {
      key: "ENTERPRISE",
      price: FLW_PLAN_PRICES.ENTERPRISE,
      features: [
        "Unlimited team members",
        "Unlimited jobs",
        "Unlimited inventory",
        "Custom branding",
        "Dedicated support",
        "SLA agreement",
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-[var(--ink)]">Billing & Plan</h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          Manage your subscription for <span className="font-medium text-[var(--ink)]">{org.name}</span>
        </p>
      </div>

      {/* Current status card */}
      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Current plan</p>
            <p className="mt-1 text-2xl font-bold text-[var(--ink)]">{PLAN_LABELS[org.plan]}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
            org.billingStatus === "ACTIVE"    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
            org.billingStatus === "TRIALING"  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
            org.billingStatus === "PAST_DUE"  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                                                "bg-[var(--border)] text-[var(--ink-muted)]"
          }`}>
            {org.billingStatus === "TRIALING" ? "Free trial" :
             org.billingStatus === "ACTIVE"   ? "Active" :
             org.billingStatus === "PAST_DUE" ? "Payment overdue" :
                                                "Cancelled"}
          </span>
        </div>

        {isTrialActive && trialDaysLeft !== null && (
          <div>
            <p className="text-sm text-[var(--ink-muted)]">
              {trialDaysLeft > 0
                ? <>{org.plan === "STARTER" ? "Free trial" : "Growth trial"} — <span className="font-medium text-[var(--ink)]">{trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} remaining</span></>
                : "Your trial has ended."}
            </p>
            {org.plan === "STARTER" && trialDaysLeft <= 7 && trialDaysLeft > 0 && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Your trial ends soon. Upgrade now to avoid interruption.
              </p>
            )}
          </div>
        )}

        {org.billingStatus === "ACTIVE" && org.planRenewsAt && (
          <p className="text-sm text-[var(--ink-muted)]">
            Next renewal:{" "}
            <span className="font-medium text-[var(--ink)]">
              {org.planRenewsAt.toLocaleDateString("en-UG", { day: "numeric", month: "long", year: "numeric" })}
            </span>{" "}
            · {FLW_CURRENCY} {formatMoney(FLW_PLAN_PRICES[org.plan] ?? 0)} / month
          </p>
        )}

        {org.billingStatus === "CANCELLED" && org.planCancelledAt && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Subscription cancelled. Your access continues until the end of the current billing period.
          </p>
        )}

        {isAdmin && org.billingStatus === "ACTIVE" && org.flwSubscriptionId && (
          <form action={cancelPlan}>
            <button
              type="submit"
              className="text-xs text-red-500 underline underline-offset-2 hover:text-red-600"
            >
              Cancel subscription
            </button>
          </form>
        )}
      </section>

      {/* Plan cards — hide Starter upgrade (it's the free tier, no upgrade path back to it) */}
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map(({ key, price, features }) => {
          const isCurrent = org.plan === key;
          const isDowngrade = key === "STARTER";
          const canSubscribe = isAdmin && !isCurrent && !isDowngrade;

          return (
            <div
              key={key}
              className={`panel-shadow rounded-xl border p-5 space-y-4 ${
                isCurrent
                  ? "border-[var(--gold)] bg-[var(--gold)]/5"
                  : "border-[var(--line)] bg-[var(--panel)]"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-[var(--ink)]">{PLAN_LABELS[key]}</p>
                  {isCurrent && (
                    <span className="rounded-full bg-[var(--gold)]/20 px-2 py-0.5 text-[10px] font-semibold text-[var(--gold)]">
                      Current
                    </span>
                  )}
                </div>
                <p className="mt-1 text-2xl font-bold text-[var(--ink)]">
                  {price === null ? (
                    <span>Free</span>
                  ) : (
                    <>
                      <span className="text-base font-normal text-[var(--ink-muted)]">UGX </span>
                      {formatMoney(price)}
                      <span className="text-sm font-normal text-[var(--ink-muted)]"> / mo</span>
                    </>
                  )}
                </p>
              </div>

              <ul className="space-y-1.5">
                {features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
                    <span className="text-[var(--gold)]">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              {canSubscribe && (
                <form action={subscribeToPlan}>
                  <input type="hidden" name="plan" value={key} />
                  <button
                    type="submit"
                    className="btn-premium w-full rounded-lg py-2 text-sm font-semibold text-white"
                  >
                    Upgrade to {PLAN_LABELS[key]}
                  </button>
                </form>
              )}

              {isDowngrade && !isCurrent && (
                <p className="text-xs text-[var(--ink-muted)]">
                  To downgrade, cancel your current subscription first.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {!isAdmin && (
        <p className="text-sm text-[var(--ink-muted)]">
          Only admins can manage the subscription. Contact your workspace admin to upgrade.
        </p>
      )}
    </div>
  );
}
