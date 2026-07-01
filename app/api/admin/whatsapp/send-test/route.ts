import { NextRequest, NextResponse } from "next/server";

import { assertPlatformAdmin } from "@/lib/platform-admin";
import { sendCustomWhatsAppMessage, whatsappIsConfigured } from "@/lib/notifications/whatsapp";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await assertPlatformAdmin();
  if (!user) {
    return NextResponse.redirect(new URL("/login", process.env.BETTER_AUTH_URL ?? "http://localhost:3000"));
  }

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>WhatsApp Send Test</title>
  </head>
  <body style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; padding: 24px;">
    <h1 style="margin: 0 0 8px;">Service Desk WhatsApp Send Test</h1>
    <p style="margin: 0 0 16px;">Sends a single WhatsApp message via Cloud API. Admin only.</p>
    <div style="display:flex; gap:10px; flex-wrap: wrap; margin-bottom: 12px;">
      <a href="/api/admin/whatsapp/health" style="padding: 10px 14px; border: 1px solid #ddd; background: #fff; color: #111; border-radius: 8px; text-decoration:none;">View Health</a>
      <a href="/api/admin/whatsapp/outbox?channel=WHATSAPP" style="padding: 10px 14px; border: 1px solid #ddd; background: #fff; color: #111; border-radius: 8px; text-decoration:none;">View Outbox</a>
    </div>

    <label style="display:block; font-weight: 600; margin-bottom: 6px;">To (E.164)</label>
    <input id="to" placeholder="+2567..." style="width: 360px; max-width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px;" />
    <div style="height: 10px;"></div>
    <label style="display:block; font-weight: 600; margin-bottom: 6px;">Message</label>
    <textarea id="msg" rows="5" style="width: 560px; max-width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px;"></textarea>
    <div style="height: 12px;"></div>

    <button id="send" style="padding: 10px 14px; border: 1px solid #000; background: #000; color: #fff; border-radius: 8px; cursor: pointer;">Send</button>
    <pre id="out" style="margin-top: 16px; padding: 12px; border: 1px solid #ddd; border-radius: 8px; background: #fafafa; white-space: pre-wrap;"></pre>

    <script>
      const out = document.getElementById('out');
      const btn = document.getElementById('send');
      const to = document.getElementById('to');
      const msg = document.getElementById('msg');

      msg.value = 'Hello! This is a test message from Service Desk.';

      btn.addEventListener('click', async () => {
        btn.disabled = true;
        out.textContent = 'Sending...';
        try {
          const res = await fetch(location.pathname, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ to: to.value, message: msg.value }),
          });
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

export async function POST(request: NextRequest) {
  const user = await assertPlatformAdmin();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!whatsappIsConfigured()) {
    return NextResponse.json({ ok: false, error: "WhatsApp not configured" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const to = typeof body?.to === "string" ? body.to : "";
  const message = typeof body?.message === "string" ? body.message : "";

  if (!to.trim() || !message.trim()) {
    return NextResponse.json({ ok: false, error: "Missing to or message" }, { status: 400 });
  }

  // Keep payload small and predictable.
  if (message.length > 1500) {
    return NextResponse.json({ ok: false, error: "Message too long" }, { status: 400 });
  }

  const result = await sendCustomWhatsAppMessage(to, message);

  const row = await prisma.outboundMessage.create({
    data: {
      channel: "WHATSAPP",
      status: result.success ? "SENT" : "FAILED",
      type: "ADMIN_TEST",
      to,
      body: message,
      provider: "meta",
      providerMessageId: result.messageId ?? null,
      sentAt: result.success ? new Date() : null,
      attemptCount: 1,
      lastAttemptAt: new Date(),
      nextAttemptAt: new Date(0),
      lastErrorCode: result.success ? null : result.errorCode ? `API_ERROR_${result.errorCode}` : "WHATSAPP_ERROR",
      lastError: result.success ? null : result.error ?? "Unknown WhatsApp error",
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: result.success, outboxId: row.id, ...result });
}
