"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { FieldVisitType } from "@prisma/client";

import { scheduleVisit } from "../actions";

type User = { id: string; name: string; role: string };
type Job = { id: string; jobNumber: string; brand: string; model: string };

type Props = {
  users: User[];
  jobs: Job[];
};

const TYPE_LABELS: Record<FieldVisitType, string> = {
  COLLECTION: "Collection",
  DELIVERY: "Delivery",
  ONSITE_REPAIR: "Onsite Repair",
  ASSESSMENT: "Assessment",
  FOLLOWUP: "Follow-up",
};

export function ScheduleVisitForm({ users, jobs }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [jobId, setJobId] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [type, setType] = useState<FieldVisitType>("ASSESSMENT");
  const [scheduledAt, setScheduledAt] = useState("");
  const [address, setAddress] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [notes, setNotes] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!assignedToId || !scheduledAt || !address.trim()) {
      setError("Assigned to, scheduled date, and address are required.");
      return;
    }

    startTransition(async () => {
      try {
        await scheduleVisit({
          jobId: jobId || undefined,
          assignedToId,
          type,
          scheduledAt: new Date(scheduledAt),
          address,
          contactName: contactName || undefined,
          contactPhone: contactPhone || undefined,
          notes: notes || undefined,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-[var(--ink)]">
            Linked Job <span className="text-[var(--ink-muted)] font-normal">(optional)</span>
          </label>
          <select
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
          >
            <option value="">— None —</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.jobNumber} — {job.brand} {job.model}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-[var(--ink)]">
            Assign To <span className="text-red-500">*</span>
          </label>
          <select
            value={assignedToId}
            onChange={(e) => setAssignedToId(e.target.value)}
            required
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
          >
            <option value="">— Select technician —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-[var(--ink)]">
            Visit Type <span className="text-red-500">*</span>
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as FieldVisitType)}
            required
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
          >
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-[var(--ink)]">
            Scheduled Date & Time <span className="text-red-500">*</span>
          </label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            required
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label className="block text-sm font-medium text-[var(--ink)]">
            Address <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
            placeholder="Full address for the visit"
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-[var(--ink)]">
            Contact Name <span className="text-[var(--ink-muted)] font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="On-site contact person"
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-[var(--ink)]">
            Contact Phone <span className="text-[var(--ink-muted)] font-normal">(optional)</span>
          </label>
          <input
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="+254 ..."
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label className="block text-sm font-medium text-[var(--ink)]">
            Notes <span className="text-[var(--ink-muted)] font-normal">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Any additional instructions or context for the technician"
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 resize-none"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isPending ? "Scheduling…" : "Schedule Visit"}
        </button>
        <Link
          href="/field"
          className="text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
