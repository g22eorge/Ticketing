import { NextResponse } from "next/server";

import { getCurrentUserRole } from "@/lib/session";
import { whatsappConfigSummary, whatsappHealthCheck, whatsappIsConfigured } from "@/lib/notifications/whatsapp";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user } = await getCurrentUserRole();
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!whatsappIsConfigured()) {
    return NextResponse.json({ ok: false, configured: false, error: "WhatsApp not configured" });
  }

  const res = await whatsappHealthCheck();
  return NextResponse.json({ ...res, configured: true, config: whatsappConfigSummary() });
}
