import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user } = await getCurrentUserRole();
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Enable Notifications</title>
  </head>
  <body style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; padding: 24px;">
    <h1 style="margin: 0 0 8px;">Enable Notifications (All Users)</h1>
    <p style="margin: 0 0 16px;">Admin-only. Creates preferences rows if missing and enables all in-app notification events + WhatsApp toggle.</p>
    <button id="run" style="padding: 10px 14px; border: 1px solid #000; background: #000; color: #fff; border-radius: 8px; cursor: pointer;">Enable All</button>
    <pre id="out" style="margin-top: 16px; padding: 12px; border: 1px solid #ddd; border-radius: 8px; background: #fafafa; white-space: pre-wrap;"></pre>
    <script>
      const out = document.getElementById('out');
      const btn = document.getElementById('run');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        out.textContent = 'Running...';
        try {
          const res = await fetch(location.href, { method: 'POST', credentials: 'include' });
          out.textContent = await res.text();
        } catch (e) {
          out.textContent = String(e);
        } finally {
          btn.disabled = false;
        }
      });
    </script>
  </body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function POST() {
  const { user } = await getCurrentUserRole();
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  if (users.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const userIds = users.map((u) => u.id);

  // Create rows for users who don't have them yet.
  const existing = await prisma.notificationPreferences.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true },
  });
  const existingSet = new Set(existing.map((p) => p.userId));
  const missing = userIds.filter((id) => !existingSet.has(id));
  if (missing.length > 0) {
    await prisma.notificationPreferences.createMany({
      data: missing.map((userId) => ({ userId })),
    });
  }

  // Enable everything.
  const res = await prisma.notificationPreferences.updateMany({
    where: { userId: { in: userIds } },
    data: {
      notifyStatusChange: true,
      notifyApprovalNeeded: true,
      notifyJobAssigned: true,
      notifyEstimateSubmitted: true,
      notifyPaymentReceived: true,
      notifyPayoutGenerated: true,
      notifyTimelineUpdated: true,
      notifyDelayNote: true,
      whatsappEnabled: true,
      // Leave email off by default until configured
      emailEnabled: false,
    },
  });

  return NextResponse.json({ ok: true, updated: res.count });
}
