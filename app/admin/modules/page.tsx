import { requireOrgSession } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";
import { OrgModule } from "@prisma/client";
import Link from "next/link";
import { checkIsPlatformAdmin } from "@/lib/platform-admin";

const MODULE_LABELS: Record<OrgModule, string> = {
  JOBS: "Tickets & Repair Jobs",
  SUBSCRIPTIONS: "Subscriptions",
  INVENTORY: "Inventory",
  POS: "POS / Sales",
  PURCHASE_ORDERS: "Purchase Orders",
  INVOICING: "Invoicing",
  COMPLAINTS: "Complaints / Support",
  REPORTS: "Reports & Dashboards",
  SALES: "Sales Pipeline",
  FIELD: "Field Visits",
  TARGETS: "Sales & Performance Targets",
};

export default async function AdminModulesPage() {
  const { user } = await requireOrgSession();
  if (!user.email || !checkIsPlatformAdmin(user.email)) {
    return (
      <div className="p-6">
        <p className="text-red-600">Forbidden — Platform admin access required.</p>
      </div>
    );
  }

  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      plan: true,
      orgModuleGrants: {
        select: { module: true },
        orderBy: { module: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-xl font-bold mb-4">Organization Module Grants</h1>
      <p className="mb-6 text-[var(--ink-muted)]">
        Manage which feature modules each organization can access. Click an organization to edit its granted modules.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {orgs.map((org) => {
          const granted = new Set(org.orgModuleGrants.map((g) => g.module));
          const allModules = Object.values(OrgModule);
          return (
            <div
              key={org.id}
              className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4"
            >
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h2 className="font-bold text-[var(--ink)]">{org.name}</h2>
                  <p className="text-xs text-[var(--ink-muted)]">
                    {org.slug} · {org.plan}
                  </p>
                </div>
                <Link
                  href={`/admin/organizations/${org.id}/modules`}
                  className="rounded bg-[var(--accent)] px-2 py-1 text-xs font-semibold text-white"
                >
                  Edit Modules
                </Link>
              </div>
              <div className="flex flex-wrap gap-1">
                {allModules.map((mod) => (
                  <span
                    key={mod}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      granted.has(mod)
                        ? "bg-emerald-500/15 text-emerald-700"
                        : "bg-[var(--panel-strong)] text-[var(--ink-muted)] line-through"
                    }`}
                  >
                    {MODULE_LABELS[mod]}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
