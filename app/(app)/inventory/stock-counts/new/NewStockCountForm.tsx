"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createStockCountAction } from "../actions";

type Location = { id: string; name: string; code: string | null };
type Part = { id: string; sku: string; name: string; qty: number };
type LineItem = { key: number; partId: string; systemQty: number; countedQty: number; note: string };

let keyCounter = 0;
function nextKey() { return ++keyCounter; }

export function NewStockCountForm({ locations, parts }: { locations: Location[]; parts: Part[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<LineItem[]>([{ key: nextKey(), partId: "", systemQty: 0, countedQty: 0, note: "" }]);

  function updateLine(key: number, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function selectPart(key: number, partId: string) {
    const part = parts.find((item) => item.id === partId);
    updateLine(key, { partId, systemQty: part?.qty ?? 0, countedQty: part?.qty ?? 0 });
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("items", JSON.stringify(lines.map(({ partId, systemQty, countedQty, note }) => ({ partId, systemQty, countedQty, note }))));
    startTransition(async () => {
      const result = await createStockCountAction(fd);
      if (result.error) { setError(result.error); return; }
      router.push(`/inventory/stock-counts/${result.id}`);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Count Details</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-[var(--ink-muted)]">Location
            <select name="locationId" required className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]"><option value="">Select location</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}{location.code ? ` (${location.code})` : ""}</option>)}</select>
          </label>
          <label className="block text-xs font-semibold text-[var(--ink-muted)]">Counted at
            <input name="countedAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]" />
          </label>
        </div>
        <textarea name="note" rows={2} placeholder="Count note" className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]" />
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--line)]"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Items</p><button type="button" onClick={() => setLines((prev) => [...prev, { key: nextKey(), partId: "", systemQty: 0, countedQty: 0, note: "" }])} className="rounded-md bg-[var(--gold)]/15 px-3 py-1 text-xs font-semibold text-[var(--gold)] hover:bg-[var(--gold)]/25">+ Add Line</button></div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-[var(--line)] text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]"><th className="px-3 py-2 text-left">Part</th><th className="px-3 py-2 text-right">System</th><th className="px-3 py-2 text-right">Counted</th><th className="px-3 py-2 text-right">Variance</th><th className="px-3 py-2 text-left">Note</th><th /></tr></thead><tbody className="divide-y divide-[var(--line)]">{lines.map((line) => <tr key={line.key}><td className="px-3 py-2"><select required value={line.partId} onChange={(e) => selectPart(line.key, e.target.value)} className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs text-[var(--ink)]"><option value="">Select part</option>{parts.map((part) => <option key={part.id} value={part.id}>{part.sku} · {part.name}</option>)}</select></td><td className="px-3 py-2 text-right tabular-nums text-[var(--ink-muted)]">{line.systemQty}</td><td className="px-3 py-2"><input type="number" min={0} value={line.countedQty} onChange={(e) => updateLine(line.key, { countedQty: parseInt(e.target.value, 10) || 0 })} className="w-24 rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-right text-xs text-[var(--ink)]" /></td><td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--ink)]">{line.countedQty - line.systemQty}</td><td className="px-3 py-2"><input value={line.note} onChange={(e) => updateLine(line.key, { note: e.target.value })} className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs text-[var(--ink)]" /></td><td className="px-3 py-2 text-center">{lines.length > 1 ? <button type="button" onClick={() => setLines((prev) => prev.filter((item) => item.key !== line.key))} className="text-xs font-bold text-[var(--ink-muted)] hover:text-red-500">x</button> : null}</td></tr>)}</tbody></table></div>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex gap-2"><button disabled={pending} className="btn-premium rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-50">{pending ? "Saving..." : "Submit Count"}</button><Link href="/inventory/stock-counts" className="rounded-lg border border-[var(--line)] px-5 py-2 text-sm font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]">Cancel</Link></div>
    </form>
  );
}
