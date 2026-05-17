import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { requireModule, OrgModule } from "@/lib/module-access";
import type { ComplaintStatus } from "@prisma/client";
import {
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_STATUS_STYLES,
  COMPLAINT_STATUSES,
  SLA_HOURS,
} from "@/lib/complaints";
import { RowActionsMenu, MenuSection } from "@/components/shared/RowActionsMenu";

export const dynamic = "force-dynamic";

const STATUSES = COMPLAINT_STATUSES as unknown as ComplaintStatus[];
const ALLOWED_ROLES = ["ADMIN", "MANAGER", "TECH_MANAGER", "OPS"] as const;

export default async function ComplaintsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  await requireModule(OrgModule.COMPLAINTS);
  const { user, orgId } = await requireOrgSession();
  if (!(ALLOWED_ROLES as readonly string[]).includes(user.role)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const filterStatus = STATUSES.includes(params.status as ComplaintStatus)
    ? (params.status as ComplaintStatus)
    : null;

  async function updateStatusAction(formData: FormData) {
    "use server";
    const { user, orgId } = await requireOrgSession();
    if (!(ALLOWED_ROLES as readonly string[]).includes(user.role)) return;

    const id = String(formData.get("id") ?? "");
    const status = String(formData.get("status") ?? "") as ComplaintStatus;
    const resolution = String(formData.get("resolution") ?? "").trim();
    const internalNotes = String(formData.get("internalNotes") ?? "").trim();

    if (!id || !STATUSES.includes(status)) return;

    const now = new Date();
    await prisma.complaint.updateMany({
      where: { id, orgId },
      data: {
        status,
        ...(resolution ? { resolution } : {}),
        ...(internalNotes ? { internalNotes } : {}),
        ...(status === "ACKNOWLEDGED" ? { acknowledgedAt: now } : {}),
        ...(status === "INVESTIGATING" ? { investigatingAt: now } : {}),
        ...(status === "RESOLVED" ? { resolvedAt: now } : {}),
        ...(status === "CLOSED" ? { closedAt: now } : {}),
      },
    });
    revalidatePath("/complaints");
  }

  const [complaints, counts] = await Promise.all([
    prisma.complaint.findMany({
      where: {
        orgId,
        ...(filterStatus ? { status: filterStatus } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        complaintNumber: true,
        status: true,
        category: true,
        channel: true,
        clientName: true,
        clientPhone: true,
        description: true,
        resolution: true,
        internalNotes: true,
        acknowledgedAt: true,
        resolvedAt: true,
        closedAt: true,
        createdAt: true,
        job: { select: { id: true, jobNumber: true } },
      },
    }).catch(() => [] as never[]),
    prisma.complaint.groupBy({
      by: ["status"],
      _count: { status: true },
      where: { orgId },
    }).catch(() => [] as Array<{ status: ComplaintStatus; _count: { status: number } }>),
  ]);

  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count?.status ?? 0]));
  const now = new Date();

  function slaStatus(complaint: (typeof complaints)[0]) {
    const ageHours = (now.getTime() - new Date(complaint.createdAt).getTime()) / 3600000;
    if (!complaint.acknowledgedAt && ageHours > SLA_HOURS.acknowledgement) return "overdue-ack";
    if (
      !complaint.resolvedAt &&
      ageHours > SLA_HOURS.resolution &&
      complaint.status !== "RESOLVED" &&
      complaint.status !== "CLOSED"
    )
      return "overdue-res";
    return "ok";
  }

  const totalOpen = counts
    .filter((c) => c.status !== "CLOSED" && c.status !== "RESOLVED")
    .reduce((sum, c) => sum + (c._count?.status ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="panel-shadow flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-bold text-[var(--ink)]">Complaints</p>
          {totalOpen > 0 && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              {totalOpen} open
            </span>
          )}
        </div>
        <a
          href="/feedback"
          target="_blank"
          rel="noreferrer"
          className="btn-premium-secondary rounded-lg px-3 py-1.5 text-xs"
        >
          Client Portal ↗
        </a>
      </div>

      {/* Status filter chips */}
      <div className="panel-shadow flex flex-wrap items-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        {[
          { label: "All", key: "" },
          ...STATUSES.map((s) => ({ label: COMPLAINT_STATUS_LABELS[s], key: s })),
        ].map(({ label, key }) => {
          const active = (filterStatus ?? "") === key;
          return (
            <Link
              key={key || "all"}
              href={key ? `/complaints?status=${key}` : "/complaints"}
              className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                active
                  ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                  : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] hover:border-[var(--accent)]/30"
              }`}
            >
              {label}
              {key ? ` · ${byStatus[key] ?? 0}` : ""}
            </Link>
          );
        })}
      </div>

      {/* Table */}
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        {complaints.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-[var(--ink-muted)]">
            No complaints yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--panel-strong)]/60">
                  {["Ref", "Status / SLA", "Category", "Client", "Description", "Job", "Actions"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {complaints.map((c) => {
                  const sla = slaStatus(c);
                  return (
                    <tr
                      key={c.id}
                      className="group align-top transition-colors hover:bg-[var(--panel-strong)]/40"
                    >
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-bold text-[var(--ink)]">
                          {c.complaintNumber}
                        </p>
                        <p className="mt-0.5 text-[10px] text-[var(--ink-muted)]">
                          {new Date(c.createdAt).toLocaleDateString()}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${COMPLAINT_STATUS_STYLES[c.status]}`}
                        >
                          {COMPLAINT_STATUS_LABELS[c.status]}
                        </span>
                        {sla === "overdue-ack" && (
                          <p className="mt-1 text-[10px] font-semibold text-red-600">
                            Ack overdue
                          </p>
                        )}
                        {sla === "overdue-res" && (
                          <p className="mt-1 text-[10px] font-semibold text-amber-600">
                            Resolution overdue
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[11px] text-[var(--ink)]">
                          {COMPLAINT_CATEGORY_LABELS[c.category]}
                        </p>
                        <p className="text-[10px] text-[var(--ink-muted)]">{c.channel}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-semibold text-[var(--ink)]">{c.clientName}</p>
                        <p className="text-[10px] text-[var(--ink-muted)]">{c.clientPhone}</p>
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <p
                          className="line-clamp-3 text-[11px] text-[var(--ink-muted)]"
                          title={c.description}
                        >
                          {c.description}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {c.job ? (
                          <Link
                            href={`/jobs/${c.job.id}`}
                            className="font-mono text-[11px] font-semibold text-[var(--accent)] hover:underline"
                          >
                            {c.job.jobNumber}
                          </Link>
                        ) : (
                          <span className="text-[11px] text-[var(--ink-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <RowActionsMenu label="Update complaint">
                          <MenuSection label="Update Status" />
                          <form action={updateStatusAction} className="space-y-2 p-3">
                            <input type="hidden" name="id" value={c.id} />
                            <select
                              name="status"
                              defaultValue={c.status}
                              className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none"
                            >
                              {STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {COMPLAINT_STATUS_LABELS[s]}
                                </option>
                              ))}
                            </select>
                            <textarea
                              name="resolution"
                              defaultValue={c.resolution ?? ""}
                              placeholder="Resolution (shown to client)"
                              rows={2}
                              className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none resize-none"
                            />
                            <textarea
                              name="internalNotes"
                              defaultValue={c.internalNotes ?? ""}
                              placeholder="Internal notes"
                              rows={2}
                              className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none resize-none"
                            />
                            <button type="submit" className="btn-premium w-full rounded-lg px-3 py-1.5 text-xs">
                              Save
                            </button>
                          </form>
                        </RowActionsMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
