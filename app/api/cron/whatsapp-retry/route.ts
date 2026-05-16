import { NextRequest, NextResponse } from "next/server";

import { getOutboxRetryLimit, retryDueOutboundMessages } from "@/lib/notifications/whatsapp-outbox";
import { assertCronAuthorized } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authError = assertCronAuthorized(request);
  if (authError) return authError;

  try {
    const result = await retryDueOutboundMessages(getOutboxRetryLimit(25));
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/whatsapp-retry] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
