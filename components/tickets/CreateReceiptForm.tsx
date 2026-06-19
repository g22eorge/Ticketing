"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface CreateReceiptFormProps {
  ticketId: string;
  ticketNumber: string;
  subject: string;
  clientId: string | null;
  clientName: string | null;
  invoiceTotal: number | null;
  invoiceNumber: string | null;
  currency: string;
}

const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "MOBILE_MONEY", label: "Mobile Money" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CARD", label: "Card" },
  { value: "OTHER", label: "Other" },
];

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)]/60 focus:ring-1 focus:ring-[var(--accent)]/15";

function formatAmount(value: number | null, currency: string) {
  if (value === null) return "-";
  return `${value.toLocaleString()} ${currency}`;
}

export function CreateReceiptForm({
  ticketId,
  ticketNumber,
  subject,
  clientId,
  clientName,
  invoiceTotal,
  invoiceNumber,
  currency,
}: CreateReceiptFormProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [amount, setAmount] = useState(invoiceTotal ?? 0);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!clientId) {
      setMessage({ type: "error", text: "Ticket must be linked to a client first." });
      return;
    }

    const form = e.currentTarget;
    const data = {
      clientId,
      amount: String(amount),
      method: (form.elements.namedItem("method") as HTMLSelectElement).value,
      reference: (form.elements.namedItem("reference") as HTMLInputElement).value || null,
      currency,
    };

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/receipt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setMessage({ type: "success", text: "Receipt created successfully." });
        setTimeout(() => router.push(`/tickets/${ticketId}`), 900);
      } else {
        setMessage({ type: "error", text: json.error ?? "Failed to create receipt." });
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
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Payment Source</p>
          <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3">
            <p className="font-mono text-sm font-bold text-[var(--gold)]">{ticketNumber}</p>
            <p className="mt-1 text-sm font-semibold text-[var(--ink)]">{subject}</p>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">{clientName ? `Client: ${clientName}` : "No client linked"}</p>
          </div>
          {invoiceNumber ? (
            <div className="mt-3 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Invoice</p>
              <p className="mt-1 font-mono text-sm font-bold text-[var(--ink)]">{invoiceNumber}</p>
              <p className="text-sm font-semibold text-[var(--ink)]">{formatAmount(invoiceTotal, currency)}</p>
            </div>
          ) : null}
        </section>

        <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Payment Details</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-[var(--ink-muted)]">
              Amount
              <input type="number" name="amount" step="0.01" min="0.01" value={amount || ""} onChange={(event) => setAmount(Number(event.target.value))} required className={`${inputClass} mt-1.5 text-right`} />
            </label>
            <label className="text-xs font-semibold text-[var(--ink-muted)]">
              Payment method
              <select name="method" defaultValue="CASH" className={`${inputClass} mt-1.5`}>
                {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-[var(--ink-muted)] sm:col-span-2">
              Reference
              <input type="text" name="reference" placeholder="Transaction ID or payment reference" className={`${inputClass} mt-1.5`} />
            </label>
          </div>
        </section>
      </div>

      <aside className="lg:sticky lg:top-4 lg:self-start">
        <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Receipt Summary</p>
          <div className="mt-4 flex justify-between gap-3 text-sm">
            <span className="text-[var(--ink-muted)]">Amount received</span>
            <span className="font-bold tabular-nums text-[var(--ink)]">{formatAmount(amount || 0, currency)}</span>
          </div>
          <button type="submit" disabled={busy || !clientId} className="btn-premium mt-5 w-full rounded-lg px-5 py-3 text-sm font-bold disabled:opacity-60">
            {busy ? "Recording..." : "Record Payment"}
          </button>
          <button type="button" onClick={() => router.back()} className="mt-2 w-full rounded-lg border border-[var(--line)] px-5 py-2.5 text-sm font-semibold text-[var(--ink-muted)] transition hover:text-[var(--ink)]">
            Cancel
          </button>
        </section>
      </aside>
    </form>
  );
}
