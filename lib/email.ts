import { Resend } from "resend";

const FROM = process.env.EMAIL_FROM ?? "Techserve ICT Solutions <noreply@app.eagleinfosolutions.com>";

async function send(to: string, subject: string, html: string) {
  if (!process.env.RESEND_API_KEY) {
    return;
  }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch (err) {
    console.error("[email] send failed", err);
  }
}

// Shared styles
const base = (body: string) => `
  <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#0a1628;color:#e5e5e5;border-radius:12px">
    <div style="margin-bottom:24px">
      <span style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#4F8EF7">Techserve ICT Solutions</span>
    </div>
    ${body}
    <div style="margin-top:32px;border-top:1px solid #2a2a2a;padding-top:16px">
      <p style="font-size:11px;color:#555;margin:0">You're receiving this because you have an account on Techserve ICT Solutions.</p>
    </div>
  </div>
`;

export async function sendWelcomeEmail(to: string, name: string, orgName: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  await send(to, `Welcome to Techserve ICT Solutions — ${orgName}`, base(`
    <h2 style="font-size:20px;font-weight:700;color:#fff;margin:0 0 8px">Welcome, ${name}!</h2>
    <p style="color:#aaa;line-height:1.6;margin:0 0 24px">Your workspace <strong style="color:#fff">${orgName}</strong> is live. You're on a free 14-day trial — no credit card needed.</p>
    <a href="${appUrl}/dashboard" style="display:inline-block;background:#4F8EF7;color:#000;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none">Open your workspace →</a>
  `));
}

export async function sendTrialExpiryWarning(to: string, name: string, orgName: string, daysLeft: number) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  await send(to, `Your trial ends in ${daysLeft} day${daysLeft !== 1 ? "s" : ""} — ${orgName}`, base(`
    <h2 style="font-size:20px;font-weight:700;color:#fff;margin:0 0 8px">Trial ending soon</h2>
    <p style="color:#aaa;line-height:1.6;margin:0 0 24px">Your free trial for <strong style="color:#fff">${orgName}</strong> ends in <strong style="color:#4F8EF7">${daysLeft} day${daysLeft !== 1 ? "s" : ""}</strong>. Upgrade to keep your data and continue managing repairs.</p>
    <a href="${appUrl}/settings/billing" style="display:inline-block;background:#4F8EF7;color:#000;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none">Upgrade now →</a>
  `));
}

export async function sendPaymentConfirmation(to: string, name: string, orgName: string, plan: string, amount: number) {
  await send(to, `Payment confirmed — ${orgName}`, base(`
    <h2 style="font-size:20px;font-weight:700;color:#fff;margin:0 0 8px">Payment confirmed ✓</h2>
    <p style="color:#aaa;line-height:1.6;margin:0 0 24px">Thank you, ${name}. Your <strong style="color:#fff">${plan}</strong> subscription for <strong style="color:#fff">${orgName}</strong> is active.</p>
    <div style="background:#1a1a1a;border-radius:8px;padding:16px;margin-bottom:24px">
      <p style="margin:0;font-size:13px;color:#aaa">Amount charged</p>
      <p style="margin:4px 0 0;font-size:24px;font-weight:700;color:#4F8EF7">UGX ${amount.toLocaleString()}</p>
    </div>
    <p style="color:#555;font-size:12px;margin:0">You will be billed monthly. Cancel anytime from Settings → Billing.</p>
  `));
}

export async function sendPaymentFailedAlert(to: string, name: string, orgName: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  await send(to, `Action required: payment failed — ${orgName}`, base(`
    <h2 style="font-size:20px;font-weight:700;color:#e55;margin:0 0 8px">Payment failed</h2>
    <p style="color:#aaa;line-height:1.6;margin:0 0 24px">We couldn't process your payment for <strong style="color:#fff">${orgName}</strong>. Please update your payment method to avoid losing access.</p>
    <a href="${appUrl}/settings/billing" style="display:inline-block;background:#4F8EF7;color:#000;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none">Update payment →</a>
  `));
}
