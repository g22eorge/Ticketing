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

  const allItems = useMemo(() => groups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.title }))), [groups]);
  const primaryItems = allItems.slice(0, 6);

  return (
    <section className="space-y-4">
      <div className="panel-shadow overflow-hidden rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--accent)] text-lg font-black text-[var(--accent-contrast)]">
              {workspaceName.trim().slice(0, 1).toUpperCase() || "S"}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xl font-black text-[var(--ink)]">Settings</p>
              <p className="mt-0.5 truncate text-xs text-[var(--ink-muted)]">
                {workspaceName} · {actorName} · Updated {lastEditedAt}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {quickActions?.length ? (
              <div className="flex items-center gap-2">
                {quickActions.map((a) => (
                  <Link
                    key={a.href}
                    href={a.href}
                    title={a.label}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] transition hover:border-[var(--accent)]/35 hover:text-[var(--ink)]"
                  >
                    {a.icon}
                  </Link>
                ))}
              </div>
            ) : null}

            <div className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-2">
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

        <div className="mt-5 flex flex-wrap gap-2">
          {primaryItems.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                  active
                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
                    : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] hover:border-[var(--accent)]/35 hover:text-[var(--ink)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="mt-5">
          <p className="text-sm text-[var(--ink-muted)]">
            {activeItem?.description ?? "Manage workspace configuration and your account."}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="panel-shadow h-fit rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-3">
          <nav className="space-y-4">
            {filtered.map((group) => (
              <div key={group.title} className="space-y-2">
                <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
                  {group.title}
                </p>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const active = isActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center justify-between gap-3 rounded-[1rem] px-3 py-2 transition ${
                          active
                            ? "bg-[var(--accent)]/12 text-[var(--ink)] border border-[var(--accent)]/25"
                            : "border border-transparent text-[var(--ink-muted)] hover:bg-[var(--panel-strong)] hover:text-[var(--ink)]"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
                            active
                              ? "border-[var(--accent)]/25 bg-[var(--accent)]/10 text-[var(--accent-text)]"
                              : "border-[var(--line)] bg-[var(--panel)] text-[var(--ink-muted)]"
                          }`}>
                            {item.icon ?? (
                              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                                <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm1 11H9v-2h2v2Zm0-3H9V5h2v5Z" />
                              </svg>
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-[var(--ink)]">{item.label}</span>
                          {item.description ? (
                            <span className="block truncate text-xs text-[var(--ink-muted)]">{item.description}</span>
                          ) : null}
                          </span>
                        </span>
                        {item.badge ? (
                          <span className="shrink-0 rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ink-muted)]">
                            {item.badge}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}

            {filtered.length === 0 ? (
              <p className="rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] p-3 text-sm text-[var(--ink-muted)]">
                No settings match this search.
              </p>
            ) : null}
          </nav>
        </aside>

        <div className="min-w-0">
          {/* Keep the right pane clean; pages render their own cards. */}
          <div className="rounded-[1.5rem] p-0 sm:p-0">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
