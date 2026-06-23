"use client";

import { useEffect } from "react";

export default function ProfileError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Profile page error:", error);
  }, [error]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
        <p className="font-semibold">Could not load profile</p>
        <p className="mt-1 text-xs opacity-80">
          {error?.message || "Something went wrong while loading your profile."}
        </p>
        {error?.digest ? (
          <p className="mt-1 text-xs opacity-60">Error ID: {error.digest}</p>
        ) : null}
      </div>
      <button
        onClick={() => window.location.reload()}
        className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-1.5 text-sm hover:bg-[var(--surface)]"
      >
        Retry
      </button>
    </div>
  );
}
