import Link from "next/link";

export default function AppNotFound() {
  return (
    <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 text-center sm:p-6">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Not Found</p>
      <h1 className="mt-1 text-xl font-semibold text-[var(--ink)]">We could not find that record</h1>
      <p className="mt-2 text-sm text-[var(--ink-muted)]">
        The item may have been removed, reassigned, or you may not have access to it.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <Link href="/jobs" className="btn-premium-secondary rounded-lg px-4 py-2.5 text-sm font-semibold">
          Go to jobs
        </Link>
        <Link href="/dashboard" className="btn-premium rounded-lg px-4 py-2.5 text-sm font-semibold text-white">
          Dashboard
        </Link>
      </div>
    </section>
  );
}
