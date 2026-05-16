import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { user, orgId } = await requireOrgSession();

  if (user.role === "TECHNICIAN_EXTERNAL" || user.role === "TECHNICIAN_INTERNAL") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const client = await prisma.client.findFirst({
    where: { id, orgId },
    select: { fullName: true },
  });

  if (!client) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ fullName: client.fullName });
}
