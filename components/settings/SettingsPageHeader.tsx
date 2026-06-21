import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function SettingsPageHeader({
  title,
  description,
  backHref,
  backLabel = "Settings",
  right,
}: {
  title: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="panel-shadow overflow-hidden rounded-2xl border border-[var(--line)] bg-gradient-to-r from-sky-100 via-white to-orange-100 p-4 text-slate-950 sm:p-6 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 dark:text-[var(--ink)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {backHref ? (
            <Link
              href={backHref}
              className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 hover:text-slate-900 dark:text-[var(--ink-muted)] dark:hover:text-[var(--ink)]"
            >
              <ArrowLeft className="h-3 w-3" aria-hidden="true" />
              <span>{backLabel}</span>
            </Link>
          ) : (
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 dark:text-[var(--ink-muted)]">Settings</p>
          )}
          <h1 className="mt-1 truncate text-xl font-semibold">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-slate-700 dark:text-[var(--ink-muted)]">{description}</p>
          ) : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
    </div>
  );
}
