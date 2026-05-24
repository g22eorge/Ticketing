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
  const pageSize = 20;
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

  const whereBase = {
    orgId,
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
      externalTechBill: getExternalTechBill(job),
      clientBill: getClientBill(job),
      workflowReason: withWorkflow.workflowReason ?? null,
    };
  });

  const preserved = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => typeof value === "string" && value.length > 0),
  ) as Record<string, string>;
  const returnToQuery = new URLSearchParams(preserved).toString();
  const returnTo = returnToQuery ? `/jobs?${returnToQuery}` : "/jobs";

  const hasAdvancedFilters = Boolean(filters.deviceType || filters.repairPath || filters.pricing || filters.from || filters.to || sort === "job_number_desc");
  const hasAnyFilter = Boolean(filters.q || filters.status || hasAdvancedFilters);
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

  return (
    <div className="space-y-4 pb-[calc(env(safe-area-inset-bottom)+5.25rem)] sm:pb-4">

      {/* ── FAB: New Job — mobile only ── */}
      {can.createJob(user) ? (
        <Link
          href="/jobs/new"
          className="jobs-fab fixed bottom-[calc(env(safe-area-inset-bottom)+3.25rem)] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[0_4px_20px_rgba(212,175,55,0.45)] transition-transform sm:hidden"
          aria-label="New Job"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </Link>
      ) : null}

      {/* ── External tech notice ── */}
      {isExternalTech ? (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--accent)]/25 bg-[var(--accent)]/8 px-3 py-2 text-xs text-[var(--accent)]">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm0 2.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5ZM7.25 6h1.5v5h-1.5V6Z"/>
          </svg>
          Diagnosis and timeline updates are available inside each work order.
        </div>
      ) : null}

      {/* ── Filter bar ── */}
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
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
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
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
              className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                statusValue ? "border-[var(--line)] bg-[var(--panel)] text-[var(--ink-muted)] hover:border-[var(--accent)]/30" : "border-[var(--accent)] bg-[var(--accent)] text-white"
              }`}
            >
              All
            </Link>
            {UI_JOB_STATUSES.map((s) => (
              <Link
                key={s}
                href={statusChipHref(s)}
                className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                  statusValue === s ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)] bg-[var(--panel)] text-[var(--ink-muted)] hover:border-[var(--accent)]/30"
                }`}
              >
                {statusOptionLabel[s]}
              </Link>
            ))}
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
          <p className="border-t border-[var(--line)] bg-[var(--accent)]/5 px-3 py-1.5 text-[11px] text-[var(--accent)]">
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
        <div className="panel-shadow flex flex-col items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] py-14 text-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-8 w-8 text-[var(--ink-muted)]/40" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
          </svg>
          <p className="text-sm font-medium text-[var(--ink-muted)]">No jobs match the current filters</p>
          {hasAnyFilter && (
            <Link href="/jobs" className="mt-1 text-xs text-[var(--accent)] underline-offset-2 hover:underline">Clear filters</Link>
          )}
        </div>
      ) : (
        <JobTable
          jobs={rows}
          role={user.role}
          permissions={user.permissions}
          canDelete={user.role === "ADMIN"}
          deleteAction={deleteJobAction}
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
