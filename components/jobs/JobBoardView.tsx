"use client";

import Link from "next/link";
import { useMemo } from "react";
import { normalizeJobStatus } from "@/lib/job-status";
import type { JobRow } from "@/components/jobs/JobTable";

type BoardCol = {
  key: string;
  label: string;
  dot: string;
  strip: string;
  badge: string;
  text: string;
};

const COLUMNS: BoardCol[] = [
  { key: "RECEIVED",          label: "Received",          dot: "bg-blue-500",    strip: "bg-blue-500",    badge: "bg-blue-500/10 text-blue-700 dark:text-blue-400",    text: "text-blue-700 dark:text-blue-400" },
  { key: "DIAGNOSING",        label: "Diagnosing",        dot: "bg-amber-500",   strip: "bg-amber-500",   badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400",   text: "text-amber-700 dark:text-amber-400" },
  { key: "REFERRED",          label: "Referred",          dot: "bg-purple-500",  strip: "bg-purple-500",  badge: "bg-purple-500/10 text-purple-700 dark:text-purple-400",  text: "text-purple-700 dark:text-purple-400" },
  { key: "AWAITING_APPROVAL", label: "Awaiting Approval", dot: "bg-orange-500",  strip: "bg-orange-500",  badge: "bg-orange-500/10 text-orange-700 dark:text-orange-400",  text: "text-orange-700 dark:text-orange-400" },
  { key: "IN_REPAIR",         label: "In Repair",         dot: "bg-emerald-500", strip: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", text: "text-emerald-700 dark:text-emerald-400" },
];

function ageInDays(receivedAt: Date | string): number {
  return Math.floor((Date.now() - new Date(receivedAt).getTime()) / 86_400_000);
}

function DeviceIcon({ type }: { type: string }) {
  if (type === "PHONE_ANDROID" || type === "PHONE_IPHONE") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <path d="M12 18h.01" />
      </svg>
    );
  }
  if (type === "TABLET") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <path d="M12 18h.01" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
      <rect x="2" y="4" width="20" height="14" rx="1" />
      <path d="M8 20h8M12 18v2" />
    </svg>
  );
}

export function JobBoardView({
  jobs,
  showClient,
}: {
  jobs: JobRow[];
  showClient: boolean;
}) {
  const columnMap = useMemo(() => {
    const map = new Map<string, JobRow[]>(COLUMNS.map((c) => [c.key, []]));
    for (const job of jobs) {
      const key = normalizeJobStatus(job.status);
      map.get(key)?.push(job);
    }
    return map;
  }, [jobs]);

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 [scrollbar-width:thin]">
      {COLUMNS.map((col) => {
        const colJobs = columnMap.get(col.key) ?? [];
        return (
          <div key={col.key} className="flex w-64 shrink-0 flex-col xl:w-[17rem]">
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
              <span className={`h-2 w-2 rounded-full ${col.dot}`} aria-hidden="true" />
              <span className={`flex-1 text-xs font-semibold ${col.text}`}>{col.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${col.badge}`}>{colJobs.length}</span>
            </div>

            <div className="flex flex-col gap-2">
              {colJobs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--line)] py-8 text-center text-[11px] text-[var(--ink-muted)]/50">
                  No jobs
                </div>
              ) : (
                colJobs.map((job) => {
                  const age = ageInDays(job.receivedAt);
                  const device = [job.brand, job.model].filter(Boolean).join(" ") || "Unknown device";
                  return (
                    <Link
                      key={job.id}
                      href={`/jobs/${job.id}`}
                      className="flex overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)] transition hover:border-[var(--accent)]/40 hover:shadow-sm"
                    >
                      <span className={`w-1 shrink-0 ${col.strip}`} aria-hidden="true" />
                      <div className="min-w-0 flex-1 space-y-1.5 p-2.5">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] font-bold tracking-tight text-[var(--ink)]">{job.jobNumber}</span>
                          {age > 0 ? (
                            <span
                              className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                                age >= 7
                                  ? "bg-red-500/10 text-red-700 dark:text-red-400"
                                  : age >= 3
                                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                                    : "bg-[var(--panel-strong)] text-[var(--ink-muted)]"
                              }`}
                            >
                              {age}d
                            </span>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-1.5 text-[var(--ink-muted)]">
                          <DeviceIcon type={job.deviceType} />
                          <span className="truncate text-[11px] font-medium text-[var(--ink)]">{device}</span>
                        </div>

                        {(showClient && job.clientName) || job.assignedTo ? (
                          <div className="flex items-center justify-between gap-1 text-[10px] text-[var(--ink-muted)]">
                            {showClient && job.clientName ? (
                              <span className="truncate">{job.clientName}</span>
                            ) : (
                              <span />
                            )}
                            {job.assignedTo ? (
                              <span className="shrink-0 rounded bg-[var(--panel-strong)] px-1.5 py-0.5 font-medium">
                                {job.assignedTo.split(" ")[0]}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
