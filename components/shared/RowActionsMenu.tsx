"use client";

import { useState, useEffect, useRef } from "react";

const CLOSE_EVENT = "row-menu:close-all";

interface RowActionsMenuProps {
  children: React.ReactNode;
  label?: string;
  /** Open upward by default; pass "down" for rows near the top */
  direction?: "up" | "down";
}

export function RowActionsMenu({ children, label = "Actions", direction = "up" }: RowActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    function onMouse(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouse);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouse);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Close when any other RowActionsMenu opens
  useEffect(() => {
    function onClose() { setOpen(false); }
    document.addEventListener(CLOSE_EVENT, onClose);
    return () => document.removeEventListener(CLOSE_EVENT, onClose);
  }, []);

  function toggle() {
    if (!open) document.dispatchEvent(new Event(CLOSE_EVENT));
    setOpen((v) => !v);
  }

  const popoverPos = direction === "down"
    ? "top-full mt-1.5"
    : "bottom-full mb-1.5";

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-expanded={open}
        className={`inline-flex h-[28px] w-[28px] items-center justify-center rounded-lg border transition
          ${open
            ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent)]"
            : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--ink)]"
          }`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>

      {open && (
        <div
          className={`panel-shadow absolute right-0 ${popoverPos} z-50 min-w-[220px] max-w-[280px] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]`}
          style={{ animation: "rowMenuIn 100ms ease-out both" }}
        >
          {children}
        </div>
      )}

      <style>{`
        @keyframes rowMenuIn {
          from { opacity: 0; transform: scale(0.95) translateY(4px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
      `}</style>
    </div>
  );
}

/** Styled section header inside a RowActionsMenu */
export function MenuSection({ label }: { label: string }) {
  return (
    <p className="border-b border-[var(--line)] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">
      {label}
    </p>
  );
}

/** Styled destructive action row at the bottom of a menu */
export function MenuDestructiveRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t border-[var(--line)] px-3 py-2">
      {children}
    </div>
  );
}
