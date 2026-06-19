import { redirect } from "next/navigation";

import { NewTicketForm } from "@/components/tickets/NewTicketForm";
import { can } from "@/lib/permissions";
import { getCurrentUserRole } from "@/lib/session";

export default async function NewTicketPage() {
  const { user } = await getCurrentUserRole();
  if (!can.createJob(user)) {
    redirect("/tickets");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-800">New Ticket</h1>
        <p className="mt-1 text-sm text-stone-500">Create a repair or service ticket.</p>
      </div>
      <NewTicketForm receivedByName={user.name} />
    </div>
  );
}
