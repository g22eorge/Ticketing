import { NextRequest, NextResponse } from "next/server";

import { getOutboxRetryLimit, retryDueOutboundMessages } from "@/lib/notifications/whatsapp-outbox";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Vercel Cron adds x-vercel-cron: 1
  const isVercelCron = request.headers.get("x-vercel-cron") === "1";
  const secret = process.env.CRON_SECRET;
  const provided = request.nextUrl.searchParams.get("secret");

  if (!isVercelCron && (!secret || provided !== secret)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await retryDueOutboundMessages(getOutboxRetryLimit(25));
  return NextResponse.json(result);
}
