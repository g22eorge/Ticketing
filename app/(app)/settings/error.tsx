"use client";

import { useEffect } from "react";

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[settings/layout] error:", error.message, error.digest);
  }, [error]);

  return (
    <div className="min-w-0 space-y-4 px-4 py-6">
      <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
        <p className="font-semibold">Settings failed to load.</p>
        <p className="mt-1 text-xs opacity-80">{error.message}</p>
      </div>
      <button
        onClick={reset}
        className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-1.5 text-sm hover:bg-[var(--surface)]"
      >
        Try again
      </button>
    </div>
  );
}