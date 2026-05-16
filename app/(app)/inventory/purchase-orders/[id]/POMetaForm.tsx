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

const STATUSES = ["DRAFT", "ORDERED", "PARTIAL", "RECEIVED", "CANCELLED"] as const;

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
    <form onSubmit={handleSubmit} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Edit Order</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">Reference / PO#</label>
          <input
            name="reference"
            type="text"
            defaultValue={po.reference ?? ""}
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">Status</label>
          <select
            name="status"
            defaultValue={po.status}
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">Order Date</label>
          <input
            name="orderedAt"
            type="date"
            defaultValue={toDateInput(po.orderedAt)}
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">Expected Delivery</label>
          <input
            name="expectedAt"
            type="date"
            defaultValue={toDateInput(po.expectedAt)}
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">Notes</label>
        <textarea
          name="notes"
          rows={2}
          defaultValue={po.notes ?? ""}
          className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40 resize-none"
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {saved && <p className="text-xs text-green-600">Saved successfully.</p>}
      <button
        type="submit"
        disabled={pending}
        className="btn-premium rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save Changes"}
      </button>
    </form>
  );
}
