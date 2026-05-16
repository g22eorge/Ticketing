import { NextRequest, NextResponse } from "next/server";

import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";

export async function GET(req: NextRequest) {
  const { user, orgId } = await requireOrgSession();
  if (!can.viewClientInfo(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ clients: [] });
  }

  const clients = await prisma.client.findMany({
    where: {
      orgId,
      OR: [
        { fullName: { contains: q } },
        { phone: { contains: q } },
        { email: { contains: q } },
        { organization: { contains: q } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 8,
    select: { id: true, fullName: true, phone: true, email: true, organization: true },
  });

  return NextResponse.json({ clients });
}
