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
    badge: "border-blue-200 bg-blue-50 text-blue-700",
    strip: "bg-blue-400",
    label: "Diagnosing",
    help: "Technician is currently diagnosing the issue.",
  },
  REFERRED: {
    dot: "bg-violet-500",
    badge: "border-violet-200 bg-violet-50 text-violet-700",
    strip: "bg-violet-500",
    label: "Referred",
    help: "Job has been referred for external handling.",
  },
  AWAITING_APPROVAL: {
    dot: "bg-amber-400",
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    strip: "bg-amber-400",
    label: "Awaiting",
    help: "Waiting for client approval to proceed.",
  },
  IN_REPAIR: {
    dot: "bg-emerald-500",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
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
    dot: "bg-gray-300",
    badge: "border-gray-200 bg-gray-50 text-gray-500",
    strip: "bg-gray-300",
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
