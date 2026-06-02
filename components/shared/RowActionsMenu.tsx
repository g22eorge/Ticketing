"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

const CLOSE_EVENT = "row-menu:close-all";

interface Rect { top: number; left: number; right: number; bottom: number; width: number; height: number }

interface RowActionsMenuProps {
  children: React.ReactNode;
  label?: string;
}

type MenuIcon =
  | "open"
  | "edit"
  | "download"
  | "receipt"
  | "delivery"
  | "whatsapp"
  | "payment"
  | "save"
  | "delete"
  | "quote"
  | "invoice"
  | "job"
  | "close";

const iconPaths: Record<MenuIcon, string[]> = {
  open: ["M7 17 17 7", "M7 7h10v10"],
  edit: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"],
  download: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"],
  receipt: ["M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z", "M9 8h6", "M9 12h6", "M9 16h4"],
  delivery: ["M3 7h11v10H3z", "M14 10h4l3 3v4h-7z", "M7 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z", "M18 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"],
  whatsapp: ["M20 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.2-4.2A8.5 8.5 0 1 1 20 11.5Z", "M9 8.5c.2 3 2.1 5 5.5 6l1.5-1.4-2.1-1.1-.9.8c-1.3-.6-2.2-1.4-2.8-2.8l.8-.9L10 7 9 8.5Z"],
  payment: ["M2 6h20v12H2z", "M2 10h20", "M6 15h4"],
  save: ["M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z", "M17 21v-8H7v8", "M7 3v5h8"],
  delete: ["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6", "M10 11v5", "M14 11v5"],
  quote: ["M7 7h10", "M7 11h10", "M7 15h6", "M5 3h14a2 2 0 0 1 2 2v16l-4-3H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"],
  invoice: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z", "M14 2v6h6", "M8 13h8", "M8 17h5"],
  job: ["M10 6h4", "M4 8h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z", "M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"],
  close: ["M18 6 6 18", "M6 6l12 12"],
};

function MenuIconSvg({ icon }: { icon: MenuIcon }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {iconPaths[icon].map((d) => <path key={d} d={d} />)}
    </svg>
  );
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

export function MenuActionLink({
  href,
  children,
  icon = "open",
  external = false,
  tone = "default",
}: {
  href: string;
  children: React.ReactNode;
  icon?: MenuIcon;
  external?: boolean;
  tone?: "default" | "accent" | "success" | "danger";
}) {
  const toneClass =
    tone === "accent"
      ? "text-[var(--accent)]"
      : tone === "success"
        ? "text-emerald-700 dark:text-emerald-400"
        : tone === "danger"
          ? "text-red-600 dark:text-red-400"
          : "text-[var(--ink)]";
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition hover:bg-[var(--panel-strong)] ${toneClass}`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center opacity-80">
        <MenuIconSvg icon={icon} />
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </a>
  );
}

export function MenuActionButton({
  children,
  icon = "save",
  tone = "default",
  className = "",
}: {
  children: React.ReactNode;
  icon?: MenuIcon;
  tone?: "default" | "accent" | "success" | "danger";
  className?: string;
}) {
  const toneClass =
    tone === "accent"
      ? "text-[var(--accent)]"
      : tone === "success"
        ? "text-emerald-700 dark:text-emerald-400"
        : tone === "danger"
          ? "text-red-600 dark:text-red-400"
          : "text-[var(--ink)]";
  return (
    <button
      type="submit"
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold transition hover:bg-[var(--panel-strong)] ${toneClass} ${className}`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center opacity-80">
        <MenuIconSvg icon={icon} />
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}
