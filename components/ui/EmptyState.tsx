import Link from "next/link";
import { CircleX, Plus } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; href: string };
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--line)] bg-[var(--panel-strong)]/50 py-16 text-center">
      <div className="mb-3 rounded-full bg-[var(--panel-strong)] p-3">
        <CircleX className="h-6 w-6 text-[var(--ink-muted)]" />
      </div>
      <p className="text-sm font-semibold text-[var(--ink)]">{title}</p>
      {description && <p className="mt-1 text-xs text-[var(--ink-muted)]">{description}</p>}
      {action && (
        <Link
          href={action.href}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> {action.label}
        </Link>
      )}
    </div>
  );
}