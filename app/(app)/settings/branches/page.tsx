import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { BranchList } from "./BranchList";

export const dynamic = "force-dynamic";

export default async function BranchesPage() {
  const { user, orgId } = await requireOrgSession();
  if (!can.manageUsers(user)) redirect("/settings");

  const branches = await prisma.branch.findMany({
    where: { orgId },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: {
      _count: { select: { users: true, jobs: true } },
    },
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-[var(--ink)]">Branches</h1>
        <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
          Manage physical locations. Assign users and track jobs per branch.
        </p>
      </div>

      <BranchList branches={branches} />
    </div>
  );
}
