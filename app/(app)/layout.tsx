import { ClientOnlySidebar } from "@/components/layout/ClientOnlySidebar";
import { AiGuideBubble } from "@/components/ai-guide/AiGuideBubble";
import { BottomNav } from "@/components/layout/BottomNav";
import { Header } from "@/components/layout/Header";
import { PageThemeHeader } from "@/components/layout/PageThemeHeader";
import { QuickActionFAB } from "@/components/layout/QuickActionFAB";
import type { FabAction } from "@/components/layout/QuickActionFAB";
import { SpeedDialFAB } from "@/components/layout/SpeedDialFAB";
import type { SpeedDialAction } from "@/components/layout/SpeedDialFAB";
import { JobStatus, Prisma, PurchaseOrderStatus, PurchaseRequestStatus } from "@prisma/client";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { sendTrialExpiryWarning } from "@/lib/email";
import { checkIsPlatformAdmin } from "@/lib/platform-admin";
import { getOrgModules } from "@/lib/module-access";
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
  }).catch(() =>
    prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } })
      .then((r) => r ? { ...r, billingStatus: "TRIALING" as const, trialEndsAt: null, plan: "STARTER" as const, planRenewsAt: null } : null)
      .catch(() => null)
  );

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

  const canViewProcurement = ["ADMIN", "MANAGER", "TECH_MANAGER", "OPS"].includes(user.role);
  const purchaseRequestAttentionWhere: Prisma.PurchaseRequestWhereInput = {
    orgId,
    status: PurchaseRequestStatus.SUBMITTED,
  };
  const purchaseOrderAttentionWhere: Prisma.PurchaseOrderWhereInput = {
    orgId,
    status: { in: [PurchaseOrderStatus.ORDERED, PurchaseOrderStatus.PARTIAL] },
    OR: [
      { status: PurchaseOrderStatus.PARTIAL },
      { expectedAt: { lt: now } },
    ],
  };

  // Defensive: wrap Promise.all so a single failing query doesn't crash the entire layout.
  let partsForReorder: { qtyOnHand: number; reorderLevel: number }[] = [];
  let paymentFollowupCount = 0;
  let receivedJobsCount = 0;
  let pendingRequestsCount = 0;
  let openComplaintsCount = 0;
  let purchaseRequestAttentionCount = 0;
  let purchaseOrderAttentionCount = 0;
  let enabledModules: Set<string> = new Set<string>();
  let orgUsers: { id: string; name: string; email: string; role: string; isActive: boolean }[] = [];

  try {
    [
      partsForReorder,
      paymentFollowupCount,
      receivedJobsCount,
      pendingRequestsCount,
      openComplaintsCount,
      purchaseRequestAttentionCount,
      purchaseOrderAttentionCount,
      enabledModules,
      orgUsers,
    ] = await Promise.all([
      prisma.part.findMany({
        where: { orgId, isActive: true, reorderLevel: { gt: 0 } },
        select: { qtyOnHand: true, reorderLevel: true },
      }).catch(() => [] as typeof partsForReorder),
      (can.reviewExternalBills(user) || can.approveInvoices(user))
        ? prisma.job.count({ where: paymentWhere }).catch(() => 0)
        : 0,
      prisma.job.count({ where: receivedWhere }).catch(() => 0),
      can.viewIntake(user)
        ? prisma.repairRequest.count({ where: { orgId, requestStatus: { in: ["PENDING_FRONT_DESK", "PENDING_INTAKE"] } } }).catch(() => 0)
        : 0,
      (async () => {
        if (!["ADMIN", "MANAGER", "TECH_MANAGER", "OPS"].includes(user.role)) return 0;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const model = (prisma as any).complaint;
          if (!model?.count) return 0;
          return await model.count({ where: { orgId, status: { in: ["RECEIVED", "ACKNOWLEDGED", "INVESTIGATING"] } } });
        } catch { return 0; }
      })(),
      canViewProcurement
        ? prisma.purchaseRequest.count({ where: purchaseRequestAttentionWhere }).catch(() => 0)
        : 0,
      canViewProcurement
        ? prisma.purchaseOrder.count({ where: purchaseOrderAttentionWhere }).catch(() => 0)
        : 0,
      getOrgModules(orgId).catch(() => new Set<string>()),
      user.role === "ADMIN"
        ? prisma.user.findMany({
            where: { orgId },
            select: { id: true, name: true, email: true, role: true, isActive: true },
            orderBy: [{ isActive: "desc" }, { name: "asc" }],
            take: 300,
          }).catch(() => [] as typeof orgUsers)
        : [],
    ]);
  } catch {
    // All queries failed; use empty fallbacks so the layout shell still renders.
  }

  const lowStockCount = partsForReorder.filter((part) => part.qtyOnHand <= part.reorderLevel).length;
  const procurementAttentionCount = purchaseRequestAttentionCount + purchaseOrderAttentionCount;

  return (
    <div className="min-h-dvh overflow-x-clip md:flex md:h-screen md:overflow-hidden">
      <ClientOnlySidebar
        role={user.role}
        permissions={user.permissions}
        isPlatformAdmin={isPlatformAdmin}
        enabledModules={enabledModules}
        orgName={org?.name}
        badges={{
          receivedJobs: receivedJobsCount,
          inventory: lowStockCount,
          procurement: procurementAttentionCount,
          purchaseRequests: purchaseRequestAttentionCount,
          purchaseOrders: purchaseOrderAttentionCount,
          paymentFollowups: paymentFollowupCount,
          pendingRequests: pendingRequestsCount,
          complaints: openComplaintsCount,
        }}
      />
      <div className="relative flex min-h-screen min-w-0 flex-1 flex-col overflow-x-clip md:h-full md:min-h-0">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(230,198,92,0.06),transparent_50%),radial-gradient(ellipse_at_bottom_left,rgba(230,198,92,0.04),transparent_40%)]" />
        <Header userName={user.name} userEmail={user.email} userPhone={user.phone} role={user.role} permissions={user.permissions} isPlatformAdmin={isPlatformAdmin} orgName={org?.name ?? null} orgUsers={orgUsers} />
        <main className="fade-in flex-1 overflow-x-hidden px-4 pb-[var(--mobile-shell-bottom)] pt-[var(--mobile-shell-top)] md:min-h-0 md:overflow-y-auto md:px-6 md:pb-8">
          <div className="mobile-page-shell mx-auto w-full max-w-lg md:max-w-[1240px] md:space-y-5 xl:max-w-[1360px]">
            {/* PageThemeHeader:
                • Mobile root pages (/dashboard, /jobs, /finance, /reports, /more):
                  hidden — each has its own custom native header
                • Mobile sub-pages (/jobs/:id, /settings/…, etc.):
                  shows back arrow + page title
                • Desktop: always shows the full card with role badge
            */}
            <PageThemeHeader role={user.role} permissions={user.permissions} />
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
        enabledModules={enabledModules}
        badges={{
          receivedJobs: receivedJobsCount,
          inventory: lowStockCount,
          procurement: procurementAttentionCount,
          purchaseRequests: purchaseRequestAttentionCount,
          purchaseOrders: purchaseOrderAttentionCount,
          paymentFollowups: paymentFollowupCount,
          pendingRequests: pendingRequestsCount,
          complaints: openComplaintsCount,
        }}
      />
      {/* Mobile: single speed-dial FAB (replaces separate FAB + AI bubble) */}
      <SpeedDialFAB
        actions={isSuspended ? [] : buildSpeedDialActions(user, enabledModules)}
      />
      {/* Desktop: keep the draggable AI bubble; mobile: hidden (AI is in speed-dial) */}
      <div className="hidden lg:block">
        <AiGuideBubble />
      </div>
      {/* Desktop-only legacy FAB (hidden on mobile) */}
      <div className="hidden lg:block">
        <QuickActionFAB actions={isSuspended ? [] : buildFabActions(user)} />
      </div>
    </div>
  );
}

// ── FAB — single context-aware primary action (industry standard) ─────────────
// Industry standard: ONE FAB = ONE primary action for the current screen.
// The home Quick Actions grid already covers the full set; the FAB is a
// shortcut to the most logical action per context.

function buildFabActions(user: { role: string; permissions?: string[] }): FabAction[] {
  const u = user as Parameters<typeof can.createJob>[0];
  if (!can.createJob(u)) return [];
  return [{
    label: "New Job",
    href: "/jobs/new",
    color: "bg-[var(--accent)]",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="black"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5"  y1="12" x2="19" y2="12"/>
      </svg>
    ),
  }];
}

// Mobile speed-dial: New Job + AI Guide
function buildSpeedDialActions(
  user: { role: string; permissions?: string[] },
  enabledModules?: { has(value: "REPORTS"): boolean },
): SpeedDialAction[] {
  const u = user as Parameters<typeof can.createJob>[0];
  const actions: SpeedDialAction[] = [];
  if (can.viewAccountsSummary(u) && (!enabledModules || enabledModules.has("REPORTS"))) {
    actions.push({
      label: "AI Guide",
      href: "/ai-insights",
      color: "bg-[var(--panel)] border border-[var(--line)] text-[var(--accent)]",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 0 2h-1v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1H1a1 1 0 0 1 0-2h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
          <path d="M8 12h.01M16 12h.01" />
        </svg>
      ),
    });
  }
  if (can.createJob(u)) {
    actions.push({
      label: "New Job",
      href: "/jobs/new",
      color: "bg-[var(--accent)]",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="black"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5"  y1="12" x2="19" y2="12"/>
        </svg>
      ),
    });
  }
  return actions;
}
