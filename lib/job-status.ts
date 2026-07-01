// ── NEW PREMIUM TICKETING SYSTEM — STATUS MAP ───────────────────────────────
// The app treats every Job as a Ticket.  The DB keeps the full enum for backward
// compatibility, but the UI surfaces only the minimal set below.
// ───────────────────────────────────────────────────────────────────────────

// Canonical status values stored in the database (keep for typing + legacy data).
export const JOB_STATUSES = [
  "RECEIVED",
  "DIAGNOSING",
  "REFERRED",
  "PENDING_EXTERNAL_ASSIGNMENT",
  "ASSIGNED_ONE_TIME_EXTERNAL",
  "IN_EXTERNAL_REPAIR",
  "WAITING_FOR_PARTS",
  "RETURNED_FROM_EXTERNAL",
  "AWAITING_APPROVAL",
  "IN_REPAIR",
  "READY_FOR_PICKUP",
  "DELIVERED",
  "COMPLETED",
  "CLOSED",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

// ── Minimal Ticketing UI Status Flow ─────────────────────────────────────────
export const TICKET_STATUSES = [
  "PENDING",
  "DIAGNOSING",
  "IN_PROGRESS",
  "WAITING",
  "READY",
  "COMPLETED",
  "CLOSED",
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

// DB → Ticket label (single source of truth for UI display)
export function toTicketLabel(status: JobStatus): TicketStatus {
  switch (status) {
    case "RECEIVED":
      return "PENDING";
    case "DIAGNOSING":
      return "DIAGNOSING";
    case "AWAITING_APPROVAL":
    case "WAITING_FOR_PARTS":
      return "WAITING";
    case "IN_REPAIR":
    case "REFERRED":
    case "PENDING_EXTERNAL_ASSIGNMENT":
    case "ASSIGNED_ONE_TIME_EXTERNAL":
    case "IN_EXTERNAL_REPAIR":
    case "RETURNED_FROM_EXTERNAL":
      return "IN_PROGRESS";
    case "READY_FOR_PICKUP":
      return "READY";
    case "COMPLETED":
    case "DELIVERED":
      return "COMPLETED";
    case "CLOSED":
      return "CLOSED";
    default:
      return "PENDING";
  }
}

// Reverse: ticket label → list of DB statuses (for querying)
export function ticketStatusToDb(status: TicketStatus): JobStatus[] {
  switch (status) {
    case "PENDING":
      return ["RECEIVED"];
    case "DIAGNOSING":
      return ["DIAGNOSING"];
    case "IN_PROGRESS":
      return [
        "IN_REPAIR",
        "REFERRED",
        "PENDING_EXTERNAL_ASSIGNMENT",
        "ASSIGNED_ONE_TIME_EXTERNAL",
        "IN_EXTERNAL_REPAIR",
        "RETURNED_FROM_EXTERNAL",
      ];
    case "WAITING":
      return ["AWAITING_APPROVAL", "WAITING_FOR_PARTS"];
    case "READY":
      return ["READY_FOR_PICKUP"];
    case "COMPLETED":
      return ["COMPLETED", "DELIVERED"];
    case "CLOSED":
      return ["CLOSED"];
    default:
      return ["RECEIVED"];
  }
}

// ── Human-readable labels, colors, icons (single source of truth) ───────────
export const TICKET_STATUS_META: Record<
  TicketStatus,
  {
    label: string;
    shortLabel: string;
    description: string;
    color: string;
    bg: string;
    text: string;
    border: string;
    ring: string;
    icon: string; // SVG path
    accent: string;
  }
> = {
  PENDING: {
    label: "Pending",
    shortLabel: "New",
    description: "Awaiting intake or initial review",
    color: "bg-slate-500",
    bg: "bg-slate-50",
    text: "text-slate-700",
    border: "border-slate-200",
    ring: "ring-slate-200",
    accent: "#64748b",
    icon: "M12 6v6l4 2M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z",
  },
  DIAGNOSING: {
    label: "Diagnosing",
    shortLabel: "Diag",
    description: "Assessment in progress",
    color: "bg-blue-500",
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
    ring: "ring-blue-200",
    accent: "#3b82f6",
    icon: "M9.663 13.713c-.362-.106-.75-.214-1.152-.342-2.296-.754-4.233-2.175-5.445-4.046C2.387 7.893 2 6.52 2 5.25c0-.414.336-.75.75-.75h.966c.414 0 .75.336.75.75 0 .92.23 1.794.646 2.566C5.63 9.56 7.26 10.82 9.12 11.56c.24.093.47.19.688.293.808.348 1.67.618 2.574.812.335.072.647.128.924.168.387.056.752.252 1.006.548a12.272 12.272 0 0 0 2.512-2.512c-.296-.254-.492-.619-.548-1.006-.04-.277-.096-.59-.168-.924-.194-.904-.464-1.766-.812-2.574-.103-.218-.2-.448-.293-.688-.76-2.34-2.556-4.264-4.934-5.384C10.37.622 9.516.376 8.65.188A12.273 12.273 0 0 0 7 .056C6.52.024 6.049 0 5.578 0c-.414 0-.75.336-.75.75v.966c0 .414.336.75.75.75.92 0 1.794.23 2.566.646 2.178 1.13 3.665 3.017 4.264 5.274.094.362.202.75.33 1.152.754 2.296 2.175 4.233 4.046 5.445 1.618 1.107 3.244 1.58 4.92 1.414.387-.036.75-.25.936-.588.185-.34.15-.75-.088-1.058-.238-.308-.574-.53-.956-.578-.384-.048-.77-.108-1.156-.194-2.072-.47-4.032-1.62-5.496-3.27z",
  },
  IN_PROGRESS: {
    label: "In Progress",
    shortLabel: "Active",
    description: "Repair / service underway",
    color: "bg-sky-500",
    bg: "bg-sky-50",
    text: "text-sky-700",
    border: "border-sky-200",
    ring: "ring-sky-200",
    accent: "#0ea5e9",
    icon: "M13 10V3L4 14h7v7l9-11h-7z",
  },
  WAITING: {
    label: "Waiting",
    shortLabel: "Hold",
    description: "Awaiting parts or approval",
    color: "bg-amber-500",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    ring: "ring-amber-200",
    accent: "#f59e0b",
    icon: "M12 8v4l3 3M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z",
  },
  READY: {
    label: "Ready",
    shortLabel: "Ready",
    description: "Ready for pickup / delivery",
    color: "bg-emerald-500",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    ring: "ring-emerald-200",
    accent: "#10b981",
    icon: "M9 12l2 2 4-4M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z",
  },
  COMPLETED: {
    label: "Completed",
    shortLabel: "Done",
    description: "Finished and delivered",
    color: "bg-violet-500",
    bg: "bg-violet-50",
    text: "text-violet-700",
    border: "border-violet-200",
    ring: "ring-violet-200",
    accent: "#8b5cf6",
    icon: "M20 13V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8M20 13H6M20 13l-5.333 5.333M6 13l5.333 5.333",
  },
  CLOSED: {
    label: "Closed",
    shortLabel: "Closed",
    description: "Cancelled or archived",
    color: "bg-slate-400",
    bg: "bg-slate-100",
    text: "text-slate-600",
    border: "border-slate-300",
    ring: "ring-slate-300",
    accent: "#94a3b8",
    icon: "M6 18L18 6M6 6l12 12",
  },
};

// ── Legacy helpers (kept for backward compatibility) ──────────────────────────
export const UI_JOB_STATUSES = [
  "RECEIVED",
  "DIAGNOSING",
  "REFERRED",
  "AWAITING_APPROVAL",
  "IN_REPAIR",
  "READY_FOR_PICKUP",
  "COMPLETED",
  "CLOSED",
] as const;

export type UiJobStatus = (typeof UI_JOB_STATUSES)[number];

export function normalizeJobStatus(status: JobStatus): UiJobStatus {
  if (
    status === "PENDING_EXTERNAL_ASSIGNMENT" ||
    status === "ASSIGNED_ONE_TIME_EXTERNAL"
  ) {
    return "REFERRED";
  }
  if (
    status === "IN_EXTERNAL_REPAIR" ||
    status === "WAITING_FOR_PARTS" ||
    status === "RETURNED_FROM_EXTERNAL"
  ) {
    return "IN_REPAIR";
  }
  if (status === "DELIVERED") {
    return "COMPLETED";
  }
  if (UI_JOB_STATUSES.includes(status as UiJobStatus)) {
    return status as UiJobStatus;
  }
  return "DIAGNOSING";
}

export function isOpenJobStatus(status: JobStatus | string) {
  return !["COMPLETED", "CLOSED", "DELIVERED"].includes(status);
}

export function isCompletedJobStatus(status: JobStatus | string) {
  return status === "COMPLETED" || status === "DELIVERED";
}
