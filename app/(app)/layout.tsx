import { AppSidebar } from "@/components/layout/AppSidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Header } from "@/components/layout/Header";
import { PageThemeHeader } from "@/components/layout/PageThemeHeader";
import { JobStatus, Prisma } from "@prisma/client";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { filterSupportedJobStatuses } from "@/lib/job-status-server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, user, orgId } = await requireOrgSession();

  const openStatuses = filterSupportedJobStatuses([
    "RECEIVED",
    "DIAGNOSING",
    "REFERRED",
    "IN_EXTERNAL_REPAIR",
    "AWAITING_APPROVAL",
    "IN_REPAIR",
    "READY_FOR_PICKUP",
    "WAITING_FOR_PARTS",
  ]) as JobStatus[];

  const jobsWhere: Prisma.JobWhereInput =
    user.role === "TECHNICIAN_EXTERNAL" || user.role === "TECHNICIAN_INTERNAL"
      ? { orgId, status: { in: openStatuses }, assignedToId: session.user.id }
      : { orgId, status: { in: openStatuses } };

  const paymentWhere: Prisma.JobWhereInput = {
    orgId,
    repairPath: "EXTERNAL" as const,
    clientBill: { not: null },
    externalPaid: false,
    status: { in: ["DELIVERED", "COMPLETED"] },
  };

  const receivedWhere: Prisma.JobWhereInput =
    user.role === "TECHNICIAN_EXTERNAL" || user.role === "TECHNICIAN_INTERNAL"
      ? { orgId, status: "RECEIVED" as JobStatus, assignedToId: session.user.id }
      : { orgId, status: "RECEIVED" as JobStatus };

  const [activeJobsCount, partsForReorder, paymentFollowupCount, receivedJobsCount, pendingRequestsCount] = await Promise.all([
    prisma.job.count({ where: jobsWhere }),
    prisma.part.findMany({
      where: { orgId, isActive: true, reorderLevel: { gt: 0 } },
      select: { qtyOnHand: true, reorderLevel: true },
    }).catch(() => []),
    (can.reviewExternalBills(user) || can.approveInvoices(user)) ? prisma.job.count({ where: paymentWhere }) : Promise.resolve(0),
    prisma.job.count({ where: receivedWhere }),
    can.viewIntake(user)
      ? prisma.repairRequest.count({ where: { orgId, requestStatus: { in: ["PENDING_FRONT_DESK", "PENDING_INTAKE"] } } }).catch(() => 0)
      : Promise.resolve(0),
  ]);

  const lowStockCount = partsForReorder.filter((part) => part.qtyOnHand <= part.reorderLevel).length;

  return (
    <div className="min-h-dvh overflow-x-clip md:flex md:h-screen md:overflow-hidden">
      <AppSidebar
        role={user.role}
        permissions={user.permissions}
        badges={{
          jobs: activeJobsCount,
          receivedJobs: receivedJobsCount,
          inventory: lowStockCount,
          paymentFollowups: paymentFollowupCount,
          pendingRequests: pendingRequestsCount,
        }}
      />
      <div className="relative flex min-h-screen min-w-0 flex-1 flex-col overflow-x-clip md:h-full md:min-h-0">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(212,175,55,0.06),transparent_50%),radial-gradient(ellipse_at_bottom_left,rgba(212,175,55,0.04),transparent_40%)]" />
        <Header userName={user.name} role={user.role} permissions={user.permissions} />
        <main className="fade-in flex-1 overflow-x-hidden px-4 pb-[var(--mobile-shell-bottom)] pt-[var(--mobile-shell-top)] md:min-h-0 md:overflow-y-auto md:px-6 md:pb-8">
          <div className="mobile-page-shell mx-auto w-full max-w-lg md:max-w-[1240px] md:space-y-5 xl:max-w-[1360px]">
            <PageThemeHeader role={user.role} />
            {children}
          </div>
        </main>
      </div>
      <BottomNav
        role={user.role}
        permissions={user.permissions}
        badges={{
          jobs: activeJobsCount,
          receivedJobs: receivedJobsCount,
          inventory: lowStockCount,
          paymentFollowups: paymentFollowupCount,
          pendingRequests: pendingRequestsCount,
        }}
      />
    </div>
  );
}
