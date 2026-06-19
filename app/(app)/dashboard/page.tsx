export const dynamic = "force-dynamic";

import Link from "next/link";
import type { ReactNode } from "react";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { formatMoneyCompact } from "@/lib/currency";
import { formatEATDate } from "@/lib/date-eat";
import { can } from "@/lib/permissions";

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

export default async function DashboardPage() {
  const { user, orgId, org } = await requireOrgSession();
  const currency = org.baseCurrency || "UGX";
  const canSeeClients = can.viewClientInfo(user);
  const canSeeFinance = can.viewFinancials(user);
  const canCreateTicket = can.createJob(user);

  const [
    ticketStatusGroup,
    openTicketCount,
    slaTicketCount,
    recentTickets,
    clientCount,
    invoiceAgg,
    receiptAgg,
    pendingQuotations,
  ] = await Promise.all([
    prisma.ticket.groupBy({
      by: ["status"],
      where: { orgId },
      _count: { status: true },
    }).catch(() => []),
    prisma.ticket.count({
      where: { orgId, status: { in: ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "WAITING_FOR_APPROVAL", "WAITING_FOR_PAYMENT"] } },
    }),
    prisma.ticket.count({
      where: { orgId, isSLACovered: true },
    }),
    prisma.ticket.findMany({
      where: { orgId },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: {
        id: true,
        ticketNumber: true,
        status: true,
        subject: true,
        priority: true,
        isSLACovered: true,
        updatedAt: true,
        createdAt: true,
        client: { select: { fullName: true } },
        assignedTo: { select: { name: true } },
      },
    }),
    canSeeClients ? prisma.client.count({ where: { orgId } }) : Promise.resolve(0),
    canSeeFinance
      ? prisma.invoice.aggregate({ where: { orgId }, _count: { id: true }, _sum: { totalAmount: true, paidAmount: true } }).catch(() => ({ _count: { id: 0 }, _sum: { totalAmount: null, paidAmount: null } }))
      : Promise.resolve({ _count: { id: 0 }, _sum: { totalAmount: null, paidAmount: null } }),
    canSeeFinance
      ? prisma.receipt.aggregate({ where: { orgId }, _count: { id: true }, _sum: { amount: true } }).catch(() => ({ _count: { id: 0 }, _sum: { amount: null } }))
      : Promise.resolve({ _count: { id: 0 }, _sum: { amount: null } }),
    canSeeFinance
      ? prisma.quotation.count({ where: { orgId, status: "DRAFT" } }).catch(() => 0)
      : Promise.resolve(0),
  ]);

  const ticketCounts = new Map<string, number>();
  for (const item of ticketStatusGroup) {
    ticketCounts.set(item.status, (ticketCounts.get(item.status) ?? 0) + item._count.status);
  }
  const totalTickets = [...ticketCounts.values()].reduce((a, b) => a + b, 0);

  const paidTotal = invoiceAgg._sum.paidAmount ?? 0;
  const billedTotal = invoiceAgg._sum.totalAmount ?? 0;
  const outstandingTotal = Math.max(0, billedTotal - paidTotal);
  const receiptTotal = receiptAgg._sum.amount ?? 0;

  const closedTickets = (ticketCounts.get("RESOLVED") ?? 0) + (ticketCounts.get("CLOSED") ?? 0);
  const waitingTickets = (ticketCounts.get("WAITING_ON_CUSTOMER") ?? 0) + (ticketCounts.get("WAITING_FOR_APPROVAL") ?? 0);
  const awaitPayment = ticketCounts.get("WAITING_FOR_PAYMENT") ?? 0;
  const inProgress = ticketCounts.get("IN_PROGRESS") ?? 0;

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

  const PRIORITY_COLOR: Record<string, string> = {
    LOW: "bg-blue-100 text-blue-800",
    MEDIUM: "bg-yellow-100 text-yellow-800",
    HIGH: "bg-orange-100 text-orange-800",
    CRITICAL: "bg-red-100 text-red-800",
  };

  const metricCards = [
    {
      label: "Open Tickets",
      value: openTicketCount.toLocaleString(),
      href: "/tickets?status=OPEN",
      helper: `${totalTickets} total`,
      tone: "text-stone-900",
    },
    {
      label: "In Progress",
      value: inProgress.toLocaleString(),
      href: "/tickets?status=IN_PROGRESS",
      helper: "Active service work",
      tone: "text-yellow-700",
    },
    {
      label: "Waiting",
      value: waitingTickets.toLocaleString(),
      href: "/tickets?status=WAITING_ON_CUSTOMER",
      helper: "Client or approval needed",
      tone: "text-purple-700",
    },
    {
      label: "Awaiting Payment",
      value: awaitPayment.toLocaleString(),
      href: "/tickets?status=WAITING_FOR_PAYMENT",
      helper: "Ready for billing",
      tone: "text-pink-700",
    },
    {
      label: "SLA Covered",
      value: slaTicketCount.toLocaleString(),
      href: "/tickets?sla=1",
      helper: "Under active SLA",
      tone: "text-emerald-700",
    },
    {
      label: "Resolved / Closed",
      value: closedTickets.toLocaleString(),
      href: "/tickets?status=RESOLVED",
      helper: "Completed work",
      tone: "text-green-700",
    },
    ...(canSeeClients
      ? [{
          label: "Clients",
          value: clientCount.toLocaleString(),
          href: "/clients",
          helper: "Customer records",
          tone: "text-stone-900",
        }]
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
          {
            label: "Receipted",
            value: formatMoneyCompact(receiptTotal, currency),
            href: "/documents/receipts",
            helper: "Payments received",
            tone: "text-emerald-600",
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
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-900">
            Dashboard
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-500">
            ICT support operations, SLA tracking, and billing overview.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
                &rarr;
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
                {totalTickets.toLocaleString()} tickets across all statuses.
              </p>
            </div>
            <Link
              href="/tickets"
              className="text-sm font-semibold text-stone-500 transition hover:text-stone-900"
            >
              View all
            </Link>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {[ "OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "WAITING_FOR_APPROVAL", "WAITING_FOR_PAYMENT", "RESOLVED"].map((status) => {
              const count = ticketCounts.get(status) ?? 0;
              const total = Math.max(totalTickets, 1);
              const share = Math.round((count / total) * 100);
              const colors: Record<string, { bg: string; border: string; text: string; accent: string }> = {
                OPEN: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", accent: "#3b82f6" },
                IN_PROGRESS: { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-700", accent: "#eab308" },
                WAITING_ON_CUSTOMER: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", accent: "#8b5cf6" },
                WAITING_FOR_APPROVAL: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", accent: "#f59e0b" },
                WAITING_FOR_PAYMENT: { bg: "bg-pink-50", border: "border-pink-200", text: "text-pink-700", accent: "#ec4899" },
                RESOLVED: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", accent: "#22c55e" },
              };
              const c = colors[status] ?? { bg: "bg-stone-50", border: "border-stone-200", text: "text-stone-600", accent: "#78716c" };
              return (
                <Link
                  key={status}
                  href={`/tickets?status=${status}`}
                  className={`rounded-xl border ${c.border} ${c.bg} p-4 transition hover:-translate-y-0.5 hover:shadow-sm`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`text-xs font-semibold uppercase tracking-wider ${c.text}`}>
                        {status.replace(/_/g, " ")}
                      </p>
                      <p className="mt-2 text-2xl font-bold tabular-nums text-stone-950">
                        {count}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/80">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${share}%`, backgroundColor: c.accent }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="space-y-4">
          {canSeeFinance ? (
            <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-stone-900">Billing</h2>
                  <p className="mt-0.5 text-xs text-stone-500">Revenue and document health.</p>
                </div>
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
                {pendingQuotations > 0 && (
                  <Link
                    href="/documents/quotations"
                    className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 transition hover:border-amber-200"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                      Draft Quotations
                    </p>
                    <p className="mt-1 text-lg font-bold tabular-nums text-amber-700">
                      {pendingQuotations}
                    </p>
                  </Link>
                )}
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
                Tickets <span className="text-stone-300">&rarr;</span>
              </Link>
              {canCreateTicket ? (
                <Link
                  href="/tickets/new"
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
                >
                  New Ticket <span className="text-stone-300">&rarr;</span>
                </Link>
              ) : null}
              {canSeeClients ? (
                <Link
                  href="/clients"
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
                >
                  Clients <span className="text-stone-300">&rarr;</span>
                </Link>
              ) : null}
              {canSeeFinance ? (
                <>
                  <Link
                    href="/documents/quotations"
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
                  >
                    Quotations <span className="text-stone-300">&rarr;</span>
                  </Link>
                  <Link
                    href="/documents/invoices"
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
                  >
                    Invoices <span className="text-stone-300">&rarr;</span>
                  </Link>
                  <Link
                    href="/documents/receipts"
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
                  >
                    Receipts <span className="text-stone-300">&rarr;</span>
                  </Link>
                </>
              ) : null}
            </div>
          </section>
        </section>
      </div>

      {recentTickets.length > 0 && (
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
          <div className="divide-y divide-stone-100">
            {recentTickets.map((ticket) => (
              <Link
                key={ticket.id}
                href={`/tickets/${ticket.id}`}
                className="grid gap-3 px-5 py-4 transition hover:bg-stone-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-sm font-semibold text-stone-900">
                      {ticket.ticketNumber}
                    </p>
                    <span className={"inline-flex rounded-full px-2 py-0.5 text-xs font-medium " + (STATUS_COLOR[ticket.status] || "bg-stone-100 text-stone-800")}>
                      {ticket.status.replace(/_/g, " ")}
                    </span>
                    {ticket.isSLACovered && (
                      <span className="inline-flex rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">SLA</span>
                    )}
                    <span className={"inline-flex rounded-full px-2 py-0.5 text-xs font-medium " + (PRIORITY_COLOR[ticket.priority] || "bg-stone-100 text-stone-800")}>
                      {ticket.priority}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm text-stone-600">
                    {ticket.subject}
                    {ticket.client && ` - ${ticket.client.fullName}`}
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
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
