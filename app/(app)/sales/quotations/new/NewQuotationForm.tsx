"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createQuotation } from "../../actions";

type LineItem = {
  id: number;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
};

type Props = {
  leadId?: string;
  clientId?: string;
  jobId?: string;
  currency: string;
  canOverrideDiscount: boolean;
};

let nextId = 1;

export function NewQuotationForm({ leadId, clientId, jobId, currency, canOverrideDiscount }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<LineItem[]>([
    { id: nextId++, description: "", quantity: 1, unitPrice: 0, discount: 0 },
  ]);
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");

  function updateItem(id: number, field: keyof LineItem, value: string | number) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  }

  function addItem() {
    setItems((prev) => [...prev, { id: nextId++, description: "", quantity: 1, unitPrice: 0, discount: 0 }]);
  }

  function removeItem(id: number) {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  function calcLineTotal(item: LineItem) {
    return item.quantity * item.unitPrice * (1 - item.discount / 100);
  }

  const subtotal = items.reduce((sum, item) => sum + calcLineTotal(item), 0);

  function formatAmount(value: number) {
    const isZeroDecimal = new Set(["UGX", "JPY", "KRW"]).has(currency);
    return `${currency} ${value.toLocaleString("en-US", { minimumFractionDigits: isZeroDecimal ? 0 : 2, maximumFractionDigits: isZeroDecimal ? 0 : 2 })}`;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validItems = items.filter((item) => item.description.trim() && item.quantity > 0 && item.unitPrice >= 0);
    if (validItems.length === 0) {
      setError("Add at least one item with a description.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await createQuotation({
          leadId,
          clientId,
          jobId,
          validUntil: validUntil || undefined,
          notes: notes || undefined,
          items: validItems.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
          })),
        });
      } catch (err) {
        if (err instanceof Error && err.message === "NEXT_REDIRECT") {
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to create quotation");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>
      ) : null}

      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="border-b border-[var(--line)] px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Line Items</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse text-[13px]">
            <thead className="bg-[var(--panel-strong)]/50 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">
              <tr className="border-b border-[var(--line)]">
                <th className="px-3 py-2">Description</th>
                <th className="w-20 px-3 py-2">Qty</th>
                <th className="w-28 px-3 py-2">Unit Price</th>
                {canOverrideDiscount ? <th className="w-20 px-3 py-2">Disc %</th> : null}
                <th className="w-28 px-3 py-2 text-right">Total</th>
                <th className="w-10 px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateItem(item.id, "description", e.target.value)}
                      placeholder="Item description"
                      className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-1 focus:ring-[var(--accent)]/15"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => updateItem(item.id, "quantity", Number(e.target.value))}
                      className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(item.id, "unitPrice", Number(e.target.value))}
                      className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50"
                    />
                  </td>
                  {canOverrideDiscount ? (
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="any"
                        value={item.discount}
                        onChange={(e) => updateItem(item.id, "discount", Number(e.target.value))}
                        className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50"
                      />
                    </td>
                  ) : null}
                  <td className="px-3 py-2 text-right font-medium text-[var(--ink)]">
                    {formatAmount(calcLineTotal(item))}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      disabled={items.length <= 1}
                      className="text-[var(--ink-muted)] transition hover:text-red-500 disabled:opacity-30"
                      aria-label="Remove item"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-[var(--line)] px-4 py-3">
          <button
            type="button"
            onClick={addItem}
            className="text-[12px] font-semibold text-[var(--accent)] hover:underline"
          >
            + Add Item
          </button>
          <div className="text-right">
            <span className="text-[11px] text-[var(--ink-muted)]">Subtotal: </span>
            <span className="text-[14px] font-bold text-[var(--ink)]">{formatAmount(subtotal)}</span>
          </div>
        </div>
      </div>

      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Quotation Details</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-muted)]">Valid Until</label>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/15"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-muted)]">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Terms, conditions, or other notes…"
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/15"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)] px-6 py-2.5 text-[13px] font-bold text-white shadow-sm transition hover:bg-[var(--accent)]/90 disabled:opacity-60"
        >
          {isPending ? "Creating…" : "Create Quotation"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-[12px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] hover:underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
