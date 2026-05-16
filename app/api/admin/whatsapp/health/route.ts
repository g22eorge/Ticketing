import { NextResponse } from "next/server";

import { getCurrentUserRole } from "@/lib/session";
import { whatsappConfigSummary, whatsappHealthCheck, whatsappIsConfigured } from "@/lib/notifications/whatsapp";

export const dynamic = "force-dynamic";

async function requirePlatformAdmin() {
  const { user } = await getCurrentUserRole();
  const platformEmail = process.env.PLATFORM_ADMIN_EMAIL;
  if (!platformEmail || !user?.email || user.email !== platformEmail) return null;
  if (user.role !== "ADMIN") return null;
  return user;
}

export async function GET() {
  const user = await requirePlatformAdmin();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!whatsappIsConfigured()) {
    return NextResponse.json({ ok: false, configured: false, error: "WhatsApp not configured" });
  }

  const res = await whatsappHealthCheck();
  return NextResponse.json({ ...res, configured: true, config: whatsappConfigSummary() });
}
