"use client";

import { useState, useTransition } from "react";
import { FieldVisitStatus } from "@prisma/client";

import { updateVisitStatus, recordSignoff } from "../actions";

type Props = {
  visitId: string;
  status: FieldVisitStatus;
  isManager: boolean;
  isFieldTech: boolean;
};

export function VisitActions({ visitId, status, isManager, isFieldTech }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showSignoffForm, setShowSignoffForm] = useState(false);
  const [signoffName, setSignoffName] = useState("");
  const [outcomeNotes, setOutcomeNotes] = useState("");

  function act(fn: () => Promise<void>, successMsg?: string) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        await fn();
        if (successMsg) setSuccess(successMsg);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  function handleStatusUpdate(newStatus: FieldVisitStatus) {
    act(() => updateVisitStatus(visitId, newStatus), `Status updated to ${newStatus.replace("_", " ")}`);
  }

  function handleSignoffSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!signoffName.trim()) {
      setError("Signoff name is required.");
      return;
    }
    act(
      () => recordSignoff(visitId, { signoffName: signoffName.trim(), outcomeNotes: outcomeNotes || undefined }),
      "Visit completed and signed off.",
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      )}

      {status === "SCHEDULED" && (isFieldTech || isManager) && (
        <button
          onClick={() => handleStatusUpdate("EN_ROUTE")}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold text-white hover:bg-yellow-600 transition-colors disabled:opacity-50"
        >
          Mark En Route
        </button>
      )}

      {status === "EN_ROUTE" && (isFieldTech || isManager) && (
        <button
          onClick={() => handleStatusUpdate("ARRIVED")}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 transition-colors disabled:opacity-50"
        >
          Mark Arrived
        </button>
      )}

      {status === "ARRIVED" && (isFieldTech || isManager) && !showSignoffForm && (
        <button
          onClick={() => setShowSignoffForm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
        >
          Record Sign-off
        </button>
      )}

      {status === "ARRIVED" && showSignoffForm && (
        <form onSubmit={handleSignoffSubmit} className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <h3 className="text-sm font-semibold text-[var(--ink)]">Record Sign-off</h3>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[var(--ink)]">
              Signoff Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={signoffName}
              onChange={(e) => setSignoffName(e.target.value)}
              required
              placeholder="Name of person signing off"
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[var(--ink)]">
              Outcome Notes <span className="text-[var(--ink-muted)] font-normal">(optional)</span>
            </label>
            <textarea
              value={outcomeNotes}
              onChange={(e) => setOutcomeNotes(e.target.value)}
              rows={3}
              placeholder="Describe work done, outcomes, or any issues"
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 resize-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Complete Visit"}
            </button>
            <button
              type="button"
              onClick={() => setShowSignoffForm(false)}
              className="text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {isManager && (status === "SCHEDULED" || status === "EN_ROUTE" || status === "ARRIVED") && (
        <button
          onClick={() => handleStatusUpdate("CANCELLED")}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
        >
          Cancel Visit
        </button>
      )}
    </div>
  );
}
