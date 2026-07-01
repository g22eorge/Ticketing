"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, FilePlus2 } from "lucide-react";

type ClientOption = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  organization: string | null;
  address: string | null;
};

type LineItem = {
  id: number;
  description: string;
  quantity: number;
  unitPrice: number;
};

type Props = {
  currency: string;
  clients: ClientOption[];
  defaultTaxApplicable: boolean;
  defaultTaxRate: number;
  defaultTaxLabel: string;
};

let nextId = 1;

const inputClass =
  "w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)]/60 focus:ring-1 focus:ring-[var(--accent)]/15";

export function NewInvoiceForm({
  currency,
  clients,
  defaultTaxApplicable,
  defaultTaxRate,
  defaultTaxLabel,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [clientMode, setClientMode] = useState<"existing" | "new">(clients.length ? "existing" : "new");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [newClient, setNewClient] = useState({
    fullName: "",
    phone: "",
    email: "",
    organization: "",
    address: "",
  });
  const [subject, setSubject] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [taxEnabled, setTaxEnabled] = useState(defaultTaxApplicable);
  const [items, setItems] = useState<LineItem[]>([
    { id: nextId++, description: "", quantity: 1, unitPrice: 0 },
  ]);

  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? null;
  const filteredClients = useMemo(() => {
    const query = clientSearch.trim().toLowerCase();
    if (!query) return [];
    return clients
      .filter((client) =>
        [client.fullName, client.phone, client.email, client.organization, client.address]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
      .slice(0, 6);
  }, [clientSearch, clients]);
  const validItems = useMemo(
    () => items.filter((item) => item.description.trim() && item.quantity > 0 && item.unitPrice >= 0),
    [items],
  );
  const taxRate = taxEnabled ? Math.max(0, Number(defaultTaxRate) || 0) : 0;
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const totalAmount = subtotal + taxAmount;

  function formatAmount(value: number) {
    const zeroDecimal = new Set(["UGX", "JPY", "KRW"]).has(currency);
    return `${currency} ${value.toLocaleString("en-US", {
      minimumFractionDigits: zeroDecimal ? 0 : 2,
      maximumFractionDigits: zeroDecimal ? 0 : 2,
    })}`;
  }

  function updateItem(id: number, patch: Partial<LineItem>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addItem() {
    setItems((current) => [...current, { id: nextId++, description: "", quantity: 1, unitPrice: 0 }]);
  }

  function removeItem(id: number) {
    if (items.length <= 1) return;
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (clientMode === "existing" && !selectedClient) {
      setError("Choose a client or switch to new client.");
      return;
    }
    if (clientMode === "new" && (!newClient.fullName.trim() || !newClient.phone.trim())) {
      setError("Enter the client's name and phone number.");
      return;
    }
    if (validItems.length === 0) {
      setError("Add at least one invoice item.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/invoices", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientId: clientMode === "existing" ? selectedClient?.id : undefined,
            newClient: clientMode === "new" ? newClient : undefined,
            subject: subject || undefined,
            dueDate: dueDate || undefined,
            currency,
            notes: notes || undefined,
            taxApplicable: taxEnabled,
            taxRate,
            items: validItems.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountAmount: 0,
            })),
          }),
        });
        const result = (await response.json().catch(() => null)) as { href?: string; listHref?: string; error?: string } | null;
        if (!response.ok) throw new Error(result?.error ?? "Failed to create invoice");
        router.push(result?.listHref ?? "/documents/invoices");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create invoice");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        {error ? (
          <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-700 dark:text-red-400">
            {error}
          </div>
        ) : null}

        <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Client</h2>
            <div className="grid grid-cols-2 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-1">
              <button
                type="button"
                onClick={() => setClientMode("existing")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  clientMode === "existing" ? "bg-[var(--accent)] text-black" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                }`}
              >
                Existing
              </button>
              <button
                type="button"
                onClick={() => setClientMode("new")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  clientMode === "new" ? "bg-[var(--accent)] text-black" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                }`}
              >
                New
              </button>
            </div>
          </div>

          {clientMode === "existing" ? (
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-semibold text-[var(--ink-muted)]">
                Search client
                <input
                  value={clientSearch}
                  onChange={(event) => {
                    setClientSearch(event.target.value);
                    setSelectedClientId("");
                  }}
                  className={`${inputClass} mt-1.5`}
                  placeholder="Type name, phone, email, or company"
                />
              </label>

              {clientSearch.trim() && !selectedClient ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {filteredClients.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => {
                        setSelectedClientId(client.id);
                        setClientSearch(client.fullName);
                      }}
                      className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-left transition hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/5"
                    >
                      <span className="block text-sm font-semibold text-[var(--ink)]">{client.fullName}</span>
                      <span className="mt-0.5 block text-xs text-[var(--ink-muted)]">
                        {[client.phone, client.email, client.organization].filter(Boolean).join(" - ") || "Client record"}
                      </span>
                    </button>
                  ))}
                  {filteredClients.length === 0 ? (
                    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-3 text-sm text-[var(--ink-muted)]">
                      No client found. Use New to add this client.
                    </div>
                  ) : null}
                </div>
              ) : null}

              {selectedClient ? (
                <div className="rounded-lg border border-[var(--accent)]/35 bg-[var(--accent)]/10 px-3 py-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--ink)]">{selectedClient.fullName}</p>
                      <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                        {[selectedClient.organization, selectedClient.email, selectedClient.address].filter(Boolean).join(" - ") || selectedClient.phone}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedClientId("");
                        setClientSearch("");
                      }}
                      className="text-xs font-semibold text-[var(--gold)] hover:underline"
                    >
                      Change
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-[var(--ink-muted)]">
                Client name
                <input
                  value={newClient.fullName}
                  onChange={(event) => setNewClient((current) => ({ ...current, fullName: event.target.value }))}
                  className={`${inputClass} mt-1.5`}
                  placeholder="Client or company name"
                />
              </label>
              <label className="text-xs font-semibold text-[var(--ink-muted)]">
                Phone
                <input
                  value={newClient.phone}
                  onChange={(event) => setNewClient((current) => ({ ...current, phone: event.target.value }))}
                  className={`${inputClass} mt-1.5`}
                  placeholder="+256..."
                />
              </label>
              <label className="text-xs font-semibold text-[var(--ink-muted)]">
                Email
                <input
                  type="email"
                  value={newClient.email}
                  onChange={(event) => setNewClient((current) => ({ ...current, email: event.target.value }))}
                  className={`${inputClass} mt-1.5`}
                  placeholder="client@example.com"
                />
              </label>
              <label className="text-xs font-semibold text-[var(--ink-muted)]">
                Location
                <input
                  value={newClient.address}
                  onChange={(event) => setNewClient((current) => ({ ...current, address: event.target.value }))}
                  className={`${inputClass} mt-1.5`}
                  placeholder="Address or branch"
                />
              </label>
            </div>
          )}
        </section>

        <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Invoice</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
            <label className="text-xs font-semibold text-[var(--ink-muted)]">
              Subject
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className={`${inputClass} mt-1.5`}
                placeholder="Service, support, equipment, or SLA"
              />
            </label>
            <label className="text-xs font-semibold text-[var(--ink-muted)]">
              Due date
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className={`${inputClass} mt-1.5`}
              />
            </label>
          </div>
        </section>

        <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Invoice items</h2>
            <button
              type="button"
              onClick={addItem}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/50"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add item
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {items.map((item, index) => (
              <div key={item.id} className="rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] p-3">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_90px_140px_36px]">
                  <label className="text-xs font-semibold text-[var(--ink-muted)]">
                    Item {index + 1}
                    <input
                      value={item.description}
                      onChange={(event) => updateItem(item.id, { description: event.target.value })}
                      className={`${inputClass} mt-1.5 bg-[var(--panel)]`}
                      placeholder="Service, product, or package"
                    />
                  </label>
                  <label className="text-xs font-semibold text-[var(--ink-muted)]">
                    Qty
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(event) => updateItem(item.id, { quantity: Number(event.target.value) })}
                      className={`${inputClass} mt-1.5 bg-[var(--panel)] text-right`}
                    />
                  </label>
                  <label className="text-xs font-semibold text-[var(--ink-muted)]">
                    Unit price
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={item.unitPrice}
                      onChange={(event) => updateItem(item.id, { unitPrice: Number(event.target.value) })}
                      className={`${inputClass} mt-1.5 bg-[var(--panel)] text-right`}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    disabled={items.length <= 1}
                    className="mt-5 flex h-9 items-center justify-center rounded-lg text-sm font-semibold text-[var(--ink-muted)] transition hover:bg-red-500/10 hover:text-red-600 disabled:opacity-30"
                    aria-label="Remove item"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <p className="mt-2 text-right text-sm font-semibold tabular-nums text-[var(--ink)]">
                  {formatAmount(item.quantity * item.unitPrice)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Notes</h2>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className={`${inputClass} mt-4 resize-none`}
            placeholder="Payment terms, delivery terms, or account notes"
          />
        </section>
      </div>

      <aside className="lg:sticky lg:top-4 lg:self-start">
        <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Summary</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--ink-muted)]">Lines</dt>
              <dd className="font-semibold text-[var(--ink)]">{validItems.length}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--ink-muted)]">Subtotal</dt>
              <dd className="font-semibold tabular-nums text-[var(--ink)]">{formatAmount(subtotal)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[var(--ink-muted)]">{defaultTaxLabel || "Tax"} ({taxRate}%)</dt>
              <dd className="font-semibold tabular-nums text-[var(--ink)]">{formatAmount(taxAmount)}</dd>
            </div>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-xs font-semibold text-[var(--ink)]">
              Apply {defaultTaxLabel || "tax"}
              <input
                type="checkbox"
                checked={taxEnabled}
                onChange={(event) => setTaxEnabled(event.target.checked)}
                className="h-4 w-4 rounded border-[var(--line)]"
              />
            </label>
            <div className="flex justify-between gap-3 border-t border-[var(--line)] pt-3">
              <dt className="font-semibold text-[var(--ink)]">Total</dt>
              <dd className="text-lg font-black tabular-nums text-[var(--ink)]">{formatAmount(totalAmount)}</dd>
            </div>
          </dl>

          <button type="submit" disabled={isPending} className="btn-premium mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-5 py-3 text-sm font-bold disabled:opacity-60">
            <FilePlus2 className="h-4 w-4" aria-hidden="true" /> {isPending ? "Creating..." : "Create Invoice"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--line)] px-5 py-2.5 text-sm font-semibold text-[var(--ink-muted)] transition hover:text-[var(--ink)]"
          >
            <X className="h-4 w-4" aria-hidden="true" /> Cancel
          </button>
        </section>
      </aside>
    </form>
  );
}
