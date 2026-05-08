"use client";

export default function PlatformError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 space-y-3">
      <p className="font-semibold text-red-700">Platform error</p>
      <p className="font-mono text-xs text-red-600 break-all">{error.message}</p>
      {error.digest && (
        <p className="text-xs text-red-500">Digest: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="rounded-md bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-200"
      >
        Try again
      </button>
    </div>
  );
}
