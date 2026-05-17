import Link from "next/link";
import { SignOutButton } from "@/components/shared/SignOutButton";
import { requirePlatformAdmin } from "@/lib/platform-admin";

const NAV = [
  { href: "/platform", label: "Organisations" },
  { href: "/platform/payments", label: "Payments" },
  { href: "/platform/audit", label: "Audit Log" },
  { href: "/platform/settings", label: "Settings" },
];

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformAdmin();
  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--ink)]">
      <div className="border-b border-[var(--line)] bg-[var(--panel)] px-6 py-0 flex items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <span className="mr-4 text-sm font-bold text-[var(--ink)]">Platform Admin</span>
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="px-3 py-3 text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors border-b-2 border-transparent hover:border-[var(--accent)]"
            >
              {n.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-4 py-3">
          <span className="text-xs text-[var(--ink-muted)]">{user!.email}</span>
          <Link
            href="/dashboard"
            className="text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
          >
            ← Back to app
          </Link>
          <SignOutButton />
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </div>
  );
}
