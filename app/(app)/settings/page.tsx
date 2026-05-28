import Link from "next/link";
import { redirect } from "next/navigation";

import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";

type TileIcon = {
  path: string;
  strokePath?: string; // second path element if needed
  bg: string;
  fg: string;
};

type Tile = {
  href: string;
  title: string;
  description: string;
  roles: readonly string[] | "all";
  icon: TileIcon;
};

// Heroicons outline paths (24×24 viewBox, strokeWidth 1.5)
const ICONS: Record<string, TileIcon> = {
  profile: {
    path: "M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z",
    bg: "bg-violet-500/10", fg: "text-violet-600",
  },
  notifications: {
    path: "M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0",
    bg: "bg-blue-500/10", fg: "text-blue-600",
  },
  billing: {
    path: "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z",
    bg: "bg-emerald-500/10", fg: "text-emerald-600",
  },
  users: {
    path: "M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z",
    bg: "bg-sky-500/10", fg: "text-sky-600",
  },
  groups: {
    path: "M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z",
    bg: "bg-indigo-500/10", fg: "text-indigo-600",
  },
  targets: {
    path: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z",
    bg: "bg-orange-500/10", fg: "text-orange-600",
  },
  branches: {
    path: "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21",
    bg: "bg-teal-500/10", fg: "text-teal-600",
  },
  ai: {
    path: "M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z",
    bg: "bg-purple-500/10", fg: "text-purple-600",
  },
  branding: {
    path: "M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.097-1.414M9.53 16.122A15.99 15.99 0 0 1 8.117 14.9m9.4-8.784a3 3 0 1 0-4.243 4.244l1.06-1.06a1.5 1.5 0 0 1 2.122-2.121l1.06-1.063Zm0 0-9.4 9.4",
    bg: "bg-pink-500/10", fg: "text-pink-600",
  },
  templates: {
    path: "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z",
    bg: "bg-amber-500/10", fg: "text-amber-700",
  },
  whatsapp: {
    path: "M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155",
    bg: "bg-green-500/10", fg: "text-green-600",
  },
  outbox: {
    path: "M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5",
    bg: "bg-cyan-500/10", fg: "text-cyan-600",
  },
  dataHeal: {
    path: "M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z",
    bg: "bg-red-500/10", fg: "text-red-600",
  },
  audit: {
    path: "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    bg: "bg-slate-500/10", fg: "text-slate-600",
  },
};

const TILES: Tile[] = [
  { href: "/settings/profile",                   title: "Profile",        description: "Your account details and preferences.",              roles: "all",              icon: ICONS.profile },
  { href: "/settings/notifications",             title: "Notifications",  description: "Personal notification preferences.",                 roles: "all",              icon: ICONS.notifications },
  { href: "/settings/billing",                   title: "Billing",        description: "Plan, trial, invoices, and renewal status.",         roles: ["ADMIN"],          icon: ICONS.billing },
  { href: "/settings/users",                     title: "Users",          description: "Create users, roles, and access control.",           roles: ["ADMIN"],          icon: ICONS.users },
  { href: "/settings/groups",                    title: "Groups",         description: "Permission groups and staff membership.",            roles: ["ADMIN"],          icon: ICONS.groups },
  { href: "/settings/targets",                   title: "Sales Targets",  description: "Monthly revenue and job targets.",                   roles: ["ADMIN", "SALES"], icon: ICONS.targets },
  { href: "/settings/branches",                  title: "Branches",       description: "Locations and default branch rules.",                roles: ["ADMIN"],          icon: ICONS.branches },
  { href: "/settings/ai",                        title: "AI Knowledge",   description: "Review AI feedback and improve help articles.",      roles: ["ADMIN"],          icon: ICONS.ai },
  { href: "/settings/branding",                  title: "Branding",       description: "Company details and document templates.",            roles: ["ADMIN"],          icon: ICONS.branding },
  { href: "/settings/notifications/templates",   title: "Templates",      description: "WhatsApp/email templates and status policy.",        roles: ["ADMIN", "OPS"],   icon: ICONS.templates },
  { href: "/settings/notifications/whatsapp",    title: "WhatsApp",       description: "Provider credentials and test sends.",               roles: ["ADMIN"],          icon: ICONS.whatsapp },
  { href: "/settings/notifications/outbox",      title: "Outbox",         description: "Delivery status and retries.",                       roles: ["ADMIN", "OPS"],   icon: ICONS.outbox },
  { href: "/settings/data-heal",                 title: "Data Heal",      description: "Diagnostics and repair tools for production.",       roles: ["ADMIN"],          icon: ICONS.dataHeal },
  { href: "/settings/audit",                     title: "Audit Log",      description: "Workspace activity history and export.",             roles: ["ADMIN"],          icon: ICONS.audit },
];

function allowed(role: string, roles: Tile["roles"]) {
  return roles === "all" ? true : roles.includes(role);
}

function TileCard({ t }: { t: Tile }) {
  return (
    <Link
      href={t.href}
      className="panel-shadow group flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:border-[var(--accent)]/40 hover:shadow-md"
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${t.icon.bg} transition group-hover:scale-105`}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-5 w-5 ${t.icon.fg}`}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={t.icon.path} />
        </svg>
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-[var(--ink)]">{t.title}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-[var(--ink-muted)]">{t.description}</p>
      </div>
      <svg viewBox="0 0 6 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="ml-auto h-2.5 w-1.5 shrink-0 text-[var(--ink-muted)]/30 transition group-hover:text-[var(--ink-muted)]/60" aria-hidden="true">
        <path d="M1 1l4 4-4 4"/>
      </svg>
    </Link>
  );
}

export default async function SettingsHomePage() {
  const { user } = await requireOrgSession();

  // External techs get a minimal settings page.
  if (user.role === "TECHNICIAN_EXTERNAL") {
    return (
      <section className="space-y-4">
        <div className="panel-shadow flex items-center rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
          <p className="text-[13px] font-bold text-[var(--ink)]">Settings</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {TILES.filter((t) => ["/settings/profile", "/settings/notifications"].includes(t.href)).map((t) => (
            <TileCard key={t.href} t={t} />
          ))}
        </div>
      </section>
    );
  }

  const showAdmin = can.manageUsers(user);
  const visible = TILES.filter((t) => allowed(user.role, t.roles));
  if (visible.length === 0) redirect("/dashboard");

  return (
    <section className="space-y-4">
      <div className="panel-shadow flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Workspace</p>
          <p className="text-[13px] font-bold text-[var(--ink)]">Settings</p>
        </div>
        {showAdmin ? (
          <Link href="/settings/billing" className="btn-premium rounded-lg px-3 py-1.5 text-[12px]">Billing</Link>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((t) => (
          <TileCard key={t.href} t={t} />
        ))}
      </div>
    </section>
  );
}
