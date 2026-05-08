"use client";

import { useActionState, useTransition } from "react";
import type { OrgWhatsAppConfig } from "@/lib/org-whatsapp-config";
import { saveWhatsAppConfigAction, deleteWhatsAppConfigAction } from "@/app/(app)/settings/notifications/whatsapp/actions";

type Props = {
  orgId: string;
  current: OrgWhatsAppConfig | null;
};

type State = { ok: boolean; error?: string } | null;

export function WhatsAppConfigForm({ orgId, current }: Props) {
  const [saveState, saveAction, saving] = useActionState<State, FormData>(saveWhatsAppConfigAction, null);
  const [, startDelete] = useTransition();

  return (
    <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
        {current ? "Update Credentials" : "Connect WhatsApp Business"}
      </p>
      <p className="mb-4 text-xs text-[var(--ink-muted)]">
        Get these values from your{" "}
        <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--ink)]">
          Meta Developer App
        </a>{" "}
        → WhatsApp → API Setup.
      </p>

      <form action={saveAction} className="space-y-3">
        <input type="hidden" name="orgId" value={orgId} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--ink-muted)]">
              Business Number <span className="text-red-500">*</span>
            </label>
            <input
              name="businessNumber"
              type="text"
              required
              placeholder="+256700000000"
              defaultValue={current?.businessNumber ?? ""}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm font-mono text-[var(--ink)] placeholder:text-[var(--ink-muted)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--ink-muted)]">
              Phone Number ID <span className="text-red-500">*</span>
            </label>
            <input
              name="phoneNumberId"
              type="text"
              required
              placeholder="1234567890"
              defaultValue={current?.phoneNumberId ?? ""}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm font-mono text-[var(--ink)] placeholder:text-[var(--ink-muted)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-[var(--ink-muted)]">
              Access Token <span className="text-red-500">*</span>
            </label>
            <input
              name="accessToken"
              type="password"
              required
              placeholder={current ? "Enter new token to update, or leave blank to keep existing" : "EAAxxxxxxxx…"}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm font-mono text-[var(--ink)] placeholder:text-[var(--ink-muted)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
            />
            {current && (
              <p className="mt-1 text-[10px] text-[var(--ink-muted)]">Leave blank to keep the existing token.</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--ink-muted)]">
              Business Account ID <span className="text-[var(--ink-muted)]">(optional)</span>
            </label>
            <input
              name="businessAccountId"
              type="text"
              placeholder="1234567890"
              defaultValue={current?.businessAccountId ?? ""}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm font-mono text-[var(--ink)] placeholder:text-[var(--ink-muted)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
            />
          </div>
        </div>

        {saveState && !saveState.ok && (
          <p className="text-xs text-red-600">{saveState.error ?? "Save failed"}</p>
        )}
        {saveState?.ok && (
          <p className="text-xs text-emerald-600">Saved. Reload the page to verify the connection.</p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="btn-premium rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {saving ? "Saving…" : current ? "Update credentials" : "Connect WhatsApp"}
          </button>

          {current && (
            <button
              type="button"
              onClick={() => {
                if (!confirm("Remove your WhatsApp configuration? Notifications will stop working.")) return;
                startDelete(async () => {
                  const fd = new FormData();
                  fd.append("orgId", orgId);
                  await deleteWhatsAppConfigAction(null, fd);
                });
              }}
              className="text-xs text-red-600 hover:underline"
            >
              Disconnect
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
