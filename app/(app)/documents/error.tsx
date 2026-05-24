"use client";

export default function DocumentsError({ error, reset }: { error: Error; reset: () => void }) {
  const digest = (error as Error & { digest?: string }).digest;

  return (
    <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Documents Error</p>
      <h2 className="mt-1 text-lg font-semibold text-[var(--ink)]">Could not load this documents page</h2>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        Please retry. If this keeps happening, refresh the page or contact support
        {digest ? <> with code: <code className="font-mono text-xs">{digest}</code></> : null}.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={reset}
          className="btn-premium rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
        >
          Retry
        </button>
        <a
          href="/dashboard"
          className="btn-premium-secondary rounded-lg px-4 py-2.5 text-sm font-semibold"
        >
          Back to dashboard
        </a>
      </div>
    </div>
  );
}
