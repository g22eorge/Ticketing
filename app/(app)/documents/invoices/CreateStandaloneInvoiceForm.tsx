"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";

type ClientOption = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  organization: string | null;
  address: string | null;
};

type PartOption = {
  id: string;
  sku: string;
  name: string;
  unitCost: number | null;
  qtyOnHand: number;
};

type TaxRateOption = {
  id: string;
  name: string;
  code: string;
  rate: number;
  isDefault: boolean;
};

type LineItem = {
  id: number;
  partId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
};

type Props = {
  action: (formData: FormData) => Promise<void>;
  createMode: boolean;
  clients: ClientOption[];
  parts: PartOption[];
  taxRates: TaxRateOption[];
  currency: string;
  canOverrideDiscount: boolean;
  defaultTaxApplicable: boolean;
  defaultTaxRate: number;
  defaultTaxLabel: string;
};

let nextId = 1;

function newLine(): LineItem {
  return { id: nextId++, partId: "", description: "", quantity: 1, unitPrice: 0, discount: 0 };
}

export function CreateStandaloneInvoiceForm({
  action,
  createMode,
  clients,
  parts,
  taxRates,
  currency,
  canOverrideDiscount,
  defaultTaxApplicable,
  defaultTaxRate,
  defaultTaxLabel,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [customerMode, setCustomerMode] = useState<"existing" | "new">(clients.length ? "existing" : "new");
  const [clientQuery, setClientQuery] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [newClient, setNewClient] = useState({ fullName: "", phone: "", email: "", organization: "", address: "" });
  const [items, setItems] = useState<LineItem[]>(() => [newLine()]);
  const [taxEnabled, setTaxEnabled] = useState(defaultTaxApplicable);
  const initialTaxKey = taxRates.find((rate) => rate.isDefault)?.id
    ? `rate:${taxRates.find((rate) => rate.isDefault)?.id}`
    : taxRates[0]?.id
      ? `rate:${taxRates[0].id}`
      : "branding";
  const [selectedTaxKey, setSelectedTaxKey] = useState(initialTaxKey);

  const filteredClients = useMemo(() => {
    const query = clientQuery.trim().toLowerCase();
    const rows = query
      ? clients.filter((client) =>
          [client.fullName, client.phone, client.email, client.organization, client.address]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query),
        )
      : clients;
    return rows.slice(0, 18);
  }, [clients, clientQuery]);

  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? null;
  const taxOptions = useMemo(() => {
    const rates = taxRates.map((rate) => ({
      key: `rate:${rate.id}`,
      label: `${rate.code} - ${rate.rate}%`,
      taxLabel: rate.code,
      taxRate: rate.rate,
    }));
    if (rates.length) return rates;
    return [{
      key: "branding",
      label: `${defaultTaxLabel || "VAT"} - ${Number(defaultTaxRate) || 0}%`,
      taxLabel: defaultTaxLabel || "VAT",
      taxRate: Number(defaultTaxRate) || 0,
    }];
  }, [defaultTaxLabel, defaultTaxRate, taxRates]);
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

  function lineTotal(item: LineItem) {
    return item.quantity * item.unitPrice * (1 - Math.max(0, item.discount) / 100);
  }

  const validItems = items.filter((item) => item.description.trim() && item.quantity > 0 && item.unitPrice >= 0);
  const subtotal = items.reduce((sum, item) => sum + lineTotal(item), 0);
  const productLines = items.filter((item) => item.partId).length;
  const taxRate = taxEnabled ? Math.max(0, Number(selectedTax?.taxRate ?? 0)) : 0;
  const taxAmount = subtotal * (taxRate / 100);
  const totalAmount = subtotal + taxAmount;

  function formatAmount(value: number) {
    const zeroDecimal = new Set(["UGX", "JPY", "KRW"]).has(currency);
    return `${currency} ${value.toLocaleString("en-US", {
      minimumFractionDigits: zeroDecimal ? 0 : 2,
      maximumFractionDigits: zeroDecimal ? 0 : 2,
    })}`;
  }

  function validateSubmit(event: FormEvent<HTMLFormElement>) {
    if (customerMode === "existing" && !selectedClient) {
      event.preventDefault();
      setError("Select a client or switch to new client.");
      return;
    }
    if (customerMode === "new" && (!newClient.fullName.trim() || !newClient.phone.trim())) {
      event.preventDefault();
      setError("Enter the new client's name and phone number.");
      return;
    }
    if (!validItems.length) {
      event.preventDefault();
      setError("Add at least one product or service line.");
      return;
    }
    setError(null);
  }

  return (
    <details
      id="create-invoice"
      open={createMode}
      className={`group rounded-xl border border-[var(--line)] bg-[var(--panel)] ${createMode ? "" : "hidden lg:block"}`}
    >
      <summary className="cursor-pointer select-none px-4 py-2.5 text-[12px] font-semibold text-[var(--ink)] group-open:border-b group-open:border-[var(--line)]">
        + Create Invoice
      </summary>
      <form action={action} onSubmit={validateSubmit} className="space-y-3 p-3">
        {error ? <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</div> : null}

        <input type="hidden" name="clientId" value={customerMode === "existing" ? selectedClient?.id ?? "" : ""} />
        <input type="hidden" name="newClientFullName" value={customerMode === "new" ? newClient.fullName : ""} />
        <input type="hidden" name="newClientPhone" value={customerMode === "new" ? newClient.phone : ""} />
        <input type="hidden" name="newClientEmail" value={customerMode === "new" ? newClient.email : ""} />
        <input type="hidden" name="newClientOrganization" value={customerMode === "new" ? newClient.organization : ""} />
        <input type="hidden" name="newClientAddress" value={customerMode === "new" ? newClient.address : ""} />
        <input type="hidden" name="items" value={JSON.stringify(validItems.map((item) => ({
          partId: item.partId || null,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: canOverrideDiscount ? item.discount : 0,
        })))} />
        <input type="hidden" name="taxApplicable" value={taxEnabled ? "1" : "0"} />
        <input type="hidden" name="taxRate" value={taxRate} />
        <input type="hidden" name="taxLabel" value={taxEnabled ? selectedTax?.taxLabel ?? "Tax" : ""} />
        <input type="hidden" name="currency" value={currency} />

        <div className="grid gap-3 xl:grid-cols-[minmax(260px,0.78fr)_minmax(0,1.45fr)]">
          <div className="space-y-3">
            <section className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Customer</p>
                <Link href="/clients?create=1" className="text-xs font-semibold text-[var(--gold)] hover:underline">Client page</Link>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-1">
                {(["existing", "new"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setCustomerMode(mode)}
                    className={`rounded-md px-3 py-1.5 text-xs font-bold capitalize transition ${customerMode === mode ? "bg-[var(--accent)] text-black" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              {customerMode === "existing" ? (
                <div className="mt-2 space-y-2">
                  <input
                    value={clientQuery}
                    onChange={(event) => setClientQuery(event.target.value)}
                    placeholder="Search client, phone, address"
                    className="h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm outline-none focus:border-[var(--accent)]/50"
                  />
                  <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                    {filteredClients.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => setSelectedClientId(client.id)}
                        className={`w-full rounded-lg border px-3 py-2 text-left transition ${selectedClientId === client.id ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--line)] bg-[var(--panel)] hover:border-[var(--accent)]/40"}`}
                      >
                        <span className="block truncate text-[13px] font-bold text-[var(--ink)]">{client.fullName}</span>
                        <span className="block truncate text-[12px] text-[var(--ink-muted)]">{[client.phone, client.email, client.organization].filter(Boolean).join(" - ") || "Client record"}</span>
                        {client.address ? <span className="mt-0.5 block truncate text-[11px] text-[var(--ink-muted)]/75">{client.address}</span> : null}
                      </button>
                    ))}
                    {!filteredClients.length ? (
                      <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-4 text-center text-xs text-[var(--ink-muted)]">No client found</div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="mt-2 grid gap-2">
                  <input value={newClient.fullName} onChange={(event) => setNewClient((prev) => ({ ...prev, fullName: event.target.value }))} placeholder="Client name *" className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm outline-none focus:border-[var(--accent)]/50" />
                  <input value={newClient.phone} onChange={(event) => setNewClient((prev) => ({ ...prev, phone: event.target.value }))} placeholder="Phone *" className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm outline-none focus:border-[var(--accent)]/50" />
                  <input value={newClient.email} onChange={(event) => setNewClient((prev) => ({ ...prev, email: event.target.value }))} placeholder="Email" className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm outline-none focus:border-[var(--accent)]/50" />
                  <input value={newClient.organization} onChange={(event) => setNewClient((prev) => ({ ...prev, organization: event.target.value }))} placeholder="Organization" className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm outline-none focus:border-[var(--accent)]/50" />
                  <input value={newClient.address} onChange={(event) => setNewClient((prev) => ({ ...prev, address: event.target.value }))} placeholder="Address / location" className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm outline-none focus:border-[var(--accent)]/50" />
                </div>
              )}
            </section>

            <section className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
              <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Details</p>
              <div className="mt-2 grid gap-2">
                <select name="invoiceType" defaultValue="SERVICE" className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm">
                  {["SERVICE", "MERCHANDISE", "CONTRACT", "OTHER"].map((type) => (
                    <option key={type} value={type}>{type.charAt(0) + type.slice(1).toLowerCase()}</option>
                  ))}
                </select>
                <input name="subject" placeholder="Subject / description" className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm outline-none focus:border-[var(--accent)]/50" />
                <input name="dueDate" type="date" className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm outline-none focus:border-[var(--accent)]/50" />
                <input name="notes" placeholder="Notes or payment terms" className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm outline-none focus:border-[var(--accent)]/50" />
              </div>
            </section>

            <section className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Totals</p>
                <label className="flex items-center gap-2 text-xs font-semibold text-[var(--ink)]">
                  Tax
                  <input type="checkbox" checked={taxEnabled} onChange={(event) => setTaxEnabled(event.target.checked)} className="h-4 w-4 rounded border-[var(--line)]" />
                </label>
              </div>
              {taxEnabled ? (
                <select value={selectedTaxKey} onChange={(event) => setSelectedTaxKey(event.target.value)} className="mt-2 h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm">
                  {taxOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
              ) : null}
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">Lines</dt><dd className="font-bold text-[var(--ink)]">{validItems.length}/{items.length}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">Products</dt><dd className="font-bold text-[var(--ink)]">{productLines}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">Subtotal</dt><dd className="font-bold tabular-nums text-[var(--ink)]">{formatAmount(subtotal)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">{taxEnabled ? `${selectedTax?.taxLabel ?? "Tax"} (${taxRate}%)` : "Tax"}</dt><dd className="font-bold tabular-nums text-[var(--ink)]">{formatAmount(taxAmount)}</dd></div>
                <div className="flex justify-between gap-3 border-t border-[var(--line)] pt-2"><dt className="font-semibold text-[var(--ink)]">Total</dt><dd className="font-black tabular-nums text-[var(--ink)]">{formatAmount(totalAmount)}</dd></div>
              </dl>
            </section>
          </div>

          <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel-strong)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-2">
              <div>
                <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Products & Services</p>
                <p className="text-[12px] text-[var(--ink-muted)]">Use inventory items or custom lines.</p>
              </div>
              <button type="button" onClick={() => setItems((prev) => [...prev, newLine()])} className="rounded-md bg-[var(--gold)]/15 px-3 py-1.5 text-xs font-semibold text-[var(--gold)] hover:bg-[var(--gold)]/25">Add Line</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-[13px]">
                <thead className="bg-[var(--panel)] text-left text-[11px] font-bold uppercase tracking-[0.13em] text-[var(--ink-muted)]">
                  <tr>
                    <th className="w-56 px-3 py-2">Item</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="w-20 px-3 py-2 text-right">Qty</th>
                    <th className="w-28 px-3 py-2 text-right">Price</th>
                    {canOverrideDiscount ? <th className="w-20 px-3 py-2 text-right">Disc %</th> : null}
                    <th className="w-28 px-3 py-2 text-right">Total</th>
                    <th className="w-10 px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {items.map((item) => (
                    <tr key={item.id} className="align-top">
                      <td className="px-3 py-2">
                        <select value={item.partId} onChange={(event) => selectPart(item.id, event.target.value)} className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50">
                          <option value="">Custom line</option>
                          {parts.map((part) => <option key={part.id} value={part.id}>{part.sku} - {part.name} ({part.qtyOnHand})</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2"><input value={item.description} onChange={(event) => updateItem(item.id, { description: event.target.value })} placeholder="Product, service, or package" className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50" /></td>
                      <td className="px-3 py-2"><input type="number" min={1} value={item.quantity} onChange={(event) => updateItem(item.id, { quantity: Number(event.target.value) })} className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2 py-1.5 text-right text-sm outline-none focus:border-[var(--accent)]/50" /></td>
                      <td className="px-3 py-2"><input type="number" min={0} step="any" value={item.unitPrice} onChange={(event) => updateItem(item.id, { unitPrice: Number(event.target.value) })} className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2 py-1.5 text-right text-sm outline-none focus:border-[var(--accent)]/50" /></td>
                      {canOverrideDiscount ? <td className="px-3 py-2"><input type="number" min={0} max={100} step="any" value={item.discount} onChange={(event) => updateItem(item.id, { discount: Number(event.target.value) })} className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2 py-1.5 text-right text-sm outline-none focus:border-[var(--accent)]/50" /></td> : null}
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--ink)]">{formatAmount(lineTotal(item))}</td>
                      <td className="px-3 py-2 text-center">
                        <button type="button" onClick={() => setItems((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== item.id) : prev))} disabled={items.length <= 1} className="rounded-md px-2 py-1 text-[var(--ink-muted)] hover:bg-red-500/10 hover:text-red-500 disabled:opacity-30" aria-label="Remove line">x</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn-premium rounded-lg px-5 py-2 text-[13px] font-bold">Create Invoice</button>
          <Link href="/documents/invoices" className="rounded-lg border border-[var(--line)] px-5 py-2 text-[13px] font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]">Cancel</Link>
        </div>
      </form>
    </details>
  );
}
