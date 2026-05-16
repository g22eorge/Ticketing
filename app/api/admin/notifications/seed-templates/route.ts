import { NextResponse } from "next/server";

import { assertPlatformAdmin } from "@/lib/platform-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await assertPlatformAdmin();
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
  const user = await assertPlatformAdmin();
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
