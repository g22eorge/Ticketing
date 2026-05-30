import { redirect } from "next/navigation";

import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { ScheduleVisitForm } from "./ScheduleVisitForm";

export default async function ScheduleVisitPage() {
  const { user, orgId } = await requireOrgSession();

  if (!can.manageFieldVisits(user)) {
    redirect("/field");
  }

  const [fieldUsers, recentJobs] = await Promise.all([
    prisma.user.findMany({
      where: {
        isActive: true,
        orgId,
        role: { in: ["TECH_FIELD", "TECHNICIAN_EXTERNAL"] },
      },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.job.findMany({
      where: {
        status: {
          notIn: ["COMPLETED", "CLOSED"],
        },
        orgId,
      },
      select: { id: true, jobNumber: true, brand: true, model: true },
      orderBy: { receivedAt: "desc" },
      take: 100,
    }),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="px-4 py-3">
          <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Field</p>
          <p className="text-[13px] font-bold text-[var(--ink)]">Schedule Field Visit</p>
          <p className="text-[13px] text-[var(--ink-muted)]">Create a new field visit and assign it to a technician.</p>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-6">
        <ScheduleVisitForm users={fieldUsers} jobs={recentJobs} />
      </div>
    </div>
  );
}
