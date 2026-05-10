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
        <div className="panel-shadow overflow-hidden rounded-2xl border border-[var(--line)] bg-gradient-to-r from-sky-100 via-white to-orange-100 p-4 text-slate-950 sm:p-6 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 dark:text-[var(--ink)]">
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="mt-1 text-sm text-slate-700 dark:text-[var(--ink-muted)]">Account settings for your workspace.</p>
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
      <div className="panel-shadow overflow-hidden rounded-2xl border border-[var(--line)] bg-gradient-to-r from-sky-100 via-white to-orange-100 p-4 text-slate-950 sm:p-6 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 dark:text-[var(--ink)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Settings</h1>
            <p className="mt-1 text-sm text-slate-700 dark:text-[var(--ink-muted)]">
              {org.access.isSuspended ? "Workspace is read-only until billing is restored." : "Manage workspace configuration and your account."}
            </p>
          </div>
          {showAdmin ? (
            <Link href="/settings/billing" className="btn-premium rounded-full px-4 py-2 text-sm text-white">Billing</Link>
          ) : null}
        </div>
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
