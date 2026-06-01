"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";

export type SpeedDialAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  icon: React.ReactNode;
  color?: string;
};

/**
 * SpeedDialFAB — single gold FAB that expands into multiple actions on tap.
 * Replaces the separate QuickActionFAB + AiGuideBubble on mobile.
 * Desktop keeps the AI bubble draggable (AiGuideBubble renders above lg:).
 */
export function SpeedDialFAB({
  actions,
  onAiToggle,
}: {
  actions: SpeedDialAction[];
  onAiToggle?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  if (actions.length === 0 && !onAiToggle) return null;
  if (pathname.startsWith("/settings") || pathname.startsWith("/documents")) return null;

  return (
    <div
      ref={ref}
      className="speed-dial-fab fixed bottom-[calc(var(--bottom-nav-h,64px)+12px)] right-4 z-50 flex flex-col items-end gap-3 md:hidden"
    >
      {/* Action items — slide up when open */}
      {open && (
        <div className="flex flex-col items-end gap-2.5">
          {/* AI Guide action */}
          {onAiToggle && (
            <button
              type="button"
              aria-label="Open AI Guide"
              onClick={() => { onAiToggle(); setOpen(false); }}
              className="flex items-center gap-2.5 active:scale-95"
            >
              <span className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] shadow-lg">
                AI Guide
              </span>
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent)]/20 shadow-lg ring-2 ring-[var(--accent)]/30">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent)]">
                  <path d="M12 2a8 8 0 0 1 8 8c0 5-8 13-8 13S4 15 4 10a8 8 0 0 1 8-8z"/><circle cx="12" cy="10" r="3"/>
                </svg>
              </div>
            </button>
          )}

          {/* Other actions */}
          {actions.map((action) => {
            const cls = `flex items-center gap-2.5 active:scale-95`;
            const inner = (
              <>
                <span className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] shadow-lg">
                  {action.label}
                </span>
                <div className={`flex h-11 w-11 items-center justify-center rounded-full shadow-lg ${action.color ?? "bg-[var(--accent)]"}`}>
                  {action.icon}
                </div>
              </>
            );
            return action.href ? (
              <Link key={action.label} href={action.href} className={cls} onClick={() => setOpen(false)}>
                {inner}
              </Link>
            ) : (
              <button key={action.label} type="button" className={cls} onClick={() => { action.onClick?.(); setOpen(false); }}>
                {inner}
              </button>
            );
          })}
        </div>
      )}

      {/* Main FAB toggle */}
      <button
        type="button"
        aria-label={open ? "Close actions" : "Quick actions"}
        onClick={() => setOpen((v) => !v)}
        className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[var(--accent)] shadow-[0_4px_20px_rgba(212,175,55,0.35)] transition-transform active:scale-95 hover:scale-105"
        style={{ transition: "transform 0.15s, box-shadow 0.15s" }}
      >
        <svg
          width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? "rotate(45deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
        >
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>
  );
}
