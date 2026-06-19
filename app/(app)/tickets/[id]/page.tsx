import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { formatEATDate } from "@/lib/date-eat";
import { TicketUpdateForm } from "@/components/tickets/TicketUpdateForm";

export const dynamic = "force-dynamic";

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { orgId } = await requireOrgSession();
  const { id } = await params;

  const ticket = await prisma.ticket.findFirst({
    where: { id, orgId },
    include: { assignedTo: { select: { id: true, name: true, email: true } } },
  });

  if (!ticket) notFound();

  const users = await prisma.user.findMany({
    where: { orgId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/tickets" className="text-sm text-stone-500 hover:text-stone-700">← Tickets</Link>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-100 px-6 py-4">
          <div className="flex items-start justify-between">
            <div>
              <span className="font-mono text-sm font-bold text-stone-500">{ticket.ticketNumber}</span>
              <h1 className="mt-1 text-xl font-bold text-stone-900">{ticket.subject}</h1>
              <p className="mt-1 text-sm text-stone-500">{formatEATDate(ticket.createdAt)}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className={"inline-flex rounded-full px-3 py-1 text-xs font-bold " +
                (ticket.priority === "CRITICAL" ? "bg-red-100 text-red-800" :
                 ticket.priority === "HIGH" ? "bg-orange-100 text-orange-800" :
                 ticket.priority === "MEDIUM" ? "bg-yellow-100 text-yellow-800" :
                 "bg-blue-100 text-blue-800")}>
                {ticket.priority}
              </span>
              <span className={"inline-flex rounded-full px-3 py-1 text-xs font-bold " +
                (ticket.status === "RESOLVED" ? "bg-green-100 text-green-800" :
                 ticket.status === "CLOSED" ? "bg-stone-100 text-stone-800" :
                 ticket.status === "IN_PROGRESS" ? "bg-yellow-100 text-yellow-800" :
                 ticket.status === "WAITING_ON_CUSTOMER" ? "bg-purple-100 text-purple-800" :
                 "bg-blue-100 text-blue-800")}>
                {ticket.status.replace(/_/g, " ")}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 border-b border-stone-100 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Reporter</p>
            <p className="mt-1 text-sm font-medium text-stone-800">{ticket.reporterName}</p>
            <p className="text-sm text-stone-500">{ticket.reporterPhone}</p>
            {ticket.reporterEmail && <p className="text-sm text-stone-500">{ticket.reporterEmail}</p>}
            {ticket.reporterCompany && <p className="text-sm text-stone-500">{ticket.reporterCompany}</p>}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Category</p>
            <p className="mt-1 text-sm font-medium text-stone-800">{ticket.category.replace(/_/g, " ")}</p>
            {ticket.deviceInfo && (
              <>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-stone-400">Device</p>
                <p className="text-sm text-stone-700">{ticket.deviceInfo}</p>
              </>
            )}
          </div>
        </div>

        <div className="border-b border-stone-100 px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Description</p>
          <p className="mt-2 text-sm leading-relaxed text-stone-700 whitespace-pre-wrap">{ticket.description}</p>
          {ticket.resolution && (
            <>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-stone-400">Resolution</p>
              <p className="mt-1 text-sm leading-relaxed text-stone-700 whitespace-pre-wrap">{ticket.resolution}</p>
            </>
          )}
        </div>

        {ticket.notes && (
          <div className="border-b border-stone-100 px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Internal Notes</p>
            <p className="mt-2 text-sm leading-relaxed text-stone-700 whitespace-pre-wrap">{ticket.notes}</p>
          </div>
        )}

        <div className="px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-3">Update Ticket</p>
          <TicketUpdateForm
            ticketId={ticket.id}
            currentStatus={ticket.status}
            currentPriority={ticket.priority}
            currentAssignedToId={ticket.assignedToId}
            currentResolution={ticket.resolution}
            users={users}
          />
        </div>
      </div>
    </div>
  );
}
