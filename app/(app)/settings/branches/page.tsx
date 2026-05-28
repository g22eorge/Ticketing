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
    <div className="space-y-4 max-w-2xl">
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        <p className="text-[13px] font-bold text-[var(--ink)]">Branches</p>
      </div>

      <BranchList branches={branches} />
    </div>
  );
}
