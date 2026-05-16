import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { ALL_MODULES, MODULE_LABELS, MODULE_ICONS } from "@/lib/module-access";
import type { OrgModule } from "@prisma/client";

export const dynamic = "force-dynamic";

async function isPlatformAdmin(userId: string) {
  const adminEmail = process.env.PLATFORM_ADMIN_EMAIL?.toLowerCase();
  if (!adminEmail) return false;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return user?.email?.toLowerCase() === adminEmail;
}

async function setModulesAction(formData: FormData) {
  "use server";
  const { user } = await requireOrgSession();
  if (!(await isPlatformAdmin(user.id))) return;

  const orgId = String(formData.get("orgId") ?? "");
  if (!orgId) return;

  const granted = ALL_MODULES.filter((m) => formData.get(`module_${m}`) === "1");

  await prisma.$transaction([
    prisma.orgModuleGrant.deleteMany({ where: { orgId } }),
    prisma.orgModuleGrant.createMany({
      data: granted.map((module) => ({ orgId, module })),
      skipDuplicates: true,
    }),
  ]);

  revalidatePath("/admin/orgs");
}

export default async function AdminOrgsPage() {
  const { user } = await requireOrgSession();
  if (!(await isPlatformAdmin(user.id))) redirect("/dashboard");

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
      _count: { select: { users: true, jobs: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div className="panel-shadow flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
        <div>
          <p className="text-[13px] font-bold text-[var(--ink)]">Organisation Module Access</p>
          <p className="text-[11px] text-[var(--ink-muted)]">
            Platform admin — toggle which modules each org can access
          </p>
        </div>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
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
                  <p className="text-[10px] text-[var(--ink-muted)]">
                    {org.slug} · {org.plan} · {org._count.users} users · {org._count.jobs} jobs
                  </p>
                </div>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    org.isActive
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-red-200 bg-red-50 text-red-600"
                  }`}
                >
                  {org.billingStatus}
                </span>
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
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-medium transition ${
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
                  <button className="btn-premium rounded-lg px-4 py-1.5 text-xs">
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
