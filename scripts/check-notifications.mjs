#!/usr/bin/env node

const base = process.env.SMOKE_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const email = process.env.SMOKE_EMAIL ?? "admin@eagle.local";
const password = process.env.SMOKE_PASSWORD ?? "Admin123!";

function cookieHeaderFromSetCookie(setCookieValues) {
  return setCookieValues
    .map((value) => value.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore
  }
  return { res, json, text };
}

async function run() {
  console.log(`BASE: ${base}`);

  const signin = await fetch(`${base}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, callbackURL: "/dashboard" }),
    redirect: "manual",
  });
  const setCookieValues = signin.headers.getSetCookie();
  const cookieHeader = cookieHeaderFromSetCookie(setCookieValues);
  if (!signin.ok || cookieHeader.length === 0) {
    console.error(`FAIL: sign-in -> ${signin.status}`);
    const body = await signin.text().catch(() => "");
    console.error(body.slice(0, 500));
    process.exit(1);
  }
  console.log(`OK: sign-in -> ${signin.status}`);

  const headers = { cookie: cookieHeader, accept: "application/json" };

  const probe = await fetchJson(`${base}/api/admin/probe`, { headers, redirect: "manual" });
  if (!probe.res.ok || !probe.json) {
    console.error(`FAIL: GET /api/admin/probe -> ${probe.res.status}`);
    console.error(probe.text.slice(0, 500));
    process.exit(1);
  }
  const whatsappConfigured = probe.json["whatsapp:configured"]?.result?.configured;
  const emailConfigured = probe.json["email:configured"]?.result?.configured;
  console.log(`OK: probe whatsapp.configured=${Boolean(whatsappConfigured)} email.configured=${Boolean(emailConfigured)}`);

  const health = await fetchJson(`${base}/api/admin/whatsapp/health`, { headers, redirect: "manual" });
  if (!health.res.ok || !health.json) {
    console.error(`FAIL: GET /api/admin/whatsapp/health -> ${health.res.status}`);
    console.error(health.text.slice(0, 500));
    process.exit(1);
  }
  console.log(`OK: whatsapp health ok=${Boolean(health.json.ok)}`);
  if (!health.json.ok) console.log(`Health error: ${health.json.error ?? "unknown"}`);

  const retry = await fetchJson(`${base}/api/admin/whatsapp/retry`, {
    method: "POST",
    headers,
    redirect: "manual",
  });
  if (!retry.res.ok || !retry.json) {
    console.error(`FAIL: POST /api/admin/whatsapp/retry -> ${retry.res.status}`);
    console.error(retry.text.slice(0, 500));
    process.exit(1);
  }
  console.log(
    `OK: retry processed=${retry.json.processed} sent=${retry.json.sent} failed=${retry.json.failed}`,
  );

  const outboxEmailFailed = await fetchJson(
    `${base}/api/admin/whatsapp/outbox?channel=EMAIL&status=FAILED`,
    { headers, redirect: "manual" },
  );
  if (outboxEmailFailed.res.ok && outboxEmailFailed.json?.ok) {
    console.log(`OK: outbox EMAIL FAILED rows=${outboxEmailFailed.json.rows?.length ?? 0}`);
    const sample = outboxEmailFailed.json.rows?.[0];
    if (sample?.lastError) console.log(`Sample EMAIL error: ${String(sample.lastError).slice(0, 160)}`);
  } else {
    console.error(`WARN: cannot read outbox EMAIL FAILED -> ${outboxEmailFailed.res.status}`);
  }

  const outboxWhatsAppFailed = await fetchJson(
    `${base}/api/admin/whatsapp/outbox?channel=WHATSAPP&status=FAILED`,
    { headers, redirect: "manual" },
  );
  if (outboxWhatsAppFailed.res.ok && outboxWhatsAppFailed.json?.ok) {
    console.log(`OK: outbox WHATSAPP FAILED rows=${outboxWhatsAppFailed.json.rows?.length ?? 0}`);
    const sample = outboxWhatsAppFailed.json.rows?.[0];
    if (sample?.lastErrorCode) console.log(`Sample WA errorCode: ${sample.lastErrorCode}`);
  } else {
    console.error(`WARN: cannot read outbox WHATSAPP FAILED -> ${outboxWhatsAppFailed.res.status}`);
  }
}

run().catch((e) => {
  console.error("FAIL: check-notifications crashed:", e?.message ?? String(e));
  process.exit(1);
});
