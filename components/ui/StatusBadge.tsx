export type BadgeVariant = "default" | "success" | "warning" | "error" | "info" | "neutral" | "accent" | "purple" | "orange";

interface StatusBadgeProps {
  label: string;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-[var(--panel-strong)] text-[var(--ink)] border-[var(--line)]",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
  warning: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
  error: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
  info: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20",
  neutral: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20",
  accent: "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/20",
  purple: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20",
  orange: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20",
};

export function StatusBadge({ label, variant = "default", className = "" }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${variantStyles[variant]} ${className}`}
    >
      {label}
    </span>
  );
}

export function quotationStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "DRAFT": return "warning";
    case "SENT": return "info";
    case "ACCEPTED": return "success";
    case "REJECTED": return "error";
    case "EXPIRED": return "neutral";
    case "CONVERTED": return "accent";
    default: return "default";
  }
}

export function invoiceStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "DRAFT": return "warning";
    case "ISSUED": return "info";
    case "PAID": return "success";
    case "PARTIALLY_PAID": return "orange";
    case "OVERDUE": return "error";
    case "VOID": return "neutral";
    default: return "default";
  }
}

export function receiptStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "ISSUED": return "success";
    case "SENT": return "info";
    case "CANCELLED":
    case "VOIDED": return "neutral";
    default: return "default";
  }
}
