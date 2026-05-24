/**
 * plan-labels.ts — Display names for subscription tiers.
 * Internal DB keys (STARTER, PROFESSIONAL, ENTERPRISE) never change.
 */

export const PLAN_LABEL: Record<string, string> = {
  FREE:         "Ekyenfuna",   // complimentary / free
  STARTER:      "Okutandika",  // beginning
  PROFESSIONAL: "Enkola",      // the way of working
  ENTERPRISE:   "Obugabi",     // prosperity
};

/** Returns the display label, falling back to the raw key if not mapped. */
export function planLabel(key: string): string {
  return PLAN_LABEL[key] ?? key;
}
