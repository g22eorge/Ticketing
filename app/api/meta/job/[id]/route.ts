import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { session, user, orgId } = await requireOrgSession();

  const job = await prisma.job.findFirst({
    where:
      user.role === "TECHNICIAN_EXTERNAL" || user.role === "TECHNICIAN_INTERNAL"
        ? { id, orgId, assignedToId: session.user.id }
        : { id, orgId },
    select: { jobNumber: true },
  });

  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ jobNumber: job.jobNumber });
}
