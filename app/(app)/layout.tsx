import { ClientOnlySidebar } from "@/components/layout/ClientOnlySidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Header } from "@/components/layout/Header";
import { PageThemeHeader } from "@/components/layout/PageThemeHeader";
import { QuickActionFAB } from "@/components/layout/QuickActionFAB";
import type { FabAction } from "@/components/layout/QuickActionFAB";
import { JobStatus, Prisma } from "@prisma/client";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { filterSupportedJobStatuses } from "@/lib/job-status-server";
import { sendTrialExpiryWarning } from "@/lib/email";
import { checkIsPlatformAdmin } from "@/lib/platform-admin";
import Link from "next/link";

// Module-level dedup: only send trial warning email once per server instance per org.
const trialWarningSent = new Set<string>();

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, user, orgId } = await requireOrgSession();

  const isPlatformAdmin = checkIsPlatformAdmin(user.email);

  // ── Billing enforcement ───────────────────────────────────────────────────
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { billingStatus: true, trialEndsAt: true, plan: true, name: true, planRenewsAt: true },
  });

  const now = new Date();

  // If a paid plan was cancelled and the billing period ended, revert to free Starter limits.
  if (org?.billingStatus === "CANCELLED" && org.planRenewsAt && org.planRenewsAt < now) {
    // Best-effort downgrade; don't take down the whole app shell.
    // Avoid touching optional legacy columns during downgrade; some deployed DBs may not have them yet.
    await prisma.organization
      .update({
        where: { id: orgId },
        data: {
          plan: "STARTER",
          billingStatus: "TRIALING",
          trialEndsAt: null,
          planRenewsAt: null,
          planCancelledAt: null,
        },
      })
      .catch(() => {});
  }

  const trialExpired =
    org?.billingStatus === "TRIALING" &&
    org.trialEndsAt != null &&
    org.trialEndsAt < now;
  const isPastDue = org?.billingStatus === "PAST_DUE";
  const isSuspended = trialExpired || isPastDue;

  // Read-only mode: allow navigation + downloads. Mutations are blocked server-side.

  // ── Trial expiry warning email (fire-and-forget, once per server instance) ─
  if (org?.billingStatus === "TRIALING" && org.trialEndsAt) {
    const daysLeft = Math.ceil((org.trialEndsAt.getTime() - now.getTime()) / 86_400_000);
    if (daysLeft <= 3 && daysLeft > 0 && !trialWarningSent.has(orgId)) {
      trialWarningSent.add(orgId);
      prisma.user
        .findFirst({ where: { orgId, role: "ADMIN" }, select: { email: true, name: true } })
        .then((admin) => {
          if (admin) {
            void sendTrialExpiryWarning(
              admin.email,
              admin.name,
              org.name,
              daysLeft,
            );
          }
        })
        .catch(() => {});
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

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

  const [activeJobsCount, partsForReorder, paymentFollowupCount, receivedJobsCount, pendingRequestsCount, openComplaintsCount] = await Promise.all([
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
    (async () => {
      if (!["ADMIN", "MANAGER", "TECH_MANAGER", "OPS"].includes(user.role)) return 0;
      try {
        // Guard: complaint model may be absent if Prisma client is a stale hot-reload cache
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const model = (prisma as any).complaint;
        if (!model?.count) return 0;
        return await model.count({ where: { orgId, status: { in: ["RECEIVED", "ACKNOWLEDGED", "INVESTIGATING"] } } });
      } catch { return 0; }
    })(),
  ]);

  const lowStockCount = partsForReorder.filter((part) => part.qtyOnHand <= part.reorderLevel).length;

  return (
    <div className="min-h-dvh overflow-x-clip md:flex md:h-screen md:overflow-hidden">
      <ClientOnlySidebar
        role={user.role}
        permissions={user.permissions}
        isPlatformAdmin={isPlatformAdmin}
        badges={{
          jobs: activeJobsCount,
          receivedJobs: receivedJobsCount,
          inventory: lowStockCount,
          paymentFollowups: paymentFollowupCount,
          pendingRequests: pendingRequestsCount,
          complaints: openComplaintsCount,
        }}
      />
      <div className="relative flex min-h-screen min-w-0 flex-1 flex-col overflow-x-clip md:h-full md:min-h-0">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(212,175,55,0.06),transparent_50%),radial-gradient(ellipse_at_bottom_left,rgba(212,175,55,0.04),transparent_40%)]" />
        <Header userName={user.name} userEmail={user.email} userPhone={user.phone} role={user.role} permissions={user.permissions} isPlatformAdmin={isPlatformAdmin} orgName={org?.name ?? null} />
        <main className="fade-in flex-1 overflow-x-hidden px-4 pb-[var(--mobile-shell-bottom)] pt-[var(--mobile-shell-top)] md:min-h-0 md:overflow-y-auto md:px-6 md:pb-8">
          <div className="mobile-page-shell mx-auto w-full max-w-lg md:max-w-[1240px] md:space-y-5 xl:max-w-[1360px]">
            <PageThemeHeader role={user.role} />
            {isSuspended ? (
              <div className="panel-shadow rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-amber-50">Workspace is read-only until billing is restored.</p>
                  <Link
                    href="/settings/billing?suspended=1"
                    className="inline-flex rounded-lg border border-amber-500/30 bg-black/20 px-3 py-1.5 text-xs font-semibold text-amber-50 hover:bg-black/30"
                  >
                    Open Billing
                  </Link>
                </div>
                <p className="mt-1 text-xs text-amber-100/90">Admins can still record payments to recover revenue.</p>
              </div>
            ) : null}
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
          complaints: openComplaintsCount,
        }}
      />
      <QuickActionFAB actions={isSuspended ? [] : buildFabActions(user)} />
    </div>
  );
}

// ── FAB actions ───────────────────────────────────────────────────────────────

function Icon({ d, color = "currentColor" }: { d: string; color?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function buildFabActions(user: { role: string; permissions?: string[] }): FabAction[] {
  const u = user as Parameters<typeof can.createJob>[0];
  const actions: FabAction[] = [];

  if (can.createJob(u)) {
    actions.push({
      label: "New Job",
      href: "/jobs/new",
      color: "bg-emerald-500",
      icon: <Icon d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" color="white" />,
    });
  }

  if (can.viewClientInfo(u)) {
    // No standalone "create client" flow yet. Avoid linking to a missing route.
  }

  if (can.viewIntake(u)) {
    actions.push({
      label: "Intake",
      href: "/intake",
      color: "bg-amber-500",
      icon: <Icon d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" color="white" />,
    });
  }

  if (can.viewFinancials(u)) {
    actions.push({
      label: "New Invoice",
      href: "/jobs?invoice=1",
      color: "bg-purple-500",
      icon: <Icon d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" color="white" />,
    });
  }

  return actions;
}
