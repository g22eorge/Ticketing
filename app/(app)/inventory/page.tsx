import Link from "next/link";
import { redirect } from "next/navigation";

import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { requireModule, OrgModule } from "@/lib/module-access";
import { can } from "@/lib/permissions";
import { RowActionsMenu, MenuDestructiveRow } from "@/components/shared/RowActionsMenu";
import { adjustStockAction, createPartAction, togglePartActiveAction, updatePartAction } from "./actions";

type StockStatusFilter = "active" | "inactive" | "all";

type InventoryRow = {
  id: string;
  sku: string;
  name: string;
  manufacturer: string | null;
  qtyOnHand: number;
  reorderLevel: number;
  unitCost: number | null;
  isActive: boolean;
};

export default async function InventoryPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireModule(OrgModule.INVENTORY);
  const { user, orgId } = await requireOrgSession();
  if (!["ADMIN", "MANAGER", "TECH_MANAGER", "OPS", "TECHNICIAN_INTERNAL"].includes(user.role)) {
    redirect("/dashboard");
  }

  const params = (((await searchParams?.catch(() => ({}))) ?? {}) as Record<string, string | string[] | undefined>);
  const created = String(params.created ?? "") === "1";
  const error = typeof params.error === "string" ? params.error : "";
  const showAdd = String(params.add ?? "") === "1";
  const stockFilter = (params.stock ?? "all") as "all" | "low" | "out";
  const requestedStatus = String(params.status ?? "active");
  const statusFilter: StockStatusFilter = requestedStatus === "inactive" || requestedStatus === "all" ? requestedStatus : "active";

  const canManage = can.manageInventory(user);

  const [parts, partStatusCounts, reservationStats, reservedByPart] = await Promise.all([
    prisma.part
      .findMany({
        where: {
          orgId,
          ...(statusFilter === "all" ? {} : { isActive: statusFilter === "active" }),
        },
        select: {
          id: true,
          sku: true,
          name: true,
          manufacturer: true,
          qtyOnHand: true,
          reorderLevel: true,
          unitCost: true,
          isActive: true,
        },
        orderBy: [{ qtyOnHand: "asc" }, { name: "asc" }],
      })
      .catch(() => [] as InventoryRow[]),
    prisma.part
      .groupBy({
        by: ["isActive"],
        where: { orgId },
        _count: { _all: true },
      })
      .catch(() => []),
    prisma.partReservation
      .groupBy({
        by: ["status"],
        where: { part: { orgId } },
        _count: { status: true },
      })
      .catch(() => []),
    prisma.partReservation
      .groupBy({
        by: ["partId"],
        where: { status: "RESERVED", part: { orgId } },
        _sum: { quantity: true },
      })
      .catch(() => []),
  ]);

  const activeParts = parts.filter((part) => part.isActive);
  const activePartCount = partStatusCounts.find((row) => row.isActive)?._count._all ?? 0;
  const inactivePartCount = partStatusCounts.find((row) => !row.isActive)?._count._all ?? 0;
  const totalPartCount = activePartCount + inactivePartCount;
  const reservedMap = new Map<string, number>(
    reservedByPart.map((row: { partId: string; _sum: { quantity: number | null } }) => [row.partId, row._sum.quantity ?? 0]),
  );

  const lowStock = activeParts.filter((part) => part.qtyOnHand <= part.reorderLevel && part.reorderLevel > 0);
  const outOfStock = activeParts.filter((part) => part.qtyOnHand === 0);
  const totalValue = activeParts.reduce((sum, part) => sum + (part.unitCost ?? 0) * part.qtyOnHand, 0);
  const reservedCount = reservationStats.find((row) => row.status === "RESERVED")?._count.status ?? 0;
  const filteredParts = statusFilter === "active" && stockFilter === "low" ? lowStock : statusFilter === "active" && stockFilter === "out" ? outOfStock : parts;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div>
          <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Warehouse</p>
          <p className="text-[13px] font-bold text-[var(--ink)]">Inventory <span className="font-normal text-[var(--ink-muted)]">· {filteredParts.length} parts</span></p>
        </div>
        {canManage && (
            <div className="flex flex-wrap items-center gap-2">
            <Link href="/inventory/locations" className="inline-flex items-center rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">
              Locations
            </Link>
            <Link href="/inventory/transfers" className="inline-flex items-center rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">
              Transfers
            </Link>
            <Link href="/inventory/stock-counts" className="inline-flex items-center rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">
              Stock Counts
            </Link>
            <Link href="/procurement" className="inline-flex items-center rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">
              Procurement
            </Link>
          </div>
        )}
      </div>
      </div>

      {/* KPI strip */}
      <div className="panel-shadow grid grid-cols-2 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] divide-x divide-y divide-[var(--line)] sm:grid-cols-4 sm:divide-y-0">
        <div className="flex items-center gap-3 px-4 py-2">
          <div>
            <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Active Parts</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--ink)]">{activePartCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-2">
          <div>
            <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Low Stock</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-amber-500">{lowStock.length}</p>
            <p className="text-[12px] text-[var(--ink-muted)]">at or below reorder</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-2">
          <div>
            <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Reserved</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--ink)]">{reservedCount}</p>
            <p className="text-[12px] text-[var(--ink-muted)]">units held for jobs</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-2">
          <div>
            <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Stock Value</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--ink)]">{formatMoney(totalValue)}</p>
          </div>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {([
          { label: `Active  ·  ${activePartCount}`, value: "active" },
          { label: `Inactive  ·  ${inactivePartCount}`, value: "inactive" },
          { label: `All  ·  ${totalPartCount}`, value: "all" },
        ] as const).map(({ label, value }) => (
          <Link
            key={value}
            href={`/inventory?status=${value}`}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${
              statusFilter === value
                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                : "border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--ink)]"
            } ${value === "inactive" && inactivePartCount > 0 && statusFilter !== "inactive" ? "border-amber-400/50 text-amber-600" : ""}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {statusFilter === "active" ? (
        <div className="flex flex-wrap gap-2">
        {([
          { label: `All Stock  ·  ${activeParts.length}`, value: "all" },
          { label: `Low Stock  ·  ${lowStock.length}`, value: "low" },
          { label: `Out of Stock  ·  ${outOfStock.length}`, value: "out" },
        ] as const).map(({ label, value }) => (
          <Link
            key={value}
            href={`/inventory?stock=${value}&status=active`}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${
              stockFilter === value
                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                : "border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--ink)]"
            } ${value === "low" && lowStock.length > 0 && stockFilter !== "low" ? "border-amber-400/50 text-amber-600" : ""} ${value === "out" && outOfStock.length > 0 && stockFilter !== "out" ? "border-red-400/50 text-red-600" : ""}`}
          >
            {label}
          </Link>
        ))}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</div>
      ) : null}
      {created ? (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">Part added successfully.</div>
      ) : null}

      {/* Add Part — shown only when ?add=1 */}
      {canManage && showAdd ? (
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
          <p className="mb-2.5 text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">Add Part</p>
          <form action={createPartAction}>
            <div className="grid gap-2 md:grid-cols-[0.8fr_1.4fr_1fr_0.7fr_0.7fr_auto]">
              <input name="sku" placeholder="SKU *" required className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/14" />
              <input name="name" placeholder="Part name *" required className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/14" />
              <input name="manufacturer" placeholder="Maker" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/14" />
              <input name="unitCost" placeholder="Cost" inputMode="decimal" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/14" />
              <input name="reorderLevel" placeholder="Reorder" inputMode="numeric" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/14" />
              <button type="submit" className="btn-premium rounded-lg px-4 py-1.5 text-[13px] font-semibold">Add Part</button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Stock table */}
      <div className="rounded-xl border border-[var(--line)]">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--panel)] px-4 py-3 rounded-t-xl">
          <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">Stock Monitor</p>
          {canManage ? (
            <Link
              href={showAdd ? "/inventory" : "/inventory?add=1"}
              className={`rounded-lg border px-3 py-1.5 text-[12px] font-bold transition ${
                showAdd
                  ? "border-[var(--line)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  : "border-[var(--accent)]/40 bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
              }`}
            >
              {showAdd ? "✕ Cancel" : "+ Add Part"}
            </Link>
          ) : null}
        </div>

        {filteredParts.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-[var(--ink-muted)]">
            {statusFilter === "inactive" ? "No inactive parts." : stockFilter === "low" ? "No low-stock parts." : stockFilter === "out" ? "No out-of-stock parts." : <>No parts yet.{canManage ? <> <Link href="#add-part" className="text-[var(--accent)] hover:underline">Add your first part</Link> above.</> : null}</>}
          </div>
        ) : (
          <div className="doc-list overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--panel-strong)] text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                <tr>
                  <th className="px-4 py-2.5 text-left">Part</th>
                  <th className="hidden px-4 py-2.5 text-left sm:table-cell">SKU</th>
                  <th className="hidden px-4 py-2.5 text-left lg:table-cell">Maker</th>
                  <th className="hidden px-4 py-2.5 text-right lg:table-cell">Unit Cost</th>
                  <th className="px-4 py-2.5 text-right">On Hand</th>
                  <th className="hidden px-4 py-2.5 text-right md:table-cell">Reserved</th>
                  <th className="px-4 py-2.5 text-right">Available</th>
                  <th className="hidden px-4 py-2.5 text-right xl:table-cell">Value</th>
                  <th className="hidden px-4 py-2.5 text-right sm:table-cell">Reorder</th>
                  {canManage ? <th className="px-4 py-2.5 text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {filteredParts.map((part) => {
                  const isLow = part.reorderLevel > 0 && part.qtyOnHand <= part.reorderLevel;
                  const reserved = reservedMap.get(part.id) ?? 0;
                  const available = part.qtyOnHand - reserved;
                  const unitCost = part.unitCost ?? 0;
                  const stockValue = unitCost * part.qtyOnHand;
                  return (
                    <tr key={part.id} className={"border-t border-[var(--line)] " + (isLow ? "bg-amber-500/8" : "hover:bg-[var(--panel-strong)]/40")}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[var(--ink)]">{part.name}</p>
                        {!part.isActive ? <p className="mt-0.5 text-[12px] font-semibold text-[var(--ink-muted)]">Inactive</p> : null}
                        {isLow ? <p className="mt-0.5 text-[12px] font-semibold text-amber-600">Low stock</p> : null}
                        <p className="mt-0.5 text-[12px] text-[var(--ink-muted)] sm:hidden">{part.sku}{part.manufacturer ? ` · ${part.manufacturer}` : ""}</p>
                      </td>
                      <td className="hidden px-4 py-3 text-[var(--ink-muted)] sm:table-cell">{part.sku}</td>
                      <td className="hidden px-4 py-3 text-[var(--ink-muted)] lg:table-cell">{part.manufacturer ?? "—"}</td>
                      <td className="hidden px-4 py-3 text-right tabular-nums text-[var(--ink-muted)] lg:table-cell">{part.unitCost != null ? formatMoney(part.unitCost) : "—"}</td>
                      <td className="px-4 py-3 text-right font-semibold text-[var(--ink)]">{part.qtyOnHand}</td>
                      <td className="hidden px-4 py-3 text-right text-[var(--ink-muted)] md:table-cell">{reserved}</td>
                      <td className={"px-4 py-3 text-right font-semibold " + (available < 0 ? "text-red-500" : available === 0 ? "text-amber-600" : "text-[var(--ink)]")}>{available}</td>
                      <td className="hidden px-4 py-3 text-right tabular-nums text-[var(--ink)] xl:table-cell">{formatMoney(stockValue)}</td>
                      <td className="hidden px-4 py-3 text-right text-[var(--ink-muted)] sm:table-cell">{part.reorderLevel}</td>
                      {canManage ? (
                        <td className="px-4 py-3 text-right">
                          <RowActionsMenu label="Part actions" size="compact">
                            <details className="border-b border-[var(--line)]">
                              <summary className="cursor-pointer px-2.5 py-1.5 text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]/70 hover:bg-[var(--panel-strong)]">
                                Part Details
                              </summary>
                              <form action={updatePartAction} className="space-y-1.5 p-2 pt-0">
                                <input type="hidden" name="partId" value={part.id} />
                                <input name="sku" defaultValue={part.sku} required className="h-7 w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 text-[11px] outline-none focus:border-[var(--accent)]/50" />
                                <input name="name" defaultValue={part.name} required className="h-7 w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 text-[11px] outline-none focus:border-[var(--accent)]/50" />
                                <input name="manufacturer" defaultValue={part.manufacturer ?? ""} placeholder="Maker" className="h-7 w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 text-[11px] outline-none focus:border-[var(--accent)]/50" />
                                <div className="grid grid-cols-2 gap-1.5">
                                  <input name="unitCost" defaultValue={part.unitCost ?? ""} placeholder="Cost" inputMode="decimal" className="h-7 min-w-0 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 text-[11px] outline-none focus:border-[var(--accent)]/50" />
                                  <input name="reorderLevel" defaultValue={part.reorderLevel} placeholder="Reorder" inputMode="numeric" className="h-7 min-w-0 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 text-[11px] outline-none focus:border-[var(--accent)]/50" />
                                </div>
                                <button type="submit" className="btn-premium h-7 w-full rounded-md px-2 text-[11px] font-semibold">Save Details</button>
                              </form>
                            </details>
                            <details open className="border-b border-[var(--line)]">
                              <summary className="cursor-pointer px-2.5 py-1.5 text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]/70 hover:bg-[var(--panel-strong)]">
                                Adjust Stock
                              </summary>
                              <form action={adjustStockAction} className="space-y-1.5 p-2 pt-0">
                                <input type="hidden" name="partId" value={part.id} />
                                <div className="flex gap-1.5">
                                  <select name="type" defaultValue="IN" className="h-7 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-1.5 text-[11px] text-[var(--ink)] outline-none focus:border-[var(--accent)]/50">
                                    <option value="IN">Stock In</option>
                                    <option value="OUT">Stock Out</option>
                                    <option value="ADJUST">Adjust</option>
                                  </select>
                                  <input name="quantity" inputMode="numeric" placeholder="Qty" className="h-7 min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 text-[11px] outline-none focus:border-[var(--accent)]/50" />
                                </div>
                                <input name="reason" placeholder="Reason" className="h-7 w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 text-[11px] outline-none focus:border-[var(--accent)]/50" />
                                <button type="submit" className="btn-premium h-7 w-full rounded-md px-2 text-[11px] font-semibold">Save</button>
                              </form>
                            </details>
                            <MenuDestructiveRow>
                              <form action={togglePartActiveAction}>
                                <input type="hidden" name="partId" value={part.id} />
                                <input type="hidden" name="next" value={part.isActive ? "0" : "1"} />
                                <button type="submit" className={`text-xs font-semibold transition ${part.isActive ? "text-red-600 hover:text-red-700" : "text-emerald-700 hover:text-emerald-800"}`}>
                                  {part.isActive ? "Deactivate Part" : "Reactivate Part"}
                                </button>
                              </form>
                            </MenuDestructiveRow>
                          </RowActionsMenu>
                        </td>
                      ) : null}
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
