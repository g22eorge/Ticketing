"use client";

import Link from "next/link";
import { Role } from "@prisma/client";
import { usePathname } from "next/navigation";

type NavGroup = "dashboard" | "tickets" | "clients" | "documents" | "settings";

// ── nav items — only Tickets, Clients, Documents ────────────────────────────

const nav = [
  // Dashboard
  { href: "/dashboard", label: "Dashboard", group: "dashboard" as NavGroup, roles: "all" as const },
  // Tickets
  { href: "/tickets", label: "Tickets", group: "tickets" as NavGroup, roles: "all" as const },
  // Clients
  { href: "/clients", label: "Clients", group: "clients" as NavGroup, roles: "all" as const },
  // Documents
  { href: "/documents/quotations", label: "Quotations", group: "documents" as NavGroup, roles: "all" as const },
  { href: "/documents/invoices",   label: "Invoices",   group: "documents" as NavGroup, roles: "all" as const },
  { href: "/documents/receipts",    label: "Receipts",   group: "documents" as NavGroup, roles: "all" as const },
  // Settings
  { href: "/settings", label: "Settings", group: "settings" as NavGroup, roles: "all" as const },
] as const;

// ── group labels ──────────────────────────────────────────────────────────────

const groupLabel: Record<NavGroup, string> = {
  dashboard: "Dashboard",
  tickets:  "Tickets",
  clients:  "Clients",
  documents: "Documents",
  settings: "Settings",
};

// ── role-based ordering ───────────────────────────────────────────────────────

const roleOrder: Partial<Record<Role, readonly string[]>> = {
  ADMIN:       ["/dashboard", "/tickets", "/clients", "/documents/quotations", "/documents/invoices", "/documents/receipts", "/settings"],
  MANAGER:     ["/dashboard", "/tickets", "/clients", "/documents/quotations", "/documents/invoices", "/documents/receipts", "/settings"],
  OPS:         ["/dashboard", "/tickets", "/clients", "/documents/quotations", "/documents/invoices", "/documents/receipts", "/settings"],
  FINANCE:     ["/dashboard", "/tickets", "/clients", "/documents/quotations", "/documents/invoices", "/documents/receipts", "/settings"],
  SALES:       ["/dashboard", "/tickets", "/clients", "/documents/quotations", "/documents/receipts", "/settings"],
  FRONT_DESK:  ["/dashboard", "/tickets", "/clients", "/documents/quotations", "/documents/receipts", "/settings"],
  TECHNICIAN_INTERNAL: ["/dashboard", "/tickets", "/clients", "/documents/quotations", "/documents/invoices", "/settings"],
  TECHNICIAN_EXTERNAL: ["/dashboard", "/tickets", "/documents/quotations", "/settings"],
  TECH_MANAGER: ["/dashboard", "/tickets", "/clients", "/documents/quotations", "/documents/invoices", "/settings"],
  INTAKE:       ["/dashboard", "/tickets", "/clients", "/settings"],
  SALES_MANAGER: ["/dashboard", "/tickets", "/clients", "/documents/quotations", "/documents/invoices", "/documents/receipts", "/settings"],
  SALES_CORPORATE: ["/dashboard", "/tickets", "/clients", "/documents/quotations", "/documents/invoices", "/settings"],
  SALES_RETAIL: ["/dashboard", "/tickets", "/clients", "/documents/quotations", "/documents/receipts", "/settings"],
  SALES_POS:    ["/dashboard", "/tickets", "/settings"],
  TECH_FIELD:   ["/dashboard", "/tickets", "/settings"],
};

const roleGroupOrder: Partial<Record<Role, readonly NavGroup[]>> = {
  ADMIN:       ["dashboard", "tickets", "clients", "documents", "settings"],
  MANAGER:     ["dashboard", "tickets", "clients", "documents", "settings"],
  OPS:         ["dashboard", "tickets", "clients", "documents", "settings"],
  FINANCE:     ["dashboard", "tickets", "clients", "documents", "settings"],
  SALES:       ["dashboard", "tickets", "clients", "documents", "settings"],
  FRONT_DESK:  ["dashboard", "tickets", "clients", "documents", "settings"],
  TECHNICIAN_INTERNAL: ["dashboard", "tickets", "clients", "documents", "settings"],
  TECHNICIAN_EXTERNAL: ["dashboard", "tickets", "documents", "settings"],
  TECH_MANAGER: ["dashboard", "tickets", "clients", "documents", "settings"],
  INTAKE:       ["dashboard", "tickets", "clients", "settings"],
  SALES_MANAGER: ["dashboard", "tickets", "clients", "documents", "settings"],
  SALES_CORPORATE: ["dashboard", "tickets", "clients", "documents", "settings"],
  SALES_RETAIL: ["dashboard", "tickets", "clients", "documents", "settings"],
  SALES_POS:    ["dashboard", "tickets", "settings"],
  TECH_FIELD:   ["dashboard", "tickets", "settings"],
};

// ── helpers ───────────────────────────────────────────────────────────────────

function isVisible(role: Role, rule: "all" | readonly string[]) {
  return rule === "all" ? true : (rule as readonly string[]).includes(role);
}

function orderedNavForRole(role: Role, _permissions: string[]) {
  const visible = nav.filter((item) => isVisible(role, item.roles === "all" ? "all" : item.roles));

  const ordered = roleOrder[role] ?? visible.map((item) => item.href);
  const ranking = new Map(ordered.map((href, index) => [href, index]));
  return [...visible].sort((a, b) => (ranking.get(a.href) ?? 99) - (ranking.get(b.href) ?? 99));
}

function groupedNavForRole(role: Role, permissions: string[]) {
  const ordered = orderedNavForRole(role, permissions);
  const canonicalOrder: NavGroup[] = ["dashboard", "tickets", "clients", "documents", "settings"];
  const baseGroups: readonly NavGroup[] = roleGroupOrder[role] ?? ["dashboard", "tickets"];
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
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10.707 2.293a1 1 0 0 0-1.414 0l-7 7A1 1 0 0 0 3 11h1v5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-5h1a1 1 0 0 0 .707-1.707l-7-7Z" /></svg>;

    case "/tickets":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M6 2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7.414A2 2 0 0 0 15.414 6L12 2.586A2 2 0 0 0 10.586 2H6Zm2 5a1 1 0 0 0 0 2h4a1 1 0 1 0 0-2H8Z" clipRule="evenodd" /></svg>;

    case "/clients":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM14.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.615 16.428a1.224 1.224 0 0 1-.569-1.175 6.002 6.002 0 0 1 11.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 0 1 7 18a9.953 9.953 0 0 1-5.385-1.572ZM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 0 0-1.588-3.755 4.502 4.502 0 0 1 5.874 2.153c.176.463-.039.964-.51 1.16A8.46 8.46 0 0 1 14.5 16Z" /></svg>;

    case "/documents/quotations":
    case "/documents/invoices":
    case "/documents/receipts":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M5.25 2A2.25 2.25 0 0 0 3 4.25v11.5A2.25 2.25 0 0 0 5.25 18h9.5A2.25 2.25 0 0 0 17 15.75V6.56a2.25 2.25 0 0 0-.659-1.591L14.03 2.66A2.25 2.25 0 0 0 12.44 2H5.25Zm6.5 1.5v2.75c0 .414.336.75.75.75h2.75v8.75a.75.75 0 0 1-.75.75h-9.5a.75.75 0 0 1-.75-.75V4.25a.75.75 0 0 1 .75-.75h6.75Zm-5.5 6.25a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 0 1.5H7a.75.75 0 0 1-.75-.75Zm0 3a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 0 1.5h-3.5a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" /></svg>;

    case "/settings":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.993 6.993 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" /></svg>;

    // Hub pages — grid/squares icon
    case "/documents":
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M4.25 4A2.25 2.25 0 0 0 2 6.25v8.75A2 2 0 0 0 8 12.75V4H4.25Z" clipRule="evenodd" /></svg>;

    default:
      return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-5.5-2.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM10 12a5.99 5.99 0 0 0-4.793 2.39A6.483 6.483 0 0 0 10 16.5a6.483 6.483 0 0 0 4.793-2.11A5.99 5.99 0 0 0 10 12Z" clipRule="evenodd" /></svg>;
  }
}

// ── group icons ────────────────────────────────────────────────────────────

function groupIcon(group: NavGroup) {
  switch (group) {
    case "tickets":
      return <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M9.5 2a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 .5-.5ZM6 4a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-1 0v-5A.5.5 0 0 1 6 4Zm-3.5 2a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0v-3a.5.5 0 0 1 .5-.5Z" /></svg>;
    case "dashboard":
      return <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M6.53 1.47a.75.75 0 0 0-1.06 0l-4 4A.75.75 0 0 0 2 6.75h.5v3A1.25 1.25 0 0 0 3.75 11h4.5A1.25 1.25 0 0 0 9.5 9.75v-3h.5a.75.75 0 0 0 .53-1.28l-4-4Z" /></svg>;
    case "clients":
      return <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><circle cx="4.5" cy="3.5" r="1.5" /><path d="M1 9.5a3.5 3.5 0 0 1 7 0" /><circle cx="9" cy="4" r="1.25" /><path d="M7 9.5a2.5 2.5 0 0 1 4.5 0" /></svg>;
    case "documents":
      return <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M2.5 1A1.5 1.5 0 0 0 1 2.5v7A1.5 1.5 0 0 0 2.5 11h7A1.5 1.5 0 0 0 11 9.5v-5L7 1H2.5ZM7 1.5V4h2.5L7 1.5ZM3.5 6a.5.5 0 0 0 0 1h5a.5.5 0 0 0 0-1h-5Zm0 2a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1h-3Z" clipRule="evenodd" /></svg>;
    case "settings":
      return <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M6 1.5a1 1 0 0 1 .98.8l.1.49c.22.08.43.17.63.29l.42-.27a1 1 0 0 1 1.25.14l.67.67a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H5a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 4.05a1 1 0 0 1 .206-1.25l1.18-2.044a1 1 0 0 1 1.187-.447l1.598.54A6.993 6.993 0 0 1 7.51 3.456l.33-1.652ZM6 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" clipRule="evenodd" /></svg>;
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export function AppSidebar({
  role,
  permissions = [],
  isPlatformAdmin = false,
  orgName,
}: {
  role: Role;
  permissions?: string[];
  isPlatformAdmin?: boolean;
  orgName?: string | null;
}) {
  const pathname = usePathname();
  const groupedNav = groupedNavForRole(role, permissions);

  return (
    <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:flex-col bg-[var(--sidebar-bg)] border-r border-[var(--line)]">

      {/* ── Brand ── */}
      <Link
        href="/dashboard"
        className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-4 transition-opacity hover:opacity-80"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)] text-sm font-black text-black">
          OS
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold text-[var(--ink)]">Business OS</span>
          <span className="block text-[12px] text-[var(--ink-muted)]">Operations</span>
        </span>
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
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

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
                    <span
                      className={`flex h-4 w-0.5 shrink-0 rounded-full transition-all ${
                        active ? "bg-[var(--accent)]" : "bg-transparent group-hover:bg-[var(--line)]"
                      }`}
                    />
                    <span
                      className={`flex h-[1.375rem] w-[1.375rem] shrink-0 items-center justify-center rounded-md transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5 ${
                        active
                          ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                          : "bg-[var(--panel-strong)] text-[var(--ink-muted)] group-hover:bg-[var(--line)] group-hover:text-[var(--ink)]"
                      }`}
                    >
                      {navIcon(item.href)}
                    </span>
                    <span className="truncate">{item.label}</span>
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
        <p className="truncate text-[13px] font-semibold text-[var(--ink)]" title={orgName ?? "Workspace"}>Workspace</p>
        <p className="mt-0.5 text-[12px] font-medium tracking-[0.08em] text-[var(--accent)]" aria-hidden="true">Service Desk</p>
      </div>
    </aside>
  );
}
