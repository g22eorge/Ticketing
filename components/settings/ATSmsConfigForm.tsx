"use client";

import { useActionState } from "react";
import { saveATConfigAction } from "@/app/(app)/settings/notifications/whatsapp/actions";

type ATConfig = {
  atApiKey: string | null;
  atUsername: string | null;
  atSenderId: string | null;
  smsFallback: boolean;
};

export function ATSmsConfigForm({ orgId, current }: { orgId: string; current: ATConfig | null }) {
  const [state, action, pending] = useActionState<
    { ok: boolean; error?: string } | null,
    FormData
  >(saveATConfigAction, null);

  const configured = Boolean(current?.atApiKey && current?.atUsername);

  return (
    <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
            Africa&apos;s Talking — SMS
          </p>
          <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
            Send SMS notifications via Africa&apos;s Talking. Can also serve as WhatsApp fallback.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
            configured
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]"
          }`}
        >
          {configured ? "✓ Configured" : "Not configured"}
        </span>
      </div>

      <form action={action} className="space-y-3">
        <input type="hidden" name="orgId" value={orgId} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--ink-muted)]">
              API Key <span className="text-red-500">*</span>
            </label>
            <input
              name="atApiKey"
              type="password"
              autoComplete="off"
              placeholder={configured ? "Leave blank to keep existing" : "AT API key…"}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm font-mono text-[var(--ink)] placeholder:text-[var(--ink-muted)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
            />
            <p className="mt-1 text-[10px] text-[var(--ink-muted)]">
              Africa&apos;s Talking dashboard → Settings → API Key.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--ink-muted)]">
              Username <span className="text-red-500">*</span>
            </label>
            <input
              name="atUsername"
              type="text"
              placeholder="sandbox or your AT username"
              defaultValue={current?.atUsername ?? ""}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm font-mono text-[var(--ink)] placeholder:text-[var(--ink-muted)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--ink-muted)]">
              Sender ID{" "}
              <span className="font-normal text-[var(--ink-muted)]">(optional)</span>
            </label>
            <input
              name="atSenderId"
              type="text"
              placeholder="e.g. REPAIR-MGR"
              defaultValue={current?.atSenderId ?? ""}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm font-mono text-[var(--ink)] placeholder:text-[var(--ink-muted)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
            />
            <p className="mt-1 text-[10px] text-[var(--ink-muted)]">
              Alphanumeric, max 11 chars. Must be registered with Africa&apos;s Talking.
            </p>
          </div>

          <div className="flex items-start gap-2.5 pt-5">
            <input
              id="smsFallback"
              name="smsFallback"
              type="checkbox"
              defaultChecked={current?.smsFallback ?? false}
              className="mt-0.5 h-4 w-4 rounded border-[var(--line)] accent-[var(--accent)]"
            />
            <div>
              <label
                htmlFor="smsFallback"
                className="cursor-pointer text-xs font-semibold text-[var(--ink)]"
              >
                SMS fallback
              </label>
              <p className="mt-0.5 text-[10px] text-[var(--ink-muted)]">
                If a WhatsApp message fails to deliver, automatically retry via SMS.
              </p>
            </div>
          </div>
        </div>

        {state && !state.ok && (
          <p className="text-xs text-red-600">{state.error ?? "Save failed"}</p>
        )}
        {state?.ok && (
          <p className="text-xs text-emerald-600">Africa&apos;s Talking settings saved.</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="btn-premium rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save AT Settings"}
        </button>
      </form>
    </div>
  );
}
