/**
 * /more — Full-screen mobile navigation hub.
 * Replaces the old bottom-sheet drawer. Opens like a native screen.
 * Desktop: renders the same content but inside the normal sidebar layout.
 */
import Link from "next/link";
import { redirect } from "next/navigation";

import { can } from "@/lib/permissions";
import { requireOrgSession } from "@/lib/org-context";
import { getOrgModules } from "@/lib/module-access";

// ── Section icon helper ────────────────────────────────────────────────────────

function ItemIcon({ d, color }: { d: string | string[]; color: string }) {
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
      className={color} aria-hidden="true">
      {paths.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

// ── Row item ──────────────────────────────────────────────────────────────────

function NavRow({
  href,
  icon,
  label,
  badge,
  iconBg = "bg-[var(--panel-strong)]",
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  description: _desc,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  iconBg?: string;
  description?: string; // kept for backward compat but not rendered — keeps UI clean
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3.5 px-4 py-3.5 transition-colors active:bg-[var(--panel-strong)]"
    >
      {/* Coloured icon circle */}
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
        {icon}
      </span>

      {/* Label */}
      <p className="min-w-0 flex-1 text-[14px] font-semibold leading-snug text-[var(--ink)]">{label}</p>

      {/* Badge */}
      {badge && badge > 0 ? (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[12px] font-black text-black">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}

      {/* Chevron */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className="shrink-0 text-[var(--ink-muted)]/30" aria-hidden="true">
        <path d="M9 18l6-6-6-6"/>
      </svg>
    </Link>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <p className="px-4 pb-1 pt-4 text-[13px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/60">
      {title}
    </p>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function MorePage() {
  const { user, orgId } = await requireOrgSession();
  const perm = { role: user.role, permissions: user.permissions ?? [] };
  const mods = await getOrgModules(orgId);
  const ok = (key: string) => !key || mods.has(key as never);

  // Derive app version from package.json
  const APP_VERSION = "2.6.0";

  return (
    <div className="pb-6">

      {/* ── BUSINESS ────────────────────────────────────────────────── */}
      <SectionHeader title="Business" />
      <div className="divide-y divide-[var(--line)]/50 rounded-2xl border border-[var(--line)] bg-[var(--panel)] mx-2 overflow-hidden">

        {can.viewClientInfo(perm) && (
          <NavRow href="/clients" label="Clients" iconBg="bg-sky-500/15"
            description="Client directory and history"
            icon={<ItemIcon d={["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2","M22 21v-2a4 4 0 0 0-3-3.87","M16 3.13a4 4 0 0 1 0 7.75"]} color="text-sky-500" />}
          />
        )}

        {["ADMIN","OPS","TECHNICIAN_INTERNAL","MANAGER"].includes(user.role) && ok("INVENTORY") && (
          <NavRow href="/inventory" label="Inventory" iconBg="bg-amber-500/15"
            description="Parts, stock levels and reorders"
            icon={<ItemIcon d={["M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z","M3.27 6.96 12 12.01l8.73-5.05","M12 22.08V12"]} color="text-amber-500" />}
          />
        )}

        {user.role !== "TECHNICIAN_EXTERNAL" && (
          <NavRow href="/technicians" label="Technicians" iconBg="bg-violet-500/15"
            description="Job board and tech performance"
            icon={<ItemIcon d={["M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"]} color="text-violet-500" />}
          />
        )}

        {["ADMIN","OPS","MANAGER"].includes(user.role) && (
          <NavRow href="/inventory/suppliers" label="Suppliers" iconBg="bg-emerald-500/15"
            description="Supplier directory and bills"
            icon={<ItemIcon d={["M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z","M3.27 6.96 12 12.01l8.73-5.05","M12 22.08V12"]} color="text-emerald-500" />}
          />
        )}

        {ok("COMPLAINTS") && ["ADMIN","MANAGER","TECH_MANAGER","OPS"].includes(user.role) && (
          <NavRow href="/complaints" label="Complaints" iconBg="bg-red-500/15"
            description="Track and resolve client issues"
            icon={<ItemIcon d={["M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z","M12 9v4","M12 17h.01"]} color="text-red-500" />}
          />
        )}

        {can.createLeads(perm) && ok("SALES") && (
          <NavRow href="/sales" label="Sales & Leads" iconBg="bg-pink-500/15"
            description="Pipeline, campaigns and targets"
            icon={<ItemIcon d={["M22 12h-4l-3 9L9 3l-3 9H2"]} color="text-pink-500" />}
          />
        )}

        {can.manageFieldVisits(perm) && ok("FIELD") && (
          <NavRow href="/field" label="Field" iconBg="bg-teal-500/15"
            description="Field visits and signoffs"
            icon={<ItemIcon d={["M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z","M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"]} color="text-teal-500" />}
          />
        )}

      </div>

      {/* ── DOCUMENTS ───────────────────────────────────────────────── */}
      {can.viewFinancials(perm) && (
        <>
          <SectionHeader title="Documents" />
          <div className="divide-y divide-[var(--line)]/50 rounded-2xl border border-[var(--line)] bg-[var(--panel)] mx-2 overflow-hidden">

            {ok("INVOICING") && (
              <>
                <NavRow href="/documents/job-cards" label="Job Cards" iconBg="bg-blue-500/15"
                  icon={<ItemIcon d={["M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2","M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2","M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2","M9 14l2 2 4-4"]} color="text-blue-500" />}
                />
                <NavRow href="/documents/quotations" label="Quotations" iconBg="bg-amber-500/15"
                  icon={<ItemIcon d={["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z","M14 2v6h6","M10 13h4","M8 17h8","M8 9h2"]} color="text-amber-500" />}
                />
                <NavRow href="/documents/invoices" label="Invoices" iconBg="bg-violet-500/15"
                  icon={<ItemIcon d={["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z","M14 2v6h6","M16 13H8","M16 17H8","M10 9H8"]} color="text-violet-500" />}
                />
                <NavRow href="/documents/receipts" label="Receipts" iconBg="bg-emerald-500/15"
                  icon={<ItemIcon d={["M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z","M9 12h6","M9 16h4"]} color="text-emerald-500" />}
                />
                <NavRow href="/documents/delivery-notes" label="Delivery Notes" iconBg="bg-sky-500/15"
                  icon={<ItemIcon d={["M1 3h15v13H1z","M16 8h4l3 3v5h-7V8z"]} color="text-sky-500" />}
                />
              </>
            )}

          </div>
        </>
      )}

      {/* ── POS ──────────────────────────────────────────────────────── */}
      {["ADMIN","OPS","FRONT_DESK","MANAGER"].includes(user.role) && ok("POS") && (
        <>
          <SectionHeader title="Sales" />
          <div className="divide-y divide-[var(--line)]/50 rounded-2xl border border-[var(--line)] bg-[var(--panel)] mx-2 overflow-hidden">
            <NavRow href="/pos" label="Point of Sale" iconBg="bg-purple-500/15"
              description="Walk-in sales and product checkout"
              icon={<ItemIcon d={["M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z","M3 6h18","M16 10a4 4 0 0 1-8 0"]} color="text-purple-500" />}
            />
            {["ADMIN","OPS","FRONT_DESK","MANAGER"].includes(user.role) && (
              <NavRow href="/pos/shifts" label="Cashier Shifts" iconBg="bg-indigo-500/15"
                description="Daily shift summaries"
                icon={<ItemIcon d={["M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z","M12 6v6l4 2"]} color="text-indigo-500" />}
              />
            )}
          </div>
        </>
      )}

      {/* ── ADMINISTRATION ───────────────────────────────────────────── */}
      {["ADMIN","MANAGER"].includes(user.role) && (
        <>
          <SectionHeader title="Administration" />
          <div className="divide-y divide-[var(--line)]/50 rounded-2xl border border-[var(--line)] bg-[var(--panel)] mx-2 overflow-hidden">

            {can.manageUsers(perm) && (
              <NavRow href="/settings/users" label="Users & Roles" iconBg="bg-blue-500/15"
                description="Manage team access and permissions"
                icon={<ItemIcon d={["M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2","M23 21v-2a4 4 0 0 0-3-3.87","M16 3.13a4 4 0 0 1 0 7.75","M12 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"]} color="text-blue-500" />}
              />
            )}

            {["ADMIN","MANAGER"].includes(user.role) && (
              <NavRow href="/settings/branches" label="Branches" iconBg="bg-teal-500/15"
                description="Locations and branch settings"
                icon={<ItemIcon d={["M15.5 2A1.5 1.5 0 0 0 14 3.5v13a1.5 1.5 0 0 0 3 0v-13A1.5 1.5 0 0 0 15.5 2ZM9.5 6A1.5 1.5 0 0 0 8 7.5v9a1.5 1.5 0 0 0 3 0v-9A1.5 1.5 0 0 0 9.5 6ZM3.5 10A1.5 1.5 0 0 0 2 11.5v5a1.5 1.5 0 0 0 3 0v-5A1.5 1.5 0 0 0 3.5 10Z"]} color="text-teal-500" />}
              />
            )}

            {can.viewAccountsSummary(perm) && (
              <NavRow href="/reports" label="Reports" iconBg="bg-amber-500/15"
                description="Analytics, KPIs and performance"
                icon={<ItemIcon d={["M3 3v18h18","m19 9-5 5-4-4-3 3"]} color="text-amber-500" />}
              />
            )}

            <NavRow href="/settings" label="Settings"
              description="Branding, notifications, billing"
              icon={<ItemIcon d={["M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z","M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"]} color="text-[var(--ink-muted)]" />}
            />

            {["ADMIN"].includes(user.role) && (
              <NavRow href="/settings/data-heal" label="Backup & Restore" iconBg="bg-orange-500/15"
                description="Database diagnostics and repair"
                icon={<ItemIcon d={["M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z","M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"]} color="text-orange-500" />}
              />
            )}

          </div>
        </>
      )}

      {/* ── SUPPORT ──────────────────────────────────────────────────── */}
      <SectionHeader title="Support" />
      <div className="divide-y divide-[var(--line)]/50 rounded-2xl border border-[var(--line)] bg-[var(--panel)] mx-2 overflow-hidden">
        <NavRow href="/settings/notifications" label="Notifications" iconBg="bg-blue-500/15"
          description="Alert preferences and delivery"
          icon={<ItemIcon d={["M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9","M10.3 21a1.94 1.94 0 0 0 3.4 0"]} color="text-blue-500" />}
        />
        <NavRow href="/settings/profile" label="My Profile" iconBg="bg-emerald-500/15"
          description="Account details and password"
          icon={<ItemIcon d={["M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2","M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"]} color="text-emerald-500" />}
        />
      </div>

      {/* ── App version ──────────────────────────────────────────────── */}
      <p className="mt-6 px-4 text-center text-[12px] text-[var(--ink-muted)]/40">
        Dduuka ProMax v{APP_VERSION}
      </p>

    </div>
  );
}
