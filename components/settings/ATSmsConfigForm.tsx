"use client";

import { useActionState } from "react";
import { saveATConfigAction } from "@/app/(app)/settings/notifications/whatsapp/actions";
import type { SmsQuota } from "@/lib/notifications/sms-quota";

type Props = {
  orgId: string;
  smsFallback: boolean;
  platformConfigured: boolean;
  stats: SmsQuota | null;
};

export function ATSmsConfigForm({ orgId, smsFallback, platformConfigured, stats }: Props) {
  const [state, action, pending] = useActionState<
    { ok: boolean; error?: string } | null,
    FormData
  >(saveATConfigAction, null);

  const barColor =
    !stats ? "bg-[var(--line)]"
    : stats.percentUsed >= 90 ? "bg-red-500"
    : stats.percentUsed >= 70 ? "bg-amber-500"
    : "bg-emerald-500";

  return (
    <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
            SMS Notifications
          </p>
          <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
            Powered by Africa&apos;s Talking. Included in your plan — no extra setup needed.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[13px] font-semibold ${
            platformConfigured
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-amber-400/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          }`}
        >
          {platformConfigured ? "Available" : "Not available"}
        </span>
      </div>

      {!platformConfigured ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
          SMS is not yet configured on this platform. Contact your platform administrator.
        </div>
      ) : (
        <>
          {/* Usage */}
          {stats && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[var(--ink-muted)]">This month</span>
                <span className="font-mono font-semibold text-[var(--ink)]">
                  {stats.used} / {stats.limit} SMS
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--panel-strong)]">
                <div
                  className={`h-full rounded-full transition-all ${barColor}`}
                  style={{ width: `${Math.min(100, stats.percentUsed)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[12px] text-[var(--ink-muted)]">
                <span>{stats.remaining} remaining</span>
                <span className={stats.percentUsed >= 90 ? "text-red-600 font-semibold" : ""}>
                  {stats.percentUsed}% used · {stats.plan} plan
                </span>
              </div>
              {stats.percentUsed >= 90 && (
                <p className="text-[12px] font-semibold text-red-600">
                  Almost at your limit. Upgrade your plan for more SMS.
                </p>
              )}
            </div>
          )}

          {/* Fallback toggle */}
          <form action={action} className="space-y-3 border-t border-[var(--line)] pt-4">
            <input type="hidden" name="orgId" value={orgId} />
            <div className="flex items-start gap-2.5">
              <input
                id="smsFallback"
                name="smsFallback"
                type="checkbox"
                defaultChecked={smsFallback}
                className="mt-0.5 h-4 w-4 rounded border-[var(--line)] accent-[var(--accent)]"
              />
              <div>
                <label
                  htmlFor="smsFallback"
                  className="cursor-pointer text-xs font-semibold text-[var(--ink)]"
                >
                  SMS fallback
                </label>
                <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">
                  If a WhatsApp message fails to deliver, automatically retry via SMS (uses your monthly quota).
                </p>
              </div>
            </div>

            {state && !state.ok && <p className="text-xs text-red-600">{state.error}</p>}
            {state?.ok && <p className="text-xs text-emerald-600">Saved.</p>}

            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-[var(--panel-strong)] border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--line)] disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
