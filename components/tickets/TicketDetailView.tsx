"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updateJobAction } from "@/app/(app)/jobs/[id]/actions";
import { TICKET_STATUS_META, type TicketStatus } from "@/lib/job-status";
import { JobStatus } from "@prisma/client";

const statusFlow: Record<TicketStatus, JobStatus[]> = {
  PENDING: ["DIAGNOSING"],
  DIAGNOSING: ["IN_REPAIR", "AWAITING_APPROVAL", "CLOSED"],
  IN_PROGRESS: ["AWAITING_APPROVAL", "READY_FOR_PICKUP", "CLOSED"],
  WAITING: ["IN_REPAIR", "CLOSED"],
  READY: ["COMPLETED", "CLOSED"],
  COMPLETED: ["CLOSED"],
  CLOSED: [],
};

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-UG", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function fmtMoney(amount: number | null, currency: string) {
  if (amount == null) return "—";
  return `${currency} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount)}`;
}

type Props = {
  job: {
    id: string;
    jobNumber: string;
    dbStatus: string;
    ticketStatus: TicketStatus;
    receivedAt: string;
    updatedAt: string;
    issueDescription: string | null;
    diagnosisNotes: string | null;
    clientBill: number | null;
    clientPaid: boolean;
    brand: string | null;
    model: string | null;
    deviceType: string | null;
    serialOrImei: string | null;
    client: { id: string; fullName: string; phone: string | null; email: string | null } | null;
    assignedTo: { id: string; name: string } | null;
    hasQuotation: boolean;
    hasInvoice: boolean;
  };
  auditLogs: { id: string; action: string; createdAt: string; user: string }[];
  baseCurrency: string;
  returnTo: string;
};

export function TicketDetailView({ job, auditLogs, baseCurrency, returnTo }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const meta = TICKET_STATUS_META[job.ticketStatus];
  const nextStatuses = statusFlow[job.ticketStatus] ?? [];

  function changeStatus(next: JobStatus) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("jobId", job.id);
      fd.set("nextStatus", next);
      if (note) fd.set("statusNote", note);
      const res = await updateJobAction(fd);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Status updated");
        router.refresh();
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 pb-20 md:p-6">
      {/* Back */}
      <Link href={returnTo} className="inline-flex items-center gap-1 text-sm font-medium text-[var(--ink-muted)] transition hover:text-[var(--ink)]">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Back
      </Link>

      {/* Header Card */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-[var(--ink-muted)]">Ticket {job.jobNumber}</p>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--ink)]">
              {job.brand || job.deviceType || "Device"}
              {job.model ? ` · ${job.model}` : ""}
            </h1>
            <p className="text-sm text-[var(--ink-muted)]">Received {fmtDate(job.receivedAt)}</p>
          </div>
          <span
            className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
            style={{
              backgroundColor: meta.bg.includes("blue") ? "#dbeafe" : meta.bg.includes("emerald") ? "#d1fae5" : meta.bg.includes("amber") ? "#fef3c7" : meta.bg.includes("violet") ? "#ede9fe" : "#f1f5f9",
              color: meta.text.includes("blue") ? "#1d4ed8" : meta.text.includes("emerald") ? "#047857" : meta.text.includes("amber") ? "#b45309" : meta.text.includes("violet") ? "#7c3aed" : "#475569",
            }}
          >
            {meta.label}
          </span>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left - Main Info */}
        <div className="space-y-6 lg:col-span-2">
          {/* Client */}
          {job.client && (
            <Section title="Client">
              <p className="text-base font-semibold text-[var(--ink)]">{job.client.fullName}</p>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--ink-muted)]">
                {job.client.phone && (
                  <span className="flex items-center gap-1">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>
                    {job.client.phone}
                  </span>
                )}
                {job.client.email && (
                  <span className="flex items-center gap-1">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25H4.5a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 00-1.183 1.548l-7.097 3.684a2.25 2.25 0 01-2.02 0L2.488 8.541a2.25 2.25 0 00-1.183-1.548V6.75" /></svg>
                    {job.client.email}
                  </span>
                )}
              </div>
            </Section>
          )}

          {/* Device */}
          {(job.deviceType || job.serialOrImei) && (
            <Section title="Device">
              <div className="flex flex-wrap gap-4 text-sm">
                {job.deviceType && (
                  <div>
                    <p className="text-xs text-[var(--ink-muted)]">Type</p>
                    <p className="font-medium text-[var(--ink)]">{job.deviceType}</p>
                  </div>
                )}
                {job.serialOrImei && (
                  <div>
                    <p className="text-xs text-[var(--ink-muted)]">Serial Number</p>
                    <p className="font-mono text-sm text-[var(--ink)]">{job.serialOrImei}</p>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Issue */}
          {job.issueDescription && (
            <Section title="Issue Description">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--ink)]">{job.issueDescription}</p>
            </Section>
          )}

          {/* Diagnosis */}
          {job.diagnosisNotes && (
            <Section title="Diagnosis">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--ink)]">{job.diagnosisNotes}</p>
            </Section>
          )}

          {/* Timeline */}
          <Section title="Timeline">
            <div className="space-y-3">
              {auditLogs.map((a) => (
                <div key={a.id} className="flex items-start gap-3">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--line)]" />
                  <div className="min-w-0">
                    <p className="text-sm text-[var(--ink)]">{a.action}</p>
                    <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)]">
                      <span>{a.user}</span>
                      <span>·</span>
                      <span>{fmtDate(a.createdAt)}</span>
                    </div>
                  </div>
                </div>
              ))}
              {auditLogs.length === 0 && <p className="text-sm text-[var(--ink-muted)]">No activity recorded.</p>}
            </div>
          </Section>
        </div>

        {/* Right - Sidebar */}
        <div className="space-y-6">
          {/* Status */}
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--ink-muted)]">Status</h3>
            <div className="space-y-3">
              {job.assignedTo && (
                <div className="flex items-center gap-2 text-sm">
                  <svg className="h-4 w-4 text-[var(--ink-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                  <span className="text-[var(--ink-muted)]">Assigned to <span className="font-medium text-[var(--ink)]">{job.assignedTo.name}</span></span>
                </div>
              )}
              {job.clientBill != null && (
                <div className="flex items-center gap-2 text-sm">
                  <svg className="h-4 w-4 text-[var(--ink-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.25 18.75a60.07 60.07 0 0115.797-2.101c.045.262-.053.523-.147.74l-.957 2.063a3.75 3.75 0 01-3.39 2.182H6.75a3.75 3.75 0 01-3.75-3.75V12.75a3.75 3.75 0 00-1.5 0v1.5a5.25 5.25 0 005.25 5.25h7.5a5.25 5.25 0 005.25-5.25V12a3.75 3.75 0 00-1.5-3.18l-1.14-.853a60.07 60.07 0 00-15.797 2.101z" /></svg>
                  <span className="text-[var(--ink-muted)]">
                    {fmtMoney(job.clientBill, baseCurrency)} · {job.clientPaid ? "Paid" : "Unpaid"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Update Status */}
          {nextStatuses.length > 0 && (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--ink-muted)]">Update Status</h3>
              <input
                type="text"
                placeholder="Add a note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mb-3 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-muted)] focus:border-[var(--accent)]/60 focus:ring-1 focus:ring-[var(--accent)]/20"
              />
              <div className="flex flex-wrap gap-2">
                {nextStatuses.map((s) => (
                  <button
                    key={s}
                    disabled={pending}
                    onClick={() => changeStatus(s)}
                    className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110 disabled:opacity-40"
                  >
                    {s.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Documents */}
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--ink-muted)]">Documents</h3>
            <div className="space-y-2">
              <DocLink href={`/api/jobs/${job.id}/quotation`} label="Quotation" icon="quote" exists={job.hasQuotation} />
              <DocLink href={`/api/jobs/${job.id}/invoice`} label="Invoice" icon="invoice" exists={job.hasInvoice} />
              <DocLink href={`/api/jobs/${job.id}/job-card`} label="Job Card" icon="job" exists={true} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--ink-muted)]">{title}</h3>
      {children}
    </div>
  );
}

function DocLink({ href, label, icon, exists }: { href: string; label: string; icon: string; exists: boolean }) {
  const icons: Record<string, string> = {
    quote: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.429-2.692a.75.75 0 00-.91-.175L12.75 4.5l-7.41 2.635a.75.75 0 00-.54.707V19.5a2.25 2.25 0 002.25 2.25h4.5",
    invoice: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12m-3.75 0v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 015 13.126v-1.5a3.375 3.375 0 013.375-3.375h1.125",
    job: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12m-3.75 0v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 015 13.126v-1.5a3.375 3.375 0 013.375-3.375h1.125",
  };
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-sm transition hover:border-[var(--accent)]/40 hover:bg-[var(--panel-strong)]"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--panel-strong)]">
        <svg className="h-4 w-4 text-[var(--ink-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d={icons[icon] ?? icons.job} />
        </svg>
      </div>
      <span className="font-medium text-[var(--ink)]">{label}</span>
      <span className="ml-auto text-xs text-[var(--ink-muted)]">{exists ? "View" : "Generate"}</span>
    </Link>
  );
}