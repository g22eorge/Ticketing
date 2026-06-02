"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

const CLOSE_EVENT = "row-menu:close-all";

interface Rect { top: number; left: number; right: number; bottom: number; width: number; height: number }

interface RowActionsMenuProps {
  children: React.ReactNode;
  label?: string;
}

export function RowActionsMenu({ children, label = "Actions" }: RowActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    function onMouse(e: MouseEvent) {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        popupRef.current && !popupRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onScroll() { setOpen(false); }
    function onResize() { setOpen(false); }
    document.addEventListener("mousedown", onMouse);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onMouse);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  // Close when any other RowActionsMenu opens
  useEffect(() => {
    document.addEventListener(CLOSE_EVENT, close);
    return () => document.removeEventListener(CLOSE_EVENT, close);
  }, [close]);

  function toggle() {
    if (!open) {
      document.dispatchEvent(new Event(CLOSE_EVENT));
      if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    }
    setOpen((v) => !v);
  }

  // Decide whether to open upward or downward based on available space
  const spaceBelow = rect ? window.innerHeight - rect.bottom : 0;
  const openDown = spaceBelow > 260;
  const popupTop = rect
    ? openDown
      ? rect.bottom + 6
      : rect.top - 6  // will be offset upward via transform
    : 0;
  const popupRight = rect ? Math.max(8, window.innerWidth - rect.right) : 0;

  const popupStyle: React.CSSProperties = rect
    ? {
        position: "fixed",
        right: popupRight,
        ...(openDown
          ? { top: popupTop }
          : { bottom: window.innerHeight - rect.top + 6 }),
        zIndex: 9999,
        minWidth: 220,
        maxWidth: 300,
        maxHeight: Math.max(160, window.innerHeight - 24),
        overflowY: "auto",
      }
    : {};

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-expanded={open}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition
          ${open
            ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent)]"
            : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--ink)]"
          }`}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={popupRef}
          className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]"
          onClickCapture={(event) => {
            const target = event.target as HTMLElement;
            if (target.closest("a")) setTimeout(close, 0);
          }}
          style={{ ...popupStyle, animation: "rowMenuIn 100ms ease-out both" }}
        >
          {children}
          <style>{`
            @keyframes rowMenuIn {
              from { opacity: 0; transform: scale(0.96) translateY(${openDown ? "-4px" : "4px"}); }
              to   { opacity: 1; transform: scale(1)    translateY(0); }
            }
          `}</style>
        </div>,
        document.body,
      )}
    </>
  );
}

/** Styled section header inside a RowActionsMenu */
export function MenuSection({ label }: { label: string }) {
  return (
    <p className="border-b border-[var(--line)] px-3 py-1.5 text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">
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
