"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { FormTextarea } from "@/components/ui/form-field";

type ClientOption = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  organization: string | null;
  address: string | null;
};
type LeadOption = {
  id: string;
  fullName: string;
  phone: string | null;
  organization: string | null;
  interest: string | null;
};
type JobOption = {
  id: string;
  jobNumber: string;
  brand: string;
  model: string;
  client: { fullName: string; phone: string | null; address: string | null } | null;
};
type PartOption = { id: string; sku: string; name: string; unitCost: number | null; qtyOnHand: number };
type TaxRateOption = { id: string; name: string; code: string; rate: number; isDefault: boolean };

type LineItem = {
  id: number;
  partId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
};

type CustomerSource = {
  key: string;
  kind: "client" | "lead" | "job";
  id: string;
  title: string;
  badge: string;
  meta: string;
  detail: string;
  searchable: string;
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
  taxRates: TaxRateOption[];
  defaultTaxApplicable: boolean;
  defaultTaxRate: number;
  defaultTaxLabel: string;
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
  taxRates,
  defaultTaxApplicable,
  defaultTaxRate,
  defaultTaxLabel,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const initialSourceKey = jobId ? `job:${jobId}` : clientId ? `client:${clientId}` : leadId ? `lead:${leadId}` : "";
  const [customerMode, setCustomerMode] = useState<"existing" | "new">("existing");
  const [sourceQuery, setSourceQuery] = useState("");
  const [selectedSourceKey, setSelectedSourceKey] = useState(initialSourceKey);
  const [newClient, setNewClient] = useState({
    fullName: "",
    phone: "",
    email: "",
    organization: "",
    address: "",
  });
  const [items, setItems] = useState<LineItem[]>([
    { id: nextId++, partId: "", description: "", quantity: 1, unitPrice: 0, discount: 0 },
  ]);
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const initialTaxKey = taxRates.find((rate) => rate.isDefault)?.id
    ? `rate:${taxRates.find((rate) => rate.isDefault)?.id}`
    : taxRates[0]?.id
      ? `rate:${taxRates[0].id}`
      : "branding";
  const [taxEnabled, setTaxEnabled] = useState(defaultTaxApplicable);
  const [selectedTaxKey, setSelectedTaxKey] = useState(initialTaxKey);

  const customerSources = useMemo<CustomerSource[]>(() => {
    const clientSources = clients.map((client) => {
      const meta = [client.phone, client.email, client.organization].filter(Boolean).join(" - ");
      const detail = client.address ?? "Client record";
      return {
        key: `client:${client.id}`,
        kind: "client" as const,
        id: client.id,
        title: client.fullName,
        badge: "Client",
        meta,
        detail,
        searchable: [client.fullName, client.phone, client.email, client.organization, client.address].filter(Boolean).join(" ").toLowerCase(),
      };
    });
    const leadSources = leads.map((lead) => {
      const meta = [lead.phone, lead.organization].filter(Boolean).join(" - ");
      const detail = lead.interest ?? "Lead opportunity";
      return {
        key: `lead:${lead.id}`,
        kind: "lead" as const,
        id: lead.id,
        title: lead.fullName,
        badge: "Lead",
        meta,
        detail,
        searchable: [lead.fullName, lead.phone, lead.organization, lead.interest].filter(Boolean).join(" ").toLowerCase(),
      };
    });
    const jobSources = jobs.map((job) => {
      const device = [job.brand, job.model].filter(Boolean).join(" ");
      const title = job.client?.fullName ?? job.jobNumber;
      const meta = [job.jobNumber, job.client?.phone, device].filter(Boolean).join(" - ");
      const detail = job.client?.address ?? "Repair job";
      return {
        key: `job:${job.id}`,
        kind: "job" as const,
        id: job.id,
        title,
        badge: "Job",
        meta,
        detail,
        searchable: [job.jobNumber, title, job.client?.phone, job.client?.address, device].filter(Boolean).join(" ").toLowerCase(),
      };
    });
    return [...clientSources, ...leadSources, ...jobSources];
  }, [clients, leads, jobs]);

  const filteredSources = useMemo(() => {
    const query = sourceQuery.trim().toLowerCase();
    const sourceList = query
      ? customerSources.filter((source) => source.searchable.includes(query))
      : customerSources;
    return sourceList.slice(0, 24);
  }, [customerSources, sourceQuery]);

  const selectedSource = customerSources.find((source) => source.key === selectedSourceKey) ?? null;
  const taxOptions = useMemo(() => {
    const rateOptions = taxRates.map((rate) => ({
      key: `rate:${rate.id}`,
      label: `${rate.code} - ${rate.rate}%`,
      taxLabel: rate.code,
      taxRate: rate.rate,
    }));
    if (rateOptions.length > 0) return rateOptions;
    return [{
      key: "branding",
      label: `${defaultTaxLabel || "VAT"} - ${Number(defaultTaxRate) || 0}%`,
      taxLabel: defaultTaxLabel || "VAT",
      taxRate: Number(defaultTaxRate) || 0,
    }];
  }, [taxRates, defaultTaxLabel, defaultTaxRate]);
  const selectedTax = taxOptions.find((option) => option.key === selectedTaxKey) ?? taxOptions[0];

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
  const taxRate = taxEnabled ? Math.max(0, Number(selectedTax?.taxRate ?? 0)) : 0;
  const taxAmount = subtotal * (taxRate / 100);
  const totalAmount = subtotal + taxAmount;

  function formatAmount(value: number) {
    const isZeroDecimal = new Set(["UGX", "JPY", "KRW"]).has(currency);
    return `${currency} ${value.toLocaleString("en-US", { minimumFractionDigits: isZeroDecimal ? 0 : 2, maximumFractionDigits: isZeroDecimal ? 0 : 2 })}`;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (customerMode === "existing" && !selectedSource) {
      setError("Choose a customer source for this quotation.");
      return;
    }
    if (customerMode === "new" && (!newClient.fullName.trim() || !newClient.phone.trim())) {
      setError("Enter the new client's name and phone number.");
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
            leadId: customerMode === "existing" && selectedSource?.kind === "lead" ? selectedSource.id : undefined,
            clientId: customerMode === "existing" && selectedSource?.kind === "client" ? selectedSource.id : undefined,
            jobId: customerMode === "existing" && selectedSource?.kind === "job" ? selectedSource.id : undefined,
            newClient: customerMode === "new" ? newClient : undefined,
            validUntil: validUntil || undefined,
            notes: notes || undefined,
            taxApplicable: taxEnabled,
            taxRate,
            taxLabel: taxEnabled ? selectedTax?.taxLabel : undefined,
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

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(280px,0.75fr)_minmax(0,1.55fr)]">
        <div className="min-w-0 space-y-4">
          <section className="panel-shadow min-w-0 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] pb-2">
              <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Customer</p>
              <Link href="/clients?create=1" className="text-xs font-semibold text-[var(--gold)] hover:underline">New client</Link>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-1">
              {(["existing", "new"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setCustomerMode(mode)}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold capitalize transition ${
                    customerMode === mode ? "bg-[var(--accent)] text-black" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {customerMode === "existing" ? (
              <div className="mt-3 space-y-2">
                <input
                  value={sourceQuery}
                  onChange={(event) => setSourceQuery(event.target.value)}
                  placeholder="Search clients, leads, jobs, phone, address"
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]/50"
                />
                <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                  {filteredSources.map((source) => (
                    <button
                      key={source.key}
                      type="button"
                      onClick={() => setSelectedSourceKey(source.key)}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                        selectedSourceKey === source.key
                          ? "border-[var(--accent)] bg-[var(--accent)]/10"
                          : "border-[var(--line)] bg-[var(--panel-strong)] hover:border-[var(--accent)]/35"
                      }`}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-bold text-[var(--ink)]">{source.title}</span>
                          <span className="block truncate text-[12px] text-[var(--ink-muted)]">{source.meta || source.detail}</span>
                        </span>
                        <span className="shrink-0 rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                          {source.badge}
                        </span>
                      </span>
                      {source.detail ? <span className="mt-1 block truncate text-[11px] text-[var(--ink-muted)]/75">{source.detail}</span> : null}
                    </button>
                  ))}
                  {filteredSources.length === 0 ? (
                    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-4 text-center text-xs text-[var(--ink-muted)]">
                      No customer source found
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-2">
                <input
                  value={newClient.fullName}
                  onChange={(event) => setNewClient((prev) => ({ ...prev, fullName: event.target.value }))}
                  placeholder="Client name *"
                  className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]/50"
                />
                <input
                  value={newClient.phone}
                  onChange={(event) => setNewClient((prev) => ({ ...prev, phone: event.target.value }))}
                  placeholder="Phone *"
                  className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]/50"
                />
                <input
                  value={newClient.email}
                  onChange={(event) => setNewClient((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="Email"
                  className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]/50"
                />
                <input
                  value={newClient.organization}
                  onChange={(event) => setNewClient((prev) => ({ ...prev, organization: event.target.value }))}
                  placeholder="Organization"
                  className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]/50"
                />
                <input
                  value={newClient.address}
                  onChange={(event) => setNewClient((prev) => ({ ...prev, address: event.target.value }))}
                  placeholder="Address / location"
                  className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]/50"
                />
              </div>
            )}

            <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-xs text-[var(--ink-muted)]">
              {customerMode === "existing" ? (
                <>
                  <p className="font-semibold text-[var(--ink)]">{selectedSource?.title ?? "Recipient not selected"}</p>
                  <p className="mt-0.5 truncate">{selectedSource?.meta || selectedSource?.detail || "Select a customer source."}</p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-[var(--ink)]">{newClient.fullName.trim() || "New client"}</p>
                  <p className="mt-0.5 truncate">{[newClient.phone, newClient.address].filter(Boolean).join(" - ") || "Client will be created with this quotation."}</p>
                </>
              )}
            </div>
          </section>

          <section className="panel-shadow min-w-0 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Totals</p>
              <Link href="/finance/tax-rates" className="text-xs font-semibold text-[var(--gold)] hover:underline">Tax rates</Link>
            </div>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">Lines ready</dt><dd className="font-bold text-[var(--ink)]">{validItems.length}/{items.length}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">Product lines</dt><dd className="font-bold text-[var(--ink)]">{productLines}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">Subtotal</dt><dd className="font-bold tabular-nums text-[var(--ink)]">{formatAmount(subtotal)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">{taxEnabled ? `${selectedTax?.taxLabel ?? "Tax"} (${taxRate}%)` : "Tax"}</dt><dd className="font-bold tabular-nums text-[var(--ink)]">{formatAmount(taxAmount)}</dd></div>
              <div className="flex justify-between gap-3 border-t border-[var(--line)] pt-2"><dt className="font-semibold text-[var(--ink)]">Total</dt><dd className="text-[15px] font-black tabular-nums text-[var(--ink)]">{formatAmount(totalAmount)}</dd></div>
            </dl>
            <div className="mt-3 space-y-2 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
              <label className="flex items-center justify-between gap-3 text-xs font-semibold text-[var(--ink)]">
                <span>Tax applicable</span>
                <input
                  type="checkbox"
                  checked={taxEnabled}
                  onChange={(event) => setTaxEnabled(event.target.checked)}
                  className="h-4 w-4 rounded border-[var(--line)]"
                />
              </label>
              {taxEnabled ? (
                <select
                  value={selectedTaxKey}
                  onChange={(event) => setSelectedTaxKey(event.target.value)}
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]/50"
                >
                  {taxOptions.map((option) => (
                    <option key={option.key} value={option.key}>{option.label}</option>
                  ))}
                </select>
              ) : null}
            </div>
          </section>

          <section className="panel-shadow min-w-0 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
            <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Details</p>
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

        <section className="panel-shadow min-w-0 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
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
                  <td colSpan={canOverrideDiscount ? 5 : 4} className="px-3 py-2 text-right text-xs font-semibold text-[var(--ink-muted)]">Subtotal</td>
                  <td className="px-3 py-2 text-right text-sm font-bold tabular-nums text-[var(--ink)]">{formatAmount(subtotal)}</td>
                  <td />
                </tr>
                {taxEnabled ? (
                  <tr className="bg-[var(--gold)]/5">
                    <td colSpan={canOverrideDiscount ? 5 : 4} className="px-3 py-2 text-right text-xs font-semibold text-[var(--ink-muted)]">{selectedTax?.taxLabel ?? "Tax"} ({taxRate}%)</td>
                    <td className="px-3 py-2 text-right text-sm font-bold tabular-nums text-[var(--ink)]">{formatAmount(taxAmount)}</td>
                    <td />
                  </tr>
                ) : null}
                <tr className="bg-[var(--panel-strong)]">
                  <td colSpan={canOverrideDiscount ? 5 : 4} className="px-3 py-3 text-right text-xs font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Total</td>
                  <td className="px-3 py-3 text-right text-base font-black tabular-nums text-[var(--ink)]">{formatAmount(totalAmount)}</td>
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
