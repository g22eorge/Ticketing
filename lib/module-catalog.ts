import { OrgModule, OrgPlan } from "@prisma/client";

export { OrgModule };

export const MODULE_LABELS: Record<OrgModule, string> = {
  JOBS: "Jobs & Repairs",
  INVENTORY: "Inventory",
  POS: "Point of Sale",
  PURCHASE_ORDERS: "Purchase Orders",
  INVOICING: "Invoicing & Documents",
  COMPLAINTS: "Complaints",
  REPORTS: "Reports",
  SALES: "Sales CRM",
  FIELD: "Field Visits",
  TARGETS: "Targets",
};

export const MODULE_ICONS: Record<OrgModule, string> = {
  JOBS: "🔧",
  INVENTORY: "📦",
  POS: "🛒",
  PURCHASE_ORDERS: "📋",
  INVOICING: "🧾",
  COMPLAINTS: "📣",
  REPORTS: "📊",
  SALES: "💼",
  FIELD: "📍",
  TARGETS: "🎯",
};

export const MODULE_DESCRIPTIONS: Record<OrgModule, string> = {
  JOBS: "Track repair jobs end-to-end — intake, diagnosis, status, and completion",
  INVENTORY: "Manage parts stock, reorder alerts, and supplier items",
  POS: "Walk-in sales, product checkout, and receipts",
  PURCHASE_ORDERS: "Raise purchase orders to suppliers and manage goods received",
  INVOICING: "Generate invoices, send to clients, and track payments",
  COMPLAINTS: "Log customer complaints and manage resolution workflows",
  REPORTS: "Revenue reports, performance dashboards, and CSV exports",
  SALES: "Leads pipeline, corporate accounts, and sales team management",
  FIELD: "Dispatch field technicians and manage on-site job visits",
  TARGETS: "Set revenue and performance targets, track attainment",
};

export const MODULE_MIN_PLAN: Record<OrgModule, OrgPlan> = {
  JOBS: "STARTER",
  REPORTS: "STARTER",
  COMPLAINTS: "STARTER",
  INVOICING: "STANDARD",
  SALES: "STANDARD",
  INVENTORY: "STANDARD",
  TARGETS: "STANDARD",
  POS: "GROWTH",
  PURCHASE_ORDERS: "GROWTH",
  FIELD: "GROWTH",
};

const PLAN_ORDER: OrgPlan[] = ["STARTER", "STANDARD", "GROWTH", "PREMIUM", "ENTERPRISE"];

export function recommendPlanForModules(modules: OrgModule[]): OrgPlan {
  if (modules.length === 0) return "STARTER";
  return modules.reduce<OrgPlan>((max, module) => {
    const plan = MODULE_MIN_PLAN[module];
    return PLAN_ORDER.indexOf(plan) > PLAN_ORDER.indexOf(max) ? plan : max;
  }, "STARTER");
}

export const ALL_MODULES: OrgModule[] = (() => {
  try {
    const vals = Object.values(OrgModule ?? {});
    if (vals.length > 0) return vals as OrgModule[];
  } catch {
    // fall through to static enum list
  }
  return ["JOBS", "INVENTORY", "POS", "PURCHASE_ORDERS", "INVOICING", "COMPLAINTS", "REPORTS", "SALES", "FIELD", "TARGETS"] as OrgModule[];
})();
