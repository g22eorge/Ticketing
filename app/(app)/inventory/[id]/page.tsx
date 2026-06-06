import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { requireModule, OrgModule } from "@/lib/module-access";
import { can } from "@/lib/permissions";
import { adjustStockAction, updatePartAction, togglePartActiveAction } from "../actions";
import { FormField, FormRow } from "@/components/ui/form-field";

export default async function PartDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireModule(OrgModule.INVENTORY);
  const { user, orgId } = await requireOrgSession();
  if (!["ADMIN", "MANAGER", "TECH_MANAGER", "OPS", "TECHNICIAN_INTERNAL"].includes(user.role)) {
    redirect("/dashboard");
  }

  const { id } = await params;
  const sp = ((await searchParams?.catch(() => ({}))) ?? {}) as Record<string, string | string[] | undefined>;
  const error = typeof sp.error === "string" ? sp.error : null;
  const saved = sp.saved === "1";
  const canManage = can.manageInventory(user);

  const [part, transactions] = await Promise.all([
    prisma.part.findFirst({
      where: { id, orgId },
      select: {
        id: true, sku: true, name: true, manufacturer: true,
        unitCost: true, qtyOnHand: true, qtyReserved: true,
        reorderLevel: true, isActive: true, createdAt: true,
        reservations: {
          where: { status: "RESERVED" },
          select: {
            id: true, quantity: true, reservedAt: true,
            job: { select: { id: true, jobNumber: true, device: { select: { brand: true, model: true } } } },
          },
          orderBy: { reservedAt: "desc" },
          take: 10,
        },
      },
    }),
    prisma.partStockTransaction.findMany({
      where: { partId: id, part: { orgId } },
      include: { createdBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  if (!part) notFound();

  const available = part.qtyOnHand - part.qtyReserved;
  const stockValue = (part.unitCost ?? 0) * part.qtyOnHand;
  const isLow = part.reorderLevel > 0 && part.qtyOnHand <= part.reorderLevel;
  const isOut = part.qtyOnHand === 0;

  // Running balance per row
  const txnsAsc = [...transactions].reverse();
  let bal = part.qtyOnHand;
  const bals: number[] = new Array(txnsAsc.length);
  for (let i = txnsAsc.length - 1; i >= 0; i--) {
    bals[i] = bal;
    const t = txnsAsc[i];
    bal -= t.type === "IN" ? t.quantity : t.type === "OUT" ? -t.quantity : t.quantity;
  }
  const txnsDisplay = transactions.map((t, di) => ({ ...t, balance: bals[transactions.length - 1 - di] }));


  return (
    <div className="space-y-5">

      {/* ── Banners ── */}
      {saved && (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/8 px-4 py-2.5 text-[13px] font-semibold text-emerald-700">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>
          Stock updated — new entry recorded in the log.
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2.5 rounded-xl border border-red-500/25 bg-red-500/8 px-4 py-2.5 text-[13px] text-red-600">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm0 3.75a.75.75 0 0 0-.75.75v3a.75.75 0 0 0 1.5 0v-3A.75.75 0 0 0 8 4.75Zm0 6.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"/></svg>
          {error}
        </div>
      )}

      {/* ── Header ── */}
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex items-center gap-2 border-b border-[var(--line)] px-5 py-2">
          <Link href="/inventory" className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)] hover:text-[var(--ink)] transition">
            Inventory
          </Link>
          <span className="text-[var(--line)]">/</span>
          <span className="text-[11px] uppercase tracking-wide text-[var(--ink-muted)]">{part.sku}</span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            {/* Status badges */}
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wider text-[var(--ink-muted)]">
                SKU: {part.sku}
              </span>
              {part.isActive && !isOut && !isLow && (
                <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Active Stock
                </span>
              )}
              {isOut && (
                <span className="flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-red-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  Out of Stock
                </span>
              )}
              {isLow && !isOut && (
                <span className="flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  Low Stock
                </span>
              )}
              {!part.isActive && (
                <span className="rounded-full border border-[var(--line)] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
                  Inactive
                </span>
              )}
            </div>
            {/* Part name */}
            <h1 className="text-[22px] font-black uppercase tracking-wide text-[var(--ink)]">{part.name}</h1>
            {part.manufacturer && (
              <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">{part.manufacturer}</p>
            )}
          </div>

          {canManage && (
            <form action={togglePartActiveAction} className="shrink-0">
              <input type="hidden" name="partId" value={part.id} />
              <input type="hidden" name="next" value={part.isActive ? "0" : "1"} />
              <button type="submit" className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-[12px] font-bold uppercase tracking-wide transition ${
                part.isActive
                  ? "border-red-400/40 text-red-600 hover:bg-red-500/8"
                  : "border-emerald-400/40 text-emerald-700 hover:bg-emerald-500/8"
              }`}>
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1ZM5.28 4.22a.75.75 0 1 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z"/>
                </svg>
                {part.isActive ? "Deactivate" : "Reactivate"}
              </button>
            </form>
          )}
        </div>

        {/* ── KPI cards ── */}
        <div className="grid grid-cols-2 gap-px border-t border-[var(--line)] bg-[var(--line)] sm:grid-cols-4">
          {[
            { label: "On Hand",    value: part.qtyOnHand,        color: isOut ? "text-red-500" : isLow ? "text-amber-500" : "text-[var(--ink)]" },
            { label: "Reserved",   value: part.qtyReserved,      color: "text-[var(--ink)]" },
            { label: "Available",  value: available,             color: available <= 0 ? "text-red-500" : "text-emerald-500" },
            { label: "Stock Value",value: formatMoney(stockValue),color: "text-[var(--ink)]" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-[var(--panel)] px-5 py-4">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]/70">{label}</p>
              <p className={`text-[26px] font-black tabular-nums leading-none ${color}`}>{value}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]/40">UNITS</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">

        {/* ── Left ── */}
        <div className="space-y-4 min-w-0">

          {/* Quick stock actions */}
          {canManage && (
            <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
              <div className="border-b border-[var(--line)] px-5 py-2.5">
                <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/70">
                  <svg className="h-3.5 w-3.5 text-[var(--accent)]" viewBox="0 0 16 16" fill="currentColor"><path d="M8.75 1a.75.75 0 0 0-1.5 0v5.5h-5.5a.75.75 0 0 0 0 1.5h5.5v5.5a.75.75 0 0 0 1.5 0V8h5.5a.75.75 0 0 0 0-1.5h-5.5V1Z"/></svg>
                  Quick Stock Actions
                </p>
              </div>

              {/* 3 action cards */}
              <div className="grid grid-cols-3 gap-px bg-[var(--line)]">

                <details className="group bg-[var(--panel)]">
                  <summary className="flex cursor-pointer select-none flex-col items-center justify-center gap-2 px-4 py-5 text-center transition hover:bg-[var(--panel-strong)]/60 list-none">
                    <svg className="h-6 w-6 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/>
                    </svg>
                    <span className="text-[12px] font-bold text-[var(--ink)]">Receive</span>
                  </summary>
                  <div className="border-t border-[var(--line)] bg-[var(--panel-strong)]/40 px-4 py-3">
                    <form action={adjustStockAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="partId" value={part.id} />
                      <input type="hidden" name="type" value="IN" />
                      <input name="quantity" inputMode="numeric" placeholder="Qty" required
                        className="h-8 w-20 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-[13px] outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/12" />
                      <input name="reason" placeholder="Reference / note"
                        className="h-8 min-w-[120px] flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-[13px] outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/12" />
                      <button type="submit"
                        className="h-8 shrink-0 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 text-[12px] font-bold text-emerald-700 transition hover:bg-emerald-500/20">
                        + Receive
                      </button>
                    </form>
                  </div>
                </details>

                <details className="group bg-[var(--panel)]">
                  <summary className="flex cursor-pointer select-none flex-col items-center justify-center gap-2 px-4 py-5 text-center transition hover:bg-[var(--panel-strong)]/60 list-none">
                    <svg className="h-6 w-6 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 7.5m0 0L7.5 12M12 7.5V21"/>
                    </svg>
                    <span className="text-[12px] font-bold text-[var(--ink)]">Issue / Write-off</span>
                  </summary>
                  <div className="border-t border-[var(--line)] bg-[var(--panel-strong)]/40 px-4 py-3">
                    <form action={adjustStockAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="partId" value={part.id} />
                      <input type="hidden" name="type" value="OUT" />
                      <input name="quantity" inputMode="numeric" placeholder="Qty" required
                        className="h-8 w-20 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-[13px] outline-none focus:border-red-400/50 focus:ring-2 focus:ring-red-500/12" />
                      <input name="reason" placeholder="Reason"
                        className="h-8 min-w-[120px] flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-[13px] outline-none focus:border-red-400/50 focus:ring-2 focus:ring-red-500/12" />
                      <button type="submit"
                        className="h-8 shrink-0 rounded-lg border border-red-400/40 bg-red-500/8 px-4 text-[12px] font-bold text-red-600 transition hover:bg-red-500/15">
                        − Issue
                      </button>
                    </form>
                  </div>
                </details>

                <details className="group bg-[var(--panel)]">
                  <summary className="flex cursor-pointer select-none flex-col items-center justify-center gap-2 px-4 py-5 text-center transition hover:bg-[var(--panel-strong)]/60 list-none">
                    <svg className="h-6 w-6 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"/>
                    </svg>
                    <span className="text-[12px] font-bold text-[var(--ink)]">Qty Correction</span>
                  </summary>
                  <div className="border-t border-[var(--line)] bg-[var(--panel-strong)]/40 px-4 py-3">
                    <p className="mb-2.5 text-[11px] text-[var(--ink-muted)]">
                      Enter the correct total. Currently <strong className="tabular-nums text-[var(--ink)]">{part.qtyOnHand}</strong>. No cost impact.
                    </p>
                    <form action={adjustStockAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="partId" value={part.id} />
                      <input type="hidden" name="type" value="ADJUST" />
                      <input type="hidden" name="quantity" value="1" />
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Correct to</label>
                        <input name="correctTo" inputMode="numeric" placeholder={String(part.qtyOnHand)} required
                          className="h-8 w-24 rounded-lg border border-amber-400/60 bg-[var(--panel)] px-3 text-[13px] font-semibold outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/14" />
                      </div>
                      <input name="reason" placeholder="Reason (recommended)"
                        className="h-8 min-w-[120px] flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-[13px] outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/12" />
                      <button type="submit"
                        className="h-8 shrink-0 self-end rounded-lg border border-amber-400/50 bg-amber-500/10 px-4 text-[12px] font-bold text-amber-700 transition hover:bg-amber-500/20">
                        Correct
                      </button>
                    </form>
                  </div>
                </details>

              </div>
            </div>
          )}

          {/* Movement log */}
          <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/70">Movement Log</p>
              <p className="text-[11px] tabular-nums text-[var(--ink-muted)]">{transactions.length} entries</p>
            </div>
            {transactions.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-[var(--ink-muted)]">No movements recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="border-b border-[var(--line)] bg-[var(--panel-strong)]">
                    <tr className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]/60">
                      <th className="px-5 py-2.5 text-left">Date &amp; Time</th>
                      <th className="px-3 py-2.5 text-left">Action</th>
                      <th className="px-3 py-2.5 text-right">Change</th>
                      <th className="px-3 py-2.5 text-right">Balance</th>
                      <th className="hidden px-3 py-2.5 text-left sm:table-cell">Reference</th>
                      <th className="px-5 py-2.5 text-left">Handler</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {txnsDisplay.map((txn) => {
                      const isIn  = txn.type === "IN";
                      const isOt  = txn.type === "OUT";
                      const sign  = isIn ? "+" : isOt ? "−" : (txn.quantity >= 0 ? "+" : "−");
                      const changeColor = isIn ? "text-emerald-600" : isOt ? "text-red-500" : "text-amber-600";
                      const badgeCls    = isIn
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                        : isOt
                        ? "border-red-400/30 bg-red-500/10 text-red-600"
                        : "border-amber-400/30 bg-amber-500/10 text-amber-700";
                      const label = isIn ? "Inbound" : isOt ? "Write-off" : "Correction";
                      return (
                        <tr key={txn.id} className="transition-colors hover:bg-[var(--panel-strong)]/40">
                          <td className="px-5 py-3 text-[12px] tabular-nums text-[var(--ink)] whitespace-nowrap">
                            {txn.createdAt.toLocaleDateString([], { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\//g, "-")}
                            {" "}
                            <span className="text-[var(--ink-muted)]">
                              {txn.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className={`inline-block rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badgeCls}`}>
                              {label}
                            </span>
                          </td>
                          <td className={`px-3 py-3 text-right text-[14px] font-black tabular-nums ${changeColor}`}>
                            {sign}{Math.abs(txn.quantity)}
                          </td>
                          <td className="px-3 py-3 text-right text-[13px] font-semibold tabular-nums text-[var(--ink)]">
                            {txn.balance}
                          </td>
                          <td className="hidden max-w-[180px] truncate px-3 py-3 text-[12px] text-[var(--ink-muted)] sm:table-cell">
                            {txn.reason ?? <span className="text-[var(--ink-muted)]/30">—</span>}
                          </td>
                          <td className="px-5 py-3 text-[12px] text-[var(--ink-muted)] whitespace-nowrap">
                            {txn.createdBy?.name ?? <span className="text-[var(--ink-muted)]/30">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Static Details ── */}
        <div className="space-y-4">
          <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            <div className="border-b border-[var(--line)] px-5 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/70">Static Details</p>
            </div>

            {canManage ? (
              <form action={updatePartAction} className="p-3 space-y-2">
                <input type="hidden" name="partId" value={part.id} />
                <FormField label="SKU Reference" name="sku" defaultValue={part.sku} />
                <FormField label="Item Name"     name="name" defaultValue={part.name} required />
                <FormField label="Manufacturer"  name="manufacturer" defaultValue={part.manufacturer ?? ""} placeholder="Optional" />
                <FormRow>
                  <FormField label="Unit Cost"     name="unitCost"     defaultValue={String(part.unitCost ?? "")} placeholder="0.00" inputMode="decimal" />
                  <FormField label="Reorder Point" name="reorderLevel" defaultValue={String(part.reorderLevel)} placeholder="0"    inputMode="numeric" />
                </FormRow>
                <button type="submit"
                  className="btn-premium mt-1 h-8 w-full rounded-md text-[11px] font-bold uppercase tracking-[0.16em]">
                  Save Details
                </button>
              </form>
            ) : (
              <dl className="divide-y divide-[var(--line)]">
                {[
                  ["SKU Reference", part.sku],
                  ["Item Name",     part.name],
                  ["Manufacturer",  part.manufacturer ?? "—"],
                  ["Unit Cost",     part.unitCost != null ? formatMoney(part.unitCost) : "—"],
                  ["Reorder Point", String(part.reorderLevel)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between px-5 py-2.5">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">{label}</dt>
                    <dd className="text-[13px] font-semibold text-[var(--ink)]">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {/* Reservations */}
          {part.reservations.length > 0 && (
            <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
              <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-2.5">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/70">Reserved For Jobs</p>
                <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                  {part.reservations.length}
                </span>
              </div>
              <ul className="divide-y divide-[var(--line)]">
                {part.reservations.map((res) => (
                  <li key={res.id} className="flex items-center justify-between gap-2 px-5 py-2.5">
                    <div className="min-w-0">
                      {res.job ? (
                        <Link href={`/jobs/${res.job.id}`} className="text-[13px] font-semibold text-[var(--accent)] hover:underline">
                          {res.job.jobNumber ?? `#${res.job.id.slice(-6)}`}
                        </Link>
                      ) : (
                        <p className="text-[13px] text-[var(--ink-muted)]">Job removed</p>
                      )}
                      {res.job?.device && (
                        <p className="truncate text-[11px] text-[var(--ink-muted)]">
                          {res.job.device.brand} {res.job.device.model}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-0.5 text-[12px] font-bold text-amber-700">
                      ×{res.quantity}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
