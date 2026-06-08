import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { requireModule, OrgModule } from "@/lib/module-access";
import { can } from "@/lib/permissions";
import {
  approveStockTransferAction,
  cancelStockTransferAction,
  createStockTransferAction,
  dispatchStockTransferAction,
  receiveStockTransferAction,
} from "./actions";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  REQUESTED: "border-sky-500/30 bg-sky-500/15 text-sky-700",
  APPROVED: "border-amber-500/30 bg-amber-500/15 text-amber-700",
  DISPATCHED: "border-purple-500/30 bg-purple-500/15 text-purple-700",
  RECEIVED: "border-emerald-500/30 bg-emerald-500/15 text-emerald-700",
  CANCELLED: "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",
};

function fmt(d: Date | null) {
  return d ? d.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

export default async function StockTransfersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireModule(OrgModule.INVENTORY);
  const { user, orgId } = await requireOrgSession();
  if (!can.manageInventory(user)) redirect("/inventory");

  const params = (((await searchParams?.catch(() => ({}))) ?? {}) as Record<string, string | string[] | undefined>);
  const created = String(params.created ?? "") === "1";
  const error = typeof params.error === "string" ? params.error : "";

  const [transfers, locations, parts] = await Promise.all([
    prisma.stockTransfer.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      include: { items: { include: { part: { select: { sku: true, name: true } } } } },
      take: 100,
    }).catch(() => []),
    prisma.stockLocation.findMany({ where: { orgId, isActive: true }, orderBy: { name: "asc" } }).catch(() => []),
    prisma.part.findMany({ where: { orgId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, sku: true, name: true } }),
  ]);
  const locationName = new Map(locations.map((location) => [location.id, location.name]));

  return (
    <div className="space-y-4">
      <div className="panel-shadow flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
        <p className="text-[13px] font-bold text-[var(--ink)]">
          Stock Transfers · <span className="font-normal text-[var(--ink-muted)]">{transfers.length}</span>
        </p>
        <div className="flex items-center gap-2">
          <Link href="/inventory/locations" className="inline-flex items-center rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">Locations</Link>
          <Link href="/inventory" className="inline-flex items-center rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">← Inventory</Link>
        </div>
      </div>

      {created ? <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">Transfer requested.</div> : null}
      {error ? <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</div> : null}

      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
        <p className="mb-2.5 text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">Request Transfer</p>
        <form action={createStockTransferAction} className="grid gap-2 lg:grid-cols-[1fr_1fr_1.4fr_0.55fr_1fr_auto]">
          <select name="fromLocationId" required className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60">
            <option value="">From location</option>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
          <select name="toLocationId" required className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60">
            <option value="">To location</option>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
          <select name="partId" required className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60">
            <option value="">Item</option>
            {parts.map((part) => <option key={part.id} value={part.id}>{part.sku} · {part.name}</option>)}
          </select>
          <input name="quantity" placeholder="Qty" inputMode="numeric" required className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60" />
          <input name="note" placeholder="Note" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60" />
          <button type="submit" className="btn-premium rounded-lg px-4 py-1.5 text-[13px] font-semibold">Request</button>
        </form>
      </div>

      <div className="rounded-xl border border-[var(--line)]">
        {transfers.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-[var(--ink-muted)]">No transfer requests yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--panel-strong)] text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                <tr>
                  <th className="px-4 py-2.5 text-left">Transfer</th>
                  <th className="px-4 py-2.5 text-left">Route</th>
                  <th className="px-4 py-2.5 text-left">Item</th>
                  <th className="px-4 py-2.5 text-left">Status</th>
                  <th className="hidden px-4 py-2.5 text-left md:table-cell">Date</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((transfer) => {
                  const first = transfer.items[0];
                  const itemLabel = first ? `${first.part.sku} · ${first.part.name} x${first.quantity}` : "No items";
                  return (
                    <tr key={transfer.id} className="border-t border-[var(--line)] align-middle hover:bg-[var(--panel-strong)]/40">
                      <td className="px-4 py-3 font-mono font-semibold text-[var(--ink)]">{transfer.transferNumber}</td>
                      <td className="px-4 py-3 text-[var(--ink-muted)]">{locationName.get(transfer.fromLocationId) ?? "From"} → {locationName.get(transfer.toLocationId) ?? "To"}</td>
                      <td className="px-4 py-3 text-[var(--ink)]">{itemLabel}</td>
                      <td className="px-4 py-3"><span className={`rounded-full border px-2.5 py-0.5 text-[13px] font-semibold ${STATUS_STYLE[transfer.status] ?? STATUS_STYLE.REQUESTED}`}>{transfer.status.replaceAll("_", " ")}</span></td>
                      <td className="hidden px-4 py-3 text-[var(--ink-muted)] md:table-cell">{fmt(transfer.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {transfer.status === "REQUESTED" ? <form action={approveStockTransferAction}><input type="hidden" name="id" value={transfer.id} /><button type="submit" className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-xs font-semibold text-[var(--ink)] hover:border-[var(--accent)]/50">Approve</button></form> : null}
                          {transfer.status === "APPROVED" ? <form action={dispatchStockTransferAction}><input type="hidden" name="id" value={transfer.id} /><button type="submit" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700">Dispatch</button></form> : null}
                          {transfer.status === "DISPATCHED" ? <form action={receiveStockTransferAction}><input type="hidden" name="id" value={transfer.id} /><button type="submit" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700">Receive</button></form> : null}
                          {transfer.status === "REQUESTED" || transfer.status === "APPROVED" ? <form action={cancelStockTransferAction}><input type="hidden" name="id" value={transfer.id} /><button type="submit" className="rounded-lg border border-red-500/20 px-2.5 py-1 text-xs font-semibold text-red-600">Cancel</button></form> : null}
                        </div>
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
  );
}
