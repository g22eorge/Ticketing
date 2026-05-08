import { redirect } from "next/navigation";
import { getCurrentUserRole } from "@/lib/session";
import { getPlatformSettings } from "@/lib/platform-settings";
import { FlutterwaveSettingsForm } from "@/components/platform/FlutterwaveSettingsForm";

export const dynamic = "force-dynamic";

export default async function PlatformSettingsPage() {
  const { user } = await getCurrentUserRole();
  const platformEmail = process.env.PLATFORM_ADMIN_EMAIL;
  if (!platformEmail || user!.email !== platformEmail) redirect("/dashboard");

  const stored = await getPlatformSettings(["FLW_SECRET_KEY", "FLW_PUBLIC_KEY", "FLW_WEBHOOK_SECRET"]);

  // Mask stored values — only show whether they're set, not the actual value
  const configured = {
    FLW_SECRET_KEY: !!stored.FLW_SECRET_KEY || !!process.env.FLW_SECRET_KEY,
    FLW_PUBLIC_KEY: !!stored.FLW_PUBLIC_KEY || !!process.env.FLW_PUBLIC_KEY,
    FLW_WEBHOOK_SECRET: !!stored.FLW_WEBHOOK_SECRET || !!process.env.FLW_WEBHOOK_SECRET,
    // indicate whether the value comes from DB (overridable) vs env-only
    FLW_SECRET_KEY_inDb: !!stored.FLW_SECRET_KEY,
    FLW_PUBLIC_KEY_inDb: !!stored.FLW_PUBLIC_KEY,
    FLW_WEBHOOK_SECRET_inDb: !!stored.FLW_WEBHOOK_SECRET,
  };

  const webhookUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/flutterwave`
    : "/api/webhooks/flutterwave";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--ink)]">Platform Settings</h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          Configure platform-wide integrations. Values saved here override environment variables.
        </p>
      </div>

      {/* Flutterwave */}
      <FlutterwaveSettingsForm configured={configured} webhookUrl={webhookUrl} />

      {/* Pricing reference */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Subscription Pricing (UGX)</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { plan: "GROWTH", price: "95,000 / month" },
            { plan: "ENTERPRISE", price: "180,000 / month" },
          ].map((p) => (
            <div key={p.plan} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">{p.plan}</p>
              <p className="mt-0.5 font-mono text-sm font-semibold text-[var(--ink)]">UGX {p.price}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-[var(--ink-muted)]">
          Prices are defined in <code className="font-mono">lib/flutterwave.ts</code> → <code className="font-mono">FLW_PLAN_PRICES</code>.
        </p>
      </div>
    </div>
  );
}
