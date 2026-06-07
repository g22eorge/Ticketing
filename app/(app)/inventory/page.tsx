import Link from "next/link";
import { redirect } from "next/navigation";

import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { requireModule, OrgModule } from "@/lib/module-access";
import { can } from "@/lib/permissions";
import { createPartAction } from "./actions";

type StockStatusFilter = "active" | "inactive" | "all";

type InventoryRow = {
  id: string;
  sku: string;
  name: string;
  manufacturer: string | null;
  qtyOnHand: number;
  qtyReserved: number;
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
  const q = typeof params.q === "string" ? params.q.trim() : "";

  const canManage = can.manageInventory(user);

  const [parts, partStatusCounts] = await Promise.all([
    prisma.part
      .findMany({
        where: {
          orgId,
          ...(statusFilter === "all" ? {} : { isActive: statusFilter === "active" }),
          ...(q ? { OR: [{ name: { contains: q } }, { sku: { contains: q } }, { manufacturer: { contains: q } }] } : {}),
        },
        select: {
          id: true,
          sku: true,
          name: true,
          manufacturer: true,
          qtyOnHand: true,
          qtyReserved: true,
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
  ]);

  const activeParts = parts.filter((p) => p.isActive);
  const activePartCount = partStatusCounts.find((r) => r.isActive)?._count._all ?? 0;
  const inactivePartCount = partStatusCounts.find((r) => !r.isActive)?._count._all ?? 0;
  const totalPartCount = activePartCount + inactivePartCount;

  const lowStock = activeParts.filter((p) => p.qtyOnHand <= p.reorderLevel && p.reorderLevel > 0);
  const outOfStock = activeParts.filter((p) => p.qtyOnHand === 0);
  const totalValue = activeParts.reduce((sum, p) => sum + (p.unitCost ?? 0) * p.qtyOnHand, 0);
  const totalReserved = activeParts.reduce((sum, p) => sum + p.qtyReserved, 0);

  const filteredParts =
    statusFilter === "active" && stockFilter === "low" ? lowStock
    : statusFilter === "active" && stockFilter === "out" ? outOfStock
    : parts;

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Warehouse</p>
            <p className="text-[13px] font-bold text-[var(--ink)]">Inventory</p>
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
        <div className="px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Active Parts</p>
          <p className="text-[18px] font-black tabular-nums leading-tight text-[var(--ink)]">{activePartCount}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Low Stock</p>
          <p className="text-[18px] font-black tabular-nums leading-tight text-amber-500">{lowStock.length}</p>
          <p className="text-[11px] text-[var(--ink-muted)]">at or below reorder</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Reserved</p>
          <p className="text-[18px] font-black tabular-nums leading-tight text-[var(--ink)]">{totalReserved}</p>
          <p className="text-[11px] text-[var(--ink-muted)]">units held for jobs</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Stock Value</p>
          <p className="text-[18px] font-black tabular-nums leading-tight text-[var(--ink)]">{formatMoney(totalValue)}</p>
        </div>
      </div>

      {/* Filters + search row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Status tabs */}
        {([
          { label: `Active · ${activePartCount}`, value: "active" },
          { label: `Inactive · ${inactivePartCount}`, value: "inactive" },
          { label: `All · ${totalPartCount}`, value: "all" },
        ] as const).map(({ label, value }) => (
          <Link
            key={value}
            href={`/inventory?status=${value}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${
              statusFilter === value
                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                : "border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--ink)]"
            } ${value === "inactive" && inactivePartCount > 0 && statusFilter !== "inactive" ? "border-amber-400/50 text-amber-600" : ""}`}
          >
            {label}
          </Link>
        ))}

        {/* Stock sub-tabs (active only) */}
        {statusFilter === "active" && (
          <>
            <span className="text-[var(--line)]">|</span>
            {([
              { label: `All stock · ${activeParts.length}`, value: "all" },
              { label: `Low · ${lowStock.length}`, value: "low" },
              { label: `Out · ${outOfStock.length}`, value: "out" },
            ] as const).map(({ label, value }) => (
              <Link
                key={value}
                href={`/inventory?stock=${value}&status=active${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${
                  stockFilter === value
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--ink)]"
                } ${value === "low" && lowStock.length > 0 && stockFilter !== "low" ? "border-amber-400/50 text-amber-600" : ""} ${value === "out" && outOfStock.length > 0 && stockFilter !== "out" ? "border-red-400/50 text-red-600" : ""}`}
              >
                {label}
              </Link>
            ))}
          </>
        )}

        {/* Search — pushes right on wide screens */}
        <form method="GET" action="/inventory" className="ml-auto flex items-center gap-1.5">
          <input type="hidden" name="status" value={statusFilter} />
          {stockFilter !== "all" && <input type="hidden" name="stock" value={stockFilter} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search parts…"
            className="h-8 w-44 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-[13px] outline-none placeholder:text-[var(--ink-muted)]/50 focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/14"
          />
          {q && (
            <Link href={`/inventory?status=${statusFilter}`} className="text-[12px] text-[var(--ink-muted)] hover:text-[var(--ink)]">
              ✕
            </Link>
          )}
        </form>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</div>
      )}
      {created && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">Part added successfully.</div>
      )}

      {/* ── Reorder Alert ── */}
      {(outOfStock.length > 0 || lowStock.length > 0) && statusFilter === "active" && !q && stockFilter === "all" && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-amber-500/15">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-600 dark:text-amber-400">Reorder Needed</p>
          </div>
          {outOfStock.length > 0 && (
            <Link href="/inventory?stock=out&status=active" className="flex items-center justify-between px-4 py-3 hover:bg-amber-500/5 transition-colors">
              <div>
                <p className="text-[13px] font-semibold text-red-500">{outOfStock.length} part{outOfStock.length > 1 ? "s" : ""} out of stock</p>
                <p className="text-[12px] text-[var(--ink-muted)]">{outOfStock.slice(0, 3).map(p => p.name).join(", ")}{outOfStock.length > 3 ? ` +${outOfStock.length - 3} more` : ""}</p>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400 shrink-0"><path d="M9 18l6-6-6-6"/></svg>
            </Link>
          )}
          {lowStock.filter(p => p.qtyOnHand > 0).length > 0 && (
            <Link href="/inventory?stock=low&status=active" className="flex items-center justify-between px-4 py-3 border-t border-amber-500/15 hover:bg-amber-500/5 transition-colors">
              <div>
                <p className="text-[13px] font-semibold text-amber-600 dark:text-amber-400">{lowStock.filter(p => p.qtyOnHand > 0).length} part{lowStock.filter(p => p.qtyOnHand > 0).length > 1 ? "s" : ""} running low</p>
                <p className="text-[12px] text-[var(--ink-muted)]">At or below reorder threshold — order before they run out</p>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400 shrink-0"><path d="M9 18l6-6-6-6"/></svg>
            </Link>
          )}
          {canManage && (
            <div className="border-t border-amber-500/15 px-4 py-2.5">
              <Link href="/procurement" className="text-[12px] font-semibold text-amber-600 dark:text-amber-400 hover:underline">
                Go to Procurement →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Add Part panel */}
      {canManage && showAdd && (
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">Add Part</p>
          <form action={createPartAction}>
            <div className="grid gap-2 sm:grid-cols-[0.8fr_1.4fr_1fr_0.7fr_0.7fr_auto]">
              <input name="sku" placeholder="SKU *" required className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 text-[13px] outline-none focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/14" />
              <input name="name" placeholder="Part name *" required className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 text-[13px] outline-none focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/14" />
              <input name="manufacturer" placeholder="Manufacturer" className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 text-[13px] outline-none focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/14" />
              <input name="unitCost" placeholder="Unit cost" inputMode="decimal" className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 text-[13px] outline-none focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/14" />
              <input name="reorderLevel" placeholder="Reorder at" inputMode="numeric" className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 text-[13px] outline-none focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/14" />
              <button type="submit" className="btn-premium h-9 rounded-lg px-4 text-[13px] font-semibold">Add</button>
            </div>
          </form>
        </div>
      )}

      {/* Parts table */}
      <div className="rounded-xl border border-[var(--line)]">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--panel)] px-4 py-3 rounded-t-xl">
          <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">
            Parts <span className="font-normal normal-case tracking-normal text-[var(--ink-muted)]">· {filteredParts.length}{q ? ` matching "${q}"` : ""}</span>
          </p>
          {canManage && (
            <Link
              href={showAdd ? `/inventory?status=${statusFilter}` : `/inventory?add=1&status=${statusFilter}`}
              className={`rounded-lg border px-3 py-1.5 text-[12px] font-bold transition ${
                showAdd
                  ? "border-[var(--line)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  : "border-[var(--accent)]/40 bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
              }`}
            >
              {showAdd ? "✕ Cancel" : "+ Add Part"}
            </Link>
          )}
        </div>

        {filteredParts.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-[var(--ink-muted)]">
            {q
              ? <>No parts match &ldquo;{q}&rdquo;. <Link href={`/inventory?status=${statusFilter}`} className="text-[var(--accent)] hover:underline">Clear search</Link></>
              : statusFilter === "inactive" ? "No inactive parts."
              : stockFilter === "low" ? "No parts at or below reorder level."
              : stockFilter === "out" ? "No parts out of stock."
              : <>No parts yet.{canManage ? <> <Link href="/inventory?add=1" className="text-[var(--accent)] hover:underline">Add your first part.</Link></> : null}</>
            }
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--panel-strong)] text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                <tr>
                  <th className="px-4 py-2.5 text-left">Part</th>
                  <th className="hidden px-4 py-2.5 text-left md:table-cell">Maker</th>
                  <th className="hidden px-4 py-2.5 text-right lg:table-cell">Unit Cost</th>
                  <th className="px-4 py-2.5 text-right">On Hand</th>
                  <th className="hidden px-4 py-2.5 text-right sm:table-cell">Reserved</th>
                  <th className="px-4 py-2.5 text-right">Available</th>
                  <th className="hidden px-4 py-2.5 text-right xl:table-cell">Value</th>
                  <th className="hidden px-4 py-2.5 text-right sm:table-cell">Reorder</th>
                </tr>
              </thead>
              <tbody>
                {filteredParts.map((part) => {
                  const isLow = part.reorderLevel > 0 && part.qtyOnHand <= part.reorderLevel;
                  const isOut = part.qtyOnHand === 0;
                  const available = part.qtyOnHand - part.qtyReserved;
                  const stockValue = (part.unitCost ?? 0) * part.qtyOnHand;
                  return (
                    <tr
                      key={part.id}
                      className={"border-t border-[var(--line)] " + (isLow ? "bg-amber-500/5" : "hover:bg-[var(--panel-strong)]/40")}
                    >
                      <td className="px-4 py-3">
                        <Link href={`/inventory/${part.id}`} className="group flex flex-col gap-0.5">
                          <span className="font-semibold text-[var(--ink)] group-hover:text-[var(--accent)] transition-colors">{part.name}</span>
                          <span className="text-[11px] font-mono text-[var(--ink-muted)]">{part.sku}</span>
                          <span className="text-[11px] text-[var(--ink-muted)] md:hidden">{part.manufacturer ?? ""}</span>
                          {!part.isActive && <span className="text-[11px] font-semibold text-amber-600">Inactive</span>}
                          {isOut && part.isActive && <span className="text-[11px] font-semibold text-red-600">Out of stock</span>}
                          {isLow && !isOut && <span className="text-[11px] font-semibold text-amber-600">Low stock</span>}
                        </Link>
                      </td>
                      <td className="hidden px-4 py-3 text-[12px] text-[var(--ink-muted)] md:table-cell">{part.manufacturer ?? "—"}</td>
                      <td className="hidden px-4 py-3 text-right tabular-nums text-[12px] text-[var(--ink-muted)] lg:table-cell">{part.unitCost != null ? formatMoney(part.unitCost) : "—"}</td>
                      <td className={`px-4 py-3 text-right font-semibold tabular-nums ${isOut ? "text-red-500" : isLow ? "text-amber-600" : "text-[var(--ink)]"}`}>{part.qtyOnHand}</td>
                      <td className="hidden px-4 py-3 text-right tabular-nums text-[12px] text-[var(--ink-muted)] sm:table-cell">{part.qtyReserved}</td>
                      <td className={`px-4 py-3 text-right font-semibold tabular-nums ${available <= 0 ? "text-red-500" : "text-[var(--ink)]"}`}>{available}</td>
                      <td className="hidden px-4 py-3 text-right tabular-nums text-[12px] text-[var(--ink)] xl:table-cell">{formatMoney(stockValue)}</td>
                      <td className="hidden px-4 py-3 text-right tabular-nums text-[12px] text-[var(--ink-muted)] sm:table-cell">{part.reorderLevel || "—"}</td>
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
