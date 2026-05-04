"use client";

export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  const digest = (error as Error & { digest?: string }).digest;

  return (
    <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Page Error</p>
      <h2 className="mt-1 text-lg font-semibold text-[var(--ink)]">We could not load this screen</h2>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        Please retry. If this keeps happening, refresh the page or contact support with this code: {digest ?? "n/a"}.
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
