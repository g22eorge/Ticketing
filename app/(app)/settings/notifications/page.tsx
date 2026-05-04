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

  return (
    <div className="space-y-4">
      {user.role === "ADMIN" || user.role === "OPS" ? (
        <div className="panel-shadow flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Message Outbox</p>
            <p className="text-xs text-[var(--ink-muted)]">Review delivery status for WhatsApp and email notifications.</p>
          </div>
          <Link
            href="/settings/notifications/outbox"
            className="btn-premium-secondary shrink-0 rounded-lg px-3 py-1.5 text-sm"
          >
            View Outbox →
          </Link>
        </div>
      ) : null}
      <NotificationPrefsForm prefs={prefs} />
    </div>
  );
}
