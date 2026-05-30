"use client";

import { useActionState } from "react";
import { saveAtSettingsAction, clearPlatformKeyAction } from "@/app/(platform)/platform/settings/actions";

type Configured = {
  AT_API_KEY: boolean;
  AT_USERNAME: boolean;
  AT_SENDER_ID: boolean;
  AT_API_KEY_inDb: boolean;
  AT_USERNAME_inDb: boolean;
  AT_SENDER_ID_inDb: boolean;
};

type Props = { configured: Configured };

const FIELDS: {
  key: "AT_API_KEY" | "AT_USERNAME" | "AT_SENDER_ID";
  label: string;
  placeholder: string;
  hint: string;
  type?: "password" | "text";
}[] = [
  {
    key: "AT_API_KEY",
    label: "API Key",
    placeholder: "Your Africa's Talking API key",
    hint: "Saved at platform level and used for SMS sending.",
    type: "password",
  },
  {
    key: "AT_USERNAME",
    label: "Username",
    placeholder: "Your Africa's Talking username",
    hint: "Your Africa's Talking application username.",
    type: "text",
  },
  {
    key: "AT_SENDER_ID",
    label: "Sender ID (optional)",
    placeholder: "e.g. EAGLEINFO",
    hint: "Optional sender ID. Leave blank to use the default short code.",
    type: "text",
  },
];

export function ATSmsPlatformSettingsForm({ configured }: Props) {
  const [saveState, saveAction, saving] = useActionState<{ ok: boolean; error?: string } | null, FormData>(saveAtSettingsAction, null);
  const [, clearAction] = useActionState<{ ok: boolean; error?: string } | null, FormData>(clearPlatformKeyAction, null);

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-5">
      <div>
        <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Africa&apos;s Talking (SMS)</p>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">
          Configure platform-wide SMS credentials. Values saved here override environment variables.
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
                <span className={`text-[12px] font-semibold ${isSet ? "text-emerald-600" : "text-[var(--ink-muted)]"}`}>
                  {isSet ? (isInDb ? "✓ Configured (DB)" : "✓ Configured (env)") : "Not configured"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  name={f.key}
                  type={f.type ?? "text"}
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
              <p className="mt-1 text-[12px] text-[var(--ink-muted)]">{f.hint}</p>
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
          {saving ? "Saving…" : "Save SMS Settings"}
        </button>
      </form>
    </div>
  );
}
