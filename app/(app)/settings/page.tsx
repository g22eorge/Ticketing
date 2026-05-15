import Link from "next/link";
import { redirect } from "next/navigation";

import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";

type Tile = {
  href: string;
  title: string;
  description: string;
  roles: readonly string[] | "all";
};

const TILES: Tile[] = [
  { href: "/settings/profile", title: "Profile", description: "Your account details and preferences.", roles: "all" },
  { href: "/settings/notifications", title: "Notifications", description: "Personal notification preferences.", roles: "all" },

  { href: "/settings/billing", title: "Billing", description: "Plan, trial, invoices, and renewal status.", roles: ["ADMIN"] },
  { href: "/settings/users", title: "Users", description: "Create users, roles, and access control.", roles: ["ADMIN"] },
  { href: "/settings/branches", title: "Branches", description: "Locations and default branch rules.", roles: ["ADMIN"] },
  { href: "/settings/branding", title: "Branding", description: "Company details and document templates.", roles: ["ADMIN"] },
  { href: "/settings/notifications/templates", title: "Templates", description: "WhatsApp/email templates and status policy.", roles: ["ADMIN", "OPS"] },
  { href: "/settings/notifications/whatsapp", title: "WhatsApp", description: "Provider credentials and test sends.", roles: ["ADMIN"] },
  { href: "/settings/notifications/outbox", title: "Outbox", description: "Delivery status and retries.", roles: ["ADMIN", "OPS"] },
  { href: "/settings/data-heal", title: "Data Heal", description: "Diagnostics and repair tools for production.", roles: ["ADMIN"] },
];

function allowed(role: string, roles: Tile["roles"]) {
  return roles === "all" ? true : roles.includes(role);
}

export default async function SettingsHomePage() {
  const { user, org } = await requireOrgSession();

  // External techs get a minimal settings page.
  if (user.role === "TECHNICIAN_EXTERNAL") {
    return (
      <section className="space-y-4">
        <div className="panel-shadow flex items-center rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
          <p className="text-[13px] font-bold text-[var(--ink)]">Settings</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {TILES.filter((t) => ["/settings/profile", "/settings/notifications"].includes(t.href)).map((t) => (
            <Link key={t.href} href={t.href} className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:border-[var(--accent)]/40">
              <p className="text-sm font-semibold text-[var(--ink)]">{t.title}</p>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">{t.description}</p>
            </Link>
          ))}
        </div>
      </section>
    );
  }

  // If workspace is suspended, keep settings accessible (read-only enforcement happens in actions).
  const showAdmin = can.manageUsers(user);

  const visible = TILES.filter((t) => allowed(user.role, t.roles));
  if (visible.length === 0) redirect("/dashboard");

  return (
    <section className="space-y-4">
      <div className="panel-shadow flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
        <p className="text-[13px] font-bold text-[var(--ink)]">Settings</p>
        {showAdmin ? (
          <Link href="/settings/billing" className="btn-premium rounded-lg px-3 py-1.5 text-[12px]">Billing</Link>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:border-[var(--accent)]/40"
          >
            <p className="text-sm font-semibold text-[var(--ink)]">{t.title}</p>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">{t.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
