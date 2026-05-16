"use client";

import { useActionState } from "react";
import { savePesapalSettingsAction, clearPesapalKeyAction, registerIpnAction } from "@/app/(platform)/platform/settings/actions";

type Configured = {
  PESAPAL_CONSUMER_KEY: boolean;
  PESAPAL_CONSUMER_SECRET: boolean;
  PESAPAL_IPN_ID: boolean;
  PESAPAL_CONSUMER_KEY_inDb: boolean;
  PESAPAL_CONSUMER_SECRET_inDb: boolean;
  PESAPAL_IPN_ID_inDb: boolean;
};

type Props = { configured: Configured; webhookUrl: string; ipnId: string | null };

const FIELDS: { key: "PESAPAL_CONSUMER_KEY" | "PESAPAL_CONSUMER_SECRET"; label: string; placeholder: string; hint: string }[] = [
  {
    key: "PESAPAL_CONSUMER_KEY",
    label: "Consumer Key",
    placeholder: "Your Pesapal consumer key",
    hint: "Found in your Pesapal dashboard under API settings.",
  },
  {
    key: "PESAPAL_CONSUMER_SECRET",
    label: "Consumer Secret",
    placeholder: "Your Pesapal consumer secret",
    hint: "Keep this secret — used for server-side API calls only.",
  },
];

export function PesapalSettingsForm({ configured, webhookUrl, ipnId }: Props) {
  const [saveState, saveAction, saving] = useActionState<{ ok: boolean; error?: string } | null, FormData>(savePesapalSettingsAction, null);
  const [, clearAction] = useActionState<{ ok: boolean; error?: string } | null, FormData>(clearPesapalKeyAction, null);
  const [ipnState, ipnAction, registering] = useActionState<{ ok: boolean; ipnId?: string; error?: string } | null, FormData>(registerIpnAction, null);

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Pesapal Configuration</p>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">
          Enter your Pesapal API credentials. Leave a field blank to keep the existing value.
        </p>
      </div>

      <form action={saveAction} className="space-y-4">
        {FIELDS.map((f) => {
          const isSet = configured[f.key];
          const isInDb = configured[`${f.key}_inDb` as keyof Configured];
          return (
            <div key={f.key}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-[var(--ink-muted)]">{f.label}</label>
                <span className={`text-[10px] font-semibold ${isSet ? "text-emerald-600" : "text-[var(--ink-muted)]"}`}>
                  {isSet ? (isInDb ? "✓ Configured (DB)" : "✓ Configured (env)") : "Not configured"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  name={f.key}
                  type="password"
                  autoComplete="off"
                  placeholder={isSet ? "Leave blank to keep existing value" : f.placeholder}
                  className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm font-mono text-[var(--ink)] placeholder:text-[var(--ink-muted)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                />
                {isInDb && (
                  <form action={clearAction}>
                    <input type="hidden" name="key" value={f.key} />
                    <button type="submit" className="rounded-md px-2.5 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors">
                      Clear
                    </button>
                  </form>
                )}
              </div>
              <p className="mt-1 text-[10px] text-[var(--ink-muted)]">{f.hint}</p>
            </div>
          );
        })}

        {saveState && !saveState.ok && <p className="text-xs text-red-600">{saveState.error ?? "Save failed"}</p>}
        {saveState?.ok && <p className="text-xs text-emerald-600">Settings saved successfully.</p>}

        <button
          type="submit"
          disabled={saving}
          className="btn-premium rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Pesapal Settings"}
        </button>
      </form>

      {/* IPN registration */}
      <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">IPN (Webhook) URL</p>
            <p className="mt-0.5 font-mono text-xs text-[var(--ink)] break-all">{webhookUrl}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div>
            <p className="text-[10px] text-[var(--ink-muted)]">
              IPN ID:{" "}
              <span className={`font-mono font-semibold ${(ipnState?.ipnId ?? ipnId) ? "text-emerald-600" : "text-[var(--ink-muted)]"}`}>
                {ipnState?.ipnId ?? ipnId ?? "Not registered"}
              </span>
            </p>
          </div>
          <form action={ipnAction}>
            <button
              type="submit"
              disabled={registering}
              className="rounded-md bg-[var(--gold)]/15 px-3 py-1.5 text-xs font-semibold text-[var(--gold)] hover:bg-[var(--gold)]/25 transition-colors disabled:opacity-50"
            >
              {registering ? "Registering…" : (ipnState?.ipnId ?? ipnId) ? "Re-register IPN" : "Register IPN"}
            </button>
          </form>
          {configured.PESAPAL_IPN_ID_inDb && (
            <form action={clearAction}>
              <input type="hidden" name="key" value="PESAPAL_IPN_ID" />
              <button type="submit" className="text-[10px] text-red-500 underline underline-offset-2">Clear</button>
            </form>
          )}
        </div>

        {ipnState && !ipnState.ok && <p className="text-xs text-red-600">{ipnState.error}</p>}
        {ipnState?.ok && <p className="text-xs text-emerald-600">IPN registered. ID: {ipnState.ipnId}</p>}

        <p className="text-[10px] text-[var(--ink-muted)]">
          Register this URL in your Pesapal dashboard, or click &quot;Register IPN&quot; above to do it automatically via the API.
          Set <code className="font-mono">PESAPAL_ENV=production</code> in env vars for live payments.
        </p>
      </div>
    </div>
  );
}
