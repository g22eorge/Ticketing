import { redirect } from "next/navigation";

import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getCurrentUserRole } from "@/lib/session";
import { ScheduleVisitForm } from "./ScheduleVisitForm";

export default async function ScheduleVisitPage() {
  const { user } = await getCurrentUserRole();

  if (!can.manageFieldVisits(user)) {
    redirect("/field");
  }

  const [fieldUsers, recentJobs] = await Promise.all([
    prisma.user.findMany({
      where: {
        isActive: true,
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
      },
      select: { id: true, jobNumber: true, brand: true, model: true },
      orderBy: { receivedAt: "desc" },
      take: 100,
    }),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--ink)]">Schedule Field Visit</h1>
        <p className="text-sm text-[var(--ink-muted)] mt-0.5">
          Create a new field visit and assign it to a technician.
        </p>
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-6">
        <ScheduleVisitForm users={fieldUsers} jobs={recentJobs} />
      </div>
    </div>
  );
}
