import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserRoleOptional } from "@/lib/session";
import { checkIsPlatformAdmin } from "@/lib/platform-admin";

function csvEscape(value: unknown) {
  const raw = value === null || value === undefined ? "" : String(value);
  if (raw.includes(",") || raw.includes("\n") || raw.includes('"')) {
    return `"${raw.replaceAll('"', '""')}"`;
  }
  return raw;
}

function toCsv(rows: Array<Record<string, unknown>>) {
  const headers = ["createdAt", "orgId", "actorUserId", "entityType", "entityId", "action", "summary", "beforeJson", "afterJson"];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
}

export async function GET(req: NextRequest) {
  const { user } = await getCurrentUserRoleOptional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isPlatformAdmin = checkIsPlatformAdmin(user.email) && user.role === "ADMIN";
  const scope = req.nextUrl.searchParams.get("scope") ?? "org";
  const action = req.nextUrl.searchParams.get("action")?.trim() ?? "";
  const requestedOrgId = req.nextUrl.searchParams.get("orgId")?.trim() ?? "";

  let orgId: string | undefined;
  if (scope === "platform") {
    if (!isPlatformAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    orgId = requestedOrgId || undefined;
  } else {
    if (user.role !== "ADMIN" || !user.orgId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    orgId = user.orgId;
  }

  const events = await prisma.systemAuditEvent
    .findMany({
      where: {
        ...(orgId ? { orgId } : {}),
        ...(action ? { action } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
      select: {
        createdAt: true,
        orgId: true,
        actorUserId: true,
        entityType: true,
        entityId: true,
        action: true,
        summary: true,
        beforeJson: true,
        afterJson: true,
      },
    })
    .catch(() => []);

  const rows = events.map((event) => ({
    ...event,
    createdAt: event.createdAt.toISOString(),
  }));

  const csv = toCsv(rows);
  const filenameScope = scope === "platform" ? "platform" : "org";
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="audit-${filenameScope}-${date}.csv"`,
    },
  });
}
