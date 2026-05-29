/**
 * MobileActivityFeed — mobile-only recent audit log timeline (lg:hidden)
 * Rendered as a React Server Component.
 */
import { prisma } from "@/lib/prisma";

/* ─── color map by action keyword ─────────────────────── */
const ACTION_COLORS: Record<string, { bg: string; icon: string }> = {
  PAYMENT:   { bg: "bg-emerald-500/15", icon: "text-emerald-500" },
  PAID:      { bg: "bg-emerald-500/15", icon: "text-emerald-500" },
  COMPLETED: { bg: "bg-emerald-500/15", icon: "text-emerald-500" },
  INVOICE:   { bg: "bg-amber-500/15",   icon: "text-amber-500"   },
  QUOTE:     { bg: "bg-amber-500/15",   icon: "text-amber-500"   },
  RECEIPT:   { bg: "bg-amber-500/15",   icon: "text-amber-500"   },
  JOB:       { bg: "bg-blue-500/15",    icon: "text-blue-500"    },
  REPAIR:    { bg: "bg-blue-500/15",    icon: "text-blue-500"    },
  STATUS:    { bg: "bg-blue-500/15",    icon: "text-blue-500"    },
  CREATED:   { bg: "bg-blue-500/15",    icon: "text-blue-500"    },
  USER:      { bg: "bg-purple-500/15",  icon: "text-purple-500"  },
  SYSTEM:    { bg: "bg-purple-500/15",  icon: "text-purple-500"  },
};

function getColors(action: string) {
  const upper = action.toUpperCase();
  for (const [key, val] of Object.entries(ACTION_COLORS)) {
    if (upper.includes(key)) return val;
  }
  return { bg: "bg-[var(--panel-strong)]", icon: "text-[var(--ink-muted)]" };
}

function ActionIcon({ action, colors }: { action: string; colors: { bg: string; icon: string } }) {
  const upper = action.toUpperCase();
  // Pick SVG path by action type
  let d = "M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z|M12 6v6l4 2"; // clock default
  if (upper.includes("PAYMENT") || upper.includes("PAID") || upper.includes("RECEIPT")) {
    d = "M12 2v20|M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6";
  } else if (upper.includes("INVOICE") || upper.includes("QUOTE")) {
    d = "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M16 13H8|M16 17H8";
  } else if (upper.includes("COMPLETED")) {
    d = "M22 11.08V12a10 10 0 1 1-5.93-9.14|M22 4 12 14.01l-3-3";
  } else if (upper.includes("STATUS") || upper.includes("JOB") || upper.includes("REPAIR") || upper.includes("CREATED")) {
    d = "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2|M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2|M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2|M9 14l2 2 4-4";
  }
  const paths = d.split("|");
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={colors.icon} aria-hidden="true">
      {paths.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

function timeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return date.toLocaleDateString("en-UG", { day: "numeric", month: "short" });
}

function isToday(date: Date): boolean {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
}

function isYesterday(date: Date): boolean {
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  return date.getFullYear() === yest.getFullYear() &&
    date.getMonth() === yest.getMonth() &&
    date.getDate() === yest.getDate();
}

function humanizeAction(action: string): string {
  return action
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

type AuditEntry = {
  id: string;
  action: string;
  detail: string | null;
  createdAt: Date;
  user: { name: string };
  job: { jobNumber: string } | null;
};

interface Props {
  orgId: string;
}

export async function MobileActivityFeed({ orgId }: Props) {
  const entries: AuditEntry[] = await prisma.auditLog.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      action: true,
      detail: true,
      createdAt: true,
      user: { select: { name: true } },
      job: { select: { jobNumber: true } },
    },
  }).catch(() => [] as AuditEntry[]);

  if (entries.length === 0) return null;

  // Group by TODAY / YESTERDAY / EARLIER
  const today: AuditEntry[] = [];
  const yesterday: AuditEntry[] = [];
  const earlier: AuditEntry[] = [];
  for (const e of entries) {
    if (isToday(e.createdAt)) today.push(e);
    else if (isYesterday(e.createdAt)) yesterday.push(e);
    else earlier.push(e);
  }
  const groups: Array<{ label: string; items: AuditEntry[] }> = [];
  if (today.length > 0)     groups.push({ label: "TODAY",     items: today     });
  if (yesterday.length > 0) groups.push({ label: "YESTERDAY", items: yesterday });
  if (earlier.length > 0)   groups.push({ label: "EARLIER",   items: earlier.slice(0, 6)  });

  return (
    <section className="lg:hidden">
      <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
        Recent Activity
      </p>
      <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        {groups.map((group, gi) => (
          <div key={group.label}>
            {/* Section label */}
            <div className={`px-4 py-2 ${gi > 0 ? "border-t border-[var(--line)]" : ""}`}>
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">
                {group.label}
              </p>
            </div>
            {/* Entries */}
            {group.items.map((entry, idx) => {
              const colors = getColors(entry.action);
              return (
                <div
                  key={entry.id}
                  className={`flex items-start gap-3 px-4 py-3 ${idx < group.items.length - 1 ? "border-b border-[var(--line)]/50" : ""}`}
                >
                  {/* Colored icon circle */}
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${colors.bg}`}>
                    <ActionIcon action={entry.action} colors={colors} />
                  </span>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-[var(--ink)] leading-snug">
                      {humanizeAction(entry.action)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--ink-muted)] leading-snug">
                      {entry.job?.jobNumber ? (
                        <span className="font-medium text-[var(--accent)]">{entry.job.jobNumber}</span>
                      ) : null}
                      {entry.job?.jobNumber && entry.user?.name ? " · " : ""}
                      {entry.user?.name ?? "System"}
                    </p>
                  </div>

                  {/* Timestamp */}
                  <p className="shrink-0 text-[10px] text-[var(--ink-muted)]">
                    {timeAgo(entry.createdAt)}
                  </p>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
