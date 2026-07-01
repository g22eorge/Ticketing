"use client";

import Link from "next/link";
import { useMemo } from "react";
import { TICKET_STATUS_META, toTicketLabel, TicketStatus } from "@/lib/job-status";
import type { JobRow } from "@/components/jobs/JobTable";
import { JobStatus } from "@prisma/client";

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

const BOARD_STATUSES: TicketStatus[] = ["PENDING", "DIAGNOSING", "IN_PROGRESS", "WAITING", "READY", "COMPLETED"];

export function TicketBoardView({
  jobs,
  showClient,
}: {
  jobs: JobRow[];
  showClient: boolean;
}) {
  const columnMap = useMemo(() => {
    const map = new Map<TicketStatus, JobRow[]>();
    for (const ticket of jobs) {
      const key = toTicketLabel(ticket.status as JobStatus);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ticket);
    }
    for (const col of BOARD_STATUSES) {
      if (!map.has(col)) map.set(col, []);
    }
    return map;
  }, [jobs]);

  return (
    <div className="flex gap-4 overflow-x-auto pb-6 pt-1 [scrollbar-width:thin]">
      {BOARD_STATUSES.map((status) => {
        const meta = TICKET_STATUS_META[status];
        const colJobs = columnMap.get(status) ?? [];
        return (
          <div key={status} className="flex w-72 shrink-0 flex-col">
            {/* Column header */}
            <div className="mb-3 flex items-center gap-2.5 rounded-xl bg-[var(--panel)] px-4 py-3 shadow-sm ring-1 ring-[var(--line)]">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: meta.accent }}
                aria-hidden="true"
              />
              <span className="flex-1 text-xs font-semibold tracking-wide text-[var(--ink)]">
                {meta.label}
              </span>
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                style={{ backgroundColor: meta.bg, color: meta.text.replace("text-", "").replace("700", "800").replace("600", "800") }}
              >
                {colJobs.length}
              </span>
            </div>

            {/* Tickets */}
            <div className="flex min-h-[120px] flex-col gap-3 rounded-xl bg-[var(--panel-strong)]/60 p-2.5 ring-1 ring-[var(--line)]/50">
              {colJobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                  <svg className="h-8 w-8 text-[var(--line)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span className="text-sm text-[var(--ink-muted)]">No tickets</span>
                </div>
              ) : (
                colJobs.map((job) => {
                  const age = ageInDays(job.receivedAt);
                  const device = [job.brand, job.model].filter(Boolean).join(" ") || "Unknown device";
                  const assignedName = job.assignedTo ? job.assignedTo.split(" ")[0] : null;
                  return (
                    <Link
                      key={job.id}
                      href={`/jobs/${job.id}`}
                      className="group relative overflow-hidden rounded-xl bg-[var(--panel)] p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ring-1 ring-[var(--line)]/70 hover:ring-[var(--accent)]/30"
                    >
                      {/* Left accent bar */}
                      <span
                        className="absolute left-0 top-0 h-full w-1"
                        style={{ backgroundColor: meta.accent }}
                        aria-hidden="true"
                      />

                      <div className="relative ml-2 space-y-2.5">
                        {/* Row: job number + age */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold tracking-tight text-[var(--ink)]">
                            {job.jobNumber}
                          </span>
                          {age > 0 ? (
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                                age >= 7
                                  ? "bg-rose-950 text-rose-400"
                                  : age >= 3
                                  ? "bg-amber-950 text-amber-400"
                                  : "bg-[var(--panel-strong)] text-[var(--ink-muted)]"
                              }`}
                            >
                              {age}d
                            </span>
                          ) : null}
                        </div>

                        {/* Device */}
                        <div className="flex items-center gap-2 text-[var(--ink-muted)]">
                          <DeviceIcon type={job.deviceType} />
                          <span className="truncate text-sm font-medium text-[var(--ink)]">{device}</span>
                        </div>

                        {/* Client + assignee */}
                        <div className="flex items-center justify-between gap-1 text-xs text-[var(--ink-muted)]">
                          {showClient && job.clientName ? (
                            <span className="truncate">{job.clientName}</span>
                          ) : (
                            <span />
                          )}
                          {assignedName ? (
                            <span className="shrink-0 rounded-md bg-[var(--panel-strong)] px-2 py-0.5 text-xs font-medium">
                              {assignedName}
                            </span>
                          ) : null}
                        </div>

                        {/* Financial strip */}
                        {(job.clientBill !== undefined || job.externalTechBill !== undefined) && (
                          <div className="flex items-center gap-2 pt-1 text-xs text-[var(--ink-muted)]">
                            {job.clientBill !== undefined && (
                              <span className="rounded bg-[var(--panel-strong)] px-2 py-0.5">
                                Client: {job.clientBill?.toLocaleString() ?? "—"}
                              </span>
                            )}
                            {job.externalTechBill !== undefined && (
                              <span className="rounded bg-[var(--panel-strong)] px-2 py-0.5">
                                Tech: {job.externalTechBill?.toLocaleString() ?? "—"}
                              </span>
                            )}
                          </div>
                        )}
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