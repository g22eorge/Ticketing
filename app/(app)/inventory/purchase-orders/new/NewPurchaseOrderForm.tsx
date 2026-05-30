"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createPurchaseOrderAction } from "../actions";

type Supplier = { id: string; name: string };
type Part = { id: string; name: string; sku: string; unitCost: number | null };

type LineItem = {
  key: number;
  description: string;
  qtyOrdered: number;
  unitCost: number;
  partId: string;
};

let keyCounter = 0;
function nextKey() { return ++keyCounter; }

export function NewPurchaseOrderForm({
  suppliers,
  parts,
  defaultSupplierId,
}: {
  suppliers: Supplier[];
  parts: Part[];
  defaultSupplierId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<LineItem[]>([
    { key: nextKey(), description: "", qtyOrdered: 1, unitCost: 0, partId: "" },
  ]);

  function addLine() {
    setLines((prev) => [...prev, { key: nextKey(), description: "", qtyOrdered: 1, unitCost: 0, partId: "" }]);
  }

  function removeLine(key: number) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function updateLine(key: number, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function onPartSelect(key: number, partId: string) {
    const part = parts.find((p) => p.id === partId);
    updateLine(key, {
      partId,
      description: part ? part.name : "",
      unitCost: part?.unitCost ?? 0,
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set(
      "items",
      JSON.stringify(
        lines.map(({ description, qtyOrdered, unitCost, partId }) => ({
          description,
          qtyOrdered,
          unitCost,
          partId: partId || undefined,
        })),
      ),
    );
    startTransition(async () => {
      const result = await createPurchaseOrderAction(fd);
      if (result.error) { setError(result.error); return; }
      router.push(`/inventory/purchase-orders/${result.id}`);
    });
  }

  const total = lines.reduce((sum, l) => sum + l.qtyOrdered * l.unitCost, 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Header */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-4">
        <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Order Details</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
              Supplier <span className="text-red-500">*</span>
            </label>
            <select
              name="supplierId"
              required
              defaultValue={defaultSupplierId ?? ""}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
            >
              <option value="">Select supplier…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">Reference / PO#</label>
            <input
              name="reference"
              type="text"
              placeholder="e.g. PO-2026-001"
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">Order Date</label>
            <input
              name="orderedAt"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">Expected Delivery</label>
            <input
              name="expectedAt"
              type="date"
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">Notes</label>
          <textarea
            name="notes"
            rows={2}
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40 resize-none"
          />
        </div>
      </div>

      {/* Line items */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--line)]">
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Items</p>
          <button
            type="button"
            onClick={addLine}
            className="rounded-md bg-[var(--gold)]/15 px-3 py-1 text-xs font-semibold text-[var(--gold)] hover:bg-[var(--gold)]/25"
          >
            + Add Line
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                <th className="px-3 py-2 text-left w-48">Part (optional)</th>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-right w-20">Qty</th>
                <th className="px-3 py-2 text-right w-28">Unit Cost</th>
                <th className="px-3 py-2 text-right w-28">Total</th>
                <th className="px-3 py-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {lines.map((line) => (
                <tr key={line.key}>
                  <td className="px-3 py-2">
                    <select
                      value={line.partId}
                      onChange={(e) => onPartSelect(line.key, e.target.value)}
                      className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
                    >
                      <option value="">— custom —</option>
                      {parts.map((p) => (
                        <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={line.description}
                      onChange={(e) => updateLine(line.key, { description: e.target.value })}
                      placeholder="Item description"
                      required
                      className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={1}
                      value={line.qtyOrdered}
                      onChange={(e) => updateLine(line.key, { qtyOrdered: parseInt(e.target.value, 10) || 1 })}
                      className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs text-right text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={line.unitCost}
                      onChange={(e) => updateLine(line.key, { unitCost: parseFloat(e.target.value) || 0 })}
                      className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs text-right text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
                    />
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-[var(--ink-muted)] tabular-nums">
                    {(line.qtyOrdered * line.unitCost).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(line.key)}
                        className="text-[var(--ink-muted)] hover:text-red-500 text-xs font-bold"
                        aria-label="Remove line"
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--line)] bg-[var(--gold)]/5">
                <td colSpan={4} className="px-3 py-2 text-right text-xs font-semibold text-[var(--ink-muted)]">Total</td>
                <td className="px-3 py-2 text-right text-sm font-bold text-[var(--ink)] tabular-nums">
                  {total.toLocaleString()}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="btn-premium rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create Purchase Order"}
        </button>
        <Link
          href="/inventory/purchase-orders"
          className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--ink-muted)] hover:bg-[var(--gold)]/5"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
