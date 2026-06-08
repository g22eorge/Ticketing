"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createPurchaseOrderAction } from "../actions";

type Supplier = { id: string; name: string };
type Part = { id: string; name: string; sku: string; unitCost: number | null };
type LineItem = { key: number; description: string; qtyOrdered: number; unitCost: number; partId: string };

let keyCounter = 0;
function nextKey() { return ++keyCounter; }

function parseNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const fieldClass = "mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/10";
const labelClass = "block text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]";

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
  const [supplierId, setSupplierId] = useState(defaultSupplierId ?? "");
  const [lines, setLines] = useState<LineItem[]>([
    { key: nextKey(), description: "", qtyOrdered: 1, unitCost: 0, partId: "" },
  ]);

  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId);
  const canSubmit = suppliers.length > 0;
  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => sum + line.qtyOrdered * line.unitCost, 0);
    const quantity = lines.reduce((sum, line) => sum + line.qtyOrdered, 0);
    const readyLines = lines.filter((line) => line.description.trim() && line.qtyOrdered > 0).length;
    const zeroCostLines = lines.filter((line) => line.description.trim() && line.unitCost <= 0).length;
    return { subtotal, quantity, readyLines, zeroCostLines };
  }, [lines]);

  function addLine() {
    setLines((prev) => [...prev, { key: nextKey(), description: "", qtyOrdered: 1, unitCost: 0, partId: "" }]);
  }

  function removeLine(key: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((line) => line.key !== key) : prev));
  }

  function updateLine(key: number, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function onPartSelect(key: number, partId: string) {
    const part = parts.find((candidate) => candidate.id === partId);
    updateLine(key, { partId, description: part ? part.name : "", unitCost: part?.unitCost ?? 0 });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const fd = new FormData(e.currentTarget);
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.name) fd.set(submitter.name, submitter.value);
    fd.set("items", JSON.stringify(lines.map(({ description, qtyOrdered, unitCost, partId }) => ({
      description,
      qtyOrdered,
      unitCost,
      partId: partId || undefined,
    }))));

    startTransition(async () => {
      const result = await createPurchaseOrderAction(fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/inventory/purchase-orders/${result.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-2">
          <div>
            <p className="text-sm font-bold text-[var(--ink)]">PO entry</p>
            <p className="text-xs text-[var(--ink-muted)]">Compact supplier order form</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--ink-muted)]">{totals.readyLines}/{lines.length} lines</span>
            <span className="rounded-md border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--ink-muted)]">{totals.quantity} units</span>
            {totals.zeroCostLines ? <span className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-700">{totals.zeroCostLines} zero-cost</span> : null}
            <span className="rounded-md border border-[var(--line)] px-2 py-1 text-xs font-bold text-[var(--ink)]">{totals.subtotal.toLocaleString()}</span>
          </div>
        </div>

        <div className="grid gap-3 p-3 lg:grid-cols-4">
          <label className={labelClass}>
            Supplier
            <select name="supplierId" required value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className={fieldClass}>
              <option value="">{suppliers.length ? "Select supplier" : "No active suppliers"}</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Reference
            <input name="reference" type="text" placeholder="Optional" className={fieldClass} />
          </label>
          <label className={labelClass}>
            Order date
            <input name="orderedAt" type="date" className={fieldClass} />
          </label>
          <label className={labelClass}>
            Expected
            <input name="expectedAt" type="date" className={fieldClass} />
          </label>
          <label className={`${labelClass} lg:col-span-4`}>
            Notes
            <textarea name="notes" rows={2} placeholder="Terms, delivery instructions, warranty, approval note" className={`${fieldClass} resize-none`} />
          </label>
        </div>

        {suppliers.length === 0 ? (
          <div className="mx-3 mb-3 rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm">
            <span className="font-semibold text-amber-700">Supplier required.</span>{" "}
            <Link href="/inventory/suppliers/new" className="font-semibold text-[var(--accent)] hover:underline">Create supplier</Link>
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-2">
          <p className="text-sm font-bold text-[var(--ink)]">Order lines</p>
          <button type="button" onClick={addLine} className="rounded-md border border-[var(--line)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink)] hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">
            Add line
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-[var(--panel-strong)] text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">
              <tr>
                <th className="w-10 px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Inventory item</th>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="w-24 px-3 py-2 text-right">Qty</th>
                <th className="w-32 px-3 py-2 text-right">Unit cost</th>
                <th className="w-32 px-3 py-2 text-right">Total</th>
                <th className="w-20 px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {lines.map((line, index) => {
                const lineTotal = line.qtyOrdered * line.unitCost;
                return (
                  <tr key={line.key} className="align-top">
                    <td className="px-3 py-2 text-xs font-semibold text-[var(--ink-muted)]">{index + 1}</td>
                    <td className="px-3 py-2">
                      <select value={line.partId} onChange={(event) => onPartSelect(line.key, event.target.value)} className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-sm text-[var(--ink)] outline-none">
                        <option value="">Custom item</option>
                        {parts.map((part) => (
                          <option key={part.id} value={part.id}>{part.sku} - {part.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input value={line.description} onChange={(event) => updateLine(line.key, { description: event.target.value })} required placeholder="Description" className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-sm text-[var(--ink)] outline-none" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min={1} value={line.qtyOrdered} onChange={(event) => updateLine(line.key, { qtyOrdered: Math.max(1, Math.floor(parseNumber(event.target.value))) })} className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-right text-sm tabular-nums text-[var(--ink)] outline-none" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min={0} step={0.01} value={line.unitCost} onChange={(event) => updateLine(line.key, { unitCost: Math.max(0, parseNumber(event.target.value)) })} className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-right text-sm tabular-nums text-[var(--ink)] outline-none" />
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--ink)]">{lineTotal.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => removeLine(line.key)} disabled={lines.length === 1} className="rounded-md border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--ink-muted)] hover:border-red-400/40 hover:text-red-600 disabled:opacity-40">
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-[var(--line)] bg-[var(--panel-strong)]">
              <tr>
                <td colSpan={3} className="px-3 py-2 text-xs font-semibold text-[var(--ink-muted)]">
                  Supplier: {selectedSupplier?.name ?? "Not selected"}
                </td>
                <td className="px-3 py-2 text-right text-sm font-bold tabular-nums text-[var(--ink)]">{totals.quantity}</td>
                <td className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">Total</td>
                <td className="px-3 py-2 text-right text-sm font-black tabular-nums text-[var(--ink)]">{totals.subtotal.toLocaleString()}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {error ? <p className="rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600">{error}</p> : null}

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--line)] bg-[var(--bg)]/95 py-2 backdrop-blur">
        <Link href="/inventory/purchase-orders" className="rounded-md border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--ink-muted)] hover:bg-[var(--panel-strong)]">
          Cancel
        </Link>
        <button type="submit" disabled={pending || !canSubmit} className="btn-premium rounded-md px-3 py-2 text-sm font-semibold disabled:opacity-50">
          {pending ? "Saving..." : "Save draft"}
        </button>
        <button type="submit" name="issueNow" value="1" disabled={pending || !canSubmit || totals.zeroCostLines > 0} className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-500/15 disabled:opacity-50">
          {pending ? "Issuing..." : "Issue now"}
        </button>
      </div>
    </form>
  );
}
