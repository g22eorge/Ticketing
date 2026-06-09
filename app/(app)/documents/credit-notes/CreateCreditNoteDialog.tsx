"use client";

import { useMemo, useState } from "react";

type SaleLine = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type SaleOption = {
  id: string;
  saleNumber: string;
  totalAmount: number;
  currency: string;
  client: { fullName: string } | null;
  items: SaleLine[];
};

type Props = {
  eligibleSales: SaleOption[];
  action: (formData: FormData) => Promise<void>;
};

function money(value: number, currency: string) {
  return `${currency} ${new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 }).format(value)}`;
}

export function CreateCreditNoteDialog({ eligibleSales, action }: Props) {
  const [open, setOpen] = useState(false);
  const [saleId, setSaleId] = useState(eligibleSales[0]?.id ?? "");
  const selectedSale = useMemo(
    () => eligibleSales.find((sale) => sale.id === saleId) ?? eligibleSales[0] ?? null,
    [eligibleSales, saleId],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-premium rounded-lg px-3 py-1.5 text-[12px]"
      >
        + New Credit Note
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Create Credit Note">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-label="Close"
          />
          <div className="panel-shadow relative z-10 w-full max-w-2xl overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <div>
                <p className="text-[13px] font-semibold text-[var(--ink)]">Create Credit Note</p>
                <p className="text-[12px] text-[var(--ink-muted)]">Select the sale and return lines.</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--ink-muted)] transition hover:bg-[var(--panel-strong)] hover:text-[var(--ink)]"
                aria-label="Close"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {eligibleSales.length > 0 && selectedSale ? (
              <form action={action} className="space-y-3 p-4">
                <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
                  <label className="space-y-1">
                    <span className="text-[12px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Sale</span>
                    <select
                      name="saleId"
                      value={selectedSale.id}
                      onChange={(event) => setSaleId(event.target.value)}
                      className="h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 text-sm text-[var(--ink)]"
                    >
                      {eligibleSales.map((sale) => (
                        <option key={sale.id} value={sale.id}>
                          {sale.saleNumber} - {sale.client?.fullName ?? "Walk-in"} - {money(sale.totalAmount, sale.currency)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[12px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Reason</span>
                    <input
                      name="reason"
                      required
                      placeholder="Return, adjustment, warranty..."
                      className="h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 text-sm text-[var(--ink)]"
                    />
                  </label>
                </div>

                <div className="max-h-[360px] overflow-y-auto rounded-xl border border-[var(--line)]">
                  {selectedSale.items.map((item) => (
                    <label key={item.id} className="grid gap-3 border-b border-[var(--line)] px-3 py-2.5 last:border-0 sm:grid-cols-[auto_1fr_90px_110px] sm:items-center">
                      <input
                        type="checkbox"
                        name="itemId"
                        value={item.id}
                        defaultChecked
                        className="mt-1 h-4 w-4 rounded border-[var(--line)] text-[var(--accent)] sm:mt-0"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-[var(--ink)]">{item.description}</span>
                        <span className="text-[12px] text-[var(--ink-muted)]">{money(item.lineTotal, selectedSale.currency)}</span>
                      </span>
                      <input
                        name={`quantity:${item.id}`}
                        type="number"
                        min="1"
                        max={item.quantity}
                        defaultValue={item.quantity}
                        className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 text-sm"
                        aria-label={`Quantity for ${item.description}`}
                      />
                      <span className="text-right text-[13px] font-semibold text-[var(--ink-muted)]">
                        @ {money(item.unitPrice, selectedSale.currency)}
                      </span>
                    </label>
                  ))}
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-premium rounded-lg px-4 py-2 text-sm font-semibold">
                    Create Credit Note
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-4 text-sm text-[var(--ink-muted)]">No paid sales are available for credit notes.</div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
