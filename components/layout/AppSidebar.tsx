"use client";

import Image from "next/image";
import Link from "next/link";
import { Role } from "@prisma/client";
import { usePathname } from "next/navigation";

import { can } from "@/lib/permissions";

type NavGroup = "overview" | "repairs" | "inventory" | "clients" | "documents" | "finance" | "personal";

// ── nav items ─────────────────────────────────────────────────────────────────

const nav = [
  // Overview
  { href: "/dashboard",   label: "Dashboard",      group: "overview"   as NavGroup, roles: "all" as const },

  // Repairs / Technical
  { href: "/jobs",        label: "Jobs",            group: "repairs"    as NavGroup, roles: "all" as const },
  { href: "/intake",      label: "Intake",          group: "repairs"    as NavGroup, roles: ["ADMIN", "MANAGER", "TECH_MANAGER", "OPS", "FRONT_DESK", "TECHNICIAN_INTERNAL", "SALES_MANAGER"] as const },
  { href: "/field",       label: "Field Visits",    group: "repairs"    as NavGroup, roles: ["ADMIN", "MANAGER", "TECH_MANAGER", "OPS", "TECH_FIELD"] as const },
  { href: "/technicians", label: "Technicians",     group: "repairs"    as NavGroup, roles: ["ADMIN", "MANAGER", "TECH_MANAGER", "OPS", "TECHNICIAN_INTERNAL", "TECHNICIAN_EXTERNAL", "FRONT_DESK", "SALES_MANAGER", "FINANCE"] as const },
  { href: "/complaints",  label: "Complaints",      group: "repairs"    as NavGroup, roles: ["ADMIN", "MANAGER", "TECH_MANAGER", "OPS"] as const },

  // Inventory
  { href: "/inventory",                    label: "Parts",           group: "inventory" as NavGroup, roles: ["ADMIN", "MANAGER", "TECH_MANAGER", "OPS", "TECHNICIAN_INTERNAL"] as const },
  { href: "/inventory/suppliers",          label: "Suppliers",       group: "inventory" as NavGroup, roles: ["ADMIN", "MANAGER", "OPS"] as const },
  { href: "/inventory/purchase-orders",    label: "Purchase Orders", group: "inventory" as NavGroup, roles: ["ADMIN", "MANAGER", "OPS"] as const },

  // Clients & Sales
  { href: "/clients",     label: "Clients",         group: "clients"    as NavGroup, roles: ["ADMIN", "MANAGER", "OPS", "FRONT_DESK", "SALES", "SALES_MANAGER", "SALES_CORPORATE", "SALES_RETAIL", "FINANCE"] as const },
  { href: "/sales",       label: "Sales CRM",       group: "clients"    as NavGroup, roles: ["ADMIN", "MANAGER", "OPS", "SALES", "SALES_MANAGER", "SALES_CORPORATE", "SALES_RETAIL", "TECH_MANAGER"] as const },
  { href: "/pos",         label: "Point of Sale",   group: "clients"    as NavGroup, roles: ["ADMIN", "MANAGER", "OPS", "FRONT_DESK", "SALES", "SALES_MANAGER", "SALES_RETAIL", "SALES_POS"] as const },

  // Documents
  { href: "/documents/job-cards",     label: "Job Cards",      group: "documents" as NavGroup, roles: ["ADMIN", "MANAGER", "TECH_MANAGER", "OPS", "FRONT_DESK", "TECHNICIAN_INTERNAL"] as const },
  { href: "/documents/quotations",    label: "Quotations",     group: "documents" as NavGroup, roles: ["ADMIN", "MANAGER", "TECH_MANAGER", "OPS", "SALES", "TECHNICIAN_INTERNAL", "SALES_MANAGER", "SALES_CORPORATE", "SALES_RETAIL"] as const },
  { href: "/documents/invoices",      label: "Invoices",       group: "documents" as NavGroup, roles: ["ADMIN", "MANAGER", "OPS", "FINANCE", "SALES_MANAGER", "SALES_CORPORATE", "TECH_MANAGER"] as const },
  { href: "/documents/receipts",      label: "Receipts",       group: "documents" as NavGroup, roles: ["ADMIN", "MANAGER", "OPS", "FRONT_DESK", "SALES", "SALES_MANAGER", "SALES_RETAIL"] as const },
  { href: "/documents/delivery-notes",label: "Delivery Notes", group: "documents" as NavGroup, roles: ["ADMIN", "MANAGER", "OPS", "FRONT_DESK"] as const },

  // Finance
  { href: "/targets",           label: "Targets",         group: "finance"    as NavGroup, roles: ["ADMIN", "MANAGER", "OPS", "SALES_MANAGER", "TECH_MANAGER", "FINANCE"] as const },
  { href: "/reports",            label: "Reports",         group: "finance"    as NavGroup, roles: ["ADMIN", "MANAGER", "OPS", "FINANCE", "SALES_MANAGER"] as const },
  { href: "/payout-followups",   label: "Payment Tracker", group: "finance"    as NavGroup, roles: ["ADMIN", "MANAGER", "OPS", "FINANCE", "TECH_MANAGER", "SALES_MANAGER"] as const },
  { href: "/technicians/payouts",label: "My Payouts",      group: "finance"    as NavGroup, roles: ["TECHNICIAN_EXTERNAL"] as const },

  // Account. Settings subpages live inside /settings and should not be duplicated in the sidebar.
  { href: "/settings", label: "Settings", group: "personal" as NavGroup, roles: "all" as const },

] as const;

// ── group labels ──────────────────────────────────────────────────────────────

const groupLabel: Record<NavGroup, string> = {
  overview:  "Overview",
  repairs:   "Repairs",
  inventory: "Inventory",
  clients:   "Clients & Sales",
  documents: "Documents",
  finance:   "Finance",
  personal:  "Account",
};

// ── role-based ordering ───────────────────────────────────────────────────────

const roleOrder: Partial<Record<Role, readonly string[]>> = {
  ADMIN: [
    "/dashboard",
    // repairs
    "/jobs", "/intake", "/field", "/technicians", "/complaints",
    // inventory
    "/inventory", "/inventory/suppliers", "/inventory/purchase-orders",
    // clients
    "/clients", "/sales", "/pos",
    // documents
    "/documents/job-cards", "/documents/quotations", "/documents/invoices", "/documents/receipts", "/documents/delivery-notes",
    // finance
    "/targets", "/reports", "/payout-followups",
    "/settings",
  ],
  MANAGER: [
    "/dashboard",
    "/jobs", "/intake", "/field", "/technicians", "/complaints",
    "/inventory", "/inventory/suppliers", "/inventory/purchase-orders",
    "/clients", "/sales", "/pos",
    "/documents/job-cards", "/documents/quotations", "/documents/invoices", "/documents/receipts", "/documents/delivery-notes",
    "/targets", "/reports", "/payout-followups",
    "/settings",
  ],
  TECH_MANAGER: [
    "/dashboard",
    "/jobs", "/intake", "/field", "/technicians", "/complaints",
    "/inventory", "/inventory/suppliers", "/inventory/purchase-orders",
    "/documents/job-cards", "/documents/quotations", "/documents/invoices", "/targets", "/payout-followups",
    "/settings",
  ],
  OPS: [
    "/dashboard",
    "/jobs", "/intake", "/field", "/technicians", "/complaints",
    "/inventory", "/inventory/suppliers", "/inventory/purchase-orders",
    "/clients", "/sales", "/pos",
    "/documents/job-cards", "/documents/quotations", "/documents/invoices", "/documents/receipts", "/documents/delivery-notes",
    "/targets", "/reports", "/payout-followups",
    "/settings",
  ],
  FINANCE: [
    "/dashboard",
    "/documents/invoices",
    "/targets", "/reports", "/payout-followups",
    "/settings",
  ],
  SALES: [
    "/dashboard",
    "/clients", "/sales", "/pos",
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
  // Legacy alias — normalizeRole() converts INTAKE → FRONT_DESK
  INTAKE: ["/dashboard", "/jobs", "/intake", "/technicians", "/clients", "/documents/job-cards", "/settings"],
  SALES_MANAGER: ["/dashboard", "/jobs", "/intake", "/field", "/technicians", "/clients", "/sales", "/pos", "/documents/job-cards", "/documents/quotations", "/documents/invoices", "/targets", "/reports", "/payout-followups", "/settings"],
  SALES_CORPORATE: ["/dashboard", "/jobs", "/clients", "/sales", "/documents/quotations", "/documents/invoices", "/settings"],
  SALES_RETAIL: ["/dashboard", "/jobs", "/clients", "/sales", "/pos", "/documents/quotations", "/documents/receipts", "/settings"],
  SALES_POS: ["/dashboard", "/pos", "/settings"],
  TECH_FIELD: ["/dashboard", "/jobs", "/field", "/settings"],
};

const roleGroupOrder: Partial<Record<Role, readonly NavGroup[]>> = {
  ADMIN:               ["overview", "repairs", "inventory", "clients", "documents", "finance", "personal"],
  MANAGER:             ["overview", "repairs", "inventory", "clients", "documents", "finance", "personal"],
  TECH_MANAGER:        ["overview", "repairs", "inventory", "documents", "personal"],
  OPS:                 ["overview", "repairs", "inventory", "clients", "documents", "finance", "personal"],
  FINANCE:             ["overview", "finance", "documents", "personal"],
  SALES:               ["overview", "clients", "documents", "personal"],
  FRONT_DESK:          ["overview", "repairs", "clients", "documents", "personal"],
  TECHNICIAN_INTERNAL: ["overview", "repairs", "inventory", "documents", "personal"],
  TECHNICIAN_EXTERNAL: ["overview", "repairs", "finance", "personal"],
  INTAKE:              ["overview", "repairs", "clients", "documents", "personal"],
  SALES_MANAGER:       ["overview", "repairs", "clients", "documents", "finance", "personal"],
  SALES_CORPORATE:     ["overview", "clients", "documents", "personal"],
  SALES_RETAIL:        ["overview", "clients", "documents", "personal"],
  SALES_POS:           ["overview", "clients", "personal"],
  TECH_FIELD:          ["overview", "repairs", "personal"],
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

function orderedNavForRole(role: Role, permissions: string[]) {
  const visible = nav.filter((item) => isVisible(role, item.roles));
  const permissionUser = { role, permissions };

  // Permission-based extras (for custom-permission users)
  function ensureItem(href: string) {
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

function groupedNavForRole(role: Role, permissions: string[]) {
  const ordered = orderedNavForRole(role, permissions);
  const canonicalOrder: NavGroup[] = ["overview", "repairs", "inventory", "clients", "documents", "finance", "personal"];
  const baseGroups: readonly NavGroup[] = roleGroupOrder[role] ?? ["overview", "personal"];
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
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M2 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4l-3 3V5Zm10 3a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM7 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm7 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" clipRule="evenodd" /></svg>;

    case "/technicians":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM1.49 15.326a.78.78 0 0 1-.358-.442 3 3 0 0 1 4.308-3.516 6.484 6.484 0 0 0-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 0 1-2.07-.655ZM16.44 15.98a4.97 4.97 0 0 0 2.07-.654.78.78 0 0 0 .357-.442 3 3 0 0 0-4.308-3.517 6.484 6.484 0 0 1 1.907 3.96 2.32 2.32 0 0 1-.026.654ZM18 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM5.304 16.19a.844.844 0 0 1-.277-.71 5 5 0 0 1 9.947 0 .843.843 0 0 1-.277.71A6.975 6.975 0 0 1 10 18a6.974 6.974 0 0 1-4.696-1.81Z" /></svg>;

    case "/complaints":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M2 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4l-3 3V5Zm8 1a1 1 0 0 0-1 1v3a1 1 0 1 0 2 0V7a1 1 0 0 0-1-1Zm0 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" /></svg>;

    case "/inventory":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M2.5 5.75a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-8.5Zm2-.5a.5.5 0 0 0-.5.5v2.75h12V5.75a.5.5 0 0 0-.5-.5h-11ZM16 10H4v4.25c0 .276.224.5.5.5h11a.5.5 0 0 0 .5-.5V10Z" clipRule="evenodd" /></svg>;

    case "/inventory/suppliers":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M3.505 2.365A41.369 41.369 0 0 1 9 2c1.863 0 3.697.124 5.495.365 1.247.167 2.255 1.08 2.4 2.268.214 1.763.325 3.57.325 5.407 0 1.838-.11 3.645-.325 5.408-.144 1.187-1.152 2.1-2.4 2.267C13.025 18.124 11.375 18.25 9.5 18.25c-1.875 0-3.525-.126-5-.5-.748-.186-1.374-.657-1.661-1.329a41.7 41.7 0 0 1-.334-5.421c0-1.838.11-3.645.325-5.408.145-1.187 1.153-2.1 2.4-2.267C5.48 3.375 6.719 3.25 8 3.25H7c-.552 0-1 .448-1 1v12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-1.5a.75.75 0 0 0-1.5 0V16H7.5V4.5h4.75v.75a.75.75 0 0 0 1.5 0V4.25a1 1 0 0 0-1-1H9a41 41 0 0 0-5.495.365Z" /><path d="M7.25 7.5a.75.75 0 0 1 .75-.75h4a.75.75 0 0 1 0 1.5H8a.75.75 0 0 1-.75-.75ZM7.25 10a.75.75 0 0 1 .75-.75h4a.75.75 0 0 1 0 1.5H8A.75.75 0 0 1 7.25 10ZM7.25 12.5a.75.75 0 0 1 .75-.75h2a.75.75 0 0 1 0 1.5H8a.75.75 0 0 1-.75-.75Z" /></svg>;

    case "/inventory/purchase-orders":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M6 5v1H4.667a1.75 1.75 0 0 0-1.743 1.598l-.826 9.5A1.75 1.75 0 0 0 3.84 19H16.16a1.75 1.75 0 0 0 1.743-1.902l-.826-9.5A1.75 1.75 0 0 0 15.333 6H14V5a4 4 0 0 0-8 0Zm4-2.5A2.5 2.5 0 0 0 7.5 5v1h5V5A2.5 2.5 0 0 0 10 2.5ZM7.5 10a2.5 2.5 0 0 0 5 0V8.75a.75.75 0 0 1 1.5 0V10a4 4 0 0 1-8 0V8.75a.75.75 0 0 1 1.5 0V10Z" clipRule="evenodd" /></svg>;

    case "/clients":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM14.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.615 16.428a1.224 1.224 0 0 1-.569-1.175 6.002 6.002 0 0 1 11.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 0 1 7 18a9.953 9.953 0 0 1-5.385-1.572ZM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 0 0-1.588-3.755 4.502 4.502 0 0 1 5.874 2.153c.176.463-.039.964-.51 1.16A8.46 8.46 0 0 1 14.5 16Z" /></svg>;

    case "/pos":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M2.5 4A1.5 1.5 0 0 0 1 5.5V6h18v-.5A1.5 1.5 0 0 0 17.5 4h-15ZM19 8.5H1v6A1.5 1.5 0 0 0 2.5 16h15a1.5 1.5 0 0 0 1.5-1.5v-6ZM3 13.25a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75Zm4.75-.75a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5h-3.5Z" clipRule="evenodd" /></svg>;

    case "/documents/job-cards":
    case "/documents/quotations":
    case "/documents/invoices":
    case "/documents/receipts":
    case "/documents/delivery-notes":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M5.25 2A2.25 2.25 0 0 0 3 4.25v11.5A2.25 2.25 0 0 0 5.25 18h9.5A2.25 2.25 0 0 0 17 15.75V6.56a2.25 2.25 0 0 0-.659-1.591L14.03 2.66A2.25 2.25 0 0 0 12.44 2H5.25Zm6.5 1.5v2.75c0 .414.336.75.75.75h2.75v8.75a.75.75 0 0 1-.75.75h-9.5a.75.75 0 0 1-.75-.75V4.25a.75.75 0 0 1 .75-.75h6.75Zm-5.5 6.25a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 0 1.5h-6a.75.75 0 0 1-.75-.75Zm0 3a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 0 1.5H7a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" /></svg>;

    case "/reports":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M15.5 2A1.5 1.5 0 0 0 14 3.5v13a1.5 1.5 0 0 0 3 0v-13A1.5 1.5 0 0 0 15.5 2ZM9.5 6A1.5 1.5 0 0 0 8 7.5v9a1.5 1.5 0 0 0 3 0v-9A1.5 1.5 0 0 0 9.5 6ZM3.5 10A1.5 1.5 0 0 0 2 11.5v5a1.5 1.5 0 0 0 3 0v-5A1.5 1.5 0 0 0 3.5 10Z" /></svg>;

    case "/payout-followups":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M10 1.75a.75.75 0 0 1 .75.75v.383a3.978 3.978 0 0 1 1.73.724.75.75 0 1 1-.922 1.182 2.48 2.48 0 0 0-.808-.396V8.5h1a.75.75 0 0 1 0 1.5h-1v4.102c.278-.078.54-.19.778-.334.267-.163.468-.348.601-.54a.75.75 0 1 1 1.232.854 3.45 3.45 0 0 1-1.052.955 4.481 4.481 0 0 1-1.559.586v.377a.75.75 0 0 1-1.5 0v-.36a4.776 4.776 0 0 1-2.045-.874.75.75 0 0 1 .967-1.147c.313.264.683.456 1.078.563V10h-1a.75.75 0 0 1 0-1.5h1V4.386a2.475 2.475 0 0 0-1.267.823.75.75 0 1 1-1.197-.904A3.968 3.968 0 0 1 9.25 2.9V2.5a.75.75 0 0 1 .75-.75Zm-.75 7.25V4.35a2.484 2.484 0 0 0-.915.425 2.5 2.5 0 0 0-.585.613A.984.984 0 0 0 8.53 9h.72Z" clipRule="evenodd" /></svg>;

    case "/technicians/payouts":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10.75 10.818v2.614A3.13 3.13 0 0 0 11.888 13c.482-.315.612-.648.612-.875 0-.227-.13-.56-.612-.875a3.13 3.13 0 0 0-1.138-.432ZM8.33 8.62c.053.055.115.11.184.164.208.16.46.284.736.363V6.603a2.45 2.45 0 0 0-.35.13c-.14.065-.27.143-.386.233-.377.292-.514.627-.514.909 0 .184.058.39.33.576Z" /><path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-6a.75.75 0 0 1 .75.75v.316a3.78 3.78 0 0 1 1.653.713c.426.33.744.74.925 1.2a.75.75 0 0 1-1.395.55 1.35 1.35 0 0 0-.428-.507 2.276 2.276 0 0 0-.755-.36V8.5c.558.157 1.072.443 1.482.8.542.47.87 1.096.87 1.7 0 .604-.328 1.23-.87 1.7a4.841 4.841 0 0 1-1.482.8V14a.75.75 0 0 1-1.5 0v-.311a4.5 4.5 0 0 1-1.681-.845.75.75 0 1 1 .914-1.198c.382.29.813.487 1.267.551V9.5a3.702 3.702 0 0 1-1.29-.645 2.193 2.193 0 0 1-.798-1.678c0-.845.467-1.58 1.129-2.066A3.947 3.947 0 0 1 9.25 4.81V4.75A.75.75 0 0 1 10 4Z" clipRule="evenodd" /></svg>;

    default:
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-5.5-2.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM10 12a5.99 5.99 0 0 0-4.793 2.39A6.483 6.483 0 0 0 10 16.5a6.483 6.483 0 0 0 4.793-2.11A5.99 5.99 0 0 0 10 12Z" clipRule="evenodd" /></svg>;
  }
}

// ── group icon chips ──────────────────────────────────────────────────────────

function groupIcon(group: NavGroup) {
  switch (group) {
    case "overview":
      return <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><circle cx="6" cy="6" r="2.5" /></svg>;
    case "repairs":
      return <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M9.5 2a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 .5-.5ZM6 4a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-1 0v-5A.5.5 0 0 1 6 4Zm-3.5 2a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0v-3a.5.5 0 0 1 .5-.5Z" /></svg>;
    case "inventory":
      return <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><rect x="1" y="4" width="10" height="7" rx="1" /><rect x="3" y="2" width="6" height="3" rx="0.5" /></svg>;
    case "clients":
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
}: {
  role: Role;
  permissions?: string[];
  isPlatformAdmin?: boolean;
  badges?: {
    jobs?: number;
    receivedJobs?: number;
    inventory?: number;
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
  const groupedNav = groupedNavForRole(role, permissions);

  return (
    <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:flex-col bg-[var(--sidebar-bg)] border-r border-[var(--line)]">

      {/* ── Brand ── */}
      <Link
        href="/"
        className="flex items-center gap-3 px-5 py-5 border-b border-[var(--line)] hover:bg-[var(--panel)] transition-colors"
      >
        <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-sm">
          <Image
            src="/eagle-info-logo.png"
            alt="Logo"
            width={36}
            height={36}
            className="h-9 w-9 object-cover"
            priority
          />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-bold tracking-tight text-[var(--ink)] leading-none">Repair</p>
          <p className="text-[10px] font-semibold text-[var(--accent)] tracking-wide mt-0.5">Manager</p>
        </div>
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
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/50">
                {section.label}
              </p>
              <div className="ml-1 h-px flex-1 bg-[var(--line)]/60" />
            </div>

            {/* Items */}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = activeHref === item.href;
                const badge =
                  item.href === "/jobs"             ? badges?.jobs
                  : item.href === "/inventory"      ? badges?.inventory
                  : item.href === "/payout-followups" ? badges?.paymentFollowups
                  : item.href === "/intake"         ? badges?.pendingRequests
                  : item.href === "/complaints"     ? badges?.complaints
                  : undefined;
                const newBadge = item.href === "/jobs" ? badges?.receivedJobs : undefined;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 focus-visible:ring-offset-1 ${
                      active
                        ? "bg-[var(--accent-muted)] text-[var(--ink)]"
                        : "text-[var(--ink-muted)] hover:bg-[var(--panel-strong)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {/* Left accent bar */}
                    <span
                      className={`flex h-4 w-0.5 shrink-0 rounded-full transition-all ${
                        active ? "bg-[var(--accent)]" : "bg-transparent group-hover:bg-[var(--line)]"
                      }`}
                    />
                    {/* Icon */}
                    <span
                      className={`flex h-[1.375rem] w-[1.375rem] shrink-0 items-center justify-center rounded-md transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5 ${
                        active
                          ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                          : "bg-[var(--panel-strong)] text-[var(--ink-muted)] group-hover:bg-[var(--line)] group-hover:text-[var(--ink)]"
                      }`}
                    >
                      {navIcon(item.href)}
                    </span>
                    {/* Label */}
                    <span className="truncate">{item.label}</span>
                    {/* Badges */}
                    <span className="ml-auto flex items-center gap-1">
                      {typeof newBadge === "number" && newBadge > 0 && (
                        <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-bold text-black">
                          {newBadge > 99 ? "99+" : newBadge} new
                        </span>
                      )}
                      {typeof badge === "number" && badge > 0 && (
                        <span className="rounded-full border border-[var(--line)] bg-[var(--panel)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ink-muted)]">
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
          <p className="mb-1 px-2 text-[9px] font-bold uppercase tracking-[0.18em] text-amber-500/70">
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
      <div className="border-t border-[var(--line)] px-5 py-3">
        <p className="text-[10px] font-semibold text-[var(--ink-muted)]/70 tracking-wide">Eagle Info Solutions</p>
        <p className="mt-0.5 text-[9px] text-[var(--ink-muted)]/45 tracking-wide">Repair Manager</p>
      </div>
    </aside>
  );
}
