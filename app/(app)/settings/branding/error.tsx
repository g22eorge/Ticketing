"use client";

import { useEffect } from "react";

export default function BrandingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[branding/page] error:", error.message, error.digest);
  }, [error]);

  return (
    <div className="min-w-0 space-y-4">
      <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
        <p className="font-semibold">Failed to load branding settings.</p>
        <p className="mt-1 text-xs opacity-80">
          {error.message || "An unexpected error occurred."}
          {error.digest ? ` (${error.digest})` : ""}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-1.5 text-sm hover:bg-[var(--surface)]"
        >
          Try again
        </button>
        <a
          href="/dashboard"
          className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-1.5 text-sm hover:bg-[var(--surface)]"
        >
          Back to dashboard
        </a>
      </div>
    </div>
  );
}