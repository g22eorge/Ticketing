"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { createSupplierBillAction } from "../actions";

type Supplier = { id: string; name: string };
type PurchaseOrder = {
  id: string;
  supplierId: string;
  reference: string | null;
  items: Array<{ description: string; qtyOrdered: number; unitCost: number }>;
};
type GoodsReceived = {
  id: string;
  supplierId: string;
  poId: string | null;
  grnNumber: string;
  items: Array<{ description: string; quantity: number; unitCost: number }>;
};
type LineItem = { key: number; description: string; quantity: number; unitCost: number };

let keyCounter = 0;
function nextKey() { return ++keyCounter; }
function blankLine(): LineItem { return { key: nextKey(), description: "", quantity: 1, unitCost: 0 }; }
function fromSourceLine(line: { description: string; quantity: number; unitCost: number }): LineItem {
  return {
    key: nextKey(),
    description: line.description,
    quantity: Math.max(1, Math.floor(Number(line.quantity) || 1)),
    unitCost: Math.max(0, Number(line.unitCost) || 0),
  };
}

export function NewSupplierBillForm({
  suppliers,
  purchaseOrders,
  goodsReceived,
  defaultSupplierId,
  defaultPoId,
  defaultGrnId,
  baseCurrency,
}: {
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  goodsReceived: GoodsReceived[];
  defaultSupplierId?: string;
  defaultPoId?: string;
  defaultGrnId?: string;
  baseCurrency: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const defaultGrn = goodsReceived.find((item) => item.id === (defaultGrnId ?? ""));
  const defaultPo = purchaseOrders.find((item) => item.id === (defaultPoId ?? defaultGrn?.poId ?? ""));
  const initialSupplierId = defaultSupplierId ?? defaultGrn?.supplierId ?? defaultPo?.supplierId ?? "";
  const initialPoId = defaultPoId ?? defaultGrn?.poId ?? "";
  const [supplierId, setSupplierId] = useState(initialSupplierId);
  const [selectedPoId, setSelectedPoId] = useState(initialPoId);
  const [selectedGrnId, setSelectedGrnId] = useState(defaultGrnId ?? "");
  const sourceLines = useMemo(() => {
    if (defaultGrn?.items.length) return defaultGrn.items.map(fromSourceLine);
    if (defaultPo?.items.length) {
      return defaultPo.items.map((item) => fromSourceLine({ description: item.description, quantity: item.qtyOrdered, unitCost: item.unitCost }));
    }
    return [blankLine()];
  }, [defaultGrn, defaultPo]);
  const [lines, setLines] = useState<LineItem[]>(sourceLines);

  const supplierPOs = purchaseOrders.filter((po) => !supplierId || po.supplierId === supplierId);
  const supplierGRNs = goodsReceived.filter((grn) =>
    (!supplierId || grn.supplierId === supplierId) &&
    (!selectedPoId || !grn.poId || grn.poId === selectedPoId),
  );

  function setLinesFromGrn(grnId: string) {
    const grn = goodsReceived.find((item) => item.id === grnId);
    if (!grn) {
      setSelectedGrnId("");
      setLines([blankLine()]);
      return;
    }
    setSelectedGrnId(grn.id);
    setSupplierId(grn.supplierId);
    if (grn.poId) setSelectedPoId(grn.poId);
    setLines(grn.items.length ? grn.items.map(fromSourceLine) : [blankLine()]);
  }

  function setLinesFromPo(poId: string) {
    const po = purchaseOrders.find((item) => item.id === poId);
    setSelectedPoId(poId);
    setSelectedGrnId("");
    if (!po) {
      setLines([blankLine()]);
      return;
    }
    setSupplierId(po.supplierId);
    setLines(
      po.items.length
        ? po.items.map((item) => fromSourceLine({ description: item.description, quantity: item.qtyOrdered, unitCost: item.unitCost }))
        : [blankLine()],
    );
  }

  function updateLine(key: number, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("items", JSON.stringify(lines.map(({ description, quantity, unitCost }) => ({ description, quantity, unitCost }))));
    startTransition(async () => {
      const result = await createSupplierBillAction(fd);
      if (result.error) { setError(result.error); return; }
      router.push(`/inventory/supplier-bills/${result.id}`);
    });
  }

  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
  const readyLines = lines.filter((line) => line.description.trim() && line.quantity > 0).length;

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Three-Way Match</p>
          <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">
            Record supplier invoices against the purchasing trail. Link a PO and GRN whenever possible so finance can compare what was ordered, what arrived, and what the supplier billed.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
              <p className="text-[11px] font-black text-[var(--accent)]">PO</p>
              <p className="text-xs font-semibold text-[var(--ink)]">Ordered</p>
            </div>
            <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
              <p className="text-[11px] font-black text-[var(--accent)]">GRN</p>
              <p className="text-xs font-semibold text-[var(--ink)]">Received</p>
            </div>
            <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
              <p className="text-[11px] font-black text-[var(--accent)]">Bill</p>
              <p className="text-xs font-semibold text-[var(--ink)]">Payable</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Posting Check</p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">Lines ready</dt><dd className="font-bold text-[var(--ink)]">{readyLines}/{lines.length}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">Supplier POs</dt><dd className="font-bold text-[var(--ink)]">{supplierPOs.length}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">Supplier GRNs</dt><dd className="font-bold text-[var(--ink)]">{supplierGRNs.length}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">Subtotal</dt><dd className="font-bold tabular-nums text-[var(--ink)]">{subtotal.toLocaleString()}</dd></div>
          </dl>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-4">
        <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Bill Details</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-[var(--ink-muted)]">
            Supplier
            <select
              name="supplierId"
              required
              value={supplierId}
              onChange={(e) => {
                setSupplierId(e.target.value);
                setSelectedPoId("");
                setSelectedGrnId("");
                setLines([blankLine()]);
              }}
              className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]"
            >
              <option value="">Select supplier...</option>
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-[var(--ink-muted)]">
            Supplier invoice/reference
            <input name="supplierRef" className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]" />
          </label>
          <label className="block text-xs font-semibold text-[var(--ink-muted)]">
            Purchase order
            <select name="poId" value={selectedPoId} onChange={(e) => setLinesFromPo(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]">
              <option value="">No linked PO</option>
              {supplierPOs.map((po) => (
                <option key={po.id} value={po.id}>
                  {po.reference ?? `PO-${po.id.slice(-6).toUpperCase()}`} · {po.items.length} line{po.items.length === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-[var(--ink-muted)]">
            Goods received
            <select name="grnId" value={selectedGrnId} onChange={(e) => setLinesFromGrn(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]">
              <option value="">No linked GRN</option>
              {supplierGRNs.map((grn) => (
                <option key={grn.id} value={grn.id}>
                  {grn.grnNumber} · {grn.items.length} line{grn.items.length === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-[var(--ink-muted)]">
            Issued date
            <input name="issuedAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]" />
          </label>
          <label className="block text-xs font-semibold text-[var(--ink-muted)]">
            Due date
            <input name="dueAt" type="date" className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]" />
          </label>
          <label className="block text-xs font-semibold text-[var(--ink-muted)]">
            Currency
            <input name="currency" defaultValue={baseCurrency} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm uppercase text-[var(--ink)]" />
          </label>
          <label className="block text-xs font-semibold text-[var(--ink-muted)]">
            Tax amount
            <input name="taxAmount" type="number" min={0} step={0.01} defaultValue={0} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-right text-sm text-[var(--ink)]" />
          </label>
        </div>
        <textarea name="notes" rows={2} placeholder="Notes" className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]" />
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--line)]">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Line Items</p>
            <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">
              {selectedGrnId ? "Loaded from selected GRN." : selectedPoId ? "Loaded from selected PO." : "Add supplier invoice lines."}
            </p>
          </div>
          <button type="button" onClick={() => setLines((prev) => [...prev, { key: nextKey(), description: "", quantity: 1, unitCost: 0 }])} className="rounded-md bg-[var(--gold)]/15 px-3 py-1 text-xs font-semibold text-[var(--gold)] hover:bg-[var(--gold)]/25">+ Add Line</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[var(--line)] text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]"><th className="px-3 py-2 text-left">Description</th><th className="px-3 py-2 text-right w-24">Qty</th><th className="px-3 py-2 text-right w-32">Unit Cost</th><th className="px-3 py-2 text-right w-32">Total</th><th className="px-3 py-2 w-8" /></tr></thead>
            <tbody className="divide-y divide-[var(--line)]">
              {lines.map((line) => (
                <tr key={line.key}>
                  <td className="px-3 py-2"><input value={line.description} onChange={(e) => updateLine(line.key, { description: e.target.value })} required className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs text-[var(--ink)]" /></td>
                  <td className="px-3 py-2"><input type="number" min={1} value={line.quantity} onChange={(e) => updateLine(line.key, { quantity: parseInt(e.target.value, 10) || 1 })} className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-right text-xs text-[var(--ink)]" /></td>
                  <td className="px-3 py-2"><input type="number" min={0} step={0.01} value={line.unitCost} onChange={(e) => updateLine(line.key, { unitCost: parseFloat(e.target.value) || 0 })} className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-right text-xs text-[var(--ink)]" /></td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-[var(--ink-muted)]">{(line.quantity * line.unitCost).toLocaleString()}</td>
                  <td className="px-3 py-2 text-center">{lines.length > 1 ? <button type="button" onClick={() => setLines((prev) => prev.filter((item) => item.key !== line.key))} className="text-xs font-bold text-[var(--ink-muted)] hover:text-red-500">x</button> : null}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t border-[var(--line)] bg-[var(--gold)]/5"><td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold text-[var(--ink-muted)]">Subtotal</td><td className="px-3 py-2 text-right text-sm font-bold text-[var(--ink)] tabular-nums">{subtotal.toLocaleString()}</td><td /></tr></tfoot>
          </table>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn-premium rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-50">{pending ? "Saving..." : "Create Bill"}</button>
        <Link href="/inventory/supplier-bills" className="rounded-lg border border-[var(--line)] px-5 py-2 text-sm font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]">Cancel</Link>
      </div>
    </form>
  );
}
