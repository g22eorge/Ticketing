import { prisma } from "@/lib/prisma";
import { OrgModule } from "@prisma/client";
import Link from "next/link";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserRole } from "@/lib/session";
import { checkIsPlatformAdmin } from "@/lib/platform-admin";
import { notFound, redirect } from "next/navigation";

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

export default async function ManageOrgModulesPage({
  params,
}: {
  params: { orgId: string };
}) {
  const orgId = params.orgId;
  if (!orgId) {
    notFound();
  }

  const { user } = await getCurrentUserRole();
  if (!user?.email || !checkIsPlatformAdmin(user.email)) {
    redirect("/login");
  }

  const [org, grants] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId } }),
    prisma.orgModuleGrant.findMany({
      where: { orgId },
      select: { module: true },
    }),
  ]);

  if (!org) {
    return (
      <div className="p-6">
        <p>Organization not found.</p>
        <Link href="/admin/orgs" className="text-blue-600">
          ← Back to Organizations
        </Link>
      </div>
    );
  }

  const enabled = new Set(grants.map((g) => g.module));

  const allModules = Object.values(OrgModule).filter(
    (v): v is OrgModule => typeof v === "string"
  );

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-4">
        <Link href="/admin/orgs" className="text-blue-600 text-sm">
          ← Back to Organizations
        </Link>
      </div>

      <h1 className="text-xl font-bold mb-2">Manage Modules</h1>
      <p className="mb-6 text-[var(--ink-muted)]">
        Enable/disable feature modules for <strong>{org.name}</strong>. Unchecked modules will be inaccessible to this organization.
      </p>

      <form method="post" action="" className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">
          {allModules.map((mod) => (
            <label
              key={mod}
              className="flex items-center gap-2 rounded-lg border border-[var(--line)] p-3"
            >
              <input
                type="checkbox"
                name="modules"
                value={mod}
                defaultChecked={enabled.has(mod)}
                className="rounded"
              />
              <span>{MODULE_LABELS[mod]}</span>
            </label>
          ))}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="submit"
            className="rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-white hover:opacity-90"
          >
            Save Changes
          </button>
          <Link
            href="/admin/orgs"
            className="rounded-lg border border-[var(--line)] px-4 py-2"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: { orgId: string } }
) {
  const orgId = params.orgId;
  if (!orgId) {
    return NextResponse.json({ error: "Org ID required" }, { status: 400 });
  }

  const { user } = await requireOrgSession();
  if (!user.email || !checkIsPlatformAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const modules = formData.getAll("modules") as string[];

  const allModules = Object.values(OrgModule).filter(
    (v): v is OrgModule => typeof v === "string"
  );
  const selected = modules.filter((m) => allModules.includes(m as OrgModule));

  await prisma.$transaction([
    prisma.orgModuleGrant.deleteMany({ where: { orgId } }),
    ...selected.map((module) =>
      prisma.orgModuleGrant.create({
        data: { orgId, module: module as OrgModule },
      })
    ),
  ]);

  // Redirect back to the same page (without trailing ? inserted by the form)
  return NextResponse.redirect(new URL(`..`, req.url));
}
