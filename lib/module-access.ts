import { redirect } from "next/navigation";
import { OrgModule, OrgPlan } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";

export { OrgModule };

export const MODULE_LABELS: Record<OrgModule, string> = {
  JOBS:           "Jobs & Repairs",
  INVENTORY:      "Inventory",
  POS:            "Point of Sale",
  PURCHASE_ORDERS:"Purchase Orders",
  INVOICING:      "Invoicing & Documents",
  COMPLAINTS:     "Complaints",
  REPORTS:        "Reports",
  SALES:          "Sales CRM",
  FIELD:          "Field Visits",
  TARGETS:        "Targets",
};

export const MODULE_ICONS: Record<OrgModule, string> = {
  JOBS:           "🔧",
  INVENTORY:      "📦",
  POS:            "🛒",
  PURCHASE_ORDERS:"📋",
  INVOICING:      "🧾",
  COMPLAINTS:     "📣",
  REPORTS:        "📊",
  SALES:          "💼",
  FIELD:          "📍",
  TARGETS:        "🎯",
};

export const MODULE_DESCRIPTIONS: Record<OrgModule, string> = {
  JOBS:           "Track repair jobs end-to-end — intake, diagnosis, status, and completion",
  INVENTORY:      "Manage parts stock, reorder alerts, and supplier items",
  POS:            "Walk-in sales, product checkout, and receipts",
  PURCHASE_ORDERS:"Raise purchase orders to suppliers and manage goods received",
  INVOICING:      "Generate invoices, send to clients, and track payments",
  COMPLAINTS:     "Log customer complaints and manage resolution workflows",
  REPORTS:        "Revenue reports, performance dashboards, and CSV exports",
  SALES:          "Leads pipeline, corporate accounts, and sales team management",
  FIELD:          "Dispatch field technicians and manage on-site job visits",
  TARGETS:        "Set revenue and performance targets, track attainment",
};

// Minimum plan required to use each module.
// STARTER < STANDARD < GROWTH < PREMIUM < ENTERPRISE
export const MODULE_MIN_PLAN: Record<OrgModule, OrgPlan> = {
  JOBS:            "STARTER",
  REPORTS:         "STARTER",
  COMPLAINTS:      "STARTER",
  INVOICING:       "STANDARD",
  SALES:           "STANDARD",
  INVENTORY:       "STANDARD",
  TARGETS:         "STANDARD",
  POS:             "GROWTH",
  PURCHASE_ORDERS: "GROWTH",
  FIELD:           "GROWTH",
};

const PLAN_ORDER: OrgPlan[] = ["STARTER", "STANDARD", "GROWTH", "PREMIUM", "ENTERPRISE"];

/** Returns the minimum plan that satisfies all selected modules. */
export function recommendPlanForModules(modules: OrgModule[]): OrgPlan {
  if (modules.length === 0) return "STARTER";
  return modules.reduce<OrgPlan>((max, m) => {
    const p = MODULE_MIN_PLAN[m];
    return PLAN_ORDER.indexOf(p) > PLAN_ORDER.indexOf(max) ? p : max;
  }, "STARTER");
}

export const ALL_MODULES: OrgModule[] = (() => {
  try {
    const vals = Object.values(OrgModule ?? {});
    if (vals.length > 0) return vals as OrgModule[];
  } catch { /* ignore */ }
  return ["JOBS","INVENTORY","POS","PURCHASE_ORDERS","INVOICING","COMPLAINTS","REPORTS","SALES","FIELD","TARGETS"] as OrgModule[];
})();

/** Returns the set of enabled modules for an org. */
export async function getOrgModules(orgId: string): Promise<Set<OrgModule>> {
  try {
    const grants = await prisma.orgModuleGrant.findMany({
      where: { orgId },
      select: { module: true },
    });
    // No explicit grants = unrestricted (all modules on by default)
    if (grants.length === 0) return new Set(ALL_MODULES);
    return new Set(grants.map((g) => g.module));
  } catch {
    // If table doesn't exist yet (local dev without migration), allow all.
    return new Set(ALL_MODULES);
  }
}

/** Server-side guard: redirects to /dashboard if the module is not granted. */
export async function requireModule(module: OrgModule): Promise<void> {
  const { orgId } = await requireOrgSession();
  const enabled = await getOrgModules(orgId);
  if (!enabled.has(module)) {
    redirect("/dashboard?blocked=module");
  }
}
