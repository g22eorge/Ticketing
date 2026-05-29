"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { can } from "@/lib/permissions";
import { authClient } from "@/lib/auth-client";
import type { Role } from "@prisma/client";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

/* ────────────────────────────── icons ──────────────────────────────────── */

function Icon({ d, size = 22, children }: { d: string | string[]; size?: number; children?: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {(Array.isArray(d) ? d : d ? [d] : []).map((path, i) => <path key={i} d={path} />)}
      {children}
    </svg>
  );
}

const homeIcon      = <Icon d={["m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z","M9 22V12h6v10"]} />;
const intakeIcon    = <Icon d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />;
const jobsIcon      = <Icon d={["M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2","M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2","M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2","M9 14l2 2 4-4"]} />;
const boardIcon     = <Icon d={["M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2","M23 21v-2a4 4 0 0 0-3-3.87","M16 3.13a4 4 0 0 1 0 7.75"]}><circle cx="9" cy="7" r="4" /></Icon>;
const moreIcon      = <Icon d="" size={22}><circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none"/></Icon>;
const clientsIcon   = <Icon d={["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2","M22 21v-2a4 4 0 0 0-3-3.87","M16 3.13a4 4 0 0 1 0 7.75"]}><circle cx="9" cy="7" r="4" /></Icon>;
const reportsIcon   = <Icon d={["M3 3v18h18","m19 9-5 5-4-4-3 3"]} />;
const inventoryIcon = <Icon d={["M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z","M3.27 6.96 12 12.01l8.73-5.05","M12 22.08V12"]} />;
const posIcon         = <Icon d={["M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z","M3 6h18","M16 10a4 4 0 0 1-8 0"]} />;
const payoutsIcon     = <Icon d={["M12 2v20","M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"]} />;
const jobCardIcon     = <Icon d={["M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2","M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2","M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2","M9 14l2 2 4-4"]} />;
const quoteIcon       = <Icon d={["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z","M14 2v6h6","M10 13h4","M8 17h8","M8 9h2"]} />;
const invoiceIcon     = <Icon d={["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z","M14 2v6h6","M16 13H8","M16 17H8","M10 9H8"]}  />;
const receiptIcon     = <Icon d={["M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z","M9 12h6","M9 16h6","M9 8h2"]} />;
const deliveryIcon    = <Icon d={["M1 3h15v13H1z","M16 8h4l3 3v5h-7V8z","M5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z","M18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"]} />;
const creditNoteIcon  = <Icon d={["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z","M14 2v6h6","M9 15l2-2 2 2","M13 13l-2 2-2-2","M12 11v4"]} />;
const refundIcon      = <Icon d={["M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8","M3 3v5h5","M12 7v5l4 2"]} />;
const expensesIcon    = <Icon d={["M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-8 2a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z"]} />;
const fieldIcon       = <Icon d={["M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"]}><circle cx="12" cy="10" r="3" /></Icon>;
const complaintsIcon  = <Icon d={["M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z","M12 9v4","M12 17h.01"]} />;
const salesIcon       = <Icon d={["M22 12h-4l-3 9L9 3l-3 9H2"]} />;
const aiIcon          = <Icon d={["M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 0 2h-1v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1H1a1 1 0 0 1 0-2h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z","M7.5 13.5c.83 0 1.5-.67 1.5-1.5S8.33 10.5 7.5 10.5 6 11.17 6 12s.67 1.5 1.5 1.5z","M16.5 13.5c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5S15 11.17 15 12s.67 1.5 1.5 1.5z"]} />;
const financeNavIcon  = <Icon d={["M12 2v20","M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"]} />;
const activityNavIcon = <Icon d={["M22 12h-4l-3 9L9 3l-3 9H2"]} />;
const targetsIcon     = <Icon d="" size={22}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></Icon>;
const recurringIcon   = <Icon d={["M17 1l4 4-4 4","M3 11V9a4 4 0 0 1 4-4h14","M7 23l-4-4 4-4","M21 13v2a4 4 0 0 1-4 4H3"]} />;
const taxIcon         = <Icon d={["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z","M14 2v6h6","M9 13l6 0","M9 9h1","M9 17h1","M14 9h1","M14 17h1"]} />;
const shiftsIcon      = <Icon d={["M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z","M12 6v6l4 2"]} />;

/* ─────────────────────────── named items ──────────────────────────────── */
const ITEMS = {
  dashboard:      { href: "/dashboard",                 label: "Home",         icon: homeIcon      },
  jobs:           { href: "/jobs",                      label: "Queue",        icon: jobsIcon      },
  board:          { href: "/technicians",               label: "Techs",        icon: boardIcon     },
  intake:         { href: "/intake",                    label: "Intake",       icon: intakeIcon    },
  clients:        { href: "/clients",                   label: "Clients",      icon: clientsIcon   },
  reports:        { href: "/reports",                   label: "Reports",      icon: reportsIcon   },
  aiInsights:     { href: "/ai-insights",               label: "AI Insights",  icon: aiIcon        },
  pos:            { href: "/pos",                       label: "POS",          icon: posIcon       },
  inventory:      { href: "/inventory",                 label: "Inventory",    icon: inventoryIcon },
  payoutFollowups:{ href: "/payout-followups",          label: "Payments",     icon: payoutsIcon   },
  payouts:        { href: "/technicians/payouts",       label: "Payouts",      icon: payoutsIcon   },
  jobCards:       { href: "/documents/job-cards",       label: "Job Cards",    icon: jobCardIcon   },
  quotations:     { href: "/documents/quotations",      label: "Quotes",       icon: quoteIcon     },
  invoiceDocs:    { href: "/documents/invoices",        label: "Invoices",     icon: invoiceIcon   },
  receipts:       { href: "/documents/receipts",        label: "Receipts",     icon: receiptIcon   },
  deliveryNotes:  { href: "/documents/delivery-notes",  label: "Delivery",     icon: deliveryIcon  },
  creditNotes:    { href: "/documents/credit-notes",    label: "Credit Notes", icon: creditNoteIcon},
  refunds:        { href: "/documents/refunds",         label: "Refunds",      icon: refundIcon    },
  cashierShifts:  { href: "/pos/shifts",                label: "Shifts",       icon: shiftsIcon    },
  expenses:       { href: "/finance/expenses",          label: "Expenses",     icon: expensesIcon  },
  taxRates:       { href: "/finance/tax-rates",         label: "Tax Rates",    icon: taxIcon       },
  recurring:      { href: "/finance/recurring",         label: "Recurring",    icon: recurringIcon },
  sales:          { href: "/sales",                     label: "Sales",        icon: salesIcon     },
  field:          { href: "/field",                     label: "Field",        icon: fieldIcon     },
  complaints:     { href: "/complaints",                label: "Complaints",   icon: complaintsIcon},
  targets:        { href: "/targets",                   label: "Targets",      icon: targetsIcon   },
  finance:        { href: "/finance",                   label: "Finance",      icon: financeNavIcon  },
  activity:       { href: "/reports",                   label: "Activity",     icon: activityNavIcon },
} satisfies Record<string, NavItem>;

/* ───────────────────────── module guard ──────────────────────────────── */
const hrefModule: Record<string, string> = {
  "/jobs": "JOBS", "/intake": "JOBS", "/technicians": "JOBS",
  "/clients": "JOBS", "/payout-followups": "JOBS",
  "/finance": "INVOICING",
  "/complaints": "COMPLAINTS", "/field": "FIELD",
  "/inventory": "INVENTORY", "/pos": "POS",
  "/documents/job-cards": "INVOICING", "/documents/quotations": "INVOICING",
  "/documents/invoices": "INVOICING", "/documents/receipts": "INVOICING",
  "/documents/delivery-notes": "INVOICING", "/documents/credit-notes": "INVOICING",
  "/documents/refunds": "INVOICING", "/pos/shifts": "POS",
  "/reports": "REPORTS", "/ai-insights": "REPORTS",
  "/sales": "SALES", "/targets": "TARGETS",
};

/* ─────────────────── role-based nav config ─────────────────────────── */
function getPrimaryItems(role: Role, permissions: string[], mods?: Set<string>): NavItem[] {
  const perm = { role, permissions };
  const ok   = (href: string) => !mods || !hrefModule[href] || mods.has(hrefModule[href]);
  if (role === "TECHNICIAN_EXTERNAL" || !can.viewIntake(perm)) {
    return [ITEMS.dashboard, ITEMS.jobs, ITEMS.board].filter((i) => ok(i.href));
  }
  // ADMIN / OPS / MANAGER get a 4-tab premium bar: Home | Repairs | Finance | Activity
  if (["ADMIN", "OPS", "MANAGER"].includes(role)) {
    return [ITEMS.dashboard, ITEMS.jobs, ITEMS.finance, ITEMS.activity].filter((i) => ok(i.href));
  }
  return [ITEMS.dashboard, ITEMS.intake, ITEMS.jobs].filter((i) => ok(i.href));
}

function getMoreGroups(role: Role, permissions: string[], mods?: Set<string>): NavGroup[] {
  const perm = { role, permissions };
  const modOk = (href: string) => !mods || !hrefModule[href] || mods.has(hrefModule[href]);

  // Roles for which "board" is already a PRIMARY nav item — don't duplicate in More.
  const boardInPrimary = role === "TECHNICIAN_EXTERNAL" || !can.viewIntake(perm);

  const allow = (href: string): boolean => {
    if (!modOk(href)) return false;
    switch (href) {
      case ITEMS.clients.href:        return can.viewClientInfo(perm);
      case ITEMS.reports.href:        return can.viewAccountsSummary(perm);
      case ITEMS.aiInsights.href:     return can.viewAccountsSummary(perm);
      // Shifts page guard: ADMIN, OPS, FRONT_DESK only
      case ITEMS.pos.href:            return ["ADMIN","OPS","FRONT_DESK","MANAGER"].includes(role);
      case ITEMS.cashierShifts.href:  return ["ADMIN","OPS","FRONT_DESK"].includes(role);
      case ITEMS.invoiceDocs.href:
      case ITEMS.receipts.href:
      case ITEMS.creditNotes.href:
      case ITEMS.refunds.href:
      case ITEMS.expenses.href:
      case ITEMS.recurring.href:      return can.viewFinancials(perm);
      case ITEMS.quotations.href:     return can.viewFinancials(perm) || role === "TECHNICIAN_INTERNAL";
      case ITEMS.jobCards.href:       return can.generateJobCards(perm);
      case ITEMS.deliveryNotes.href:  return can.viewFinancials(perm) || ["OPS","FRONT_DESK","ADMIN"].includes(role);
      case ITEMS.taxRates.href:       return ["ADMIN","MANAGER"].includes(role);
      case ITEMS.payoutFollowups.href:return can.reviewExternalBills(perm) || can.approveInvoices(perm);
      // Inventory page guard: ADMIN, MANAGER, TECH_MANAGER, OPS, TECHNICIAN_INTERNAL
      case ITEMS.inventory.href:      return ["ADMIN","OPS","TECHNICIAN_INTERNAL","MANAGER","TECH_MANAGER"].includes(role);
      // Board/Techs: skip if already a primary item for this role (avoids duplicate)
      case ITEMS.board.href:          return !boardInPrimary;
      case ITEMS.sales.href:          return can.createLeads(perm);
      // Field page: accessible to managers AND field techs who can record signoffs
      case ITEMS.field.href:          return can.manageFieldVisits(perm) || can.recordFieldSignoffs(perm);
      // Complaints page guard: ADMIN, MANAGER, TECH_MANAGER, OPS
      case ITEMS.complaints.href:     return modOk("/complaints") && ["ADMIN","MANAGER","TECH_MANAGER","OPS"].includes(role);
      case ITEMS.targets.href:        return can.viewTeamTargets(perm);
      default: return true;
    }
  };

  const groups: NavGroup[] = [
    { title: "Customers",  items: [ITEMS.clients, ITEMS.sales, ITEMS.complaints] },
    { title: "Documents",  items: [ITEMS.jobCards, ITEMS.quotations, ITEMS.invoiceDocs, ITEMS.receipts, ITEMS.deliveryNotes, ITEMS.creditNotes, ITEMS.refunds] },
    { title: "Operations", items: [ITEMS.inventory, ITEMS.field, ITEMS.payoutFollowups, ITEMS.board] },
    { title: "Sales",      items: [ITEMS.pos, ITEMS.cashierShifts, ITEMS.targets] },
    { title: "Finance",    items: [ITEMS.expenses, ITEMS.recurring, ITEMS.taxRates] },
    { title: "Analytics",  items: [ITEMS.reports, ITEMS.aiInsights] },
  ];

  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => allow(i.href)) }))
    .filter((g) => g.items.length > 0);
}

/* ═══════════════════════════ BottomNav ════════════════════════════════ */
export function BottomNav({
  role,
  permissions = [],
  enabledModules,
  badges,
}: {
  role: Role;
  permissions: string[];
  enabledModules?: Set<string>;
  badges?: {
    jobs?: number;
    receivedJobs?: number;
    inventory?: number;
    paymentFollowups?: number;
    pendingRequests?: number;
    complaints?: number;
  };
}) {
  const pathname      = usePathname();
  const router        = useRouter();
  const [open, setOpen]         = useState(false);
  const [isSigningOut, setSO]   = useState(false);

  const primaryItems = getPrimaryItems(role, permissions, enabledModules);
  const moreGroups   = getMoreGroups(role, permissions, enabledModules);
  const hasExtra     = moreGroups.length > 0;

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  const anyExtraActive = moreGroups.some((g) => g.items.some((i) => isActive(i.href)));

  const getBadge = (href: string): number | undefined => {
    if (href === "/jobs")     return badges?.receivedJobs ?? badges?.jobs;
    if (href === "/intake")   return badges?.pendingRequests;
    return undefined;
  };
  const getMoreBadge = (href: string): number | undefined => {
    if (href === "/inventory")       return badges?.inventory;
    if (href === "/payout-followups")return badges?.paymentFollowups;
    if (href === "/complaints")      return badges?.complaints;
    return undefined;
  };

  return (
    <>
      {/* ── The bar ──────────────────────────────────────────────────── */}
      <nav
        aria-label="Primary navigation"
        className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--panel)]/96 backdrop-blur-xl lg:hidden"
      >
        {/* Safe-area padding + content */}
        <div
          className="mx-auto flex max-w-lg items-end justify-around px-1"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 6px)", paddingTop: "6px" }}
        >
          {primaryItems.map((item) => {
            const active = isActive(item.href);
            const badge  = getBadge(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex min-w-0 flex-1 flex-col items-center gap-0.5"
                aria-current={active ? "page" : undefined}
              >
                {/* Icon — no pill background, just color shift */}
                <span className={`relative flex h-9 w-9 items-center justify-center transition-all duration-200 ${
                  active
                    ? "text-[var(--accent)]"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                }`}>
                  {item.icon}
                  {typeof badge === "number" && badge > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[9px] font-black leading-none text-black">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </span>
                {/* Label */}
                <span className={`text-[10px] leading-none tracking-wide ${
                  active
                    ? "font-bold text-[var(--accent)]"
                    : "font-medium text-[var(--ink-muted)]"
                }`}>
                  {item.label}
                </span>
                {/* Active gold underline dot */}
                <span className={`mt-0.5 h-0.5 w-5 rounded-full transition-all duration-200 ${
                  active ? "bg-[var(--accent)]" : "bg-transparent"
                }`} />
              </Link>
            );
          })}

          {/* More button */}
          {hasExtra && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex min-w-0 flex-1 flex-col items-center gap-0.5"
              aria-expanded={open}
              aria-label="More navigation"
            >
              <span className={`flex h-9 w-9 items-center justify-center transition-all duration-200 ${
                anyExtraActive
                  ? "text-[var(--accent)]"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}>
                {moreIcon}
              </span>
              <span className={`text-[10px] leading-none tracking-wide ${
                anyExtraActive ? "font-bold text-[var(--accent)]" : "font-medium text-[var(--ink-muted)]"
              }`}>
                More
              </span>
              <span className={`mt-0.5 h-0.5 w-4 rounded-full transition-all duration-200 ${
                anyExtraActive ? "bg-[var(--accent)]" : "bg-transparent"
              }`} />
            </button>
          )}
        </div>
      </nav>

      {/* ── More drawer ──────────────────────────────────────────────── */}
      {open && (
        <>
          {/* Scrim */}
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] lg:hidden"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* Sheet */}
          <div
            role="dialog"
            aria-label="More options"
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[82vh] max-w-md overflow-hidden rounded-t-3xl border-t border-[var(--line)] bg-[var(--panel)] shadow-[0_-12px_48px_rgba(0,0,0,0.18)] lg:hidden"
          >
            {/* Drag handle */}
            <div className="flex justify-center pb-1 pt-3">
              <span className="h-1 w-9 rounded-full bg-[var(--line)]" />
            </div>

            {/* Sheet header */}
            <div className="flex items-center justify-between px-5 pb-3">
              <p className="text-[13px] font-bold text-[var(--ink)]">Navigation</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] transition hover:bg-[var(--panel-strong)]/80"
                aria-label="Close"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Scrollable content */}
            <div className="max-h-[calc(82vh-80px)] overflow-y-auto px-4 pb-8">
              <div className="space-y-4">
                {moreGroups.map((group) => (
                  <div key={group.title}>
                    {/* Group header */}
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]/70">
                      {group.title}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {group.items.map((item) => {
                        const active = isActive(item.href);
                        const moreBadge = getMoreBadge(item.href);
                        return (
                          <button
                            key={item.href}
                            type="button"
                            aria-current={active ? "page" : undefined}
                            onClick={() => { setOpen(false); router.push(item.href); }}
                            className={`relative flex items-center gap-2.5 rounded-2xl border px-3 py-3 text-[12px] font-semibold transition-all active:scale-[0.97] ${
                              active
                                ? "border-[var(--accent)]/35 bg-[var(--accent)]/10 text-[var(--accent)] shadow-[0_1px_6px_rgba(212,175,55,0.14)]"
                                : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink)] hover:border-[var(--accent)]/20 hover:bg-[var(--panel)]"
                            }`}
                          >
                            <span className={`shrink-0 ${active ? "text-[var(--accent)]" : "text-[var(--ink-muted)]"}`}>
                              {item.icon}
                            </span>
                            <span className="truncate leading-snug">{item.label}</span>
                            {typeof moreBadge === "number" && moreBadge > 0 && (
                              <span className="absolute right-2.5 top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[9px] font-black leading-none text-black">
                                {moreBadge > 99 ? "99+" : moreBadge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Sign out */}
              <button
                type="button"
                disabled={isSigningOut}
                onClick={async () => {
                  setSO(true);
                  const result = await authClient.signOut();
                  if (result.error) {
                    toast.error(result.error.message || "Sign out failed");
                    setSO(false);
                    return;
                  }
                  setOpen(false);
                  router.push("/login");
                  router.refresh();
                }}
                className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 text-[12px] font-semibold text-[var(--ink-muted)] transition hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50 active:scale-[0.98] dark:hover:text-red-400"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>
                </svg>
                {isSigningOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

