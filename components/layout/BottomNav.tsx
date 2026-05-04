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

/* ── icons ── */
const homeIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/>
  </svg>
);
const jobsIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 14v6"/><path d="M15 14v6"/><path d="M9 18h6"/>
  </svg>
);
const boardIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 7v7"/><path d="M12 7v4"/><path d="M16 7v9"/>
  </svg>
);
const profileIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>
  </svg>
);
const moreIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
  </svg>
);
const intakeIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);
const clientsIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const reportsIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
  </svg>
);
const usersIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>
  </svg>
);
const brandingIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
  </svg>
);
const payoutsIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
  </svg>
);
const inventoryIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7h18v13H3z"/><path d="M3 7l3-4h12l3 4"/><path d="M9 12h6"/>
  </svg>
);
const messagesIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);
const notificationsIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5"/>
    <path d="M9 17a3 3 0 0 0 6 0"/>
  </svg>
);
const invoiceIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <path d="M14 2v6h6"/>
    <path d="M8 13h8"/>
    <path d="M8 17h5"/>
  </svg>
);

/* ── named items ── */
const ITEMS = {
  dashboard:   { href: "/dashboard",            label: "Home",      icon: homeIcon },
  jobs:        { href: "/jobs",                  label: "Queue",     icon: jobsIcon },
  board:       { href: "/technicians",           label: "Board",     icon: boardIcon },
  intake:      { href: "/intake",                label: "Requests",  icon: intakeIcon },
  clients:     { href: "/clients",               label: "Clients",   icon: clientsIcon },
  reports:     { href: "/reports",               label: "Reports",   icon: reportsIcon },
  inventory:   { href: "/inventory",             label: "Inventory", icon: inventoryIcon },
  payoutFollowups: { href: "/payout-followups",  label: "Payment Follow-up", icon: payoutsIcon },
  payouts:     { href: "/technicians/payouts",   label: "Payouts",   icon: payoutsIcon },
  users:       { href: "/settings/users",        label: "Users",     icon: usersIcon },
  branding:    { href: "/settings/branding",     label: "Branding",  icon: brandingIcon },
  commsTemplates: { href: "/settings/notifications/templates", label: "Comms", icon: messagesIcon },
  notifications: { href: "/settings/notifications", label: "Notifications", icon: notificationsIcon },
  profile:     { href: "/settings/profile",      label: "Profile",   icon: profileIcon },
  jobCards:    { href: "/documents/job-cards",   label: "Intake Inv", icon: invoiceIcon },
  quotations:  { href: "/documents/quotations",  label: "Quotes",    icon: invoiceIcon },
  invoiceDocs: { href: "/documents/invoices",    label: "Invoices",  icon: invoiceIcon },
} satisfies Record<string, NavItem>;

/* ── role-based nav config ── */
function getPrimaryItems(role: Role, permissions: string[]): NavItem[] {
  const permUser = { role, permissions };

  if (role === "TECHNICIAN_EXTERNAL" || !can.viewIntake(permUser)) {
    return [ITEMS.dashboard, ITEMS.jobs, ITEMS.board];
  }
  return [ITEMS.dashboard, ITEMS.intake, ITEMS.jobs];
}

function getMoreGroups(role: Role, permissions: string[]): NavGroup[] {
  const permUser = { role, permissions };
  const allow = (href: string) => {
    if (href === ITEMS.clients.href) return can.viewClientInfo(permUser);
    if (href === ITEMS.reports.href) return can.viewAccountsSummary(permUser);
    if (href === ITEMS.invoiceDocs.href) return can.viewFinancials(permUser);
    if (href === ITEMS.quotations.href) return can.viewFinancials(permUser) || role === "TECHNICIAN_INTERNAL";
    if (href === ITEMS.jobCards.href) return can.generateJobCards(permUser);
    if (href === ITEMS.payoutFollowups.href) return can.reviewExternalBills(permUser) || can.approveInvoices(permUser);
    if (href === ITEMS.users.href || href === ITEMS.branding.href) return role === "ADMIN";
    if (href === ITEMS.inventory.href) return ["ADMIN", "OPS", "TECHNICIAN_INTERNAL"].includes(role);
    if (href === ITEMS.board.href) return role !== "TECHNICIAN_EXTERNAL";
    if (href === ITEMS.commsTemplates.href) return ["ADMIN", "OPS"].includes(role);
    if (href === ITEMS.notifications.href) return can.viewNotifications(permUser);
    return true;
  };

  const groups: NavGroup[] = [
    {
      title: "Documents",
      items: [ITEMS.jobCards, ITEMS.quotations, ITEMS.invoiceDocs],
    },
    {
      title: "Operations",
      items: [ITEMS.clients, ITEMS.inventory, ITEMS.payoutFollowups, ITEMS.board],
    },
    {
      title: "Management",
      items: [ITEMS.users, ITEMS.reports, ITEMS.branding, ITEMS.notifications],
    },
    {
      title: "Communication",
      items: [ITEMS.commsTemplates],
    },
  ];

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => allow(item.href)),
    }))
    .filter((group) => group.items.length > 0);
}

export function BottomNav({
  role,
  permissions = [],
  badges,
}: {
  role: Role;
  permissions: string[];
  badges?: {
    jobs?: number;
    receivedJobs?: number;
    inventory?: number;
    paymentFollowups?: number;
    pendingRequests?: number;
  };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const primaryItems = getPrimaryItems(role, permissions);
  const moreGroups   = getMoreGroups(role, permissions);
  const hasExtra     = moreGroups.length > 0;

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  const anyExtraActive = moreGroups.some((group) => group.items.some((item) => isActive(item.href)));

  return (
    <>
      <nav className="mobile-bottom-nav glass fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--panel)]/95 backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-lg items-center justify-around px-1 pt-1 pb-[max(env(safe-area-inset-bottom),0.375rem)]">
          {primaryItems.map((item) => {
            const active = isActive(item.href);
            const jobsCount =
              item.href === "/jobs"
                ? (badges?.receivedJobs ?? badges?.jobs)
                : item.href === "/intake"
                  ? badges?.pendingRequests
                  : undefined;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1 text-[10px] font-semibold transition-colors ${
                  active ? "text-[var(--accent)]" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                }`}
              >
                <span className={`relative flex items-center justify-center rounded-xl px-4 py-1 transition-all duration-200 ${
                  active
                    ? "bg-[var(--accent)]/12 shadow-[0_1px_3px_rgba(212,175,55,0.15)]"
                    : "bg-transparent"
                }`}>
                  {item.icon}
                  {typeof jobsCount === "number" && jobsCount > 0 ? (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[9px] font-bold leading-none text-black">
                      {jobsCount > 99 ? "99+" : jobsCount}
                    </span>
                  ) : null}
                </span>
                <span className={`tracking-wide ${active ? "font-bold" : ""}`}>{item.label}</span>
              </Link>
            );
          })}

          {hasExtra && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1 text-[10px] font-semibold transition-colors ${
                anyExtraActive ? "text-[var(--accent)]" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              <span className={`flex items-center justify-center rounded-xl px-4 py-1 transition-all duration-200 ${
                anyExtraActive
                  ? "bg-[var(--accent)]/12 shadow-[0_1px_3px_rgba(212,175,55,0.15)]"
                  : "bg-transparent"
              }`}>
                {moreIcon}
              </span>
              <span className={`tracking-wide ${anyExtraActive ? "font-bold" : ""}`}>More</span>
            </button>
          )}

          {(() => {
            const active = isActive(ITEMS.profile.href);
            return (
              <Link
                href={ITEMS.profile.href}
                onClick={() => setOpen(false)}
                className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1 text-[10px] font-semibold transition-colors ${
                  active ? "text-[var(--accent)]" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                }`}
              >
                <span className={`flex items-center justify-center rounded-xl px-4 py-1 transition-all duration-200 ${
                  active
                    ? "bg-[var(--accent)]/12 shadow-[0_1px_3px_rgba(212,175,55,0.15)]"
                    : "bg-transparent"
                }`}>
                  {ITEMS.profile.icon}
                </span>
                <span className={`tracking-wide ${active ? "font-bold" : ""}`}>{ITEMS.profile.label}</span>
              </Link>
            );
          })()}
        </div>
      </nav>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-16 z-50 mx-auto max-h-[76vh] max-w-sm overflow-hidden rounded-t-2xl border border-[var(--line)] bg-[var(--panel)] shadow-[0_-8px_40px_rgba(0,0,0,0.14)] lg:hidden">
            {/* Drag handle */}
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-[var(--line)]" />

            <div className="flex items-center justify-between px-4 pb-2 pt-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">More</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-[var(--line)] bg-[var(--panel-strong)] p-1.5 text-[var(--ink-muted)] transition hover:bg-[var(--line)]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                </svg>
              </button>
            </div>

            <div className="max-h-[calc(76vh-64px)] space-y-4 overflow-y-auto px-4 pb-6">
              {moreGroups.map((group) => (
                <div key={group.title}>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">{group.title}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {group.items.map((item) => {
                      const active = isActive(item.href);
                      const moreBadge =
                        item.href === "/inventory"
                          ? badges?.inventory
                          : item.href === "/payout-followups"
                            ? badges?.paymentFollowups
                            : undefined;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className={`flex items-center gap-2.5 rounded-xl border px-3 py-3 text-[12px] font-semibold transition-all ${
                            active
                              ? "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[#9A7A00] shadow-[0_1px_4px_rgba(212,175,55,0.12)]"
                              : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink)] hover:border-[var(--accent)]/25 hover:bg-[var(--panel-strong)] active:scale-[0.97]"
                          }`}
                        >
                          <span className={`shrink-0 ${active ? "text-[var(--accent)]" : "text-[var(--ink-muted)]"}`}>{item.icon}</span>
                          <span className="truncate">{item.label}</span>
                          {typeof moreBadge === "number" && moreBadge > 0 ? (
                            <span className="ml-auto rounded-full border border-[var(--line)] bg-[var(--panel)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ink-muted)]">
                              {moreBadge > 99 ? "99+" : moreBadge}
                            </span>
                          ) : null}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}

              <button
                type="button"
                disabled={isSigningOut}
                onClick={async () => {
                  setIsSigningOut(true);
                  const result = await authClient.signOut();
                  if (result.error) {
                    toast.error(result.error.message || "Sign out failed");
                    setIsSigningOut(false);
                    return;
                  }
                  setOpen(false);
                  router.push("/login");
                  router.refresh();
                }}
                className="flex w-full items-center gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-3 text-[12px] font-semibold text-[var(--ink-muted)] transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 active:scale-[0.98]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
