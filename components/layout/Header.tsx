"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { useTheme } from "@/components/layout/ThemeProvider";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { can } from "@/lib/permissions";

type HeaderProps = {
  userName: string;
  userEmail: string;
  userPhone?: string | null;
  role: string;
  permissions?: string[];
  isPlatformAdmin?: boolean;
  orgName?: string | null;
  orgUsers?: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
  }>;
};

function roleDisplay(role: string) {
  switch (role) {
    case "ADMIN": return "Admin";
    case "MANAGER": return "Manager";
    case "TECHNICIAN_INTERNAL": return "Tech";
    case "TECHNICIAN_EXTERNAL": return "Ext. Tech";
    case "OPS": return "Ops";
    case "FRONT_DESK": return "Front Desk";
    case "FINANCE": return "Finance";
    case "SALES": return "Sales";
    case "SALES_MANAGER": return "Sales Mgr";
    default: return role.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  }
}

function roleAccent(role: string): string {
  switch (role) {
    case "ADMIN":               return "bg-[var(--accent)] text-black";
    case "MANAGER":             return "bg-[var(--accent)]/20 text-[#9A7A00]";
    case "OPS":                 return "bg-[var(--accent)]/15 text-[#9A7A00]";
    case "TECHNICIAN_INTERNAL": return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
    case "TECHNICIAN_EXTERNAL": return "bg-purple-500/10 text-purple-700 dark:text-purple-400";
    case "FRONT_DESK":          return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "FINANCE":             return "bg-sky-500/10 text-sky-700 dark:text-sky-400";
    case "SALES":
    case "SALES_MANAGER":       return "bg-violet-500/10 text-violet-700 dark:text-violet-400";
    default:                    return "bg-[var(--panel-strong)] text-[var(--ink-muted)]";
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

function UserListSection({
  title,
  users,
  onSelect,
}: {
  title: string;
  users: NonNullable<HeaderProps["orgUsers"]>;
  onSelect: (userId: string) => void;
}) {
  if (users.length === 0) return null;
  return (
    <div>
      <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">{title}</p>
      <div className="max-h-36 overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--panel-strong)]">
        {users.map((user) => (
          <button
            key={user.id}
            role="menuitem"
            type="button"
            onClick={() => onSelect(user.id)}
            className="flex w-full flex-col rounded-md px-3 py-2 text-left transition hover:bg-[var(--panel)]"
          >
            <span className="truncate text-[12px] font-semibold text-[var(--ink)]">{user.name}</span>
            <span className="truncate text-[10px] text-[var(--ink-muted)]">
              {roleDisplay(user.role)}{!user.isActive ? " · inactive" : ""}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Header({
  userName,
  userEmail,
  userPhone = null,
  role,
  permissions = [],
  isPlatformAdmin = false,
  orgName = null,
  orgUsers = [],
}: HeaderProps) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<"profile" | "password">("profile");

  const admins = orgUsers.filter((u) => u.role === "ADMIN");
  const others  = orgUsers.filter((u) => u.role !== "ADMIN");

  const closeMenu = () => setMenuOpen(false);
  const openSettings = (section: "profile" | "password" = "profile") => {
    setSettingsInitialSection(section);
    setMenuOpen(false);
    setSettingsOpen(true);
  };

  return (
    <>
      {/* ── Top header ────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--panel)]/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[1360px] items-center gap-3 px-4">

          {/* Mobile brand (sidebar takes over on lg+) */}
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 lg:hidden transition-opacity hover:opacity-75"
          >
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)] shadow-sm">
              <Image
                src="/app-logo.png"
                alt="Duuka Pro Max"
                width={32}
                height={32}
                className="h-8 w-8 object-cover"
                priority
                onError={(e) => { (e.target as HTMLImageElement).src = "/eagle-info-logo.png"; }}
              />
            </div>
            <div className="leading-none">
              <p className="text-[12px] font-bold text-[var(--ink)] tracking-tight">Duuka Pro</p>
              <p className="text-[9px] font-semibold text-[var(--accent)] tracking-wide">Max</p>
            </div>
          </Link>

          {/* Spacer */}
          <div className="flex-1" />

          {/* ── Action pill group ─────────────────────────────────────── */}
          <div className="flex items-center divide-x divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel-strong)]">
            {/* Theme toggle */}
            <ThemeToggle />

            {/* Notifications */}
            {can.viewNotifications({ role: role as never, permissions }) ? (
              <div className="flex items-center">
                <NotificationBell />
              </div>
            ) : null}

            {/* Settings gear */}
            <button
              type="button"
              onClick={() => openSettings("profile")}
              title="Settings"
              aria-label="Open settings"
              className="flex h-9 w-9 items-center justify-center text-[var(--ink-muted)] transition hover:bg-[var(--panel)] hover:text-[var(--ink)]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          </div>

          {/* ── User menu ─────────────────────────────────────────────── */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] py-1.5 pl-1.5 pr-2.5 transition hover:border-[var(--accent)]/40"
              title="Account menu"
            >
              {/* Avatar */}
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-[11px] font-black text-black select-none">
                {initials(userName)}
              </div>
              {/* Name + role (desktop only) */}
              <div className="hidden sm:flex flex-col items-start leading-none gap-0.5">
                <span className="text-[12px] font-semibold text-[var(--ink)] leading-none truncate max-w-[100px]">
                  {userName.split(" ")[0]}
                </span>
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none ${roleAccent(role)}`}>
                  {roleDisplay(role)}
                </span>
              </div>
              <svg className="h-3.5 w-3.5 text-[var(--ink-muted)] transition-transform duration-150" style={{ transform: menuOpen ? "rotate(180deg)" : "none" }} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z" clipRule="evenodd" />
              </svg>
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <>
                {/* Backdrop */}
                <div className="fixed inset-0 z-40" onClick={closeMenu} />
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] shadow-xl"
                >
                  {/* Identity */}
                  <div className="border-b border-[var(--line)] px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-[13px] font-black text-black">
                        {initials(userName)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-bold text-[var(--ink)]">{userName}</p>
                        <p className="truncate text-[10px] text-[var(--ink-muted)]">{userEmail}</p>
                      </div>
                    </div>
                    {orgName && (
                      <p className="mt-2 truncate text-[11px] font-medium text-[var(--ink-muted)]">
                        <span className="text-[var(--ink-muted)]/60">Org:</span> {orgName}
                      </p>
                    )}
                  </div>

                  {/* Menu items */}
                  <div className="py-1">
                    <MenuItem icon={
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M10 2.75a4.25 4.25 0 1 0 0 8.5 4.25 4.25 0 0 0 0-8.5ZM4.5 16.25A5.5 5.5 0 0 1 10 11.5h0a5.5 5.5 0 0 1 5.5 4.75.75.75 0 0 1-.743.875H5.243a.75.75 0 0 1-.743-.875Z" clipRule="evenodd" /></svg>
                    } label="Profile" onClick={() => { closeMenu(); router.push("/settings/profile"); }} />
                    <MenuItem icon={
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M8 7a5 5 0 1 1 3.61 4.804L9.999 13H8.5a.5.5 0 0 0-.5.5v1H6.5a.5.5 0 0 0-.5.5v1.379l-.743.743a2 2 0 1 1-2.836-2.836l4.83-4.83A5.02 5.02 0 0 1 8 7Zm5-3a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" clipRule="evenodd" /></svg>
                    } label="Change password" onClick={() => openSettings("password")} />
                    <MenuItem icon={
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M8.34 1.804A1 1 0 0 1 9.32 1h1.36a1 1 0 0 1 .98.804l.295 1.473c.497.144.971.342 1.411.59l1.247-.834a1 1 0 0 1 1.262.125l.962.962a1 1 0 0 1 .125 1.262l-.834 1.248c.248.44.446.914.59 1.41l1.473.296a1 1 0 0 1 .804.98v1.361a1 1 0 0 1-.804.98l-1.473.295a6.95 6.95 0 0 1-.59 1.411l.834 1.247a1 1 0 0 1-.125 1.262l-.962.962a1 1 0 0 1-1.262.125l-1.248-.834a6.953 6.953 0 0 1-1.41.59l-.296 1.473a1 1 0 0 1-.98.804H9.32a1 1 0 0 1-.98-.804l-.295-1.473a6.957 6.957 0 0 1-1.411-.59l-1.247.834a1 1 0 0 1-1.262-.125l-.962-.962a1 1 0 0 1-.125-1.262l.834-1.248a6.957 6.957 0 0 1-.59-1.41l-1.473-.296a1 1 0 0 1-.804-.98V9.32a1 1 0 0 1 .804-.98l1.473-.295c.144-.497.342-.971.59-1.411L3.03 5.387a1 1 0 0 1 .125-1.262l.962-.962A1 1 0 0 1 5.38 3.038l1.248.834a6.957 6.957 0 0 1 1.41-.59L8.34 1.804ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" /></svg>
                    } label="Settings" onClick={() => openSettings("profile")} />
                  </div>

                  {/* Admin section */}
                  {role === "ADMIN" && (
                    <div className="border-t border-[var(--line)] py-1">
                      <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Admin</p>
                      <MenuItem icon={
                        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path d="M11 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/><path d="M2.046 15.253c-.18.01-.34-.092-.382-.266a6.5 6.5 0 0 1 11.672 0c-.042.174-.202.276-.382.266a34.816 34.816 0 0 0-10.908 0Z"/><path d="M16.75 9.5a.75.75 0 0 0-1.5 0v1.25H14a.75.75 0 0 0 0 1.5h1.25V13.5a.75.75 0 0 0 1.5 0v-1.25H18a.75.75 0 0 0 0-1.5h-1.25V9.5Z"/></svg>
                      } label="Manage users" onClick={() => { closeMenu(); router.push("/settings/users"); }} />
                      {orgUsers.length > 0 && (
                        <div className="space-y-2 px-3 pb-2 pt-1">
                          <UserListSection title="Admins" users={admins} onSelect={(id) => { closeMenu(); router.push(`/settings/users/${id}`); }} />
                          <UserListSection title="Team" users={others} onSelect={(id) => { closeMenu(); router.push(`/settings/users/${id}`); }} />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Platform admin */}
                  {isPlatformAdmin && (
                    <div className="border-t border-[var(--line)] py-1">
                      <Link
                        role="menuitem"
                        href="/platform"
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-[12px] font-semibold text-[var(--gold)] transition hover:bg-[var(--gold)]/8"
                        onClick={closeMenu}
                      >
                        <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M9.661 2.237a.531.531 0 0 1 .678 0 11.947 11.947 0 0 0 7.078 2.749.5.5 0 0 1 .479.425c.069.52.104 1.05.104 1.589 0 5.162-3.26 9.563-7.834 11.256a.48.48 0 0 1-.332 0C5.26 16.563 2 12.162 2 7c0-.538.035-1.069.104-1.589a.5.5 0 0 1 .48-.425 11.947 11.947 0 0 0 7.077-2.749Z" clipRule="evenodd" />
                        </svg>
                        Platform Admin
                      </Link>
                    </div>
                  )}

                  {/* Sign out */}
                  <div className="border-t border-[var(--line)] py-1">
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
                        closeMenu();
                        router.push("/login");
                        router.refresh();
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-[12px] font-semibold text-red-600 transition hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
                    >
                      <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z" clipRule="evenodd" />
                        <path fillRule="evenodd" d="M19 10a.75.75 0 0 0-.75-.75H8.704l1.048-1.08a.75.75 0 1 0-1.004-1.115l-2.5 2.571a.75.75 0 0 0 0 1.05l2.5 2.572a.75.75 0 1 0 1.004-1.116l-1.048-1.079h9.546A.75.75 0 0 0 19 10Z" clipRule="evenodd" />
                      </svg>
                      {isSigningOut ? "Signing out…" : "Sign out"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        userName={userName}
        userEmail={userEmail}
        userPhone={userPhone}
        userRole={roleDisplay(role)}
        role={role}
        initialSection={settingsInitialSection}
        orgUsers={orgUsers}
      />
    </>
  );
}

/* ── Menu item helper ─────────────────────────────────────────────────────── */
function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      role="menuitem"
      type="button"
      className="flex w-full items-center gap-2.5 px-3 py-2 text-[12px] font-medium text-[var(--ink)] transition hover:bg-[var(--panel-strong)]"
      onClick={onClick}
    >
      <span className="shrink-0 text-[var(--ink-muted)]">{icon}</span>
      {label}
    </button>
  );
}

/* ── Theme toggle ─────────────────────────────────────────────────────────── */
function ThemeToggle() {
  const { theme, toggle } = useTheme();

  const isDark = (() => {
    if (theme === "dark") return true;
    if (theme === "light") return false;
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains("theme-blackgold");
  })();

  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? "Switch to light" : "Switch to dark"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
      className="flex h-9 w-9 items-center justify-center text-[var(--ink-muted)] transition hover:bg-[var(--panel)] hover:text-[var(--ink)]"
    >
      {isDark ? (
        /* Moon — currently dark, click to go light */
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      ) : (
        /* Sun — currently light, click to go dark */
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
        </svg>
      )}
      <span className="sr-only">{isDark ? "Dark mode active" : "Light mode active"}</span>
    </button>
  );
}
