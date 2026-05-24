"use client";

import { useActionState } from "react";
import { saveZohoSettingsAction, syncZohoPricesAction } from "@/app/(platform)/platform-admin/settings/actions";
import { formatMoney } from "@/lib/currency";
import { planLabel } from "@/lib/plan-labels";

type Props = {
  configured: {
    ZOHO_CLIENT_ID: boolean;
    ZOHO_CLIENT_SECRET: boolean;
    ZOHO_REFRESH_TOKEN: boolean;
    ZOHO_ORG_ID: boolean;
    ZOHO_PLAN_CODE_STARTER: string | null;
    ZOHO_PLAN_CODE_PROFESSIONAL: string | null;
    ZOHO_PLAN_CODE_ENTERPRISE: string | null;
    ZOHO_REGION: string | null;
  };
  effectivePrices: Record<string, number>;
};

const CRED_FIELDS: { key: "ZOHO_CLIENT_ID" | "ZOHO_CLIENT_SECRET" | "ZOHO_REFRESH_TOKEN" | "ZOHO_ORG_ID"; label: string; type: string }[] = [
  { key: "ZOHO_ORG_ID",       label: "Organisation ID",   type: "text"     },
  { key: "ZOHO_CLIENT_ID",    label: "Client ID",         type: "text"     },
  { key: "ZOHO_CLIENT_SECRET",label: "Client Secret",     type: "password" },
  { key: "ZOHO_REFRESH_TOKEN",label: "Refresh Token",     type: "password" },
];

const APP_PLANS = ["STARTER", "PROFESSIONAL", "ENTERPRISE"] as const;

export function ZohoSyncPanel({ configured, effectivePrices }: Props) {
  const [saveState, saveAction, saving] = useActionState<{ ok: boolean; error?: string } | null, FormData>(
    saveZohoSettingsAction, null,
  );
  const [syncState, syncAction, syncing] = useActionState<
    { ok: boolean; synced?: Record<string, number>; error?: string } | null, FormData
  >(syncZohoPricesAction, null);

  const isConfigured = configured.ZOHO_CLIENT_ID && configured.ZOHO_CLIENT_SECRET &&
    configured.ZOHO_REFRESH_TOKEN && configured.ZOHO_ORG_ID;

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Zoho Subscriptions</p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            Pull plan prices from your Zoho Subscriptions account. Synced prices override the built-in defaults.
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
          isConfigured ? "bg-emerald-100 text-emerald-700" : "bg-[var(--panel-strong)] text-[var(--ink-muted)]"
        }`}>
          {isConfigured ? "Connected" : "Not configured"}
        </span>
      </div>

      {/* Credentials */}
      <form action={saveAction} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {CRED_FIELDS.map((f) => (
            <div key={f.key}>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-semibold text-[var(--ink-muted)]">{f.label}</label>
                {configured[f.key] && (
                  <span className="text-[10px] font-semibold text-emerald-600">✓ Set</span>
                )}
              </div>
              <input
                name={f.key}
                type={f.type}
                autoComplete="off"
                placeholder={configured[f.key] ? "Leave blank to keep existing" : `Enter ${f.label}`}
                className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm font-mono text-[var(--ink)] placeholder:text-[var(--ink-muted)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
              />
            </div>
          ))}
        </div>

        {/* Region */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--ink-muted)]">Region</label>
          <select
            name="ZOHO_REGION"
            defaultValue={configured.ZOHO_REGION ?? "US"}
            className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
          >
            {["US", "EU", "IN", "AU", "JP"].map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {/* Plan code mappings */}
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--ink-muted)]">Plan Code Mapping</p>
          <p className="mb-2 text-[10px] text-[var(--ink-muted)]">
            Enter the Zoho plan codes that correspond to each subscription tier.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {APP_PLANS.map((plan) => {
              const settingKey = `ZOHO_PLAN_CODE_${plan}` as const;
              const current = configured[settingKey];
              return (
                <div key={plan}>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">{planLabel(plan)}</label>
                  <input
                    name={settingKey}
                    type="text"
                    placeholder={current ?? "zoho-plan-code"}
                    defaultValue={current ?? ""}
                    autoComplete="off"
                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm font-mono text-[var(--ink)] placeholder:text-[var(--ink-muted)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                  />
                </div>
              );
            })}
          </div>
        </div>

        {saveState && !saveState.ok && <p className="text-xs text-red-600">{saveState.error ?? "Save failed"}</p>}
        {saveState?.ok && <p className="text-xs text-emerald-600">Zoho settings saved.</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-2 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--panel)] transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Zoho Settings"}
        </button>
      </form>

      {/* Sync + live prices */}
      <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Subscription Prices (UGX)</p>
          <form action={syncAction}>
            <button
              type="submit"
              disabled={syncing || !isConfigured}
              title={!isConfigured ? "Configure Zoho credentials first" : undefined}
              className="rounded-md bg-[var(--gold)]/15 px-3 py-1.5 text-xs font-semibold text-[var(--gold)] hover:bg-[var(--gold)]/25 transition-colors disabled:opacity-40"
            >
              {syncing ? "Syncing…" : "↓ Sync from Zoho"}
            </button>
          </form>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {APP_PLANS.map((plan) => {
            const price = syncState?.synced?.[plan] ?? effectivePrices[plan] ?? 0;
            return (
              <div key={plan} className="rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">{planLabel(plan)}</p>
                <p className="mt-0.5 font-mono text-sm font-semibold text-[var(--ink)]">
                  UGX {formatMoney(price)} / mo
                </p>
              </div>
            );
          })}
        </div>

        {syncState && !syncState.ok && (
          <p className="text-xs text-red-600">{syncState.error}</p>
        )}
        {syncState?.ok && (
          <p className="text-xs text-emerald-600">
            Synced {Object.keys(syncState.synced ?? {}).length} plan price(s) from Zoho.
          </p>
        )}
      </div>
    </div>
  );
}
