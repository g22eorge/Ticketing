/**
 * plan-prices.ts — Effective plan price resolver
 *
 * Priority:
 *   1. PlatformSetting (PLAN_PRICE_*)  — written by Zoho sync or manual save
 *   2. FALLBACK_PLAN_PRICES            — hardcoded defaults
 */

import { getPlatformSetting } from "@/lib/platform-settings";

export const FALLBACK_PLAN_PRICES: Record<string, number> = {
  STARTER:       35_000,
  PROFESSIONAL:  75_000,
  ENTERPRISE:   120_000,
};

/** Returns the effective price map for all three plans. */
export async function getEffectivePlanPrices(): Promise<Record<string, number>> {
  const prices: Record<string, number> = { ...FALLBACK_PLAN_PRICES };

  await Promise.all(
    Object.keys(FALLBACK_PLAN_PRICES).map(async (plan) => {
      const stored = await getPlatformSetting(`PLAN_PRICE_${plan}`);
      if (stored) {
        const n = Number(stored);
        if (n > 0) prices[plan] = n;
      }
    }),
  );

  return prices;
}

/**
 * Returns the effective price for a single plan.
 * Returns the fallback if the plan is not in DB.
 * Returns null if the plan key itself is unknown.
 */
export async function getEffectivePlanPrice(plan: string): Promise<number | null> {
  const stored = await getPlatformSetting(`PLAN_PRICE_${plan}`);
  if (stored) {
    const n = Number(stored);
    if (n > 0) return n;
  }
  return FALLBACK_PLAN_PRICES[plan] ?? null;
}
