import Link from "next/link";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; href: string };
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--line)] bg-[var(--panel-strong)]/50 py-16 text-center">
      <div className="mb-3 rounded-full bg-[var(--panel-strong)] p-3">
        <svg className="h-6 w-6 text-[var(--ink-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-[var(--ink)]">{title}</p>
      {description && <p className="mt-1 text-xs text-[var(--ink-muted)]">{description}</p>}
      {action && (
        <Link
          href={action.href}
          className="mt-4 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}