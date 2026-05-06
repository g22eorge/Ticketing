"use client";

export default function AuthError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] p-6">
      <div className="panel-shadow w-full max-w-sm rounded-xl border border-[var(--line)] bg-[var(--panel)] p-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 className="text-base font-semibold text-[var(--ink)]">Authentication error</h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          {error.message || "Something went wrong during sign-in. Please try again."}
        </p>
        <button
          onClick={reset}
          className="btn-premium mt-5 w-full rounded-lg px-4 py-2.5 text-sm font-semibold"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
