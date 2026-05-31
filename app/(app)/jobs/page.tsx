export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { SearchToggle } from "@/components/shared/SearchToggle";
import { JobTable, JobRow } from "@/components/jobs/JobTable";
import { JobBoardView } from "@/components/jobs/JobBoardView";
import { UI_JOB_STATUSES, JobStatus, normalizeJobStatus } from "@/lib/job-status";
import { filterSupportedJobStatuses } from "@/lib/job-status-server";
import { getClientBill, getExternalTechBill } from "@/lib/billing";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";

type SearchParams = {
  status?: string;
  pricing?: string;
  payout?: string;
  deviceType?: string;
  repairPath?: string;
  assignedToId?: string;
  q?: string;
  from?: string;
  to?: string;
  dateField?: "receivedAt" | "completedAt";
  page?: string;
  sort?: string;
  view?: string;
  adv?: string;
  overdue?: string;
  mine?: string;
};

type JobWithClient = Prisma.JobGetPayload<{
  include: { client: true; assignedTo: true; device: true };
}> & {
  oneTimeExternalAssignment?: { technicianName: string } | null;
};
type JobWithoutClient = Prisma.JobGetPayload<{
  include: { assignedTo: true; device: true };
}> & {
  oneTimeExternalAssignment?: { technicianName: string } | null;
};

const supportsOneTimeExternal = Boolean(
  Prisma.dmmf.datamodel.models
    .find((model) => model.name === "Job")
    ?.fields.some((field) => field.name === "oneTimeExternalAssignment"),
);

const statusOptionLabel: Record<ReturnType<typeof normalizeJobStatus>, string> = {
  RECEIVED: "Received",
  DIAGNOSING: "Diagnosing",
  REFERRED: "Referred",
  AWAITING_APPROVAL: "Awaiting Approval",
  IN_REPAIR: "In Repair",
  READY_FOR_PICKUP: "Ready for Pickup",
  COMPLETED: "Completed",
  CLOSED: "Closed",
};

const UI_TO_DB_STATUSES: Record<ReturnType<typeof normalizeJobStatus>, JobStatus[]> = {
  RECEIVED: ["RECEIVED"],
  DIAGNOSING: ["DIAGNOSING"],
  REFERRED: ["REFERRED", "PENDING_EXTERNAL_ASSIGNMENT", "ASSIGNED_ONE_TIME_EXTERNAL"],
  AWAITING_APPROVAL: ["AWAITING_APPROVAL"],
  IN_REPAIR: ["IN_REPAIR", "IN_EXTERNAL_REPAIR", "WAITING_FOR_PARTS", "RETURNED_FROM_EXTERNAL"],
  READY_FOR_PICKUP: ["READY_FOR_PICKUP"],
  COMPLETED: ["COMPLETED", "DELIVERED"],
  CLOSED: ["CLOSED"],
};

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { session, user, orgId } = await requireOrgSession();
  const filters = await searchParams;
  const q = (filters.q ?? "").trim();
  const statusValueRaw = (filters.status ?? "").split(",")[0]?.trim() ?? "";
  const statusValue = (UI_JOB_STATUSES as readonly string[]).includes(statusValueRaw) ? statusValueRaw : "";
  const statuses = (filters.status ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const uiStatuses = statuses.filter((status) => (UI_JOB_STATUSES as readonly string[]).includes(status));
  const dbStatusesRaw = uiStatuses.length
    ? Array.from(
        new Set(
          uiStatuses.flatMap((status) => UI_TO_DB_STATUSES[status as ReturnType<typeof normalizeJobStatus>] ?? []),
        ),
      )
    : [];

  const dbStatuses = filterSupportedJobStatuses(dbStatusesRaw) as JobStatus[];
  const pricingFilter = filters.pricing === "needs" || filters.pricing === "priced" ? filters.pricing : "";
  const payoutFilter = filters.payout === "due" || filters.payout === "paid" ? filters.payout : "";
  const page = Math.max(Number(filters.page ?? "1") || 1, 1);
  // Mobile gets a large batch for continuous scroll; desktop uses pages
  const pageSize = 60;
  const sort = filters.sort === "job_number_desc" ? "job_number_desc" : "received_desc";
  const orderBy = sort === "job_number_desc" ? { jobNumber: "desc" as const } : { receivedAt: "desc" as const };
  const internalCanSearchAll =
    user.role === "TECHNICIAN_INTERNAL"
    && (can.searchJobs(user) || can.approveInvoices(user));

  const assignedScopeFilter =
    filters.assignedToId === "unassigned"
      ? { assignedToId: null as string | null }
      : filters.assignedToId
        ? { assignedToId: filters.assignedToId }
        : {};

  const roleScopeFilter =
    user.role === "TECHNICIAN_EXTERNAL" || (user.role === "TECHNICIAN_INTERNAL" && !internalCanSearchAll)
      ? { assignedToId: session.user.id }
      : {};

  // "Mine" chip — filter to jobs assigned to the current user
  const mineFilter = filters.mine === "1" ? { assignedToId: session.user.id } : {};

  const whereBase = {
    orgId,
    ...mineFilter,
    ...(dbStatuses.length > 0 ? { status: { in: dbStatuses } } : {}),
    ...(pricingFilter === "needs"
      ? {
          clientBill: null,
        status: { in: ["AWAITING_APPROVAL", "IN_REPAIR", "READY_FOR_PICKUP"] as JobStatus[] },
        }
      : pricingFilter === "priced"
        ? { clientBill: { not: null } }
        : {}),
    ...(payoutFilter === "due"
      ? {
          repairPath: "EXTERNAL" as const,
          clientBill: { not: null },
          externalPaid: false,
          status: { in: ["DELIVERED", "COMPLETED"] as JobStatus[] },
        }
      : payoutFilter === "paid"
        ? {
            repairPath: "EXTERNAL" as const,
            externalPaid: true,
            status: { in: ["DELIVERED", "COMPLETED"] as JobStatus[] },
          }
        : {}),
    ...(filters.deviceType ? { device: { deviceType: filters.deviceType as never } } : {}),
    ...(filters.repairPath ? { repairPath: filters.repairPath as never } : {}),
    ...(filters.from || filters.to
      ? {
          [filters.dateField === "completedAt" ? "completedAt" : "receivedAt"]: {
            ...(filters.from ? { gte: new Date(filters.from) } : {}),
            ...(filters.to ? { lte: new Date(filters.to) } : {}),
          },
        }
      : {}),
    ...(filters.overdue === "1"
      ? {
          receivedAt: { lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          status: { notIn: filterSupportedJobStatuses(["COMPLETED", "CLOSED", "DELIVERED"]) as JobStatus[] },
        }
      : {}),
    ...assignedScopeFilter,
    ...roleScopeFilter,
  };

  const where =
    user.role === "TECHNICIAN_EXTERNAL"
      ? {
          ...whereBase,
          ...(q
            ? {
                OR: [
                  { jobNumber: { contains: q } },
                  // External techs can still search by device details.
                  { brand: { contains: q } },
                  { model: { contains: q } },
                  { device: { brand: { contains: q } } },
                  { device: { model: { contains: q } } },
                  { serialOrImei: { contains: q } },
                ],
              }
            : {}),
        }
      : {
          ...whereBase,
          ...(q
            ? {
                OR: [
                  { jobNumber: { contains: q } },
                  { client: { fullName: { contains: q } } },
                  { client: { phone: { contains: q } } },
                  // Support both the legacy Job.brand/model fields and the newer Device relation.
                  { brand: { contains: q } },
                  { model: { contains: q } },
                  { device: { brand: { contains: q } } },
                  { device: { model: { contains: q } } },
                  { serialOrImei: { contains: q } },
                  { issueDescription: { contains: q } },
                ],
              }
            : {}),
        };

  const includeBase =
    user.role === "TECHNICIAN_EXTERNAL"
      ? ({ assignedTo: true, device: true } as const)
      : ({ client: true, assignedTo: true, device: true } as const);

  const includeWithOneTime = supportsOneTimeExternal
    ? ({
        ...includeBase,
        oneTimeExternalAssignment: { select: { technicianName: true } },
      } as const)
    : includeBase;

  let jobs: Array<JobWithClient | JobWithoutClient> = [];
  let total = 0;

  try {
    const jobsResult = await prisma.job.findMany({
      where,
      include: includeWithOneTime,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const totalResult = await prisma.job.count({ where });
    jobs = jobsResult as Array<JobWithClient | JobWithoutClient>;
    total = totalResult;
  } catch (error) {
    console.error("[jobs] failed to load jobs list", error);
    const bareJobs = await prisma.job.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const clientIds = Array.from(
      new Set(bareJobs.map((job) => job.clientId).filter((id): id is string => Boolean(id))),
    );
    const assigneeIds = Array.from(
      new Set(bareJobs.map((job) => job.assignedToId).filter((id): id is string => Boolean(id))),
    );
    const deviceIds = Array.from(
      new Set(bareJobs.map((job) => job.deviceId).filter((id): id is string => Boolean(id))),
    );

    const [clientRows, assigneeRows, deviceRows] = await Promise.all([
      prisma.client.findMany({
        where: { id: { in: clientIds } },
        select: { id: true, fullName: true },
      }),
      prisma.user.findMany({
        where: { id: { in: assigneeIds } },
        select: { id: true, name: true },
      }),
      prisma.device.findMany({
        where: { id: { in: deviceIds } },
        select: { id: true, deviceType: true, brand: true, model: true },
      }),
    ]);

    const clientMap = new Map(clientRows.map((client) => [client.id, client]));
    const assigneeMap = new Map(assigneeRows.map((assignee) => [assignee.id, assignee]));
    const deviceMap = new Map(deviceRows.map((device) => [device.id, device]));

    jobs = bareJobs.map((job) => ({
      ...job,
      client: clientMap.get(job.clientId),
      assignedTo: job.assignedToId ? assigneeMap.get(job.assignedToId) : null,
      device: job.deviceId ? deviceMap.get(job.deviceId) : undefined,
      oneTimeExternalAssignment: null,
    })) as Array<JobWithClient | JobWithoutClient>;

    try {
      total = await prisma.job.count({ where });
    } catch {
      total = bareJobs.length;
    }
  }

  // Status counts for mobile chip labels
  const statusCountsRaw = await prisma.job.groupBy({
    by: ["status"],
    where: { orgId, ...roleScopeFilter },
    _count: { status: true },
  }).catch(() => [] as Array<{ status: string; _count: { status: number } }>);

  // Build map from DB status → count, then aggregate into UI statuses
  const dbStatusCountMap = new Map<string, number>(
    statusCountsRaw.map((r) => [r.status, r._count.status]),
  );
  const uiStatusCountMap = new Map<string, number>();
  for (const [uiStatus, dbStatusList] of Object.entries(UI_TO_DB_STATUSES)) {
    const total = dbStatusList.reduce((sum, s) => sum + (dbStatusCountMap.get(s) ?? 0), 0);
    if (total > 0) uiStatusCountMap.set(uiStatus, total);
  }

  const isBoard = filters.view === "board";

  // Board view: load all active jobs (up to 200) without pagination.
  let boardRows: JobRow[] = [];
  if (isBoard) {
    const boardActiveDbStatuses = uiStatuses.length
      ? dbStatuses
      : (filterSupportedJobStatuses([
          "RECEIVED", "DIAGNOSING", "REFERRED",
          "PENDING_EXTERNAL_ASSIGNMENT", "ASSIGNED_ONE_TIME_EXTERNAL",
          "AWAITING_APPROVAL", "IN_REPAIR",
          "IN_EXTERNAL_REPAIR", "WAITING_FOR_PARTS", "RETURNED_FROM_EXTERNAL",
        ]) as JobStatus[]);
    const boardWhere = { ...where, status: { in: boardActiveDbStatuses } };
    const rawBoard = await prisma.job.findMany({ where: boardWhere, include: includeWithOneTime, orderBy: { receivedAt: "desc" }, take: 200 });
    const fallbackFields = (j: (typeof rawBoard)[0]) => j as typeof j & { deviceType?: string; brand?: string | null; model?: string | null };
    boardRows = rawBoard.map((job) => ({
      id: job.id,
      jobNumber: job.jobNumber,
      status: job.status,
      deviceType: job.device?.deviceType ?? fallbackFields(job).deviceType ?? "OTHER",
      brand: job.device?.brand ?? fallbackFields(job).brand ?? "",
      model: job.device?.model ?? fallbackFields(job).model ?? "",
      clientName: "client" in job ? (job as { client?: { fullName?: string } }).client?.fullName : undefined,
      assignedTo: job.assignedTo?.name ?? (job as { oneTimeExternalAssignment?: { technicianName: string } }).oneTimeExternalAssignment?.technicianName,
      receivedAt: job.receivedAt,
      externalTechBill: getExternalTechBill(job),
      clientBill: getClientBill(job),
      workflowReason: (job as { workflowReason?: JobRow["workflowReason"] }).workflowReason ?? null,
    }));
  }

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const pageStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, total);
  const prevPage = Math.max(page - 1, 1);
  const nextPage = Math.min(page + 1, totalPages);
  const isPrevDisabled = page <= 1;
  const isNextDisabled = page >= totalPages;
  const isExternalTech = user.role === "TECHNICIAN_EXTERNAL";
  const lookupByPhone = can.viewClientInfo(user);

  async function deleteJobAction(formData: FormData) {
    "use server";
    const { user, orgId: deleteOrgId } = await requireOrgSession();
    if (user.role !== "ADMIN") redirect("/dashboard");
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await prisma.job.delete({ where: { id, orgId: deleteOrgId } });
    revalidatePath("/jobs");
  }

  // Quick-advance action: tap button on card → advance to DIAGNOSING without opening job
  async function quickAdvanceAction(formData: FormData) {
    "use server";
    const { user: u, orgId: qOrgId } = await requireOrgSession();
    if (!can.editDiagnosis(u)) return;
    const jobId = String(formData.get("jobId") ?? "").trim();
    const toStatus = String(formData.get("toStatus") ?? "").trim() as JobStatus;
    if (!jobId || !toStatus) return;
    const job = await prisma.job.findFirst({ where: { id: jobId, orgId: qOrgId }, select: { id: true, status: true, updatedAt: true } });
    if (!job) return;
    await prisma.job.update({ where: { id: jobId }, data: { status: toStatus, updatedAt: new Date() } });
    await prisma.auditLog.create({ data: { orgId: qOrgId, jobId, userId: u.id, action: "STATUS_CHANGED", detail: JSON.stringify({ from: job.status, to: toStatus, source: "quick_advance" }) } }).catch(() => {});
    revalidatePath("/jobs");
  }

  const rows: JobRow[] = jobs.map((job) => {
    const withWorkflow = job as typeof job & { workflowReason?: JobRow["workflowReason"] };
    const fallbackFields = job as typeof job & {
      deviceType?: string;
      brand?: string | null;
      model?: string | null;
    };
    return {
      id: job.id,
      jobNumber: job.jobNumber,
      status: job.status,
      deviceType: job.device?.deviceType ?? fallbackFields.deviceType ?? "OTHER",
      brand: job.device?.brand ?? fallbackFields.brand ?? "",
      model: job.device?.model ?? fallbackFields.model ?? "",
      clientName: "client" in job ? job.client?.fullName : undefined,
      assignedTo: job.assignedTo?.name ?? job.oneTimeExternalAssignment?.technicianName,
      receivedAt: job.receivedAt,
      updatedAt: job.updatedAt,
      externalTechBill: getExternalTechBill(job),
      clientBill: getClientBill(job),
      repairTimeline: (job as typeof job & { repairTimeline?: string | null }).repairTimeline ?? null,
      workflowReason: withWorkflow.workflowReason ?? null,
    };
  });

  const preserved = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => typeof value === "string" && value.length > 0),
  ) as Record<string, string>;
  const returnToQuery = new URLSearchParams(preserved).toString();
  const returnTo = returnToQuery ? `/jobs?${returnToQuery}` : "/jobs";

  const hasAdvancedFilters = Boolean(filters.deviceType || filters.repairPath || filters.pricing || filters.from || filters.to || sort === "job_number_desc");
  const hasAnyFilter = Boolean(filters.q || filters.status || filters.overdue || hasAdvancedFilters);
  const showAdv = filters.adv === "1" || hasAdvancedFilters;

  const ctrlClass = "rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] text-[var(--ink)] outline-none transition focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/14";

  const preservedWithoutStatus = Object.fromEntries(
    Object.entries(preserved).filter(([key]) => key !== "status" && key !== "page"),
  ) as Record<string, string>;
  function statusChipHref(nextStatus: string) {
    const params = new URLSearchParams(preservedWithoutStatus);
    if (nextStatus) params.set("status", nextStatus);
    const query = params.toString();
    return query ? `/jobs?${query}` : "/jobs";
  }

  const advToggleHref = (() => {
    const params = new URLSearchParams(preserved);
    if (filters.adv === "1") params.delete("adv"); else params.set("adv", "1");
    const qs = params.toString();
    return qs ? `/jobs?${qs}` : "/jobs";
  })();

  const overdueChipHref = (() => {
    const params = new URLSearchParams(Object.fromEntries(
      Object.entries(preserved).filter(([k]) => k !== "page" && k !== "overdue"),
    ));
    if (filters.overdue !== "1") params.set("overdue", "1");
    const qs = params.toString();
    return qs ? `/jobs?${qs}` : "/jobs";
  })();

  return (
    <div className="space-y-4 pb-[calc(env(safe-area-inset-bottom)+5.25rem)] sm:pb-4">

      {/* ── New Job shortcut — desktop only; mobile uses Quick Actions on home ── */}
      {can.createJob(user) ? (
        <Link href="/jobs/new" className="hidden" aria-label="New Job" />
      ) : null}

      {/* ═══ MOBILE header + chips ═══════════════════════════════════════ */}
      <div className="sm:hidden -mx-4 px-4">

        {/* Row 1: title + count */}
        <div className="flex items-center gap-2 pb-3">
          <h2 className="text-[18px] font-black tracking-tight text-[var(--ink)]">Repairs</h2>
          {total > 0 && (
            <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[13px] font-black text-black">
              {total}
            </span>
          )}
        </div>

        {/* Row 2: Always-visible search bar */}
        <form method="GET" action="/jobs" className="mb-3 flex items-center gap-2">
          {filters.status ? <input type="hidden" name="status" value={filters.status} /> : null}
          {filters.view ? <input type="hidden" name="view" value={filters.view} /> : null}
          {filters.deviceType ? <input type="hidden" name="deviceType" value={filters.deviceType} /> : null}
          {filters.repairPath ? <input type="hidden" name="repairPath" value={filters.repairPath} /> : null}
          {filters.pricing ? <input type="hidden" name="pricing" value={filters.pricing} /> : null}
          {sort !== "received_desc" ? <input type="hidden" name="sort" value={sort} /> : null}
          {filters.from ? <input type="hidden" name="from" value={filters.from} /> : null}
          {filters.to ? <input type="hidden" name="to" value={filters.to} /> : null}
          <div className="relative flex-1">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]/50" aria-hidden="true">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="search"
              name="q"
              defaultValue={filters.q}
              placeholder={isExternalTech ? "Search job #…" : lookupByPhone ? "Name, phone or job #…" : "Search job #…"}
              className="h-10 w-full rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] pl-9 pr-4 text-[13px] text-[var(--ink)] placeholder:text-[var(--ink-muted)]/50 outline-none focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/14"
            />
            {filters.q ? (
              <a href={`/jobs?${new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([k]) => k !== "q") as [string,string][])).toString()}`} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]/50 hover:text-[var(--ink-muted)]" aria-label="Clear search">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </a>
            ) : null}
          </div>
          {/* Filter toggle — desktop only; chips handle mobile filtering */}
          {!isExternalTech ? (
            <Link
              href={advToggleHref}
              aria-label="Filters"
              className={`relative hidden lg:flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition ${
                hasAdvancedFilters
                  ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent)]"
                  : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
              </svg>
              {hasAdvancedFilters ? (
                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              ) : null}
            </Link>
          ) : null}
        </form>

        {/* Row 3: 5 key status chips — equal grid, always fits screen */}
        {(() => {
          const isMine = filters.mine === "1";
          const mineHref = isMine ? statusChipHref("") : (() => {
            const p = new URLSearchParams(preservedWithoutStatus);
            p.set("mine", "1"); p.delete("status");
            return `/jobs?${p.toString()}`;
          })();
          const KEY_CHIPS = [
            { href: statusChipHref(""),                  label: "All",      count: total ?? 0,                                     active: !statusValue && !isMine },
            { href: mineHref,                            label: "Mine",     count: null,                                           active: isMine                  },
            { href: statusChipHref("AWAITING_APPROVAL"), label: "Awaiting", count: uiStatusCountMap.get("AWAITING_APPROVAL") ?? 0,  active: statusValue === "AWAITING_APPROVAL" },
            { href: statusChipHref("IN_REPAIR"),         label: "In Repair",count: uiStatusCountMap.get("IN_REPAIR") ?? 0,          active: statusValue === "IN_REPAIR" },
            { href: statusChipHref("READY_FOR_PICKUP"),  label: "Ready",    count: uiStatusCountMap.get("READY_FOR_PICKUP") ?? 0,   active: statusValue === "READY_FOR_PICKUP" },
          ];
          return (
            <div className="grid grid-cols-5 gap-1.5 pb-2">
              {KEY_CHIPS.map(({ href, label, count, active }) => (
                <Link key={label} href={href}
                  className={`rounded-full px-1 py-1.5 text-center text-[11px] font-bold transition ${
                    active
                      ? "bg-[var(--accent)] text-black"
                      : "border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]"
                  }`}
                >
                  {label}{count !== null && count > 0 && !active ? ` ${count}` : ""}
                </Link>
              ))}
            </div>
          );
        })()}

        {/* Advanced filters — desktop only (chips handle mobile) */}
        {showAdv ? (
          <form method="GET" className="mb-3 hidden lg:block overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] divide-y divide-[var(--line)]">
            {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}
            {filters.status ? <input type="hidden" name="status" value={filters.status} /> : null}
            <input type="hidden" name="adv" value="1" />
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-[13px] font-medium text-[var(--ink-muted)]">Device</span>
              <select name="deviceType" defaultValue={filters.deviceType}
                className="border-0 bg-transparent text-right text-[13px] font-semibold text-[var(--ink)] outline-none">
                <option value="">All</option>
                <option value="PHONE_ANDROID">Android</option>
                <option value="PHONE_IPHONE">iPhone</option>
                <option value="TABLET">Tablet</option>
                <option value="WINDOWS_PC">Windows PC</option>
                <option value="MAC">Mac</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-[13px] font-medium text-[var(--ink-muted)]">Path</span>
              <select name="repairPath" defaultValue={filters.repairPath}
                className="border-0 bg-transparent text-right text-[13px] font-semibold text-[var(--ink)] outline-none">
                <option value="">All</option>
                <option value="IN_HOUSE">In-house</option>
                <option value="EXTERNAL">External</option>
              </select>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-[13px] font-medium text-[var(--ink-muted)]">Sort</span>
              <select name="sort" defaultValue={sort}
                className="border-0 bg-transparent text-right text-[13px] font-semibold text-[var(--ink)] outline-none">
                <option value="received_desc">Newest first</option>
                <option value="job_number_desc">Job # desc</option>
              </select>
            </div>
            {!isExternalTech && can.approveInvoices(user) ? (
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-[13px] font-medium text-[var(--ink-muted)]">Pricing</span>
                <select name="pricing" defaultValue={pricingFilter}
                  className="border-0 bg-transparent text-right text-[13px] font-semibold text-[var(--ink)] outline-none">
                  <option value="">All</option>
                  <option value="needs">Needs pricing</option>
                  <option value="priced">Priced</option>
                </select>
              </div>
            ) : null}
            {/* Footer: Apply + optional Clear */}
            <div className="flex items-center gap-3 px-4 py-2.5">
              <button type="submit" className="btn-premium rounded-xl px-5 py-1.5 text-[13px] font-semibold">Apply</button>
              {hasAdvancedFilters && (
                <Link href="/jobs?adv=1" className="text-[13px] font-medium text-[var(--ink-muted)]">Clear</Link>
              )}
            </div>
          </form>
        ) : null}

      </div>
      {/* ═══ END mobile header ═══════════════════════════════════════════ */}

      {/* ── External tech notice ── */}
      {isExternalTech ? (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--accent)]/25 bg-[var(--accent)]/8 px-3 py-2 text-xs text-[var(--accent)]">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm0 2.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5ZM7.25 6h1.5v5h-1.5V6Z"/>
          </svg>
          Diagnosis and timeline updates are available inside each work order.
        </div>
      ) : null}

      {/* ── Desktop filter bar (hidden on mobile) ── */}
      <div className="panel-shadow hidden overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] lg:block">
        {/* Row: view toggle | status chips | actions */}
        <div className="flex items-center gap-2 px-3 py-2">
          {/* View toggle */}
          <div className="hidden items-center rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-0.5 sm:flex">
            {(["table", "board"] as const).map((v) => {
              const active = v === (isBoard ? "board" : "table");
              const params = new URLSearchParams({ ...preserved, view: v === "table" ? "" : v });
              if (v === "table") params.delete("view");
              return (
                <Link
                  key={v}
                  href={`/jobs?${params.toString()}`}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-semibold transition ${
                    active ? "bg-[var(--panel)] text-[var(--ink)] shadow-sm" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  {v === "table" ? (
                    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3" aria-hidden="true">
                      <path d="M0 3a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1V3zm0 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1V8zm1 4a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H1z"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3" aria-hidden="true">
                      <path d="M1 2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2zm5 0a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V2zm5 0a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V2z"/>
                    </svg>
                  )}
                  {v === "table" ? "Table" : "Board"}
                </Link>
              );
            })}
          </div>

          {/* Status chips — scrollable */}
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
            <Link
              href={statusChipHref("")}
              className={`shrink-0 rounded-full border px-3 py-1 text-[13px] font-semibold transition ${
                statusValue ? "border-[var(--line)] bg-[var(--panel)] text-[var(--ink-muted)] hover:border-[var(--accent)]/30" : "border-[var(--accent)] bg-[var(--accent)] text-black"
              }`}
            >
              All
            </Link>
            {UI_JOB_STATUSES.map((s) => (
              <Link
                key={s}
                href={statusChipHref(s)}
                className={`shrink-0 rounded-full border px-3 py-1 text-[13px] font-semibold transition ${
                  statusValue === s ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)] bg-[var(--panel)] text-[var(--ink-muted)] hover:border-[var(--accent)]/30"
                }`}
              >
                {statusOptionLabel[s]}
              </Link>
            ))}
            <div className="mx-1 h-4 w-px shrink-0 bg-[var(--line)]" aria-hidden="true" />
            <Link
              href={overdueChipHref}
              className={`shrink-0 rounded-full border px-3 py-1 text-[13px] font-semibold transition ${
                filters.overdue === "1"
                  ? "border-red-500 bg-red-500/10 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-400"
                  : "border-[var(--line)] bg-[var(--panel)] text-[var(--ink-muted)] hover:border-red-400/50 hover:text-red-600"
              }`}
            >
              Overdue 7+d
            </Link>
          </div>

          {/* Right actions */}
          <div className="flex shrink-0 items-center gap-1.5">
            <SearchToggle
              basePath="/jobs"
              defaultValue={filters.q}
              placeholder={isExternalTech ? "Search job #" : lookupByPhone ? "Search job #, name, phone…" : "Search job #…"}
              preserve={{
                status: filters.status,
                view: filters.view,
                deviceType: filters.deviceType,
                repairPath: filters.repairPath,
                pricing: filters.pricing,
                sort: sort !== "received_desc" ? sort : undefined,
                from: filters.from,
                to: filters.to,
              }}
            />
            {!isExternalTech ? (
              <Link
                href={advToggleHref}
                aria-label="Toggle advanced filters"
                className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition ${
                  hasAdvancedFilters
                    ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--ink)]"
                }`}
              >
                <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
                  <path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                {hasAdvancedFilters ? <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--accent)]" /> : null}
              </Link>
            ) : null}
            {can.createJob(user) ? (
              <Link href="/jobs/new" className="btn-premium hidden rounded-lg px-3 py-1.5 text-[13px] font-semibold sm:inline-flex">
                + New Job
              </Link>
            ) : null}
          </div>
        </div>

        {/* Advanced filters — only when toggled or active */}
        {showAdv ? (
          <form className={`border-t border-[var(--line)] bg-[var(--panel-strong)]/40 p-3 grid grid-cols-2 gap-2 sm:grid-cols-3 ${
            !isExternalTech && can.approveInvoices(user) ? "lg:grid-cols-6" : "lg:grid-cols-5"
          }`}>
            {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}
            {filters.status ? <input type="hidden" name="status" value={filters.status} /> : null}
            {filters.view ? <input type="hidden" name="view" value={filters.view} /> : null}
            <select name="deviceType" defaultValue={filters.deviceType} className={ctrlClass}>
              <option value="">All devices</option>
              <option value="PHONE_ANDROID">Android Phone</option>
              <option value="PHONE_IPHONE">iPhone</option>
              <option value="TABLET">Tablet</option>
              <option value="WINDOWS_PC">Windows PC</option>
              <option value="MAC">Mac</option>
              <option value="OTHER">Other</option>
            </select>
            <select name="repairPath" defaultValue={filters.repairPath} className={ctrlClass}>
              <option value="">All paths</option>
              <option value="IN_HOUSE">In-house</option>
              <option value="EXTERNAL">External</option>
            </select>
            {!isExternalTech && can.approveInvoices(user) ? (
              <select name="pricing" defaultValue={pricingFilter} className={ctrlClass}>
                <option value="">All pricing</option>
                <option value="needs">Needs pricing</option>
                <option value="priced">Priced</option>
              </select>
            ) : null}
            <select name="sort" defaultValue={sort} className={ctrlClass}>
              <option value="received_desc">Newest first</option>
              <option value="job_number_desc">Job # desc</option>
            </select>
            <input type="date" name="from" defaultValue={filters.from} className={ctrlClass} />
            <input type="date" name="to" defaultValue={filters.to} className={ctrlClass} />
            {filters.dateField ? <input type="hidden" name="dateField" value={filters.dateField} /> : null}
            <div className="col-span-2 flex items-center gap-2 sm:col-span-3 lg:col-span-full">
              <button type="submit" className="btn-premium-secondary rounded-lg px-3 py-1.5 text-[13px]">Apply</button>
              {hasAnyFilter ? <Link href="/jobs" className="text-[13px] text-[var(--ink-muted)] hover:text-[var(--ink)]">Reset</Link> : null}
            </div>
          </form>
        ) : null}
        {filters.dateField === "completedAt" && (filters.from || filters.to) ? (
          <p className="border-t border-[var(--line)] bg-[var(--accent)]/5 px-3 py-1.5 text-[13px] text-[var(--accent)]">
            Date range is filtering by <strong>completion date</strong>.
          </p>
        ) : null}
      </div>

      {/* ── Results ── */}
      {isBoard ? (
        boardRows.length === 0 ? (
          <div className="panel-shadow flex flex-col items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] py-14 text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-8 w-8 text-[var(--ink-muted)]/40" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
            </svg>
            <p className="text-sm font-medium text-[var(--ink-muted)]">No active jobs found</p>
            {hasAnyFilter && (
              <Link href="/jobs?view=board" className="mt-1 text-xs text-[var(--accent)] underline-offset-2 hover:underline">Clear filters</Link>
            )}
          </div>
        ) : (
          <JobBoardView jobs={boardRows} showClient={!isExternalTech} />
        )
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--panel)] py-16 text-center">
          <span className="text-4xl opacity-25">🔧</span>
          <p className="text-[14px] font-semibold text-[var(--ink-muted)]">No repairs found</p>
          <p className="text-[12px] text-[var(--ink-muted)]/60">
            {hasAnyFilter ? "Try a different status or clear filters" : "New jobs will appear here"}
          </p>
          {hasAnyFilter && (
            <Link href="/jobs" className="mt-1 inline-flex rounded-full border border-[var(--accent)]/40 px-4 py-1.5 text-[12px] font-semibold text-[var(--accent)]">
              Clear filters
            </Link>
          )}
        </div>
      ) : (
        <JobTable
          jobs={rows}
          role={user.role}
          permissions={user.permissions}
          canDelete={user.role === "ADMIN"}
          deleteAction={deleteJobAction}
          quickAdvanceAction={can.editDiagnosis(user) ? quickAdvanceAction : undefined}
          returnTo={returnTo}
          pageStart={pageStart}
          pageEnd={pageEnd}
          total={total}
          page={page}
          totalPages={totalPages}
          isPrevDisabled={isPrevDisabled}
          isNextDisabled={isNextDisabled}
          prevPageHref={`?${new URLSearchParams({ ...preserved, page: String(prevPage) }).toString()}`}
          nextPageHref={`?${new URLSearchParams({ ...preserved, page: String(nextPage) }).toString()}`}
        />
      )}
    </div>
  );
}
