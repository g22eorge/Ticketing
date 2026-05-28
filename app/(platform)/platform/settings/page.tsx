import { getPlatformSettings, getPlatformSetting } from "@/lib/platform-settings";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { PesapalSettingsForm } from "@/components/platform/PesapalSettingsForm";
import { ATSmsPlatformSettingsForm } from "@/components/platform/ATSmsPlatformSettingsForm";
import { PLAN_PRICES } from "@/lib/pesapal";
import { formatMoney } from "@/lib/currency";

export const dynamic = "force-dynamic";

export default async function PlatformSettingsPage() {
  await requirePlatformAdmin();

  const [stored, ipnId] = await Promise.all([
    getPlatformSettings([
      "PESAPAL_CONSUMER_KEY",
      "PESAPAL_CONSUMER_SECRET",
      "PESAPAL_IPN_ID",
      "AT_API_KEY",
      "AT_USERNAME",
      "AT_SENDER_ID",
    ]),
    getPlatformSetting("PESAPAL_IPN_ID"),
  ]);

  const configured = {
    PESAPAL_CONSUMER_KEY: !!stored.PESAPAL_CONSUMER_KEY || !!process.env.PESAPAL_CONSUMER_KEY,
    PESAPAL_CONSUMER_SECRET: !!stored.PESAPAL_CONSUMER_SECRET || !!process.env.PESAPAL_CONSUMER_SECRET,
    PESAPAL_IPN_ID: !!stored.PESAPAL_IPN_ID,
    PESAPAL_CONSUMER_KEY_inDb: !!stored.PESAPAL_CONSUMER_KEY,
    PESAPAL_CONSUMER_SECRET_inDb: !!stored.PESAPAL_CONSUMER_SECRET,
    PESAPAL_IPN_ID_inDb: !!stored.PESAPAL_IPN_ID,
  };

  const atConfigured = {
    AT_API_KEY: !!stored.AT_API_KEY || !!process.env.AT_API_KEY,
    AT_USERNAME: !!stored.AT_USERNAME || !!process.env.AT_USERNAME,
    AT_SENDER_ID: !!stored.AT_SENDER_ID || !!process.env.AT_SENDER_ID,
    AT_API_KEY_inDb: !!stored.AT_API_KEY,
    AT_USERNAME_inDb: !!stored.AT_USERNAME,
    AT_SENDER_ID_inDb: !!stored.AT_SENDER_ID,
  };

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const webhookUrl = `${baseUrl}/api/webhooks/pesapal`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--ink)]">Platform Settings</h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          Configure platform-wide integrations. Values saved here override environment variables.
        </p>
      </div>

      <PesapalSettingsForm configured={configured} webhookUrl={webhookUrl} ipnId={ipnId} />

      <ATSmsPlatformSettingsForm configured={atConfigured} />

      {/* Pricing reference */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Subscription Pricing (UGX)</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["GROWTH", "ENTERPRISE"] as const).map((plan) => (
            <div key={plan} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">{plan}</p>
              <p className="mt-0.5 font-mono text-sm font-semibold text-[var(--ink)]">UGX {formatMoney(PLAN_PRICES[plan])} / month</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-[var(--ink-muted)]">
          Prices are defined in <code className="font-mono">lib/pesapal.ts</code> → <code className="font-mono">PLAN_PRICES</code>.
        </p>
      </div>

      {/* Environment */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Environment</p>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
            process.env.PESAPAL_ENV === "production"
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-amber-400/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          }`}>
            {process.env.PESAPAL_ENV === "production" ? "Production" : "Sandbox"}
          </span>
          <p className="text-xs text-[var(--ink-muted)]">
            Set <code className="font-mono">PESAPAL_ENV=production</code> in env vars to switch to live payments.
          </p>
        </div>
      </div>
    </div>
  );
}
