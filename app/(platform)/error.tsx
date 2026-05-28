"use client";

export default function PlatformError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-6 space-y-3">
      <p className="font-semibold text-red-700 dark:text-red-400">Platform error</p>
      <p className="font-mono text-xs text-red-600 dark:text-red-400 break-all">{error.message}</p>
      {error.digest && (
        <p className="text-xs text-red-500 dark:text-red-400">Digest: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-500/20 dark:text-red-400"
      >
        Try again
      </button>
    </div>
  );
}
