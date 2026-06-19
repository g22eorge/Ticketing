"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface CreateQuotationFormProps {
  ticketId: string;
  ticketNumber: string;
  subject: string;
  clientId: string | null;
  clientName: string | null;
  estimatedCost: number | null;
  currency: string;
}

type QuoteItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
};

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)]/60 focus:ring-1 focus:ring-[var(--accent)]/15";

function formatAmount(value: number, currency: string) {
  return `${value.toLocaleString()} ${currency}`;
}

export function CreateQuotationForm({
  ticketId,
  ticketNumber,
  subject,
  clientId,
  clientName,
  estimatedCost,
  currency,
}: CreateQuotationFormProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [items, setItems] = useState<QuoteItem[]>([
    { description: subject, quantity: 1, unitPrice: estimatedCost ?? 0, discount: 0 },
  ]);

  function addItem() {
    setItems([...items, { description: "", quantity: 1, unitPrice: 0, discount: 0 }]);
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof QuoteItem, value: number | string) {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  }

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice - item.discount, 0);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!clientId) {
      setMessage({ type: "error", text: "Ticket must be linked to a client first." });
      return;
    }

    const form = e.currentTarget;
    const data = {
      clientId,
      items,
      currency,
      vatRate: 0,
      notes: (form.elements.namedItem("notes") as HTMLTextAreaElement).value,
      validUntil: (form.elements.namedItem("validUntil") as HTMLInputElement).value || null,
      discountAmount: 0,
    };

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/quotation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setMessage({ type: "success", text: "Quotation created successfully." });
        setTimeout(() => router.push(`/tickets/${ticketId}`), 900);
      } else {
        setMessage({ type: "error", text: json.error ?? "Failed to create quotation." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4">
        {message ? (
          <div
            className={
              "rounded-xl border px-4 py-3 text-sm font-medium " +
              (message.type === "success"
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-700"
                : "border-red-400/30 bg-red-500/10 text-red-700")
            }
          >
            {message.text}
          </div>
        ) : null}

        <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Source Ticket</p>
          <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3">
            <p className="font-mono text-sm font-bold text-[var(--gold)]">{ticketNumber}</p>
            <p className="mt-1 text-sm font-semibold text-[var(--ink)]">{subject}</p>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">{clientName ? `Client: ${clientName}` : "No client linked"}</p>
          </div>
        </section>

        <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Line Items</p>
            <button type="button" onClick={addItem} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/50">
              Add line
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {items.map((item, i) => (
              <div key={i} className="rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] p-3">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_80px_130px_110px_34px]">
                  <label className="text-xs font-semibold text-[var(--ink-muted)]">
                    Description
                    <input value={item.description} onChange={(e) => updateItem(i, "description", e.target.value)} className={`${inputClass} mt-1.5 bg-[var(--panel)]`} required />
                  </label>
                  <label className="text-xs font-semibold text-[var(--ink-muted)]">
                    Qty
                    <input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(i, "quantity", parseInt(e.target.value) || 1)} className={`${inputClass} mt-1.5 bg-[var(--panel)] text-right`} />
                  </label>
                  <label className="text-xs font-semibold text-[var(--ink-muted)]">
                    Unit price
                    <input type="number" step="0.01" min="0" value={item.unitPrice} onChange={(e) => updateItem(i, "unitPrice", parseFloat(e.target.value) || 0)} className={`${inputClass} mt-1.5 bg-[var(--panel)] text-right`} />
                  </label>
                  <label className="text-xs font-semibold text-[var(--ink-muted)]">
                    Discount
                    <input type="number" step="0.01" min="0" value={item.discount} onChange={(e) => updateItem(i, "discount", parseFloat(e.target.value) || 0)} className={`${inputClass} mt-1.5 bg-[var(--panel)] text-right`} />
                  </label>
                  <button type="button" onClick={() => removeItem(i)} disabled={items.length <= 1} className="mt-5 h-9 rounded-lg text-[var(--ink-muted)] transition hover:bg-red-500/10 hover:text-red-600 disabled:opacity-30" aria-label="Remove item">
                    x
                  </button>
                </div>
                <p className="mt-2 text-right text-sm font-bold tabular-nums text-[var(--ink)]">
                  {formatAmount(item.quantity * item.unitPrice - item.discount, currency)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Terms</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
            <label className="text-xs font-semibold text-[var(--ink-muted)]">
              Valid until
              <input type="date" name="validUntil" className={`${inputClass} mt-1.5`} />
            </label>
            <label className="text-xs font-semibold text-[var(--ink-muted)]">
              Notes
              <textarea name="notes" rows={3} placeholder="Terms, conditions, or notes" className={`${inputClass} mt-1.5 resize-none`} />
            </label>
          </div>
        </section>
      </div>

      <aside className="lg:sticky lg:top-4 lg:self-start">
        <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Summary</p>
          <div className="mt-4 flex justify-between gap-3 text-sm">
            <span className="text-[var(--ink-muted)]">Subtotal</span>
            <span className="font-bold tabular-nums text-[var(--ink)]">{formatAmount(subtotal, currency)}</span>
          </div>
          <button type="submit" disabled={busy || !clientId} className="btn-premium mt-5 w-full rounded-lg px-5 py-3 text-sm font-bold disabled:opacity-60">
            {busy ? "Creating..." : "Create Quotation"}
          </button>
          <button type="button" onClick={() => router.back()} className="mt-2 w-full rounded-lg border border-[var(--line)] px-5 py-2.5 text-sm font-semibold text-[var(--ink-muted)] transition hover:text-[var(--ink)]">
            Cancel
          </button>
        </section>
      </aside>
    </form>
  );
}
