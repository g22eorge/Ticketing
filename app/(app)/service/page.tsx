export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOrgSession } from "@/lib/org-context";
import { orgDb } from "@/lib/prisma";

type Tile = { label: string; href: string; icon: string; color: string; description: string };

const TILES: Tile[] = [
  {
    label: "Field Visits",
    href: "/field",
    icon: "M17.657 16.657L13.414 20.9a1.998 1.998 0 0 1-2.827 0l-4.244-4.243a8 8 0 1 1 11.314 0z|M15 11a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
    color: "text-blue-500",
    description: "On-site visits and field technician dispatch",
  },
  {
    label: "Technicians",
    href: "/technicians",
    icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0|M23 21v-2a4 4 0 0 0-3-3.87|M16 3.13a4 4 0 0 1 0 7.75",
    color: "text-violet-500",
    description: "Manage technicians, assignments and payouts",
  },
  {
    label: "Complaints",
    href: "/complaints",
    icon: "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z|M12 9v4|M12 17h.01",
    color: "text-rose-500",
    description: "Track and resolve customer complaints",
  },
];

function NavIcon({ d, color }: { d: string; color: string }) {
  const paths = d.split("|");
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={color} aria-hidden="true">
      {paths.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

export default async function ServiceHubPage() {
  const { user, orgId } = await requireOrgSession();
  if (!["ADMIN", "MANAGER", "TECH_MANAGER", "OPS", "FRONT_DESK"].includes(user.role)) {
    redirect("/dashboard");
  }

  const db = orgDb(orgId);
  const [openJobs, pendingIntake] = await Promise.all([
    db.repairJob.count({ where: { orgId, status: { notIn: ["COMPLETED", "CLOSED", "CANCELLED"] } } }).catch(() => null),
    db.repairRequest.count({ where: { orgId, status: "PENDING" } }).catch(() => null),
  ]);

  return (
    <div className="space-y-6 pb-24 lg:pb-6">

      {/* Page header */}
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="px-4 py-4">
          <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Service</p>
          <p className="text-[15px] font-bold text-[var(--ink)]">Service Hub</p>
          <p className="text-[13px] text-[var(--ink-muted)]">Field visits, technicians, and complaints</p>
        </div>
      </div>

      {/* Quick links to daily items with live counts */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/jobs"
          className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-[12px] font-semibold text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)] hover:bg-[var(--panel-strong)]"
        >
          ← Jobs
          {openJobs !== null && (
            <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">{openJobs}</span>
          )}
        </Link>
        <Link
          href="/intake"
          className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-[12px] font-semibold text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)] hover:bg-[var(--panel-strong)]"
        >
          Intake
          {pendingIntake !== null && pendingIntake > 0 && (
            <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">{pendingIntake}</span>
          )}
        </Link>
      </div>

      {/* Tiles */}
      <section>
        <h2 className="mb-2.5 px-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
          Service Management
        </h2>
        {/* Mobile */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:hidden">
          {TILES.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-2xl bg-[var(--panel)] px-4 py-3.5 transition-all active:opacity-75"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--panel-strong)]">
                <NavIcon d={item.icon} color={item.color} />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-[var(--ink)]">{item.label}</p>
                <p className="text-[11px] text-[var(--ink-muted)]">{item.description}</p>
              </div>
            </Link>
          ))}
        </div>
        {/* Desktop */}
        <div className="hidden gap-3 lg:grid lg:grid-cols-4">
          {TILES.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-4 transition-all hover:border-[var(--accent)]/30 hover:bg-[var(--panel-strong)] active:scale-[0.97]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--panel-strong)]">
                <NavIcon d={item.icon} color={item.color} />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-[var(--ink)]">{item.label}</p>
                <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">{item.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

    </div>
  );
}
