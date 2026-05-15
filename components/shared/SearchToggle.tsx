"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const SearchIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
    <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M10.5 10.5L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3" aria-hidden="true">
    <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

type Props = {
  /** Base path to navigate to, e.g. "/jobs" */
  basePath: string;
  /** Current search value — if set, starts expanded */
  defaultValue?: string;
  placeholder?: string;
  /** Other URL params to preserve when navigating, e.g. { status: "IN_REPAIR" } */
  preserve?: Record<string, string | undefined>;
};

export function SearchToggle({ basePath, defaultValue, placeholder = "Search…", preserve }: Props) {
  const [open, setOpen] = useState(Boolean(defaultValue));
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function buildUrl(q: string) {
    const params = new URLSearchParams();
    if (preserve) {
      for (const [k, v] of Object.entries(preserve)) {
        if (v) params.set(k, v);
      }
    }
    if (q) params.set("q", q);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  function expand() {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function collapse() {
    setOpen(false);
    if (defaultValue) router.push(buildUrl(""));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = inputRef.current?.value.trim() ?? "";
    router.push(buildUrl(q));
  }

  const iconBtn = "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] transition hover:border-[var(--accent)]/40 hover:text-[var(--ink)]";

  if (!open) {
    return (
      <button type="button" onClick={expand} aria-label="Search" className={iconBtn}>
        <SearchIcon />
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
      <input
        ref={inputRef}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoFocus
        className="w-52 rounded-lg border border-[var(--accent)]/40 bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none ring-2 ring-[var(--accent)]/15 placeholder:text-[var(--ink-muted)] transition"
      />
      <button type="submit" aria-label="Submit search" className={iconBtn}>
        <SearchIcon />
      </button>
      <button type="button" onClick={collapse} aria-label="Close search" className={iconBtn}>
        <CloseIcon />
      </button>
    </form>
  );
}
