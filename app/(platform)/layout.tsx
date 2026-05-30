import Link from "next/link";
import { SignOutButton } from "@/components/shared/SignOutButton";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { PlatformNav } from "./PlatformNav";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformAdmin();
  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--ink)]">
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--panel)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2 text-xs font-bold tracking-wide text-[var(--ink)]">
              <span className="rounded bg-[var(--gold)]/20 px-1.5 py-0.5 font-mono text-[12px] font-bold text-[var(--gold)]">PLATFORM</span>
              Admin
            </span>
            <div className="h-4 w-px bg-[var(--line)]" />
            <PlatformNav />
          </div>
          <div className="flex items-center gap-3 py-2.5">
            <span className="hidden text-xs text-[var(--ink-muted)] sm:block">{user!.email}</span>
            <Link
              href="/dashboard"
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-muted)] transition-colors hover:border-[var(--accent)]/50 hover:text-[var(--ink)]"
            >
              ← App
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
