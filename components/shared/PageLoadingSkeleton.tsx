export function PageLoadingSkeleton() {
  return (
    <div className="space-y-4 p-2">
      <div className="h-16 animate-pulse rounded-xl bg-[var(--panel-strong)]" />
      <div className="grid gap-3 md:grid-cols-3">
        <div className="h-24 animate-pulse rounded-xl bg-[var(--panel-strong)]" />
        <div className="h-24 animate-pulse rounded-xl bg-[var(--panel-strong)]" />
        <div className="h-24 animate-pulse rounded-xl bg-[var(--panel-strong)]" />
      </div>
      <div className="h-72 animate-pulse rounded-xl bg-[var(--panel-strong)]" />
    </div>
  );
}
