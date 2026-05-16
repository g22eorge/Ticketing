import { NextRequest, NextResponse } from "next/server";

import { getAuditRetentionDays, pruneSystemAuditEvents } from "@/lib/commercial/audit-retention";
import { writeSystemAuditEvent } from "@/lib/commercial/audit";
import { assertCronAuthorized } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authError = assertCronAuthorized(request);
  if (authError) return authError;

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
