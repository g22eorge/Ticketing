import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-6 text-center panel-shadow">
        <h1 className="text-2xl font-semibold">404</h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">The requested resource was not found.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-[var(--accent)] hover:underline">
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
