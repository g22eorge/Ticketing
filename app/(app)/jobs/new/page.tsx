import { redirect } from "next/navigation";

import { NewJobStepper } from "@/components/jobs/NewJobStepper";
import { can } from "@/lib/permissions";
import { getCurrentUserRole } from "@/lib/session";

export default async function NewJobPage() {
  const { user } = await getCurrentUserRole();
  if (!can.createJob(user)) {
    redirect("/jobs");
  }

  return (
    <div className="space-y-4">
      <NewJobStepper receivedByName={user.name} />
    </div>
  );
}
