"use client";

import { useState, useTransition } from "react";
import { receiveStockAction } from "../actions";

type Item = { id: string; description: string; qtyOrdered: number; qtyReceived: number };
type Location = { id: string; name: string; code: string | null };

export function ReceiveStockForm({ poId, items, locations }: { poId: string; items: Item[]; locations: Location[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(items.map((i) => [i.id, i.qtyReceived])),
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("poId", poId);
    fd.set("locationId", locationId);
    for (const [id, qty] of Object.entries(quantities)) {
      fd.set(`qtyReceived_${id}`, String(qty));
    }
    startTransition(async () => {
      const result = await receiveStockAction(fd);
      if (result.error) { setError(result.error); return; }
      setSaved(true);
    });
  }

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
      <div className="px-5 py-3 border-b border-[var(--line)]">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Receive Stock</p>
        <p className="mt-0.5 text-xs text-[var(--ink-muted)]">Update quantities received. Part inventory will be adjusted automatically.</p>
      </div>
      <form onSubmit={handleSubmit} className="p-5 space-y-3">
        <label className="block text-xs font-semibold text-[var(--ink)]">
          Receive into location
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}{location.code ? ` (${location.code})` : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[400px] text-sm">
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              <th className="text-left pb-2">Item</th>
              <th className="text-right pb-2 w-24">Ordered</th>
              <th className="text-right pb-2 w-28">Qty Received</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="py-2 text-[var(--ink)]">{item.description}</td>
                <td className="py-2 text-right tabular-nums text-[var(--ink-muted)]">{item.qtyOrdered}</td>
                <td className="py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    max={item.qtyOrdered}
                    value={quantities[item.id] ?? item.qtyReceived}
                    onChange={(e) =>
                      setQuantities((prev) => ({
                        ...prev,
                        [item.id]: Math.min(item.qtyOrdered, parseInt(e.target.value, 10) || 0),
                      }))
                    }
                    className="w-24 rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1 text-xs text-right text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
        {saved && <p className="text-xs text-green-600">Stock received and inventory updated.</p>}

        <button
          type="submit"
          disabled={pending || !locationId}
          className="btn-premium rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save Received Quantities"}
        </button>
      </form>
    </div>
  );
}
