import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { ALL_MODULES, MODULE_LABELS, MODULE_ICONS } from "@/lib/module-access";
import { assertPlatformAdmin, checkIsPlatformAdmin } from "@/lib/platform-admin";
import type { OrgModule } from "@prisma/client";

export const dynamic = "force-dynamic";

async function setModulesAction(formData: FormData) {
  "use server";
  const admin = await assertPlatformAdmin();
  if (!admin) return;

  const orgId = String(formData.get("orgId") ?? "");
  if (!orgId) return;

  const granted = ALL_MODULES.filter((m) => formData.get(`module_${m}`) === "1");

  await prisma.$transaction([
    prisma.orgModuleGrant.deleteMany({ where: { orgId } }),
    prisma.orgModuleGrant.createMany({
      data: granted.map((module) => ({ orgId, module })),
    }),
  ]);

  revalidatePath("/admin/orgs");
}

export default async function AdminOrgsPage() {
  const { user } = await requireOrgSession();
  if (!checkIsPlatformAdmin(user.email)) redirect("/dashboard");

  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      plan: true,
      isActive: true,
      billingStatus: true,
      moduleGrants: { select: { module: true } },
      _count: { select: { users: true, clients: true, clientSubscriptions: true, jobs: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div className="panel-shadow flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
        <div>
          <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Admin</p>
          <p className="text-[13px] font-bold text-[var(--ink)]">Super Admin Panel</p>
          <p className="text-[13px] text-[var(--ink-muted)]">
            Manage client accounts, subscriptions, and module access across all organisations
          </p>
        </div>
        <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[12px] font-semibold text-amber-700 dark:text-amber-400">
          Platform Admin
        </span>
      </div>

      <div className="space-y-3">
        {orgs.map((org) => {
          const granted = new Set(org.moduleGrants.map((g) => g.module));
          return (
            <div
              key={org.id}
              className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)]"
            >
              {/* Org header */}
              <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-[var(--ink)] truncate">{org.name}</p>
                  <p className="text-[12px] text-[var(--ink-muted)]">
                    {org.slug} · {org.plan} · {org._count.users} users · {org._count.clients} clients · {org._count.clientSubscriptions} subscriptions
                  </p>
                </div>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[12px] font-semibold ${
                    org.isActive
                      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : "border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-400"
                  }`}
                >
                  {org.billingStatus}
                </span>
                <Link
                  href={`/platform-admin/orgs/${org.id}`}
                  className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-bold text-[var(--ink-muted)] transition hover:border-[var(--accent)]/40 hover:text-[var(--ink)]"
                >
                  Manage
                </Link>
              </div>

              {/* Module toggles */}
              <form action={setModulesAction} className="p-4">
                <input type="hidden" name="orgId" value={org.id} />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
                  {ALL_MODULES.map((mod) => {
                    const on = granted.has(mod as OrgModule);
                    return (
                      <label
                        key={mod}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium transition ${
                          on
                            ? "border-[var(--accent)]/40 bg-[var(--accent)]/8 text-[var(--ink)]"
                            : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          name={`module_${mod}`}
                          value="1"
                          defaultChecked={on}
                          className="h-3.5 w-3.5 accent-[var(--accent)]"
                        />
                        <span>{MODULE_ICONS[mod as OrgModule]}</span>
                        <span className="truncate">{MODULE_LABELS[mod as OrgModule]}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="mt-3 flex justify-end">
                  <button type="submit" className="btn-premium rounded-lg px-4 py-1.5 text-xs">
                    Save changes
                  </button>
                </div>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
