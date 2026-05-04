"use client";

export default function AuthError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="rounded-lg border border-black bg-black p-4 text-sm text-white">
        Auth error: {error.message}
        <button onClick={reset} className="ml-3 rounded border border-white px-2 py-1">
          Retry
        </button>
      </div>
    </main>
  );
}
