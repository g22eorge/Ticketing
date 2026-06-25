import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { OrgModule } from "@prisma/client";

export async function POST(
  req: NextRequest,
  { params }: { params: { orgId: string } }
) {
  const { user } = await requireOrgSession();
  if (!user.isPlatformAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const modules = formData.getAll("modules") as string[];

  const allModules = Object.values(OrgModule).filter(
    (v): v is OrgModule => typeof v === "string"
  );

  const selected = modules.filter((m) => allModules.includes(m as OrgModule));

  const orgId = params.orgId;

  // atomic replace: clear then create selected
  await prisma.$transaction([
    prisma.orgModuleGrant.deleteMany({ where: { orgId } }),
    ...selected.map((module) =>
      prisma.orgModuleGrant.create({ data: { orgId, module: module as OrgModule } })
    ),
  ]);

  // redirect back to the form
  return NextResponse.redirect(new URL(`..`, req.url));
}
