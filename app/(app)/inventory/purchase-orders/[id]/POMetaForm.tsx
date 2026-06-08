"use client";

import { useState, useTransition } from "react";
import { updatePurchaseOrderAction } from "../actions";

type POData = {
  id: string;
  reference: string | null;
  orderedAt: Date | null;
  expectedAt: Date | null;
  notes: string | null;
  status: string;
};

function toDateInput(d: Date | null) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

export function POMetaForm({ po }: { po: POData }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const fd = new FormData(e.currentTarget);
    fd.set("id", po.id);
    startTransition(async () => {
      const result = await updatePurchaseOrderAction(fd);
      if (result.error) { setError(result.error); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
      <input type="hidden" name="status" value={po.status} />
      <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-2">
        <p className="text-sm font-bold text-[var(--ink)]">Terms</p>
        <p className="text-xs text-[var(--ink-muted)]">Reference, dates, notes</p>
      </div>
      <div className="grid gap-3 p-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">Reference / PO#</label>
          <input
            name="reference"
            type="text"
            defaultValue={po.reference ?? ""}
            className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--accent)]/10"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">Order Date</label>
          <input
            name="orderedAt"
            type="date"
            defaultValue={toDateInput(po.orderedAt)}
            className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--accent)]/10"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">Expected Delivery</label>
          <input
            name="expectedAt"
            type="date"
            defaultValue={toDateInput(po.expectedAt)}
            className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--accent)]/10"
          />
        </div>
        <div className="sm:col-span-3">
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">Notes</label>
        <textarea
          name="notes"
          rows={2}
          defaultValue={po.notes ?? ""}
          className="w-full resize-none rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--accent)]/10"
        />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] px-3 py-2">
        <div>
          {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
          {saved && <p className="text-xs font-semibold text-green-600">Saved successfully.</p>}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="btn-premium rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}
