import { JobStatus, normalizeJobStatus } from "@/lib/job-status";

type StatusConfig = {
  dot: string;
  badge: string;
  strip: string;   // left-border color class for table rows
  label: string;
  help: string;
};

const statusConfig: Record<ReturnType<typeof normalizeJobStatus>, StatusConfig> = {
  RECEIVED: {
    dot: "bg-[var(--ink)]/35",
    badge: "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",
    strip: "bg-[var(--line)]",
    label: "Received",
    help: "Job received, waiting to be worked on.",
  },
  DIAGNOSING: {
    dot: "bg-blue-500",
    badge: "border-blue-400/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
    strip: "bg-blue-400",
    label: "Diagnosing",
    help: "Technician is currently diagnosing the issue.",
  },
  REFERRED: {
    dot: "bg-violet-500",
    badge: "border-violet-400/30 bg-violet-500/10 text-violet-700 dark:text-violet-400",
    strip: "bg-violet-500",
    label: "Referred",
    help: "Job has been referred for external handling.",
  },
  AWAITING_APPROVAL: {
    dot: "bg-amber-400",
    badge: "border-amber-400/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    strip: "bg-amber-400",
    label: "Awaiting",
    help: "Waiting for client approval to proceed.",
  },
  IN_REPAIR: {
    dot: "bg-emerald-500",
    badge: "border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    strip: "bg-emerald-500",
    label: "In Repair",
    help: "Repair is actively in progress.",
  },
  READY_FOR_PICKUP: {
    dot: "bg-white",
    badge: "border-[var(--accent)] bg-[var(--accent)] text-white",
    strip: "bg-[var(--accent)]",
    label: "Ready ✓",
    help: "Repair complete — ready for client pickup.",
  },
  COMPLETED: {
    dot: "bg-white",
    badge: "border-emerald-700 bg-emerald-600 text-white",
    strip: "bg-emerald-500",
    label: "Completed",
    help: "Repair finished and device returned.",
  },
  CLOSED: {
    dot: "bg-[var(--ink)]/30",
    badge: "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",
    strip: "bg-[var(--line)]",
    label: "Closed",
    help: "Job closed without successful repair.",
  },
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const key = normalizeJobStatus(status);
  const cfg = statusConfig[key];
  return (
    <span
      title={cfg.help}
      aria-label={`${key.replaceAll("_", " ")}. ${cfg.help}`}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${cfg.badge}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dot}`} aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

/** Returns the strip color bg class for a table row's left accent */
export function statusStripClass(status: JobStatus): string {
  return statusConfig[normalizeJobStatus(status)].strip;
}
