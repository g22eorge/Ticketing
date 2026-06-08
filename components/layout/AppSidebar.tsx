"use client";

import Link from "next/link";
import { Role } from "@prisma/client";
import { usePathname } from "next/navigation";

import { can } from "@/lib/permissions";
import { AppLogo } from "@/components/ui/AppLogo";

type NavGroup = "overview" | "service" | "stock" | "customers" | "documents" | "finance" | "personal";

// ── nav items ─────────────────────────────────────────────────────────────────

const nav = [
  // Overview
  { href: "/dashboard",   label: "Dashboard",      group: "overview"   as NavGroup, roles: "all" as const },

  // Service — daily items + hub for management
  { href: "/jobs",    label: "Jobs",   group: "service" as NavGroup, roles: "all" as const },
  { href: "/intake",  label: "Intake", group: "service" as NavGroup, roles: ["ADMIN", "MANAGER", "TECH_MANAGER", "OPS", "FRONT_DESK", "TECHNICIAN_INTERNAL", "SALES_MANAGER"] as const },
  { href: "/service", label: "Service Hub", group: "service" as NavGroup, roles: ["ADMIN", "MANAGER", "TECH_MANAGER", "OPS", "FRONT_DESK"] as const },

  // Stock & Supply — daily items + ops hub for less-frequent tasks
  { href: "/inventory",                   label: "Inventory Items",     group: "stock" as NavGroup, roles: ["ADMIN", "MANAGER", "TECH_MANAGER", "OPS", "TECHNICIAN_INTERNAL"] as const },
  { href: "/procurement",                 label: "Procurement Desk",    group: "stock" as NavGroup, roles: ["ADMIN", "MANAGER", "TECH_MANAGER", "OPS"] as const },
  { href: "/inventory/purchase-requests", label: "Purchase Requests", group: "stock" as NavGroup, roles: ["ADMIN", "MANAGER", "TECH_MANAGER", "OPS"] as const },
  { href: "/inventory/purchase-orders",   label: "Purchase Orders",   group: "stock" as NavGroup, roles: ["ADMIN", "MANAGER", "OPS"] as const },
  { href: "/inventory/ops",               label: "Stock Hub",         group: "stock" as NavGroup, roles: ["ADMIN", "MANAGER", "TECH_MANAGER", "OPS"] as const },

  // Customers
  { href: "/clients",          label: "Clients",         group: "customers"  as NavGroup, roles: ["ADMIN", "MANAGER", "OPS", "FRONT_DESK", "SALES", "SALES_MANAGER", "SALES_CORPORATE", "SALES_RETAIL", "FINANCE"] as const },
  { href: "/sales",            label: "Sales CRM",       group: "customers"  as NavGroup, roles: ["ADMIN", "MANAGER", "OPS", "SALES", "SALES_MANAGER", "SALES_CORPORATE", "SALES_RETAIL", "TECH_MANAGER"] as const },
  { href: "/sales/campaigns",  label: "Campaigns",       group: "customers"  as NavGroup, roles: ["ADMIN", "MANAGER", "OPS", "SALES", "SALES_MANAGER"] as const },
  { href: "/pos",              label: "Point of Sale",   group: "customers"  as NavGroup, roles: ["ADMIN", "MANAGER", "OPS", "FRONT_DESK", "SALES", "SALES_MANAGER", "SALES_RETAIL", "SALES_POS"] as const },

  // Documents — daily items + hub for post-sale and config
  { href: "/documents/job-cards",  label: "Job Cards",   group: "documents" as NavGroup, roles: ["ADMIN", "MANAGER", "TECH_MANAGER", "OPS", "FRONT_DESK", "TECHNICIAN_INTERNAL"] as const },
  { href: "/documents/quotations", label: "Quotations",  group: "documents" as NavGroup, roles: ["ADMIN", "MANAGER", "TECH_MANAGER", "OPS", "SALES", "TECHNICIAN_INTERNAL", "SALES_MANAGER", "SALES_CORPORATE", "SALES_RETAIL"] as const },
  { href: "/documents/invoices",   label: "Invoices",    group: "documents" as NavGroup, roles: ["ADMIN", "MANAGER", "OPS", "FINANCE", "SALES_MANAGER", "SALES_CORPORATE", "TECH_MANAGER"] as const },
  { href: "/documents/receipts",   label: "Receipts",    group: "documents" as NavGroup, roles: ["ADMIN", "MANAGER", "OPS", "FRONT_DESK", "SALES", "SALES_MANAGER", "SALES_RETAIL"] as const },
  { href: "/documents",            label: "Documents Hub", group: "documents" as NavGroup, roles: ["ADMIN", "MANAGER", "TECH_MANAGER", "OPS", "FRONT_DESK", "SALES", "SALES_MANAGER", "SALES_CORPORATE", "SALES_RETAIL", "FINANCE", "TECHNICIAN_INTERNAL"] as const },

  // Finance
  { href: "/finance",               label: "Finance Hub", group: "finance" as NavGroup, roles: ["ADMIN", "MANAGER", "OPS", "FINANCE"] as const },
  { href: "/technicians/payouts",   label: "My Payouts",  group: "finance" as NavGroup, roles: ["TECHNICIAN_EXTERNAL"] as const },

  // Account
  { href: "/settings", label: "Settings", group: "personal" as NavGroup, roles: "all" as const },

] as const;

// ── group labels ──────────────────────────────────────────────────────────────

const groupLabel: Record<NavGroup, string> = {
  overview:   "Overview",
  service:    "Service",
  stock:      "Stock & Supply",
  customers:  "Customers",
  documents:  "Documents",
  finance:    "Finance",
  personal:   "Account",
};

// ── role-based ordering ───────────────────────────────────────────────────────

const roleOrder: Partial<Record<Role, readonly string[]>> = {
  ADMIN: [
    "/dashboard",
    "/jobs", "/intake", "/field", "/technicians", "/complaints",
    "/inventory", "/inventory/locations", "/inventory/transfers", "/inventory/stock-counts",
    "/inventory/suppliers", "/inventory/purchase-requests", "/inventory/purchase-orders", "/inventory/goods-received", "/inventory/supplier-bills",
    "/clients", "/sales", "/sales/campaigns", "/pos",
    "/documents/job-cards", "/documents/quotations", "/documents/invoices", "/documents/receipts", "/documents/delivery-notes", "/documents/credit-notes", "/documents/refunds", "/documents/templates",
    "/finance/expenses", "/finance/tax-rates", "/finance/recurring", "/finance/accounts", "/finance/journal", "/finance/bank", "/finance/reports/pl", "/finance/reports/balance-sheet", "/pos/shifts", "/targets", "/reports", "/ai-insights", "/payout-followups",
    "/settings",
  ],
  MANAGER: [
    "/dashboard",
    "/jobs", "/intake", "/field", "/technicians", "/complaints",
    "/inventory", "/inventory/locations", "/inventory/transfers", "/inventory/stock-counts",
    "/inventory/suppliers", "/inventory/purchase-requests", "/inventory/purchase-orders", "/inventory/goods-received", "/inventory/supplier-bills",
    "/clients", "/sales", "/sales/campaigns", "/pos",
    "/documents/job-cards", "/documents/quotations", "/documents/invoices", "/documents/receipts", "/documents/delivery-notes", "/documents/credit-notes", "/documents/refunds", "/documents/templates",
    "/finance/expenses", "/finance/tax-rates", "/finance/recurring", "/finance/accounts", "/finance/journal", "/finance/bank", "/finance/reports/pl", "/finance/reports/balance-sheet", "/pos/shifts", "/targets", "/reports", "/ai-insights", "/payout-followups",
    "/settings",
  ],
  TECH_MANAGER: [
    "/dashboard",
    "/jobs", "/intake", "/field", "/technicians", "/complaints",
    "/inventory", "/inventory/locations", "/inventory/transfers", "/inventory/stock-counts",
    "/inventory/suppliers", "/inventory/purchase-requests", "/inventory/purchase-orders", "/inventory/goods-received", "/inventory/supplier-bills",
    "/documents/job-cards", "/documents/quotations", "/documents/invoices", "/targets", "/payout-followups",
    "/settings",
  ],
  OPS: [
    "/dashboard",
    "/jobs", "/intake", "/field", "/technicians", "/complaints",
    "/inventory", "/inventory/locations", "/inventory/transfers", "/inventory/stock-counts",
    "/inventory/suppliers", "/inventory/purchase-requests", "/inventory/purchase-orders", "/inventory/goods-received", "/inventory/supplier-bills",
    "/clients", "/sales", "/sales/campaigns", "/pos",
    "/documents/job-cards", "/documents/quotations", "/documents/invoices", "/documents/receipts", "/documents/delivery-notes", "/documents/credit-notes", "/documents/refunds", "/documents/templates",
    "/finance/expenses", "/finance/recurring", "/finance/reports/pl", "/finance/reports/balance-sheet", "/pos/shifts", "/targets", "/reports", "/ai-insights", "/payout-followups",
    "/settings",
  ],
  FINANCE: [
    "/dashboard",
    "/clients",
    "/documents/invoices", "/documents/credit-notes", "/documents/refunds",
    "/finance/expenses", "/finance/recurring", "/finance/accounts", "/finance/journal", "/finance/bank", "/finance/reports/pl", "/finance/reports/balance-sheet", "/pos/shifts", "/targets", "/reports", "/ai-insights", "/payout-followups",
    "/settings",
  ],
  SALES: [
    "/dashboard",
    "/clients", "/sales", "/sales/campaigns", "/pos",
    "/documents/quotations", "/documents/receipts",
    "/settings",
  ],
  FRONT_DESK: [
    "/dashboard",
    "/jobs", "/intake", "/technicians",
    "/clients", "/pos",
    "/documents/job-cards", "/documents/receipts", "/documents/delivery-notes",
    "/settings",
  ],
  TECHNICIAN_INTERNAL: [
    "/dashboard",
    "/jobs", "/intake", "/technicians",
    "/inventory",
    "/documents/job-cards", "/documents/quotations",
    "/settings",
  ],
  TECHNICIAN_EXTERNAL: [
    "/dashboard",
    "/jobs", "/technicians",
    "/technicians/payouts",
    "/settings",
  ],
  INTAKE: ["/dashboard", "/jobs", "/intake", "/technicians", "/clients", "/documents/job-cards", "/settings"],
  SALES_MANAGER: ["/dashboard", "/jobs", "/intake", "/field", "/technicians", "/clients", "/sales", "/sales/campaigns", "/pos", "/documents/job-cards", "/documents/quotations", "/documents/invoices", "/targets", "/reports", "/ai-insights", "/payout-followups", "/settings"],
  SALES_CORPORATE: ["/dashboard", "/jobs", "/clients", "/sales", "/documents/quotations", "/documents/invoices", "/settings"],
  SALES_RETAIL: ["/dashboard", "/jobs", "/clients", "/sales", "/pos", "/documents/quotations", "/documents/receipts", "/settings"],
  SALES_POS: ["/dashboard", "/pos", "/settings"],
  TECH_FIELD: ["/dashboard", "/jobs", "/field", "/settings"],
};

const roleGroupOrder: Partial<Record<Role, readonly NavGroup[]>> = {
  ADMIN:               ["overview", "service", "stock", "customers", "documents", "finance", "personal"],
  MANAGER:             ["overview", "service", "stock", "customers", "documents", "finance", "personal"],
  TECH_MANAGER:        ["overview", "service", "stock", "documents", "personal"],
  OPS:                 ["overview", "service", "stock", "customers", "documents", "finance", "personal"],
  FINANCE:             ["overview", "customers", "documents", "finance", "personal"],
  SALES:               ["overview", "customers", "documents", "personal"],
  FRONT_DESK:          ["overview", "service", "customers", "documents", "personal"],
  TECHNICIAN_INTERNAL: ["overview", "service", "stock", "documents", "personal"],
  TECHNICIAN_EXTERNAL: ["overview", "service", "finance", "personal"],
  INTAKE:              ["overview", "service", "customers", "documents", "personal"],
  SALES_MANAGER:       ["overview", "service", "customers", "documents", "finance", "personal"],
  SALES_CORPORATE:     ["overview", "customers", "documents", "personal"],
  SALES_RETAIL:        ["overview", "customers", "documents", "personal"],
  SALES_POS:           ["overview", "customers", "personal"],
  TECH_FIELD:          ["overview", "service", "personal"],
};

// ── module guard ──────────────────────────────────────────────────────────────

const hrefModule: Record<string, string> = {
  "/jobs":                           "JOBS",
  "/intake":                         "JOBS",
  "/technicians":                    "JOBS",
  "/clients":                        "JOBS",
  "/payout-followups":               "JOBS",
  "/complaints":                     "COMPLAINTS",
  "/field":                          "FIELD",
  "/inventory":                      "INVENTORY",
  "/procurement":                    "PURCHASE_ORDERS",
  "/inventory/locations":            "INVENTORY",
  "/inventory/transfers":            "INVENTORY",
  "/inventory/stock-counts":         "INVENTORY",
  "/pos":                            "POS",
  "/inventory/purchase-requests":    "PURCHASE_ORDERS",
  "/inventory/purchase-orders":      "PURCHASE_ORDERS",
  "/inventory/goods-received":       "PURCHASE_ORDERS",
  "/inventory/supplier-bills":       "PURCHASE_ORDERS",
  "/inventory/suppliers":            "PURCHASE_ORDERS",
  "/documents/job-cards":            "INVOICING",
  "/documents/quotations":           "INVOICING",
  "/documents/invoices":             "INVOICING",
  "/documents/receipts":             "INVOICING",
  "/documents/delivery-notes":       "INVOICING",
  "/documents/credit-notes":         "INVOICING",
  "/documents/refunds":              "INVOICING",
  "/pos/shifts":                     "POS",
  "/reports":                        "REPORTS",
  "/ai-insights":                    "REPORTS",
  "/sales":                          "SALES",
  "/targets":                        "TARGETS",
};

// ── helpers ───────────────────────────────────────────────────────────────────

function isVisible(role: Role, rule: "all" | readonly string[]) {
  return rule === "all" ? true : (rule as readonly string[]).includes(role);
}

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

function activeHrefForPath(pathname: string, hrefs: readonly string[]) {
  let best: string | null = null;
  for (const href of hrefs) {
    if (!isActive(pathname, href)) continue;
    if (!best || href.length > best.length) best = href;
  }
  return best;
}

function orderedNavForRole(role: Role, permissions: string[], enabledModules?: Set<string>) {
  const moduleAllowed = (href: string) =>
    !enabledModules || !hrefModule[href] || enabledModules.has(hrefModule[href]);

  const visible = nav.filter(
    (item) => isVisible(role, item.roles) && moduleAllowed(item.href),
  );
  const permissionUser = { role, permissions };

  function ensureItem(href: string) {
    if (!moduleAllowed(href)) return;
    if (!visible.some((i) => i.href === href)) {
      const found = nav.find((i) => i.href === href);
      if (found) visible.push(found);
    }
  }
  if (can.viewClientInfo(permissionUser))    { ensureItem("/intake"); ensureItem("/clients"); }
  if (can.viewAccountsSummary(permissionUser)) ensureItem("/reports");
  if (can.viewFinancials(permissionUser))    { ensureItem("/documents/invoices"); ensureItem("/documents/quotations"); }
  if (can.reviewExternalBills(permissionUser) || can.approveInvoices(permissionUser)) ensureItem("/payout-followups");
  if (can.generateJobCards(permissionUser))  ensureItem("/documents/job-cards");

  const ordered = roleOrder[role] ?? visible.map((item) => item.href);
  const ranking = new Map(ordered.map((href, index) => [href, index]));
  return [...visible].sort((a, b) => (ranking.get(a.href) ?? 99) - (ranking.get(b.href) ?? 99));
}

function groupedNavForRole(role: Role, permissions: string[], enabledModules?: Set<string>) {
  const ordered = orderedNavForRole(role, permissions, enabledModules);
  const canonicalOrder: NavGroup[] = ["overview", "service", "stock", "customers", "documents", "finance", "personal"];
  const baseGroups: readonly NavGroup[] = roleGroupOrder[role] ?? ["overview"];
  const missingGroups = canonicalOrder.filter(
    (group) => ordered.some((item) => item.group === group) && !baseGroups.includes(group),
  );
  const groups = [...baseGroups, ...missingGroups];
  return groups
    .map((group) => ({
      group,
      label: groupLabel[group],
      items: ordered.filter((item) => item.group === group),
    }))
    .filter((section) => section.items.length > 0);
}

// ── icons ─────────────────────────────────────────────────────────────────────

function navIcon(href: string) {
  switch (href) {
    case "/dashboard":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M2.5 9.5 10 3l7.5 6.5V17a.75.75 0 0 1-.75.75h-4.5v-4h-4.5v4h-4.5A.75.75 0 0 1 2.5 17V9.5Z" /></svg>;

    case "/jobs":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M6 2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7.414A2 2 0 0 0 15.414 6L12 2.586A2 2 0 0 0 10.586 2H6Zm2 5a1 1 0 0 0 0 2h4a1 1 0 1 0 0-2H8Zm-1 4a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1Zm1 3a1 1 0 1 0 0 2h2a1 1 0 1 0 0-2H8Z" clipRule="evenodd" /></svg>;

    case "/intake":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" /></svg>;

    case "/field":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.003-.001.005-.003.019-.008a5.741 5.741 0 0 0 .282-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 15.01 17 12.669 17 9.5a7 7 0 1 0-14 0c0 3.169 1.698 5.51 3.354 7.085.829.799 1.654 1.38 2.274 1.765.311.193.571.337.757.433a5.741 5.741 0 0 0 .282.14l.019.008.005.003ZM10 11.25a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Z" clipRule="evenodd" /></svg>;

    case "/technicians":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM1.49 15.326a.78.78 0 0 1-.358-.442 3 3 0 0 1 4.308-3.516 6.484 6.484 0 0 0-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 0 1-2.07-.655ZM16.44 15.98a4.97 4.97 0 0 0 2.07-.654.78.78 0 0 0 .357-.442 3 3 0 0 0-4.308-3.517 6.484 6.484 0 0 1 1.907 3.96 2.32 2.32 0 0 1-.026.654ZM18 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM5.304 16.19a.844.844 0 0 1-.277-.71 5 5 0 0 1 9.947 0 .843.843 0 0 1-.277.71A6.975 6.975 0 0 1 10 18a6.974 6.974 0 0 1-4.696-1.81Z" /></svg>;

    case "/complaints":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" /></svg>;

    case "/inventory":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M2 3a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H2Z" /><path fillRule="evenodd" d="M2 7.5h16l-.811 7.71a2 2 0 0 1-1.99 1.79H4.802a2 2 0 0 1-1.99-1.79L2 7.5ZM7.75 11a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5Z" clipRule="evenodd" /></svg>;

    case "/inventory/locations":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M4 16.5v-13h-.25a.75.75 0 0 1 0-1.5h12.5a.75.75 0 0 1 0 1.5H16v13h.25a.75.75 0 0 1 0 1.5h-3.5a.75.75 0 0 1-.75-.75v-2.5a.75.75 0 0 0-.75-.75h-2.5a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 1-.75.75h-3.5a.75.75 0 0 1 0-1.5H4Zm3-13a.75.75 0 0 0-.75.75v.5c0 .414.336.75.75.75h1a.75.75 0 0 0 .75-.75v-.5A.75.75 0 0 0 8 3.5H7ZM6.25 7a.75.75 0 0 1 .75-.75h1a.75.75 0 0 1 .75.75v.5a.75.75 0 0 1-.75.75H7a.75.75 0 0 1-.75-.75V7ZM7 9.75A.75.75 0 0 0 6.25 10.5v.5c0 .414.336.75.75.75h1a.75.75 0 0 0 .75-.75v-.5a.75.75 0 0 0-.75-.75H7ZM12 3.5a.75.75 0 0 0-.75.75v.5c0 .414.336.75.75.75h1a.75.75 0 0 0 .75-.75v-.5a.75.75 0 0 0-.75-.75h-1Zm-.75 3.75c0-.414.336-.75.75-.75h1a.75.75 0 0 1 .75.75v.5a.75.75 0 0 1-.75.75h-1a.75.75 0 0 1-.75-.75V7Zm.75 2.25a.75.75 0 0 0-.75.75v.5c0 .414.336.75.75.75h1a.75.75 0 0 0 .75-.75v-.5a.75.75 0 0 0-.75-.75h-1Z" clipRule="evenodd" /></svg>;

    case "/inventory/transfers":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M12.97 3.97a.75.75 0 0 1 1.06 0l3.5 3.5a.75.75 0 0 1 0 1.06l-3.5 3.5a.75.75 0 1 1-1.06-1.06l2.22-2.22H2.75a.75.75 0 0 1 0-1.5h12.44l-2.22-2.22a.75.75 0 0 1 0-1.06ZM7.03 12.97a.75.75 0 0 1 0 1.06l-2.22 2.22H17.25a.75.75 0 0 1 0 1.5H4.81l2.22 2.22a.75.75 0 1 1-1.06 1.06l-3.5-3.5a.75.75 0 0 1 0-1.06l3.5-3.5a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" /></svg>;

    case "/inventory/stock-counts":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M9 3.5a.5.5 0 0 0-.5.5H6A2.5 2.5 0 0 0 3.5 6.5v9A2.5 2.5 0 0 0 6 18h8a2.5 2.5 0 0 0 2.5-2.5v-9A2.5 2.5 0 0 0 14 4h-2.5a.5.5 0 0 0-.5-.5H9ZM8 4v.5A1.5 1.5 0 0 0 9.5 6h1A1.5 1.5 0 0 0 12 4.5V4h2a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h2Zm4.78 4.03a.75.75 0 0 0-1.06-1.06L9 10.69 7.28 8.97a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l3.25-3.25Z" clipRule="evenodd" /></svg>;

    case "/inventory/suppliers":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M3.505 2.365A41.369 41.369 0 0 1 9 2c1.863 0 3.697.124 5.495.365 1.247.167 2.255 1.08 2.4 2.268.214 1.763.325 3.57.325 5.407 0 1.838-.11 3.645-.325 5.408-.144 1.187-1.152 2.1-2.4 2.267A41.37 41.37 0 0 1 9 18a41.37 41.37 0 0 1-5.495-.285c-1.247-.167-2.255-1.08-2.4-2.267A41.458 41.458 0 0 1 .78 10c0-1.838.11-3.644.325-5.407.145-1.187 1.153-2.1 2.4-2.268ZM7.25 7.5a.75.75 0 0 0 0 1.5h5.5a.75.75 0 0 0 0-1.5h-5.5Zm0 3a.75.75 0 0 0 0 1.5h5.5a.75.75 0 0 0 0-1.5h-5.5Zm0 3a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5h-3.5Z" /></svg>;

    case "/inventory/purchase-requests":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M2.695 14.763l-1.262 3.154a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885L17.5 5.5a2.121 2.121 0 0 0-3-3L3.58 13.42a4 4 0 0 0-.885 1.343Z" /></svg>;

    case "/inventory/purchase-orders":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M6 5v1H4.667a1.75 1.75 0 0 0-1.743 1.598l-.826 9.5A1.75 1.75 0 0 0 3.84 19H16.16a1.75 1.75 0 0 0 1.743-1.902l-.826-9.5A1.75 1.75 0 0 0 15.333 6H14V5a4 4 0 0 0-8 0Zm4-2.5A2.5 2.5 0 0 0 7.5 5v1h5V5A2.5 2.5 0 0 0 10 2.5ZM7.5 10a2.5 2.5 0 0 0 5 0V8.75a.75.75 0 0 1 1.5 0V10a4 4 0 0 1-8 0V8.75a.75.75 0 0 1 1.5 0V10Z" clipRule="evenodd" /></svg>;

    case "/inventory/goods-received":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M6.5 3c-1.051 0-2.093.04-3.125.117A1.49 1.49 0 0 0 2 4.607V10.5h9V3H6.5Z" /><path d="M12 3v7.5h6V4.606c0-.771-.59-1.43-1.375-1.489A41.035 41.035 0 0 0 12 3Z" /><path d="M11 14.25a2.25 2.25 0 1 0-4.5 0 2.25 2.25 0 0 0 4.5 0ZM15.25 12a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5ZM2 12h2a3 3 0 0 0 2.83 2H2v-2ZM12.17 14a3 3 0 0 0 .83-2h5v2a1 1 0 0 1-1 1h-4.83Z" /></svg>;

    case "/inventory/supplier-bills":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M4 2a2 2 0 0 0-2 2v11a3 3 0 1 0 6 0V4a2 2 0 0 0-2-2H4Zm1 14a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm-1-4h2V5H4v7Zm7-8a2 2 0 0 0-2 2v1h6V6a2 2 0 0 0-2-2h-2Zm2 9.5V10H9v3.5a3.5 3.5 0 1 0 7 0V10h-3v3.5ZM12 17a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" clipRule="evenodd" /></svg>;

    case "/clients":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM14.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.615 16.428a1.224 1.224 0 0 1-.569-1.175 6.002 6.002 0 0 1 11.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 0 1 7 18a9.953 9.953 0 0 1-5.385-1.572ZM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 0 0-1.588-3.755 4.502 4.502 0 0 1 5.874 2.153c.176.463-.039.964-.51 1.16A8.46 8.46 0 0 1 14.5 16Z" /></svg>;

    case "/sales":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M12 7a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-1-5a7 7 0 1 0 0 14A7 7 0 0 0 11 2Zm0 1.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM9.5 10.5v3a.75.75 0 0 0 1.5 0v-3a.75.75 0 0 0-1.5 0Z" clipRule="evenodd" /></svg>;

    case "/pos":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M2.5 4A1.5 1.5 0 0 0 1 5.5V6h18v-.5A1.5 1.5 0 0 0 17.5 4h-15ZM19 8.5H1v6A1.5 1.5 0 0 0 2.5 16h15a1.5 1.5 0 0 0 1.5-1.5v-6ZM3 13.25a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75Zm4.75-.75a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5h-3.5Z" clipRule="evenodd" /></svg>;

    case "/documents/job-cards":
    case "/documents/quotations":
    case "/documents/invoices":
    case "/documents/receipts":
    case "/documents/delivery-notes":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M5.25 2A2.25 2.25 0 0 0 3 4.25v11.5A2.25 2.25 0 0 0 5.25 18h9.5A2.25 2.25 0 0 0 17 15.75V6.56a2.25 2.25 0 0 0-.659-1.591L14.03 2.66A2.25 2.25 0 0 0 12.44 2H5.25Zm6.5 1.5v2.75c0 .414.336.75.75.75h2.75v8.75a.75.75 0 0 1-.75.75h-9.5a.75.75 0 0 1-.75-.75V4.25a.75.75 0 0 1 .75-.75h6.75Zm-5.5 6.25a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 0 1.5h-6a.75.75 0 0 1-.75-.75Zm0 3a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 0 1.5H7a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" /></svg>;

    case "/documents/credit-notes":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M5.25 2A2.25 2.25 0 0 0 3 4.25v11.5A2.25 2.25 0 0 0 5.25 18h9.5A2.25 2.25 0 0 0 17 15.75V6.56a2.25 2.25 0 0 0-.659-1.591L14.03 2.66A2.25 2.25 0 0 0 12.44 2H5.25Zm6.5 1.5v2.75c0 .414.336.75.75.75h2.75v8.75a.75.75 0 0 1-.75.75h-9.5a.75.75 0 0 1-.75-.75V4.25a.75.75 0 0 1 .75-.75h6.75ZM7 10.25a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" /></svg>;

    case "/documents/refunds":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M7.793 2.232a.75.75 0 0 1-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 0 1 0 10.75H10.75a.75.75 0 0 1 0-1.5h2.875a3.875 3.875 0 0 0 0-7.75H3.622l4.146 3.957a.75.75 0 0 1-1.036 1.085l-5.5-5.25a.75.75 0 0 1 0-1.085l5.5-5.25a.75.75 0 0 1 1.061.025Z" clipRule="evenodd" /></svg>;

    case "/finance/expenses":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10.75 10.818v2.614A3.13 3.13 0 0 0 11.888 13c.482-.315.612-.648.612-.875 0-.227-.13-.56-.612-.875a3.13 3.13 0 0 0-1.138-.432ZM8.33 8.62c.053.055.115.11.184.164.208.16.46.284.736.363V6.603a2.45 2.45 0 0 0-.35.13c-.14.065-.27.143-.386.233-.377.292-.514.627-.514.909 0 .184.058.39.33.576Z" /><path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-6a.75.75 0 0 1 .75.75v.316a3.78 3.78 0 0 1 1.653.713c.426.33.744.74.925 1.2a.75.75 0 0 1-1.395.55 1.35 1.35 0 0 0-.428-.507 2.276 2.276 0 0 0-.755-.36V8.5c.558.157 1.072.443 1.482.8.542.47.87 1.096.87 1.7 0 .604-.328 1.23-.87 1.7a4.841 4.841 0 0 1-1.482.8V14a.75.75 0 0 1-1.5 0v-.311a4.5 4.5 0 0 1-1.681-.845.75.75 0 1 1 .914-1.198c.382.29.813.487 1.267.551V9.5a3.702 3.702 0 0 1-1.29-.645 2.193 2.193 0 0 1-.798-1.678c0-.845.467-1.58 1.129-2.066A3.947 3.947 0 0 1 9.25 4.81V4.75A.75.75 0 0 1 10 4Z" clipRule="evenodd" /></svg>;

    case "/finance/tax-rates":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M13.5 4.938a7 7 0 1 1-9.006 1.737c.202-.257.59-.218.793.012.8.944 2.523.655 3.322-.208 1.831-1.977.19-5.59 2.046-6.975.317-.231.74.163.744.567v.292c.05 3.025 2.1 5.403 5.105 5.403.78 0 1.42-.1 1.946-.314.508-.205.913.469.786.963-.55 2.12-2.56 3.634-4.93 3.523a5.5 5.5 0 0 1-5.49-5.493c0-.473.063-.931.18-1.37a.75.75 0 0 0-1.44-.422A7 7 0 1 0 17 10.938Z" clipRule="evenodd" /></svg>;

    case "/finance/recurring":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.05 2.126l-1.091 1.092A1 1 0 0 1 3.5 14H2a1 1 0 0 1-1-1v-1.5a1 1 0 0 1 1-1h1.5a1 1 0 0 1 .707 1.707l-.765.765a4 4 0 0 0 6.867-1.548 1 1 0 1 1 1.94.487ZM4.688 8.576a5.5 5.5 0 0 1 9.05-2.126l1.091-1.092A1 1 0 0 1 16.5 6H18a1 1 0 0 1 1 1v1.5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-.707-1.707l.765-.765a4 4 0 0 0-6.867 1.548 1 1 0 1 1-1.94-.487Z" clipRule="evenodd" /></svg>;

    case "/pos/shifts":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clipRule="evenodd" /></svg>;

    case "/targets":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M13 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /><path fillRule="evenodd" d="M18.905 10.75a.75.75 0 0 0 0-1.5h-1.277A7.002 7.002 0 0 0 10.75 3.372V2.095a.75.75 0 0 0-1.5 0v1.277A7.002 7.002 0 0 0 3.372 9.25H2.095a.75.75 0 0 0 0 1.5h1.277a7.002 7.002 0 0 0 6.378 6.378v1.277a.75.75 0 0 0 1.5 0v-1.277a7.002 7.002 0 0 0 6.378-6.378h1.277ZM10 15.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11Z" clipRule="evenodd" /></svg>;

    case "/reports":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M15.5 2A1.5 1.5 0 0 0 14 3.5v13a1.5 1.5 0 0 0 3 0v-13A1.5 1.5 0 0 0 15.5 2ZM9.5 6A1.5 1.5 0 0 0 8 7.5v9a1.5 1.5 0 0 0 3 0v-9A1.5 1.5 0 0 0 9.5 6ZM3.5 10A1.5 1.5 0 0 0 2 11.5v5a1.5 1.5 0 0 0 3 0v-5A1.5 1.5 0 0 0 3.5 10Z" /></svg>;

    case "/payout-followups":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M1 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4Zm12 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM4 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm13-1a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM1.75 14.5a.75.75 0 0 0 0 1.5c4.417 0 8.693.603 12.749 1.73 1.111.309 2.251-.512 2.251-1.696v-.784a.75.75 0 0 0-1.5 0v.784a.272.272 0 0 1-.35.25A49.043 49.043 0 0 0 1.75 14.5Z" clipRule="evenodd" /></svg>;

    case "/technicians/payouts":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10.75 10.818v2.614A3.13 3.13 0 0 0 11.888 13c.482-.315.612-.648.612-.875 0-.227-.13-.56-.612-.875a3.13 3.13 0 0 0-1.138-.432ZM8.33 8.62c.053.055.115.11.184.164.208.16.46.284.736.363V6.603a2.45 2.45 0 0 0-.35.13c-.14.065-.27.143-.386.233-.377.292-.514.627-.514.909 0 .184.058.39.33.576Z" /><path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-6a.75.75 0 0 1 .75.75v.316a3.78 3.78 0 0 1 1.653.713c.426.33.744.74.925 1.2a.75.75 0 0 1-1.395.55 1.35 1.35 0 0 0-.428-.507 2.276 2.276 0 0 0-.755-.36V8.5c.558.157 1.072.443 1.482.8.542.47.87 1.096.87 1.7 0 .604-.328 1.23-.87 1.7a4.841 4.841 0 0 1-1.482.8V14a.75.75 0 0 1-1.5 0v-.311a4.5 4.5 0 0 1-1.681-.845.75.75 0 1 1 .914-1.198c.382.29.813.487 1.267.551V9.5a3.702 3.702 0 0 1-1.29-.645 2.193 2.193 0 0 1-.798-1.678c0-.845.467-1.58 1.129-2.066A3.947 3.947 0 0 1 9.25 4.81V4.75A.75.75 0 0 1 10 4Z" clipRule="evenodd" /></svg>;

    case "/settings":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.993 6.993 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" /></svg>;

    // Hub pages — grid/squares icon
    case "/service":
    case "/inventory/ops":
    case "/documents":
    case "/finance":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 0 0 2 4.25v2.5A2.25 2.25 0 0 0 4.25 9h2.5A2.25 2.25 0 0 0 9 6.75v-2.5A2.25 2.25 0 0 0 6.75 2h-2.5Zm0 9A2.25 2.25 0 0 0 2 13.25v2.5A2.25 2.25 0 0 0 4.25 18h2.5A2.25 2.25 0 0 0 9 15.75v-2.5A2.25 2.25 0 0 0 6.75 11h-2.5Zm6.5-9A2.25 2.25 0 0 0 8.5 4.25v2.5A2.25 2.25 0 0 0 10.75 9h2.5A2.25 2.25 0 0 0 15.5 6.75v-2.5A2.25 2.25 0 0 0 13.25 2h-2.5Zm0 9A2.25 2.25 0 0 0 8.5 13.25v2.5A2.25 2.25 0 0 0 10.75 18h2.5A2.25 2.25 0 0 0 15.5 15.75v-2.5A2.25 2.25 0 0 0 13.25 11h-2.5Z" clipRule="evenodd" /></svg>;

    default:
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-5.5-2.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM10 12a5.99 5.99 0 0 0-4.793 2.39A6.483 6.483 0 0 0 10 16.5a6.483 6.483 0 0 0 4.793-2.11A5.99 5.99 0 0 0 10 12Z" clipRule="evenodd" /></svg>;
  }
}

// ── group icon chips ──────────────────────────────────────────────────────────

function groupIcon(group: NavGroup) {
  switch (group) {
    case "overview":
      return <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><circle cx="6" cy="6" r="2.5" /></svg>;
    case "service":
      return <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M9.5 2a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 .5-.5ZM6 4a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-1 0v-5A.5.5 0 0 1 6 4Zm-3.5 2a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0v-3a.5.5 0 0 1 .5-.5Z" /></svg>;
    case "stock":
      return <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><rect x="1" y="4" width="10" height="7" rx="1" /><rect x="3" y="2" width="6" height="3" rx="0.5" /></svg>;
    case "customers":
      return <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><circle cx="4.5" cy="3.5" r="1.5" /><path d="M1 9.5a3.5 3.5 0 0 1 7 0" /><circle cx="9" cy="4" r="1.25" /><path d="M7 9.5a2.5 2.5 0 0 1 4.5 0" /></svg>;
    case "documents":
      return <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M2.5 1A1.5 1.5 0 0 0 1 2.5v7A1.5 1.5 0 0 0 2.5 11h7A1.5 1.5 0 0 0 11 9.5v-5L7 1H2.5ZM7 1.5V4h2.5L7 1.5ZM3.5 6a.5.5 0 0 0 0 1h5a.5.5 0 0 0 0-1h-5Zm0 2a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1h-3Z" clipRule="evenodd" /></svg>;
    case "finance":
      return <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M6 1a5 5 0 1 0 0 10A5 5 0 0 0 6 1Zm.5 2.5a.5.5 0 0 0-1 0v.27a1.5 1.5 0 0 0 .5 2.91v1.5a.75.75 0 0 1-.553-.242.5.5 0 1 0-.735.676A1.75 1.75 0 0 0 5.5 8.73V9a.5.5 0 0 0 1 0v-.27a1.5 1.5 0 0 0-.5-2.91V4.32c.21.08.388.217.5.38a.5.5 0 1 0 .832-.555A1.75 1.75 0 0 0 6.5 3.77V3.5Z" clipRule="evenodd" /></svg>;
    case "personal":
      return <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M6 1.5a1 1 0 0 1 .98.8l.1.49c.22.08.43.17.63.29l.42-.27a1 1 0 0 1 1.25.14l.67.67a1 1 0 0 1 .14 1.25l-.27.42c.12.2.21.41.29.63l.49.1a1 1 0 0 1 .8.98v1a1 1 0 0 1-.8.98l-.49.1c-.08.22-.17.43-.29.63l.27.42a1 1 0 0 1-.14 1.25l-.67.67a1 1 0 0 1-1.25.14l-.42-.27c-.2.12-.41.21-.63.29l-.1.49a1 1 0 0 1-.98.8H5a1 1 0 0 1-.98-.8l-.1-.49a3.75 3.75 0 0 1-.63-.29l-.42.27a1 1 0 0 1-1.25-.14l-.67-.67a1 1 0 0 1-.14-1.25l.27-.42a3.75 3.75 0 0 1-.29-.63l-.49-.1A1 1 0 0 1-.5 8V7a1 1 0 0 1 .8-.98l.49-.1c.08-.22.17-.43.29-.63l-.27-.42a1 1 0 0 1 .14-1.25l.67-.67a1 1 0 0 1 1.25-.14l.42.27c.2-.12.41-.21.63-.29l.1-.49A1 1 0 0 1 5 1.5h1Zm-.5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" clipRule="evenodd" /></svg>;
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export function AppSidebar({
  role,
  permissions = [],
  badges,
  isPlatformAdmin = false,
  enabledModules,
  orgName,
}: {
  role: Role;
  permissions?: string[];
  isPlatformAdmin?: boolean;
  enabledModules?: Set<string>;
  orgName?: string | null;
  badges?: {
    receivedJobs?: number;
    inventory?: number;
    procurement?: number;
    purchaseRequests?: number;
    purchaseOrders?: number;
    paymentFollowups?: number;
    pendingRequests?: number;
    complaints?: number;
  };
}) {
  const pathname = usePathname();
  const visibleHrefs = nav
    .filter((item) => isVisible(role, item.roles === "all" ? "all" : item.roles))
    .map((item) => item.href);
  const activeHref = activeHrefForPath(pathname, visibleHrefs);
  const groupedNav = groupedNavForRole(role, permissions, enabledModules);

  return (
    <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:flex-col bg-[var(--sidebar-bg)] border-r border-[var(--line)]">

      {/* ── Brand ── */}
      <Link
        href="/"
        className="flex items-center px-5 py-4 border-b border-[var(--line)] hover:opacity-80 transition-opacity"
      >
        <AppLogo height={48} priority />
      </Link>

      {/* ── Navigation ── */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-3">
        {groupedNav.map((section, si) => (
          <div key={section.group} className={si > 0 ? "mt-2" : ""}>

            {/* Section header */}
            <div className="mb-1 flex items-center gap-1.5 px-2">
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[var(--ink-muted)]/40 [&_svg]:h-2.5 [&_svg]:w-2.5">
                {groupIcon(section.group)}
              </span>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]/60" aria-hidden="true">
                {section.label}
              </p>
              <div className="ml-1 h-px flex-1 bg-[var(--line)]/60" />
            </div>

            {/* Items */}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = activeHref === item.href;
                const isHub = ["/service", "/inventory/ops", "/documents", "/finance"].includes(item.href);
                const badge =
                  item.href === "/inventory"          ? badges?.inventory
                  : item.href === "/procurement"      ? badges?.procurement
                  : item.href === "/inventory/purchase-requests" ? badges?.purchaseRequests
                  : item.href === "/inventory/purchase-orders" ? badges?.purchaseOrders
                  : item.href === "/intake"           ? badges?.pendingRequests
                  : undefined;
                const newBadge = item.href === "/jobs" ? badges?.receivedJobs : undefined;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 focus-visible:ring-offset-1 ${
                      isHub
                        ? active
                          ? "border border-[var(--accent)]/40 bg-[var(--accent-muted)] text-[var(--ink)]"
                          : "border border-dashed border-[var(--line)] text-[var(--ink-muted)]/70 hover:border-[var(--accent)]/30 hover:bg-[var(--panel-strong)] hover:text-[var(--ink)]"
                        : active
                          ? "bg-[var(--accent-muted)] text-[var(--ink)]"
                          : "text-[var(--ink-muted)] hover:bg-[var(--panel-strong)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-0.5 shrink-0 rounded-full transition-all ${
                        active ? "bg-[var(--accent)]" : "bg-transparent group-hover:bg-[var(--line)]"
                      }`}
                    />
                    <span
                      className={`flex h-[1.375rem] w-[1.375rem] shrink-0 items-center justify-center rounded-md transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5 ${
                        active
                          ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                          : isHub
                            ? "bg-transparent text-[var(--ink-muted)]/50 group-hover:bg-[var(--line)] group-hover:text-[var(--ink)]"
                            : "bg-[var(--panel-strong)] text-[var(--ink-muted)] group-hover:bg-[var(--line)] group-hover:text-[var(--ink)]"
                      }`}
                    >
                      {navIcon(item.href)}
                    </span>
                    <span className={`truncate ${isHub ? "text-[12px]" : ""}`}>{item.label}</span>
                    <span className="ml-auto flex items-center gap-1">
                      {typeof newBadge === "number" && newBadge > 0 && (
                        <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[12px] font-bold text-black">
                          {newBadge > 99 ? "99+" : newBadge} new
                        </span>
                      )}
                      {typeof badge === "number" && badge > 0 && (
                        <span className="rounded-full border border-[var(--line)] bg-[var(--panel)] px-1.5 py-0.5 text-[12px] font-semibold text-[var(--ink-muted)]">
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Platform admin section ── */}
      {isPlatformAdmin && (
        <div className="border-t border-[var(--line)] px-3 py-2">
          <p className="mb-1 px-2 text-[13px] font-bold uppercase tracking-[0.18em] text-amber-500/70">
            Platform Admin
          </p>
          <Link
            href="/admin/orgs"
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] font-medium transition-colors ${
              pathname.startsWith("/admin/orgs")
                ? "bg-amber-500/15 text-amber-600"
                : "text-[var(--ink-muted)] hover:bg-[var(--panel-strong)] hover:text-[var(--ink)]"
            }`}
          >
            <span className="flex h-[1.375rem] w-[1.375rem] shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                <path fillRule="evenodd" d="M8 7a5 5 0 1 1 10 0A5 5 0 0 1 8 7ZM2.293 9.707a1 1 0 0 1 1.414-1.414l4.586 4.586a1 1 0 0 1-1.414 1.414L2.293 9.707Z" clipRule="evenodd" />
              </svg>
            </span>
            Module Access
          </Link>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="border-t border-[var(--line)] px-5 py-3 text-left">
        {orgName && (
          <p className="truncate text-[13px] font-semibold text-[var(--ink)]" title={orgName}>{orgName}</p>
        )}
        <p className="mt-0.5 text-[12px] font-medium tracking-[0.08em] text-[var(--accent)]" aria-hidden="true">Duuka Pro Max</p>
      </div>
    </aside>
  );
}
