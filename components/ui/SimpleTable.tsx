import React from "react";
import Link from "next/link";

export type TableColumn<T> = {
  header: string;
  width?: string;
  align?: "left" | "right" | "center";
  render: (row: T, index: number) => React.ReactNode;
};

interface SimpleTableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  keyExtractor: (row: T) => string;
  emptyState: React.ReactNode;
}

export function SimpleTable<T>({ columns, rows, keyExtractor, emptyState }: SimpleTableProps<T>) {
  const alignClass = (align?: string) => {
    if (align === "right") return "text-right";
    if (align === "center") return "text-center";
    return "text-left";
  };

  if (rows.length === 0) return <>{emptyState}</>;

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="bg-[var(--panel-strong)]">
          <tr className="border-b border-[var(--line)] text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
            {columns.map((col, i) => (
              <th key={i} className={`px-4 py-3 ${alignClass(col.align)}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--line)]">
          {rows.map((row, i) => (
            <tr key={keyExtractor(row)} className="transition hover:bg-[var(--panel-strong)]/50">
              {columns.map((col, j) => (
                <td key={j} className={`px-4 py-3 ${alignClass(col.align)}`}>
                  {col.render(row, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface PageLayoutProps {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  searchPlaceholder?: string;
  searchValue?: string;
  children: React.ReactNode;
  page: number;
  totalPages: number;
}

export function PageLayout({ title, subtitle, action, searchPlaceholder, searchValue, children, page, totalPages }: PageLayoutProps) {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">{title}</h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">{subtitle}</p>
        </div>
        {action}
      </div>

      {searchPlaceholder && (
        <form className="max-w-sm">
          <input
            name="q"
            defaultValue={searchValue}
            placeholder={searchPlaceholder}
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-muted)] focus:border-[var(--accent)]/60 focus:ring-1 focus:ring-[var(--accent)]/20"
          />
        </form>
      )}

      {children}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-[var(--ink-muted)]">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            {page > 1 && <Link href={`?page=${page - 1}`} className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-[var(--ink-muted)] transition hover:border-[var(--accent)]/40 hover:bg-[var(--panel-strong)]">Previous</Link>}
            {page < totalPages && <Link href={`?page=${page + 1}`} className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-[var(--ink-muted)] transition hover:border-[var(--accent)]/40 hover:bg-[var(--panel-strong)]">Next</Link>}
          </div>
        </div>
      )}
    </div>
  );
}