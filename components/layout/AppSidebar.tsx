"use client";

import Link from "next/link";
import { Role } from "@prisma/client";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: "home" | "ticket" | "client" | "subscription" | "quote" | "invoice" | "receipt" | "reports" | "settings" | "key";
  roles: "all" | readonly Role[];
};

const NAV: readonly NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "home", roles: "all" },
  { href: "/tickets", label: "Tickets", icon: "ticket", roles: "all" },
  { href: "/clients", label: "Clients", icon: "client", roles: "all" },
  { href: "/subscriptions", label: "Subscriptions", icon: "subscription", roles: "all" },
  { href: "/documents/quotations", label: "Quotations", icon: "quote", roles: "all" },
  { href: "/documents/invoices", label: "Invoices", icon: "invoice", roles: "all" },
  { href: "/documents/receipts", label: "Receipts", icon: "receipt", roles: "all" },
  { href: "/reports-dashboard", label: "Reports", icon: "reports", roles: [Role.ADMIN, Role.MANAGER, Role.OPS, Role.FINANCE] },
  { href: "/settings", label: "Settings", icon: "settings", roles: "all" },
];

const ROLE_ORDER: Partial<Record<Role, readonly string[]>> = {
  ADMIN: ["/dashboard", "/tickets", "/clients", "/subscriptions", "/documents/quotations", "/documents/invoices", "/documents/receipts", "/reports-dashboard", "/settings"],
  MANAGER: ["/dashboard", "/tickets", "/clients", "/subscriptions", "/documents/quotations", "/documents/invoices", "/documents/receipts", "/reports-dashboard", "/settings"],
  OPS: ["/dashboard", "/tickets", "/clients", "/subscriptions", "/documents/quotations", "/documents/invoices", "/documents/receipts", "/reports-dashboard", "/settings"],
  FINANCE: ["/dashboard", "/tickets", "/clients", "/subscriptions", "/documents/quotations", "/documents/invoices", "/documents/receipts", "/reports-dashboard", "/settings"],
  SALES: ["/dashboard", "/tickets", "/clients", "/subscriptions", "/documents/quotations", "/documents/receipts", "/settings"],
  FRONT_DESK: ["/dashboard", "/tickets", "/clients", "/subscriptions", "/documents/quotations", "/documents/receipts", "/settings"],
  TECHNICIAN_INTERNAL: ["/dashboard", "/tickets", "/clients", "/subscriptions", "/documents/quotations", "/documents/invoices", "/settings"],
  TECHNICIAN_EXTERNAL: ["/dashboard", "/tickets", "/documents/quotations", "/settings"],
  TECH_MANAGER: ["/dashboard", "/tickets", "/clients", "/subscriptions", "/documents/quotations", "/documents/invoices", "/settings"],
  INTAKE: ["/dashboard", "/tickets", "/clients", "/subscriptions", "/settings"],
  SALES_MANAGER: ["/dashboard", "/tickets", "/clients", "/subscriptions", "/documents/quotations", "/documents/invoices", "/documents/receipts", "/settings"],
  SALES_CORPORATE: ["/dashboard", "/tickets", "/clients", "/subscriptions", "/documents/quotations", "/documents/invoices", "/settings"],
  SALES_RETAIL: ["/dashboard", "/tickets", "/clients", "/subscriptions", "/documents/quotations", "/documents/receipts", "/settings"],
  SALES_POS: ["/dashboard", "/tickets", "/settings"],
  TECH_FIELD: ["/dashboard", "/tickets", "/settings"],
};

const VISIBILITY: Partial<Record<Role, readonly string[]>> = {
  TECHNICIAN_EXTERNAL: ["/dashboard", "/tickets", "/documents/quotations", "/settings"],
  TECH_FIELD: ["/dashboard", "/tickets", "/settings"],
  SALES_POS: ["/dashboard", "/tickets", "/settings"],
};

function isNavVisible(item: NavItem, role: Role) {
  if (item.roles === "all") {
    const hidden = VISIBILITY[role];
    return !hidden || hidden.includes(item.href);
  }
  return item.roles.includes(role);
}

function orderedNav(role: Role) {
  const order = ROLE_ORDER[role];
  const visible = NAV.filter((item) => isNavVisible(item, role));
  if (!order) return visible;
  const ranking = new Map(order.map((href, i) => [href, i]));
  return [...visible].sort((a, b) => (ranking.get(a.href) ?? 99) - (ranking.get(b.href) ?? 99));
}

function NavIcon({ icon }: { icon: NavItem["icon"] }) {
  switch (icon) {
    case "home":
      return (
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M10.707 2.293a1 1 0 0 0-1.414 0l-7 7A1 1 0 0 0 3 11h1v5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-5h1a1 1 0 0 0 .707-1.707l-7-7Z" />
        </svg>
      );
    case "ticket":
      return (
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M6 2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7.414A2 2 0 0 0 15.414 6L12 2.586A2 2 0 0 0 10.586 2H6Zm2 5a1 1 0 0 0 0 2h4a1 1 0 1 0 0-2H8Z" clipRule="evenodd" />
        </svg>
      );
    case "client":
      return (
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM14.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.615 16.428a1.224 1.224 0 0 1-.569-1.175 6.002 6.002 0 0 1 11.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 0 1 7 18a9.953 9.953 0 0 1-5.385-1.572ZM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 0 0-1.588-3.755 4.502 4.502 0 0 1 5.874 2.153c.176.463-.039.964-.51 1.16A8.46 8.46 0 0 1 14.5 16Z" />
        </svg>
      );
    case "subscription":
      return (
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M6 2a1 1 0 0 1 1 1v1h6V3a1 1 0 1 1 2 0v1h.5A2.5 2.5 0 0 1 18 6.5v8A2.5 2.5 0 0 1 15.5 17h-11A2.5 2.5 0 0 1 2 14.5v-8A2.5 2.5 0 0 1 4.5 4H5V3a1 1 0 0 1 1-1Zm10 7H4v5.5a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5V9ZM7 11a1 1 0 1 0 0 2h2a1 1 0 1 0 0-2H7Z" clipRule="evenodd" />
        </svg>
      );
    case "quote":
      return (
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M4.5 2A2.5 2.5 0 0 0 2 4.5v11A2.5 2.5 0 0 0 4.5 18h11a2.5 2.5 0 0 0 2.5-2.5V7.414a2.5 2.5 0 0 0-.732-1.767l-3.415-3.414A2.5 2.5 0 0 0 12.086 2H4.5ZM6 10.5a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 6 10.5Zm0 3a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 0 1.5h-3.5A.75.75 0 0 1 6 13.5Z" clipRule="evenodd" />
        </svg>
      );
    case "invoice":
      return (
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9.172a1.5 1.5 0 0 1 1.06.44l2.829 2.828a1.5 1.5 0 0 1 .439 1.06V16.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 2.5 16.5v-13Zm4.5 6.75a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5h-5Zm0 3a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z" clipRule="evenodd" />
        </svg>
      );
    case "receipt":
      return (
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 0 0 2 4.25v13.5A2.25 2.25 0 0 0 4.25 20h11.5A2.25 2.25 0 0 0 18 17.75V4.25A2.25 2.25 0 0 0 15.75 2H4.25ZM6 7.75A.75.75 0 0 1 6.75 7h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 6 7.75Zm0 3a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1-.75-.75Zm0 3a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 0 1.5h-3.5a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
        </svg>
      );
    case "reports":
      return (
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M15.5 2A1.5 1.5 0 0 0 14 3.5v13a1.5 1.5 0 0 0 1.5 1.5h1a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 16.5 2h-1ZM9.5 6A1.5 1.5 0 0 0 8 7.5v9A1.5 1.5 0 0 0 9.5 18h1a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 10.5 6h-1Zm-6 4A1.5 1.5 0 0 0 2 11.5v5A1.5 1.5 0 0 0 3.5 18h1A1.5 1.5 0 0 0 6 16.5v-5A1.5 1.5 0 0 0 4.5 10h-1Z" />
        </svg>
      );
    case "settings":
      return (
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.993 6.993 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
        </svg>
      );
    case "key":
      return (
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M5 9V7a5 5 0 0 1 10 0v2a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2Zm8-2v2H7V7a3 3 0 0 1 6 0Z" clipRule="evenodd" />
        </svg>
      );
  }
}

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
  const nav = orderedNav(role);

  const documentPaths = ["/documents/quotations", "/documents/invoices", "/documents/receipts"];
  const activeItem = nav.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));

  return (
    <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:flex-col bg-[var(--sidebar-bg)] border-r border-[var(--line)]">
      <Link
        href="/dashboard"
        className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-4 transition-opacity hover:opacity-80"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)] text-sm font-black text-black">
          TI
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold text-[var(--ink)]">Techserve ICT Solutions</span>
          <span className="block text-[12px] text-[var(--ink-muted)]">Service Desk</span>
        </span>
      </Link>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 py-3">
        {nav.map((item) => {
          const isDoc = documentPaths.includes(item.href);
          const isActive =
            activeItem?.href === item.href ||
            (isDoc ? pathname.startsWith(item.href) : pathname === item.href || pathname.startsWith(`${item.href}/`));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 focus-visible:ring-offset-1 ${
                isActive
                  ? "bg-[var(--accent-muted)] text-[var(--ink)]"
                  : "text-[var(--ink-muted)] hover:bg-[var(--panel-strong)] hover:text-[var(--ink)]"
              }`}
            >
              <span
                className={`flex h-[1.25rem] w-[1.25rem] shrink-0 items-center justify-center rounded-md transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5 ${
                  isActive
                    ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                    : "text-[var(--ink-muted)] group-hover:text-[var(--ink)]"
                }`}
              >
                <NavIcon icon={item.icon} />
              </span>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {isPlatformAdmin && (
        <div className="border-t border-[var(--line)] px-3 py-2">
          <p className="mb-1 px-2 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-500/70">
            Platform
          </p>
          <Link
            href="/admin/orgs"
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] font-medium transition-colors ${
              pathname.startsWith("/admin/orgs")
                ? "bg-amber-500/15 text-amber-600"
                : "text-[var(--ink-muted)] hover:bg-[var(--panel-strong)] hover:text-[var(--ink)]"
            }`}
          >
            <span className="flex h-[1.25rem] w-[1.25rem] shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                <path fillRule="evenodd" d="M8 7a5 5 0 1 1 10 0A5 5 0 0 1 8 7ZM2.293 9.707a1 1 0 0 1 1.414-1.414l4.586 4.586a1 1 0 0 1-1.414 1.414L2.293 9.707Z" clipRule="evenodd" />
              </svg>
            </span>
            Super Admin
          </Link>
          <Link
            href="/admin/modules"
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] font-medium transition-colors ${
              pathname.startsWith("/admin/modules")
                ? "bg-amber-500/15 text-amber-600"
                : "text-[var(--ink-muted)] hover:bg-[var(--panel-strong)] hover:text-[var(--ink)]"
            }`}
          >
            <span className="flex h-[1.25rem] w-[1.25rem] shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500">
              <NavIcon icon="key" />
            </span>
            Modules
          </Link>
        </div>
      )}

      <div className="border-t border-[var(--line)] px-5 py-3 text-left">
        <p className="truncate text-[13px] font-semibold text-[var(--ink)]" title={orgName ?? "Workspace"}>
          {orgName ?? "Workspace"}
        </p>
        <p className="mt-0.5 text-[11px] font-medium tracking-[0.08em] text-[var(--accent)]" aria-hidden="true">
          Service Desk
        </p>
      </div>
    </aside>
  );
}
