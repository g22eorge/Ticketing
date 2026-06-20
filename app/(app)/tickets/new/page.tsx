import { redirect } from "next/navigation";

import { NewTicketForm } from "@/components/tickets/NewTicketForm";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";

export default async function NewTicketPage() {
  const { user, orgId } = await requireOrgSession();
  if (!can.createJob(user)) {
    redirect("/tickets");
  }

  const clients = await prisma.client.findMany({
    where: { orgId },
    select: { id: true, fullName: true, phone: true, isSLACovered: true },
    orderBy: { fullName: "asc" },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--ink)]">New Ticket</h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">Create an ICT support ticket.</p>
      </div>
      <NewTicketForm clients={clients} />
    </div>
  );
}
