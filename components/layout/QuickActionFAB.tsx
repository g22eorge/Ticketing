"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export type FabAction = {
  label: string;
  href: string;
  icon: React.ReactNode;
  color: string; // bg colour for the icon circle
};

export function QuickActionFAB({ actions }: { actions: FabAction[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <div
      ref={ref}
      className="fixed bottom-[calc(var(--bottom-nav-h,64px)+16px)] right-4 z-50 flex flex-col items-end gap-3 md:hidden"
    >
      {/* Action list — slides up */}
      <div
        className={`flex flex-col items-end gap-3 transition-all duration-200 ${
          open ? "translate-y-0 opacity-100 pointer-events-auto" : "translate-y-4 opacity-0 pointer-events-none"
        }`}
      >
        {[...actions].reverse().map((action) => (
          <Link
            key={action.href}
            href={action.href}
            onClick={() => setOpen(false)}
            className="flex items-center gap-3"
          >
            <span className="rounded-xl bg-[var(--panel)] px-3 py-1.5 text-sm font-semibold text-[var(--ink)] shadow-md border border-[var(--line)]">
              {action.label}
            </span>
            <span
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-lg ${action.color}`}
            >
              {action.icon}
            </span>
          </Link>
        ))}
      </div>

      {/* FAB trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close quick actions" : "Quick actions"}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] shadow-xl transition-transform duration-200 active:scale-95"
        style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.25)" }}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform duration-200 ${open ? "rotate-45" : "rotate-0"}`}
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
}
