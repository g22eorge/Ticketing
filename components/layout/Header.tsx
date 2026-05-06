"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { useTheme } from "@/components/layout/ThemeProvider";
import { can } from "@/lib/permissions";

type HeaderProps = {
  userName: string;
  role: string;
  permissions?: string[];
};

function roleDisplay(role: string) {
  switch (role) {
    case "ADMIN": return "Admin";
    case "TECHNICIAN_INTERNAL": return "Internal Tech";
    case "TECHNICIAN_EXTERNAL": return "External Tech";
    case "OPS": return "Operations";
    case "FRONT_DESK": return "Front Desk";
    default: return role;
  }
}

function roleAccent(role: string): string {
  switch (role) {
    // Don't use --ink as a background: in dark theme it's near-white.
    case "ADMIN": return "bg-[var(--accent)] text-black border border-[var(--accent)]/35";
    case "OPS": return "bg-[var(--accent)]/15 text-[#9A7A00] border border-[var(--accent)]/30";
    case "TECHNICIAN_INTERNAL": return "bg-blue-50 text-blue-700 border border-blue-200";
    case "TECHNICIAN_EXTERNAL": return "bg-purple-50 text-purple-700 border border-purple-200";
    case "FRONT_DESK": return "bg-emerald-50 text-emerald-700 border border-emerald-200";
    default: return "bg-[var(--panel-strong)] text-[var(--ink-muted)]";
  }
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";
}

export function Header({ userName, role, permissions = [] }: HeaderProps) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--panel)]/95 backdrop-blur-md px-4 py-2.5">
      <div className="mx-auto flex w-full max-w-lg items-center gap-3 md:max-w-[1240px] xl:max-w-[1360px]">

        {/* Mobile brand (hidden on desktop where sidebar shows) */}
        <Link href="/" className="flex items-center gap-2.5 lg:hidden hover:opacity-80 transition-opacity">
          <div className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)] shadow-sm">
            <Image
              src="/eagle-info-logo.png"
              alt="Eagle Info logo"
              width={28}
              height={28}
              className="h-7 w-7 object-cover"
              priority
            />
          </div>
          <span className="text-[13px] font-bold text-[var(--ink)] tracking-tight">Eagle Info</span>
        </Link>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right section */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {can.viewNotifications({ role: role as never, permissions }) ? <NotificationBell /> : null}

          {/* User menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel-strong)]/60 pl-1.5 pr-3 py-1 transition hover:border-[var(--accent)]/30"
              title="Account menu"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-bold text-black select-none">
                {initials(userName)}
              </div>
              <span className="hidden sm:inline text-[12px] font-semibold text-[var(--ink)] leading-none truncate max-w-[140px]">
                {userName.split(" ")[0]}
              </span>
              <span className={`hidden sm:inline rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none ${roleAccent(role)}`}>
                {roleDisplay(role)}
              </span>
              <svg className="ml-0.5 h-4 w-4 text-[var(--ink-muted)]" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z" clipRule="evenodd" />
              </svg>
            </button>

            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-xl"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <Link
                  role="menuitem"
                  href="/settings/profile"
                  className="flex w-full items-center px-3 py-2 text-left text-sm text-[var(--ink)] hover:bg-[var(--panel-strong)]"
                  onClick={() => setMenuOpen(false)}
                >
                  Profile
                </Link>
                {role === "ADMIN" ? (
                  <Link
                    role="menuitem"
                    href="/settings/users"
                    className="flex w-full items-center px-3 py-2 text-left text-sm text-[var(--ink)] hover:bg-[var(--panel-strong)]"
                    onClick={() => setMenuOpen(false)}
                  >
                    Users
                  </Link>
                ) : null}
                <button
                  role="menuitem"
                  type="button"
                  disabled={isSigningOut}
                  onClick={async () => {
                    setIsSigningOut(true);
                    const result = await authClient.signOut();
                    if (result.error) {
                      toast.error(result.error.message || "Sign out failed");
                      setIsSigningOut(false);
                      return;
                    }
                    router.push("/login");
                    router.refresh();
                  }}
                  className="flex w-full items-center px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  {isSigningOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();

  // Resolve "system" without relying on matchMedia during SSR/hydration.
  const resolved = (() => {
    if (theme === "dark" || theme === "light") return theme;
    if (typeof document === "undefined") return "light";
    return document.documentElement.classList.contains("theme-blackgold") ? "dark" : "light";
  })();

  const isDark = resolved === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
      className="relative inline-flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] p-2 sm:px-3 sm:py-2 text-[12px] font-semibold text-[var(--ink)] transition-all hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
    >
      {isDark ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
        </svg>
      )}
      <span className="hidden sm:inline">Theme</span>
      <span className="sr-only">{isDark ? "Dark mode" : "Light mode"}</span>
    </button>
  );
}
