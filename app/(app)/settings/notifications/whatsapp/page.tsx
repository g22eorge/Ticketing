import Link from "next/link";
import { redirect } from "next/navigation";

import { requireOrgSession } from "@/lib/org-context";
import { getOrgWhatsAppConfig } from "@/lib/org-whatsapp-config";
import { whatsappHealthCheckForOrg } from "@/lib/notifications/whatsapp";
import { WhatsAppTestPanel } from "@/components/settings/WhatsAppTestPanel";
import { WhatsAppConfigForm } from "@/components/settings/WhatsAppConfigForm";
import { ATSmsConfigForm } from "@/components/settings/ATSmsConfigForm";
import { checkSmsQuota } from "@/lib/notifications/sms-quota";
import { getPlatformSettings } from "@/lib/platform-settings";

export const dynamic = "force-dynamic";

export default async function WhatsAppSettingsPage() {
  const { user, orgId } = await requireOrgSession();
  if (user.role !== "ADMIN") redirect("/settings/notifications");

  const platformAtStored = await getPlatformSettings(["AT_API_KEY", "AT_USERNAME"]);
  const platformAtConfigured =
    Boolean((platformAtStored.AT_API_KEY && platformAtStored.AT_USERNAME) || (process.env.AT_API_KEY && process.env.AT_USERNAME));

  const [orgConfig, smsStats] = await Promise.all([
    getOrgWhatsAppConfig(orgId),
    platformAtConfigured ? checkSmsQuota(orgId) : Promise.resolve(null),
  ]);
  const health = orgConfig ? await whatsappHealthCheckForOrg(orgId) : null;

  const healthData = health as (typeof health & {
    display_phone_number?: string;
    verified_name?: string;
    code_verification_status?: string;
    quality_rating?: string;
  }) | null;

  return (
    <div className="space-y-4">
      {/* Back link */}
      <Link
        href="/settings/notifications"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Notifications
      </Link>

      {/* Connected account panel */}
      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
              WhatsApp Business Account
            </p>
            <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
              Messages sent from your number via Meta Cloud API.
            </p>
          </div>
          {health?.ok ? (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Connected
            </span>
          ) : orgConfig ? (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              Error
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-muted)]">
              Not configured
            </span>
          )}
        </div>

        {orgConfig ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--ink-muted)]">Business Number</p>
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#25D366]/15">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="#25D366">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </span>
                <p className="font-mono text-sm font-semibold text-[var(--ink)]">
                  {healthData?.display_phone_number ?? orgConfig.businessNumber}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--ink-muted)]">Verified Name</p>
              <p className="text-sm font-semibold text-[var(--ink)]">
                {healthData?.verified_name ?? "—"}
              </p>
            </div>

            <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--ink-muted)]">Verification</p>
              <p className="text-sm font-semibold text-[var(--ink)]">
                {healthData?.code_verification_status ?? "—"}
              </p>
            </div>

            <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--ink-muted)]">Quality Rating</p>
              <p className="text-sm font-semibold text-[var(--ink)]">
                {healthData?.quality_rating ?? "—"}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
            Connect your Meta WhatsApp Business account below to enable WhatsApp notifications for your customers.
          </div>
        )}

        {health && !health.ok && orgConfig && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            <span className="font-semibold">API error:</span> {health.error}
          </div>
        )}
      </div>

      {/* Config form */}
      <WhatsAppConfigForm orgId={orgId} current={orgConfig} />

      {/* Send test — only if connected */}
      {health?.ok && orgConfig ? (
        <WhatsAppTestPanel
          from={healthData?.display_phone_number ?? orgConfig.businessNumber}
          verifiedName={healthData?.verified_name ?? null}
        />
      ) : null}

      {/* SMS Notifications */}
      <ATSmsConfigForm
        orgId={orgId}
        smsFallback={orgConfig?.smsFallback ?? false}
        platformConfigured={platformAtConfigured}
        stats={smsStats}
      />

      {/* Links */}
      <div className="flex flex-wrap gap-3">
        <Link
          href="/settings/notifications/outbox"
          className="btn-premium-secondary rounded-lg px-3 py-1.5 text-sm"
        >
          View Message Outbox →
        </Link>
      </div>
    </div>
  );
}
