"use client";

import { useEffect, useRef } from "react";

type PersistedDisclosureProps = {
  storageKey: string;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  groupName?: string;
  className?: string;
};

export function PersistedDisclosure({
  storageKey,
  title,
  children,
  defaultOpen = false,
  groupName,
  className,
}: PersistedDisclosureProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const node = detailsRef.current;
    if (!node) return;
    const saved = window.localStorage.getItem(storageKey);
    if (saved === "open") node.open = true;
    if (saved === "closed") node.open = false;
  }, [storageKey]);

  return (
    <details
      ref={detailsRef}
      className={className}
      name={groupName}
      open={defaultOpen}
      onToggle={(event) => {
        const current = event.currentTarget;
        window.localStorage.setItem(storageKey, current.open ? "open" : "closed");
      }}
    >
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">{title}</p>
          <span className="text-[11px] text-[var(--ink-muted)]">Tap to expand</span>
        </div>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
