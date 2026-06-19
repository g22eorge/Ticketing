import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { formatEATDate } from "@/lib/date-eat";
import { formatMoney } from "@/lib/currency";
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
  WAITING_FOR_APPROVAL: "bg-amber-100 text-amber-800",
  WAITING_FOR_PAYMENT: "bg-pink-100 text-pink-800",
  RESOLVED: "bg-green-100 text-green-800",
  CLOSED: "bg-gray-100 text-gray-800",
  CANCELLED: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING_ON_CUSTOMER: "Waiting on Client",
  WAITING_FOR_APPROVAL: "Awaiting Approval",
  WAITING_FOR_PAYMENT: "Awaiting Payment",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

const ALL_STATUSES: string[] = [
  "OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "WAITING_FOR_APPROVAL",
  "WAITING_FOR_PAYMENT", "RESOLVED", "CLOSED", "CANCELLED",
];

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string; sla?: string }>;
}) {
  const { orgId, org } = await requireOrgSession();
  const params = await searchParams;
  const statusFilter = params.status;
  const priorityFilter = params.priority;
  const slaFilter = params.sla;
  const currency = org.baseCurrency || "UGX";

  const where = {
    orgId,
    ...(statusFilter ? { status: statusFilter.toUpperCase() as TicketStatus } : {}),
    ...(priorityFilter ? { priority: priorityFilter.toUpperCase() as TicketPriority } : {}),
    ...(slaFilter === "1" ? { isSLACovered: true } : {}),
  };

  const [tickets, statusCountsRaw, slaCount] = await Promise.all([
    prisma.ticket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        assignedTo: { select: { name: true } },
        client: { select: { id: true, fullName: true, isSLACovered: true } },
      },
      take: 100,
    }),
    prisma.ticket.groupBy({
      by: ["status"],
      where: { orgId },
      _count: { status: true },
    }).catch(() => [] as Array<{ status: string; _count: { status: number } }>),
    prisma.ticket.count({ where: { orgId, isSLACovered: true } }),
  ]);

  const statusCounts = new Map(statusCountsRaw.map((s) => [s.status, s._count.status]));
  const totalTickets = [...statusCounts.values()].reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">Support</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-900">ICT Tickets</h1>
          <p className="mt-1 text-sm text-stone-500">
            {totalTickets} total &middot; {slaCount} SLA-covered
          </p>
        </div>
        <Link
          href="/tickets/new"
          className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800"
        >
          New Ticket
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/tickets"
          className={"rounded-full border px-4 py-1.5 text-sm font-semibold transition " + (!statusFilter && !slaFilter ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:text-stone-800")}
        >
          All ({totalTickets})
        </Link>
        {ALL_STATUSES.map((s) => (
          <Link
            key={s}
            href={"/tickets?status=" + s}
            className={"rounded-full border px-4 py-1.5 text-sm font-semibold transition " + (statusFilter === s ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:text-stone-800")}
          >
            {STATUS_LABEL[s] ?? s.replace(/_/g, " ")} ({statusCounts.get(s) ?? 0})
          </Link>
        ))}
        <Link
          href="/tickets?sla=1"
          className={"rounded-full border px-4 py-1.5 text-sm font-semibold transition " + (slaFilter === "1" ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300")}
        >
          SLA ({slaCount})
        </Link>
        {(statusFilter || priorityFilter || slaFilter) && (
          <Link href="/tickets" className="rounded-full border border-stone-200 bg-white px-4 py-1.5 text-sm font-semibold text-stone-500 hover:border-stone-300 hover:text-stone-700">
            Clear
          </Link>
        )}
      </div>

      {tickets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-stone-200 bg-white py-16 text-center">
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
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">Client</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">Category</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">Priority</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">Status</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">Assigned</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">Est. Cost</th>
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
                    {t.isSLACovered && (
                      <span className="ml-2 inline-flex rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">SLA</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={"/tickets/" + t.id} className="font-medium text-stone-900 hover:text-amber-700 hover:underline">
                      {t.subject}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {t.client ? (
                      <Link href={"/clients"} className="text-sm font-medium text-stone-700 hover:text-stone-900">
                        {t.client.fullName}
                        {t.client.isSLACovered && <span className="ml-1 text-emerald-600 text-xs">SLA</span>}
                      </Link>
                    ) : (
                      <div>
                        <div className="text-sm font-medium text-stone-700">{t.reporterName}</div>
                        <div className="text-xs text-stone-400">{t.reporterPhone}</div>
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-stone-600">{t.category.replace(/_/g, " ")}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={"inline-flex rounded-full px-2 py-0.5 text-xs font-medium " + (PRIORITY_COLOR[t.priority] || "bg-stone-100 text-stone-800")}>
                      {t.priority}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={"inline-flex rounded-full px-2 py-0.5 text-xs font-medium " + (STATUS_COLOR[t.status] || "bg-stone-100 text-stone-800")}>
                      {STATUS_LABEL[t.status] ?? t.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-stone-600">{t.assignedTo?.name ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-stone-600">
                    {t.estimatedCost ? formatMoney(t.estimatedCost, currency) : "—"}
                  </td>
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
