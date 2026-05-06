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

          {/* User pill */}
          <div className="hidden sm:flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel-strong)]/60 pl-1.5 pr-3 py-1">
            {/* Avatar */}
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-bold text-black select-none">
              {initials(userName)}
            </div>
            {/* Name */}
            <span className="text-[12px] font-semibold text-[var(--ink)] leading-none truncate max-w-[120px]">
              {userName.split(" ")[0]}
            </span>
            {/* Role badge */}
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none ${roleAccent(role)}`}>
              {roleDisplay(role)}
            </span>
          </div>

          {/* Mobile user avatar only */}
          <div className="sm:hidden flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-bold text-black select-none">
            {initials(userName)}
          </div>

          {/* Sign out */}
          <button
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
            className="hidden sm:flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--ink-muted)] transition-colors hover:border-[var(--ink)]/20 hover:text-[var(--ink)] disabled:opacity-50"
            aria-label="Sign out"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
              <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z" clipRule="evenodd" />
              <path fillRule="evenodd" d="M19 10a.75.75 0 0 0-.75-.75H8.704l1.048-1.08a.75.75 0 1 0-1.08-1.04l-2.25 2.33a.75.75 0 0 0 0 1.04l2.25 2.33a.75.75 0 1 0 1.08-1.04l-1.048-1.08h9.546A.75.75 0 0 0 19 10Z" clipRule="evenodd" />
            </svg>
            <span className="hidden sm:block">{isSigningOut ? "Signing out…" : "Sign out"}</span>
          </button>
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
