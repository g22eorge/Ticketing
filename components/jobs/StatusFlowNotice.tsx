"use client";

import { useEffect, useState } from "react";

type Props = {
  message: string;
};

const SESSION_KEY = "mrms.statusFlowNotice.dismissed.v1";

export function StatusFlowNotice({ message }: Props) {
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem(SESSION_KEY) !== "1";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (!visible) return;

    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // ignore storage errors
    }

    const timer = setTimeout(() => setVisible(false), 7000);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-xs text-[var(--ink-muted)] [overflow-wrap:anywhere]">
      {message}
    </div>
  );
}
