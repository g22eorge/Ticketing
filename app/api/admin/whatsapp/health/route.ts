import { NextResponse } from "next/server";

import { assertPlatformAdmin } from "@/lib/platform-admin";
import { whatsappConfigSummary, whatsappHealthCheck, whatsappIsConfigured } from "@/lib/notifications/whatsapp";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await assertPlatformAdmin();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!whatsappIsConfigured()) {
    return NextResponse.json({ ok: false, configured: false, error: "WhatsApp not configured" });
  }

  const res = await whatsappHealthCheck();
  return NextResponse.json({ ...res, configured: true, config: whatsappConfigSummary() });
}
