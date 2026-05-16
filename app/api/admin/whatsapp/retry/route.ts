import { NextResponse } from "next/server";

import { assertPlatformAdmin } from "@/lib/platform-admin";
import { getOutboxRetryLimit, retryDueOutboundMessages } from "@/lib/notifications/whatsapp-outbox";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await assertPlatformAdmin();
  if (!user) {
    return NextResponse.redirect(new URL("/login", process.env.BETTER_AUTH_URL ?? "http://localhost:3000"));
  }

  // Simple in-browser runner (uses current session cookies).
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>WhatsApp Retry</title>
  </head>
  <body style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; padding: 24px;">
    <h1 style="margin: 0 0 8px;">MRMS WhatsApp Retry</h1>
    <p style="margin: 0 0 16px;">Retries due WhatsApp outbox messages. Admin only.</p>
    <div style="display:flex; gap:10px; flex-wrap: wrap;">
      <button id="run" style="padding: 10px 14px; border: 1px solid #000; background: #000; color: #fff; border-radius: 8px; cursor: pointer;">Run Retry</button>
      <a href="/api/admin/whatsapp/health" style="padding: 10px 14px; border: 1px solid #ddd; background: #fff; color: #111; border-radius: 8px; text-decoration:none;">View Health</a>
      <a href="/api/admin/probe" style="padding: 10px 14px; border: 1px solid #ddd; background: #fff; color: #111; border-radius: 8px; text-decoration:none;">View Probe</a>
    </div>
    <pre id="out" style="margin-top: 16px; padding: 12px; border: 1px solid #ddd; border-radius: 8px; background: #fafafa; white-space: pre-wrap;"></pre>
    <script>
      const out = document.getElementById('out');
      const btn = document.getElementById('run');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        out.textContent = 'Running...';
        try {
          const res = await fetch(location.pathname, { method: 'POST', credentials: 'include' });
          const text = await res.text();
          out.textContent = text;
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
  const user = await assertPlatformAdmin();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await retryDueOutboundMessages(getOutboxRetryLimit(25));
  return NextResponse.json(result);
}
