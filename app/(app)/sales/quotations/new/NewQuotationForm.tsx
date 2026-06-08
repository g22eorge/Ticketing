"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { FormTextarea } from "@/components/ui/form-field";

type ClientOption = { id: string; fullName: string; phone: string | null; email: string | null };
type LeadOption = { id: string; fullName: string; phone: string | null; interest: string | null };
type JobOption = { id: string; jobNumber: string; brand: string; model: string; client: { fullName: string } | null };
type PartOption = { id: string; sku: string; name: string; unitCost: number | null; qtyOnHand: number };

type LineItem = {
  id: number;
  partId: string;
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
  clients: ClientOption[];
  leads: LeadOption[];
  jobs: JobOption[];
  parts: PartOption[];
};

let nextId = 1;

export function NewQuotationForm({
  leadId,
  clientId,
  jobId,
  currency,
  canOverrideDiscount,
  clients,
  leads,
  jobs,
  parts,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState(clientId ?? "");
  const [selectedLeadId, setSelectedLeadId] = useState(leadId ?? "");
  const [selectedJobId, setSelectedJobId] = useState(jobId ?? "");
  const [items, setItems] = useState<LineItem[]>([
    { id: nextId++, partId: "", description: "", quantity: 1, unitPrice: 0, discount: 0 },
  ]);
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");

  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? null;
  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) ?? null;
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;

  function updateItem(id: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function selectPart(id: number, partId: string) {
    const part = parts.find((item) => item.id === partId);
    updateItem(id, {
      partId,
      description: part ? `${part.sku} - ${part.name}` : "",
      unitPrice: part?.unitCost ?? 0,
    });
  }

  function addItem() {
    setItems((prev) => [...prev, { id: nextId++, partId: "", description: "", quantity: 1, unitPrice: 0, discount: 0 }]);
  }

  function removeItem(id: number) {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  function calcLineTotal(item: LineItem) {
    return item.quantity * item.unitPrice * (1 - item.discount / 100);
  }

  const validItems = useMemo(
    () => items.filter((item) => item.description.trim() && item.quantity > 0 && item.unitPrice >= 0),
    [items],
  );
  const subtotal = items.reduce((sum, item) => sum + calcLineTotal(item), 0);
  const productLines = items.filter((item) => item.partId).length;

  function formatAmount(value: number) {
    const isZeroDecimal = new Set(["UGX", "JPY", "KRW"]).has(currency);
    return `${currency} ${value.toLocaleString("en-US", { minimumFractionDigits: isZeroDecimal ? 0 : 2, maximumFractionDigits: isZeroDecimal ? 0 : 2 })}`;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClientId && !selectedLeadId && !selectedJobId) {
      setError("Choose a client, lead, or repair job for this quotation.");
      return;
    }
    if (validItems.length === 0) {
      setError("Add at least one product or service line.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/quotations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            leadId: selectedLeadId || undefined,
            clientId: selectedClientId || undefined,
            jobId: selectedJobId || undefined,
            validUntil: validUntil || undefined,
            notes: notes || undefined,
            items: validItems.map((item) => ({
              partId: item.partId || null,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount,
            })),
          }),
        });
        const result = await response.json().catch(() => null) as { id?: string; href?: string; error?: string } | null;
        if (!response.ok) {
          throw new Error(result?.error ?? "Failed to create quotation");
        }
        const href = result?.href ?? (result?.id ? `/sales/quotations/${result.id}` : "/documents/quotations");
        router.push(href);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create quotation");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error ? (
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.4fr)]">
        <div className="space-y-4">
          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] pb-3">
              <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Customer & Source</p>
              <Link href="/clients" className="text-xs font-semibold text-[var(--gold)] hover:underline">Clients</Link>
            </div>
            <div className="mt-3 grid gap-3">
              <label className="text-xs font-semibold text-[var(--ink-muted)]">
                Client
                <select
                  value={selectedClientId}
                  onChange={(event) => setSelectedClientId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]/50"
                >
                  <option value="">No client selected</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.fullName}{client.phone ? ` - ${client.phone}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-semibold text-[var(--ink-muted)]">
                Lead / Opportunity
                <select
                  value={selectedLeadId}
                  onChange={(event) => setSelectedLeadId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]/50"
                >
                  <option value="">No lead selected</option>
                  {leads.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.fullName}{lead.interest ? ` - ${lead.interest}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-semibold text-[var(--ink-muted)]">
                Repair Job (optional)
                <select
                  value={selectedJobId}
                  onChange={(event) => setSelectedJobId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]/50"
                >
                  <option value="">No repair job</option>
                  {jobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.jobNumber} - {job.client?.fullName ?? "No client"} - {job.brand} {job.model}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-xs text-[var(--ink-muted)]">
              <p className="font-semibold text-[var(--ink)]">{selectedClient?.fullName ?? selectedLead?.fullName ?? selectedJob?.jobNumber ?? "Recipient not selected"}</p>
              <p className="mt-0.5">{selectedClient?.phone ?? selectedLead?.phone ?? selectedJob?.client?.fullName ?? "Select a client for product quotations, or link a lead/job when relevant."}</p>
            </div>
          </section>

          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Quote Snapshot</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">Lines ready</dt><dd className="font-bold text-[var(--ink)]">{validItems.length}/{items.length}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">Product lines</dt><dd className="font-bold text-[var(--ink)]">{productLines}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">Subtotal</dt><dd className="font-bold tabular-nums text-[var(--ink)]">{formatAmount(subtotal)}</dd></div>
            </dl>
          </section>

          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
            <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Quotation Details</p>
            <div className="grid grid-cols-1 gap-3">
              <label className="text-xs font-semibold text-[var(--ink-muted)]">
                Valid Until
                <input
                  name="validUntil"
                  type="date"
                  value={validUntil}
                  onChange={(event) => setValidUntil(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]/50"
                />
              </label>
              <FormTextarea
                label="Notes"
                name="notes"
                size="md"
                rows={4}
                placeholder="Terms, delivery notes, warranty, product availability..."
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </section>
        </div>

        <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
            <div>
              <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Products & Services</p>
              <p className="text-[13px] text-[var(--ink-muted)]">Select inventory products or add custom service lines.</p>
            </div>
            <button type="button" onClick={addItem} className="rounded-md bg-[var(--gold)]/15 px-3 py-1.5 text-xs font-semibold text-[var(--gold)] hover:bg-[var(--gold)]/25">Add Line</button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-[13px]">
              <thead className="bg-[var(--panel-strong)]/50 text-left text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">
                <tr className="border-b border-[var(--line)]">
                  <th className="w-64 px-3 py-2">Product</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="w-20 px-3 py-2 text-right">Qty</th>
                  <th className="w-28 px-3 py-2 text-right">Unit Price</th>
                  {canOverrideDiscount ? <th className="w-20 px-3 py-2 text-right">Disc %</th> : null}
                  <th className="w-28 px-3 py-2 text-right">Total</th>
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {items.map((item) => (
                  <tr key={item.id} className="align-top hover:bg-[var(--gold)]/5">
                    <td className="px-3 py-2">
                      <select
                        value={item.partId}
                        onChange={(event) => selectPart(item.id, event.target.value)}
                        className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50"
                      >
                        <option value="">Custom line</option>
                        {parts.map((part) => (
                          <option key={part.id} value={part.id}>
                            {part.sku} - {part.name} ({part.qtyOnHand} in stock)
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(event) => updateItem(item.id, { description: event.target.value })}
                        placeholder="Product, service, or package description"
                        className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-1 focus:ring-[var(--accent)]/15"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(event) => updateItem(item.id, { quantity: Number(event.target.value) })}
                        className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-right text-sm outline-none focus:border-[var(--accent)]/50"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={item.unitPrice}
                        onChange={(event) => updateItem(item.id, { unitPrice: Number(event.target.value) })}
                        className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-right text-sm outline-none focus:border-[var(--accent)]/50"
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
                          onChange={(event) => updateItem(item.id, { discount: Number(event.target.value) })}
                          className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-right text-sm outline-none focus:border-[var(--accent)]/50"
                        />
                      </td>
                    ) : null}
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--ink)]">
                      {formatAmount(calcLineTotal(item))}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        disabled={items.length <= 1}
                        className="rounded-md px-2 py-1 text-[var(--ink-muted)] transition hover:bg-red-500/10 hover:text-red-500 disabled:opacity-30"
                        aria-label="Remove item"
                      >
                        x
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[var(--line)] bg-[var(--gold)]/5">
                  <td colSpan={canOverrideDiscount ? 5 : 4} className="px-3 py-3 text-right text-xs font-semibold text-[var(--ink-muted)]">Subtotal</td>
                  <td className="px-3 py-3 text-right text-sm font-bold tabular-nums text-[var(--ink)]">{formatAmount(subtotal)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={isPending} className="btn-premium rounded-lg px-6 py-2.5 text-[13px] font-bold disabled:opacity-60">
          {isPending ? "Creating..." : "Create Quotation"}
        </button>
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-[var(--line)] px-5 py-2.5 text-[13px] font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]">
          Cancel
        </button>
      </div>
    </form>
  );
}
