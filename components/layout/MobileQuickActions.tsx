"use client";

import Link from "next/link";
import { Role } from "@prisma/client";
import { usePathname } from "next/navigation";

import { can } from "@/lib/permissions";

type QuickAction = {
  href: string;
  label: string;
};

function roleActions(role: Role, permissions: string[]): QuickAction[] {
  const permissionUser = { role, permissions };

  if (role === "ADMIN") {
    return [
      { href: "/jobs/new",  label: "New Job" },
      { href: "/intake",    label: "Requests" },
      { href: "/reports",   label: "Reports" },
    ];
  }
  if (role === "OPS") {
    return [
      { href: "/jobs/new",  label: "New Job" },
      { href: "/intake",    label: "Requests" },
      { href: "/clients",   label: "Clients" },
    ];
  }
  if (role === "FRONT_DESK" || role === "INTAKE") {
    return [
      { href: "/jobs/new",  label: "New Job" },
      { href: "/intake",    label: "Requests" },
      { href: "/clients",   label: "Clients" },
    ];
  }
  if (role === "TECHNICIAN_INTERNAL" && can.viewClientInfo(permissionUser)) {
    // has can_intake
    return [
      { href: "/jobs/new",  label: "New Intake" },
      { href: "/intake",    label: "Requests" },
      { href: "/jobs",      label: "Work Queue" },
    ];
  }
  if (role === "TECHNICIAN_INTERNAL") {
    return [
      { href: "/jobs",        label: "Jobs" },
      { href: "/technicians", label: "Technicians" },
      { href: "/dashboard",   label: "Dashboard" },
    ];
  }
  if (role === "TECHNICIAN_EXTERNAL") {
    return [
      { href: "/jobs",                  label: "Jobs" },
      { href: "/technicians/payouts",   label: "Payouts" },
      { href: "/dashboard",             label: "Dashboard" },
    ];
  }
  return [
    { href: "/jobs",      label: "Jobs" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/technicians", label: "Technicians" },
  ];
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileQuickActions({ role, permissions = [] }: { role: Role; permissions?: string[] }) {
  const pathname = usePathname();
  const actions = roleActions(role, permissions);

  return (
    <div className="mobile-quick-actions glass grid grid-cols-3 gap-2 rounded-xl border border-[var(--line)] px-2 py-2 lg:hidden">
      {actions.map((action) => {
        const active = isActive(pathname, action.href);
        return (
          <Link
            key={action.href}
            href={action.href}
            className={`min-w-0 rounded-lg border px-2 py-2 text-center text-[13px] font-semibold tracking-[0.08em] transition-colors ${
              active
                ? "border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[#9A7A00]"
                : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] hover:border-[var(--accent)]/20 hover:text-[var(--ink)]"
            }`}
          >
            {action.label}
          </Link>
        );
      })}
    </div>
  );
}
