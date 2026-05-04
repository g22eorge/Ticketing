import { NextResponse } from "next/server";

import { upsertDefaultCommunicationPolicies, upsertDefaultCommunicationTemplates } from "@/lib/notifications/default-templates";
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
    <title>Seed Comms Templates</title>
  </head>
  <body style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; padding: 24px;">
    <h1 style="margin: 0 0 8px;">Seed Default Comms Templates</h1>
    <p style="margin: 0 0 16px;">Admin-only. Upserts the default CommunicationTemplate rows (safe to re-run).</p>
    <button id="run" style="padding: 10px 14px; border: 1px solid #000; background: #000; color: #fff; border-radius: 8px; cursor: pointer;">Seed Defaults</button>
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

  try {
    const [templates, policies] = await Promise.all([
      upsertDefaultCommunicationTemplates(),
      upsertDefaultCommunicationPolicies(),
    ]);

    const ok = Boolean(templates.ok && policies.ok);
    return NextResponse.json({ ok, templates, policies }, { status: ok ? 200 : 500 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, reason: "Server error", detail: message }, { status: 500 });
  }
}
