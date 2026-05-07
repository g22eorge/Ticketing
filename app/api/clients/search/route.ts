import { NextRequest, NextResponse } from "next/server";

import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getOrgSessionOptional } from "@/lib/org-context";

export async function GET(req: NextRequest) {
  const { user, orgId } = await getOrgSessionOptional();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!can.viewClientInfo(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const phone = req.nextUrl.searchParams.get("phone")?.trim();

  if (!phone || phone.length < 3) {
    return NextResponse.json({ client: null });
  }

  const client = await prisma.client.findFirst({
    where: { phone, ...(orgId ? { orgId } : {}) },
    select: { id: true, fullName: true, phone: true, email: true, organization: true },
  });

  return NextResponse.json({ client });
}
