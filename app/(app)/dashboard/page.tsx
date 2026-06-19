export const dynamic = "force-dynamic";

import Link from "next/link";
import type { ReactNode } from "react";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { formatMoneyCompact } from "@/lib/currency";
import { formatEATDate } from "@/lib/date-eat";
import { can } from "@/lib/permissions";
import {
  TICKET_STATUSES,
  TICKET_STATUS_META,
  type JobStatus,
  type TicketStatus,
  toTicketLabel,
} from "@/lib/job-status";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { BadgeVariant } from "@/components/ui/StatusBadge";

type SearchParams = {
  month?: string;
  year?: string;
  period?: string;
};

type RecentTicket = {
  id: string;
  jobNumber: string;
  status: string;
  updatedAt: Date;
  receivedAt: Date;
  client?: { fullName: string } | null;
  device?: { brand: string | null; model: string | null } | null;
  assignedTo?: { name: string | null } | null;
};

function statusHref(status: TicketStatus) {
  return `/tickets?status=${status}`;
}

function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

const badgeVariantByStatus: Record<TicketStatus, BadgeVariant> = {
  PENDING: "neutral",
  DIAGNOSING: "info",
  IN_PROGRESS: "info",
  WAITING: "warning",
  READY: "success",
  COMPLETED: "default",
  CLOSED: "neutral",
};

function CardShell({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`group rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md ${className}`}
    >
      {children}
    </Link>
  );
}

export default async function DashboardPage({
  searchParams: _searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { session, user, orgId, org } = await requireOrgSession();
  const currency = org.baseCurrency || "UGX";
  const canSeeClients = can.viewClientInfo(user);
  const canSeeFinance = can.viewFinancials(user);
  const canCreateTicket = can.createJob(user);
  const isScopedTechnician =
    user.role === "TECHNICIAN_EXTERNAL" || user.role === "TECHNICIAN_INTERNAL";
  const ticketScopeWhere = {
    orgId,
    ...(isScopedTechnician ? { assignedToId: session.user.id } : {}),
  };

  const recentTicketsQuery = canSeeClients
    ? prisma.job.findMany({
        where: ticketScopeWhere,
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: {
          id: true,
          jobNumber: true,
          status: true,
          receivedAt: true,
          updatedAt: true,
          client: { select: { fullName: true } },
          device: { select: { brand: true, model: true } },
          assignedTo: { select: { name: true } },
        },
      })
    : prisma.job.findMany({
        where: ticketScopeWhere,
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: {
          id: true,
          jobNumber: true,
          status: true,
          receivedAt: true,
          updatedAt: true,
          device: { select: { brand: true, model: true } },
          assignedTo: { select: { name: true } },
        },
      });

  const [
    statusGroup,
    recentTicketsRaw,
    clientCount,
    invoiceAgg,
    receiptAgg,
    overdueTickets,
  ] = await Promise.all([
    prisma.job.groupBy({
      by: ["status"],
      where: ticketScopeWhere,
      _count: { status: true },
    }),
    recentTicketsQuery,
    canSeeClients ? prisma.client.count({ where: { orgId } }) : Promise.resolve(0),
    canSeeFinance
      ? prisma.invoice
          .aggregate({
            where: { orgId },
            _count: { id: true },
            _sum: { totalAmount: true, paidAmount: true },
          })
          .catch(() => ({
            _count: { id: 0 },
            _sum: { totalAmount: null, paidAmount: null },
          }))
      : Promise.resolve({
          _count: { id: 0 },
          _sum: { totalAmount: null, paidAmount: null },
        }),
    canSeeFinance
      ? prisma.receipt
          .aggregate({
            where: { orgId },
            _count: { id: true },
            _sum: { amount: true },
          })
          .catch(() => ({ _count: { id: 0 }, _sum: { amount: null } }))
      : Promise.resolve({ _count: { id: 0 }, _sum: { amount: null } }),
    prisma.job.count({
      where: {
        ...ticketScopeWhere,
        receivedAt: { lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        status: { notIn: ["COMPLETED", "CLOSED", "DELIVERED"] as JobStatus[] },
      },
    }),
  ]);

  const recentTickets = recentTicketsRaw as RecentTicket[];
  const ticketCounts = new Map<TicketStatus, number>();
  for (const item of statusGroup) {
    const key = toTicketLabel(item.status as JobStatus);
    ticketCounts.set(key, (ticketCounts.get(key) ?? 0) + item._count.status);
  }

  const totalTickets = [...ticketCounts.values()].reduce((sum, count) => sum + count, 0);
  const openTickets =
    (ticketCounts.get("PENDING") ?? 0) +
    (ticketCounts.get("DIAGNOSING") ?? 0) +
    (ticketCounts.get("IN_PROGRESS") ?? 0) +
    (ticketCounts.get("WAITING") ?? 0);
  const readyTickets = ticketCounts.get("READY") ?? 0;
  const completedTickets = ticketCounts.get("COMPLETED") ?? 0;
  const paidTotal = invoiceAgg._sum.paidAmount ?? 0;
  const billedTotal = invoiceAgg._sum.totalAmount ?? 0;
  const outstandingTotal = Math.max(0, billedTotal - paidTotal);
  const receiptTotal = receiptAgg._sum.amount ?? 0;

  const metricCards = [
    {
      label: isScopedTechnician ? "My Open Tickets" : "Open Tickets",
      value: openTickets.toLocaleString(),
      href: "/tickets",
      helper: `${overdueTickets} over 7 days`,
      tone: "text-stone-900",
    },
    {
      label: "Ready",
      value: readyTickets.toLocaleString(),
      href: statusHref("READY"),
      helper: "Pickup or delivery queue",
      tone: "text-emerald-600",
    },
    ...(canSeeClients
      ? [
          {
            label: "Clients",
            value: clientCount.toLocaleString(),
            href: "/clients",
            helper: "Customer records",
            tone: "text-stone-900",
          },
        ]
      : []),
    ...(canSeeFinance
      ? [
          {
            label: "Outstanding",
            value: formatMoneyCompact(outstandingTotal, currency),
            href: "/documents/invoices",
            helper: `${invoiceAgg._count.id} invoices`,
            tone: outstandingTotal > 0 ? "text-amber-600" : "text-emerald-600",
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6 pb-24 lg:pb-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
            Service Desk
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
            Dashboard
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-300">
            A live operating view of ticket load, pickup readiness, and document flow.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/tickets?view=board"
            className="rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 shadow-sm transition hover:border-stone-300 hover:text-stone-950"
          >
            Board View
          </Link>
          {canCreateTicket ? (
            <Link
              href="/tickets/new"
              className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800"
            >
              New Ticket
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((card) => (
          <CardShell key={card.label} href={card.href}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                  {card.label}
                </p>
                <p className={`mt-2 text-2xl font-bold tabular-nums ${card.tone}`}>
                  {card.value}
                </p>
              </div>
              <span
                aria-hidden="true"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-stone-200 text-sm font-semibold text-stone-400 transition group-hover:border-stone-300 group-hover:text-stone-600"
              >
                -&gt;
              </span>
            </div>
            <p className="mt-3 text-xs text-stone-500">{card.helper}</p>
          </CardShell>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <section className="rounded-xl border border-stone-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-stone-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-stone-900">Ticket Pipeline</h2>
              <p className="mt-0.5 text-xs text-stone-500">
                {totalTickets.toLocaleString()} total tickets in the current scope.
              </p>
            </div>
            <Link
              href="/tickets"
              className="text-sm font-semibold text-stone-500 transition hover:text-stone-900"
            >
              View all
            </Link>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {TICKET_STATUSES.map((status) => {
              const meta = TICKET_STATUS_META[status];
              const count = ticketCounts.get(status) ?? 0;
              const share = percent(count, totalTickets);
              return (
                <Link
                  key={status}
                  href={statusHref(status)}
                  className={`rounded-xl border ${meta.border} ${meta.bg} p-4 transition hover:-translate-y-0.5 hover:shadow-sm`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`text-xs font-semibold uppercase tracking-wider ${meta.text}`}>
                        {meta.shortLabel}
                      </p>
                      <p className="mt-2 text-2xl font-bold tabular-nums text-stone-950">
                        {count}
                      </p>
                    </div>
                    <span
                      className="mt-1 h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: meta.accent }}
                    />
                  </div>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/80">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${share}%`, backgroundColor: meta.accent }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-stone-500">{meta.description}</p>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-stone-900">Operations Snapshot</h2>
            <p className="mt-0.5 text-xs text-stone-500">
              The queues that need the next desk action.
            </p>
          </div>
          <div className="divide-y divide-stone-100">
            <Link
              href="/tickets?status=WAITING"
              className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-stone-50"
            >
              <div>
                <p className="text-sm font-semibold text-stone-900">Waiting</p>
                <p className="text-xs text-stone-500">Parts or approval required</p>
              </div>
              <span className="text-lg font-bold tabular-nums text-amber-600">
                {ticketCounts.get("WAITING") ?? 0}
              </span>
            </Link>
            <Link
              href="/tickets?status=DIAGNOSING"
              className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-stone-50"
            >
              <div>
                <p className="text-sm font-semibold text-stone-900">Diagnosing</p>
                <p className="text-xs text-stone-500">Assessment in progress</p>
              </div>
              <span className="text-lg font-bold tabular-nums text-blue-600">
                {ticketCounts.get("DIAGNOSING") ?? 0}
              </span>
            </Link>
            <Link
              href="/tickets?status=COMPLETED"
              className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-stone-50"
            >
              <div>
                <p className="text-sm font-semibold text-stone-900">Completed</p>
                <p className="text-xs text-stone-500">Finished service work</p>
              </div>
              <span className="text-lg font-bold tabular-nums text-violet-600">
                {completedTickets}
              </span>
            </Link>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-xl border border-stone-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-stone-900">Recent Tickets</h2>
              <p className="mt-0.5 text-xs text-stone-500">
                Latest updates across the service queue.
              </p>
            </div>
            <Link
              href="/tickets"
              className="text-sm font-semibold text-stone-500 transition hover:text-stone-900"
            >
              Open queue
            </Link>
          </div>
          {recentTickets.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm font-semibold text-stone-600">No tickets yet</p>
              {canCreateTicket ? (
                <Link
                  href="/tickets/new"
                  className="mt-3 inline-flex rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800"
                >
                  Create a ticket
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {recentTickets.map((ticket) => {
                const ts = toTicketLabel(ticket.status as JobStatus);
                const meta = TICKET_STATUS_META[ts];
                const device = [ticket.device?.brand, ticket.device?.model]
                  .filter(Boolean)
                  .join(" ");
                const clientName = canSeeClients ? ticket.client?.fullName : null;
                return (
                  <Link
                    key={ticket.id}
                    href={`/tickets/${ticket.id}`}
                    className="grid gap-3 px-5 py-4 transition hover:bg-stone-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono text-sm font-semibold text-stone-900">
                          {ticket.jobNumber}
                        </p>
                        <StatusBadge
                          label={meta?.label ?? ts}
                          variant={badgeVariantByStatus[ts]}
                        />
                      </div>
                      <p className="mt-1 truncate text-sm text-stone-600">
                        {[clientName, device].filter(Boolean).join(" - ") || "Device details pending"}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                      <p className="text-xs text-stone-400">
                        Updated {formatEATDate(ticket.updatedAt)}
                      </p>
                      {ticket.assignedTo?.name ? (
                        <p className="hidden rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600 md:block">
                          {ticket.assignedTo.name}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          {canSeeFinance ? (
            <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-stone-900">Documents</h2>
                  <p className="mt-0.5 text-xs text-stone-500">Billing and receipt health.</p>
                </div>
                <Link
                  href="/documents"
                  className="text-xs font-semibold text-stone-500 transition hover:text-stone-900"
                >
                  Open
                </Link>
              </div>
              <div className="mt-5 grid gap-3">
                <Link
                  href="/documents/invoices"
                  className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-3 transition hover:border-stone-200"
                >
                  <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                    Billed
                  </p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-stone-900">
                    {formatMoneyCompact(billedTotal, currency)}
                  </p>
                </Link>
                <Link
                  href="/documents/receipts"
                  className="rounded-xl border border-stone-100 bg-emerald-50 px-4 py-3 transition hover:border-emerald-200"
                >
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                    Receipted
                  </p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-emerald-700">
                    {formatMoneyCompact(receiptTotal, currency)}
                  </p>
                </Link>
              </div>
            </section>
          ) : null}

          <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-stone-900">Shortcuts</h2>
            <div className="mt-4 grid gap-2">
              <Link
                href="/tickets"
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
              >
                Tickets <span className="text-stone-300">-&gt;</span>
              </Link>
              {canCreateTicket ? (
                <Link
                  href="/tickets/new"
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
                >
                  New Ticket <span className="text-stone-300">-&gt;</span>
                </Link>
              ) : null}
              {canSeeClients ? (
                <Link
                  href="/clients"
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
                >
                  Clients <span className="text-stone-300">-&gt;</span>
                </Link>
              ) : null}
              {canSeeFinance ? (
                <Link
                  href="/documents/quotations"
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
                >
                  Quotations <span className="text-stone-300">-&gt;</span>
                </Link>
              ) : null}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
