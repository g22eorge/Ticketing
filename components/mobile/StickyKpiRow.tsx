import Link from "next/link";

type StickyKpiItem = {
  label: string;
  value: string;
  href?: string;
  tone?: "default" | "brand" | "success" | "warning";
};

export function StickyKpiRow({ items, className = "" }: { items: StickyKpiItem[]; className?: string }) {
  return (
    <div className={`panel-shadow sticky top-[var(--mobile-stack-offset)] z-10 grid grid-cols-2 gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-2 py-2 sm:grid-cols-3 lg:static lg:top-auto lg:grid-cols-4 lg:px-3 ${className}`}>
      {items.map((item) => {
        const toneClass =
          item.tone === "brand"
            ? "text-[var(--accent)]"
            : item.tone === "success"
              ? "text-emerald-600"
              : item.tone === "warning"
                ? "text-amber-600"
                : "text-[var(--ink)]";

        const content = (
          <>
            <p className="text-[12px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">{item.label}</p>
            <p className={`mt-0.5 text-sm font-semibold ${toneClass}`}>{item.value}</p>
          </>
        );

        if (item.href) {
          return (
            <Link
              key={item.label}
              href={item.href}
              className="min-w-0 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5"
            >
              {content}
            </Link>
          );
        }

        return (
          <div key={item.label} className="min-w-0 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5">
            {content}
          </div>
        );
      })}
    </div>
  );
}
