import { NextRequest, NextResponse } from "next/server";

import { getAuditRetentionDays, pruneSystemAuditEvents } from "@/lib/commercial/audit-retention";
import { writeSystemAuditEvent } from "@/lib/commercial/audit";

export const dynamic = "force-dynamic";

function isCronAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const provided = request.nextUrl.searchParams.get("secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (secret) return provided === secret;
  return process.env.NODE_ENV !== "production" && request.headers.get("x-vercel-cron") === "1";
}

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const days = await getAuditRetentionDays();
  const result = await pruneSystemAuditEvents(days);
  await writeSystemAuditEvent({
    entityType: "SystemAuditEvent",
    entityId: "retention-cron",
    action: "CRON_AUDIT_EVENTS_PRUNED",
    summary: "Scheduled audit retention prune completed",
    after: { deleted: result.deleted, cutoff: result.cutoff.toISOString(), days: result.days },
  });

  return NextResponse.json({ ok: true, ...result, cutoff: result.cutoff.toISOString() });
}
