import { redirect } from "next/navigation";
import { getCurrentUserRole } from "@/lib/session";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getCurrentUserRole();
  const platformEmail = process.env.PLATFORM_ADMIN_EMAIL;
  // Guard: must be the designated platform admin email
  if (!platformEmail || user!.email !== platformEmail) {
    redirect("/dashboard");
  }
  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--ink)]">
      <div className="border-b border-[var(--line)] bg-[var(--panel)] px-6 py-3 flex items-center justify-between">
        <p className="font-semibold text-[var(--ink)]">Platform Admin</p>
        <a href="/dashboard" className="text-sm text-[var(--ink-muted)] hover:text-[var(--ink)]">← Back to app</a>
      </div>
      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </div>
  );
}
