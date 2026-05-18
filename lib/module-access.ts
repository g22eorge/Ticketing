import { redirect } from "next/navigation";
import { OrgModule } from "@prisma/client";

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

export const ALL_MODULES = Object.values(OrgModule) as OrgModule[];

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
