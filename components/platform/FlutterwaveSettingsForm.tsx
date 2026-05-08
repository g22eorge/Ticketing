"use client";

import { useActionState } from "react";
import { saveFlutterwaveSettingsAction, clearFlutterwaveKeyAction } from "@/app/(platform)/platform/settings/actions";

type Configured = {
  FLW_SECRET_KEY: boolean;
  FLW_PUBLIC_KEY: boolean;
  FLW_WEBHOOK_SECRET: boolean;
  FLW_SECRET_KEY_inDb: boolean;
  FLW_PUBLIC_KEY_inDb: boolean;
  FLW_WEBHOOK_SECRET_inDb: boolean;
};

type Props = { configured: Configured; webhookUrl: string };

type SaveState = { ok: boolean; error?: string } | null;
type ClearState = { ok: boolean; error?: string } | null;

const FIELDS: { key: keyof Configured; label: string; placeholder: string; hint: string }[] = [
  {
    key: "FLW_SECRET_KEY",
    label: "Secret Key",
    placeholder: "FLWSECK_TEST-…",
    hint: "Used for server-side API calls. Never expose to the browser.",
  },
  {
    key: "FLW_PUBLIC_KEY",
    label: "Public Key",
    placeholder: "FLWPUBK_TEST-…",
    hint: "Used to initialise the Flutterwave payment modal on the client.",
  },
  {
    key: "FLW_WEBHOOK_SECRET",
    label: "Webhook Secret",
    placeholder: "Your webhook verif-hash secret",
    hint: "Set the same value in your Flutterwave dashboard Webhook settings.",
  },
];

export function FlutterwaveSettingsForm({ configured, webhookUrl }: Props) {
  const [saveState, saveAction, saving] = useActionState<SaveState, FormData>(saveFlutterwaveSettingsAction, null);
  const [, clearAction] = useActionState<ClearState, FormData>(clearFlutterwaveKeyAction, null);

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Flutterwave Configuration</p>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">
          Enter your Flutterwave API credentials. Leave a field blank to keep the existing value.
        </p>
      </div>

      <form action={saveAction} className="space-y-4">
        {FIELDS.map((f) => {
          const isSet = configured[f.key];
          const isInDb = configured[`${f.key}_inDb` as keyof Configured];
          return (
            <div key={f.key}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-[var(--ink-muted)]">
                  {f.label}
                </label>
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
                    <button
                      type="submit"
                      className="rounded-md px-2.5 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors"
                      title="Remove stored value (will fall back to env var)"
                    >
                      Clear
                    </button>
                  </form>
                )}
              </div>
              <p className="mt-1 text-[10px] text-[var(--ink-muted)]">{f.hint}</p>
            </div>
          );
        })}

        {saveState && !saveState.ok && (
          <p className="text-xs text-red-600">{saveState.error ?? "Save failed"}</p>
        )}
        {saveState?.ok && (
          <p className="text-xs text-emerald-600">Settings saved successfully.</p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="btn-premium rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Flutterwave Settings"}
        </button>
      </form>

      {/* Webhook URL */}
      <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Webhook URL</p>
        <p className="font-mono text-xs text-[var(--ink)] break-all">{webhookUrl}</p>
        <p className="mt-1 text-[10px] text-[var(--ink-muted)]">
          Add this URL in your Flutterwave dashboard under Settings → Webhooks. Set the hash secret to match your Webhook Secret above.
        </p>
      </div>
    </div>
  );
}
