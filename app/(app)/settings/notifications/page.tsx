import Link from "next/link";
import { redirect } from "next/navigation";

import { getUserPreferences } from "@/lib/notifications";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";

import { NotificationPrefsForm } from "@/components/settings/NotificationPrefsForm";

export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const { user } = await getCurrentUserRole();
  if (!can.viewNotifications(user)) {
    redirect("/dashboard");
  }
  const prefs = await getUserPreferences(user.id);

  const canSeeOutbox = user.role === "ADMIN" || user.role === "OPS";
  const canSeeTemplates = user.role === "ADMIN" || user.role === "OPS";
  const canSeeWhatsApp = user.role === "ADMIN";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Settings</p>
            <p className="text-[13px] font-bold text-[var(--ink)]">Notifications</p>
          </div>
          {(canSeeOutbox || canSeeTemplates || canSeeWhatsApp) && (
            <div className="flex flex-wrap gap-1.5">
              {canSeeOutbox && (
                <Link href="/settings/notifications/outbox" className="btn-premium-secondary rounded-lg px-3 py-1.5 text-xs">
                  Outbox
                </Link>
              )}
              {canSeeTemplates && (
                <Link href="/settings/notifications/templates" className="btn-premium-secondary rounded-lg px-3 py-1.5 text-xs">
                  Templates
                </Link>
              )}
              {canSeeWhatsApp && (
                <Link href="/settings/notifications/whatsapp" className="btn-premium-secondary rounded-lg px-3 py-1.5 text-xs">
                  WhatsApp
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {canSeeOutbox ? (
        <div className="panel-shadow flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Outbox</p>
            <p className="text-xs text-[var(--ink-muted)]">Delivery status for WhatsApp and email.</p>
          </div>
          <Link
            href="/settings/notifications/outbox"
            className="btn-premium-secondary shrink-0 rounded-lg px-3 py-1.5 text-sm"
          >
            Open →
          </Link>
        </div>
      ) : null}
      <NotificationPrefsForm prefs={prefs} />
    </div>
  );
}
