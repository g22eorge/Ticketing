"use client";

import Link from "next/link";

export type FabAction = {
  label: string;
  href: string;
  icon: React.ReactNode;
  color: string;
};

/**
 * QuickActionFAB — single context-aware primary action button.
 *
 * Industry standard (Material Design, iOS HIG): one FAB = one primary action.
 * When only one action is passed, render it as a direct link — no speed-dial
 * required. Multi-action speed-dial can be re-added if needed in future.
 */
export function QuickActionFAB({ actions }: { actions: FabAction[] }) {
  if (actions.length === 0) return null;

  // Always use the first action as the primary
  const primary = actions[0];

  return (
    <Link
      href={primary.href}
      aria-label={primary.label}
      className={`fixed bottom-[calc(var(--bottom-nav-h,64px)+12px)] right-4 z-50 flex h-[52px] w-[52px] items-center justify-center rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.3)] transition-transform active:scale-95 hover:scale-105 md:hidden ${primary.color}`}
    >
      {primary.icon}
    </Link>
  );
}
