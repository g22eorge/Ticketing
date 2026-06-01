"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";

export type SettingsNavItem = {
  href: string;
  label: string;
  description?: string;
  badge?: string;
  icon?: React.ReactNode;
};

export type SettingsNavGroup = {
  title: string;
  items: SettingsNavItem[];
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SettingsShell({
  workspaceName,
  actorName,
  lastEditedAt,
  quickActions,
  groups,
  children,
}: {
  workspaceName: string;
  actorName: string;
  lastEditedAt: string;
  quickActions?: Array<{ href: string; label: string; icon: React.ReactNode }>;
  groups: SettingsNavGroup[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((it) => {
          const haystack = `${it.label} ${it.description ?? ""}`.toLowerCase();
          return haystack.includes(query);
        }),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, q]);

  const activeItem = useMemo(() => {
    let best: SettingsNavItem | null = null;
    for (const group of groups) {
      for (const item of group.items) {
        if (!isActive(pathname, item.href)) continue;
        if (!best || item.href.length > best.href.length) best = item;
      }
    }
    return best;
  }, [groups, pathname]);

  const filteredItems = useMemo(
    () => filtered.flatMap((g) => g.items),
    [filtered],
  );

  return (
    <section className="space-y-4">
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 sm:rounded-[1.75rem] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--accent)] text-base font-black text-[var(--accent-contrast)] sm:h-11 sm:w-11 sm:rounded-2xl sm:text-lg">
              {workspaceName.trim().slice(0, 1).toUpperCase() || "S"}
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-black text-[var(--ink)] sm:text-xl">Settings</p>
              <p className="mt-0.5 truncate text-xs text-[var(--ink-muted)] max-sm:max-w-[220px]">
                {workspaceName} · {actorName} · Updated {lastEditedAt}
              </p>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {quickActions?.length ? (
              <div className="flex items-center gap-2">
                {quickActions.map((a) => (
                  <Link
                    key={a.href}
                    href={a.href}
                    title={a.label}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] transition hover:border-[var(--accent)]/35 hover:text-[var(--ink)] sm:h-10 sm:w-10"
                  >
                    {a.icon}
                  </Link>
                ))}
              </div>
            ) : null}

            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 sm:flex-none sm:px-4">
              <svg className="h-4 w-4 text-[var(--ink-muted)]" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.2 4.43l3.18 3.19a.75.75 0 1 1-1.06 1.06l-3.19-3.18A7 7 0 0 1 2 9Z" clipRule="evenodd" />
              </svg>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search"
                className="w-full bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] outline-none sm:w-[260px]"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1 sm:mt-5 sm:flex-wrap sm:overflow-visible sm:pb-0">
          {filteredItems.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                  active
                    ? "border-[var(--accent)]/70 bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm"
                    : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] hover:border-[var(--accent)]/40 hover:bg-[var(--panel)] hover:text-[var(--ink)]"
                }`}
              >
                {active && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-80" />
                )}
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="mt-3 min-h-[1.25rem]">
          {filteredItems.length === 0 ? (
            <p className="text-sm text-[var(--ink-muted)]">No settings match &ldquo;{q}&rdquo;.</p>
          ) : (
            <p className="text-[12px] text-[var(--ink-muted)]">
              {activeItem
                ? <><span className="font-medium text-[var(--ink)]">{activeItem.label}</span> — {activeItem.description}</>
                : "Select a section above to get started."}
            </p>
          )}
        </div>
      </div>

      <div>{children}</div>
    </section>
  );
}
