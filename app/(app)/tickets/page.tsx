import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { formatEATDate } from "@/lib/date-eat";
import type { TicketStatus, TicketPriority } from "@prisma/client";

export const dynamic = "force-dynamic";

const PRIORITY_COLOR: Record<string, string> = {
  LOW: "bg-blue-100 text-blue-800",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  HIGH: "bg-orange-100 text-orange-800",
  CRITICAL: "bg-red-100 text-red-800",
};

const STATUS_COLOR: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  WAITING_ON_CUSTOMER: "bg-purple-100 text-purple-800",
  RESOLVED: "bg-green-100 text-green-800",
  CLOSED: "bg-gray-100 text-gray-800",
};

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string }>;
}) {
  const { orgId } = await requireOrgSession();
  const params = await searchParams;
  const statusFilter = params.status;
  const priorityFilter = params.priority;

  const where = {
    orgId,
    ...(statusFilter ? { status: statusFilter.toUpperCase() as TicketStatus } : {}),
    ...(priorityFilter ? { priority: priorityFilter.toUpperCase() as TicketPriority } : {}),
  };

  const [tickets, statusCountsRaw] = await Promise.all([
    prisma.ticket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { assignedTo: { select: { name: true } } },
      take: 100,
    }),
    prisma.ticket.groupBy({
      by: ["status"],
      where: { orgId },
      _count: { status: true },
    }).catch(() => [] as Array<{ status: string; _count: { status: number } }>),
  ]);

  const statusCounts = new Map(statusCountsRaw.map((s) => [s.status, s._count.status]));

  const statuses = ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "RESOLVED", "CLOSED"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-800">ICT Tickets</h1>
          <p className="mt-1 text-sm text-stone-500">Track and manage ICT support requests.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/tickets"
          className={"rounded-full border px-4 py-1.5 text-sm font-semibold transition " + (!statusFilter ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:text-stone-800")}
        >
          All ({[...statusCounts.values()].reduce((a, b) => a + b, 0)})
        </Link>
        {statuses.map((s) => (
          <Link
            key={s}
            href={"/tickets?status=" + s}
            className={"rounded-full border px-4 py-1.5 text-sm font-semibold transition " + (statusFilter === s ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:text-stone-800")}
          >
            {s.replace(/_/g, " ")} ({statusCounts.get(s) ?? 0})
          </Link>
        ))}
        {statusFilter && (
          <Link href="/tickets" className="rounded-full border border-stone-200 bg-white px-4 py-1.5 text-sm font-semibold text-stone-500 hover:border-stone-300 hover:text-stone-700">
            Clear filter
          </Link>
        )}
      </div>

      {tickets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-stone-200 bg-white py-16 text-center">
          <span className="text-4xl opacity-25">🎫</span>
          <p className="text-sm font-semibold text-stone-500">No tickets found</p>
          <p className="text-xs text-stone-400">New tickets will appear here</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-stone-200 text-sm">
            <thead className="bg-stone-50">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">Ticket</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">Subject</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">Reporter</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">Category</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">Priority</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">Status</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">Assigned</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {tickets.map((t) => (
                <tr key={t.id} className="hover:bg-stone-50">
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link href={"/tickets/" + t.id} className="font-mono text-xs font-semibold text-amber-600 hover:text-amber-700 hover:underline">
                      {t.ticketNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={"/tickets/" + t.id} className="font-medium text-stone-900 hover:text-amber-700 hover:underline">
                      {t.subject}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-stone-700">{t.reporterName}</div>
                    <div className="text-xs text-stone-400">{t.reporterPhone}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-stone-600">{t.category.replace(/_/g, " ")}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={"inline-flex rounded-full px-2 py-0.5 text-xs font-medium " + (PRIORITY_COLOR[t.priority] || "bg-stone-100 text-stone-800")}>
                      {t.priority}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={"inline-flex rounded-full px-2 py-0.5 text-xs font-medium " + (STATUS_COLOR[t.status] || "bg-stone-100 text-stone-800")}>
                      {t.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-stone-600">{t.assignedTo?.name ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-stone-500">{formatEATDate(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
