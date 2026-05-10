import { NextResponse } from "next/server";

import { getCurrentUserRole } from "@/lib/session";

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

  return NextResponse.json(
    {
      ok: true,
      message: "Default communication templates are no longer seeded. Orgs create their own templates in /settings/notifications/templates.",
    },
    { status: 200 },
  );
}

export async function POST() {
  const user = await requirePlatformAdmin();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(
    {
      ok: false,
      reason: "Disabled",
      message: "Default communication templates are no longer seeded. Create org templates in /settings/notifications/templates.",
    },
    { status: 410 },
  );
}
