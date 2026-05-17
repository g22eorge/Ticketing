import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { requireModule, OrgModule } from "@/lib/module-access";
import { can } from "@/lib/permissions";
import { checkPartLimit } from "@/lib/plan-limits";
import { RowActionsMenu, MenuSection, MenuDestructiveRow } from "@/components/shared/RowActionsMenu";

type StockTxnType = "IN" | "OUT" | "ADJUST";

type InventoryRow = {
  id: string;
  sku: string;
  name: string;
  manufacturer: string | null;
  qtyOnHand: number;
  reorderLevel: number;
  unitCost: number | null;
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

  const canManage = can.manageInventory(user);

  async function createPartAction(formData: FormData) {
    "use server";
    const { user, orgId: createOrgId } = await requireOrgSession();
    if (!can.manageInventory(user)) redirect("/dashboard");
    const sku = String(formData.get("sku") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const manufacturer = String(formData.get("manufacturer") ?? "").trim();
    const unitCostRaw = String(formData.get("unitCost") ?? "").trim();
    const reorderRaw = String(formData.get("reorderLevel") ?? "").trim();

    if (!sku || !name) return;
    const unitCost = unitCostRaw ? Number(unitCostRaw) : null;
    const reorderLevel = reorderRaw ? Math.max(0, Math.floor(Number(reorderRaw))) : 0;

    const partLimit = await checkPartLimit(createOrgId);
    if (!partLimit.allowed) {
      redirect(`/inventory?error=${encodeURIComponent(partLimit.reason)}`);
    }

    try {
      await prisma.part.create({
        data: {
          orgId: createOrgId,
          sku,
          name,
          manufacturer: manufacturer || null,
          unitCost: unitCost !== null && Number.isFinite(unitCost) ? unitCost : null,
          reorderLevel,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isUnique = message.includes("Unique constraint") || message.includes("P2002") || message.toLowerCase().includes("unique");
      const qs = new URLSearchParams({ error: isUnique ? "SKU already exists" : "Failed to add part" }).toString();
      redirect(`/inventory?${qs}#add-part`);
    }

    revalidatePath("/inventory");
    redirect("/inventory?created=1#add-part");
  }

  async function adjustStockAction(formData: FormData) {
    "use server";
    const { session, user, orgId: adjustOrgId } = await requireOrgSession();
    if (!can.manageInventory(user)) redirect("/dashboard");
    const partId = String(formData.get("partId") ?? "").trim();
    const type = String(formData.get("type") ?? "").trim().toUpperCase() as StockTxnType;
    const qty = Math.floor(Number(String(formData.get("quantity") ?? "0").trim()));
    const reason = String(formData.get("reason") ?? "").trim();

    if (!partId) return;
    if (!(["IN", "OUT", "ADJUST"] as const).includes(type)) return;
    if (!Number.isFinite(qty) || qty === 0) return;

    await prisma.$transaction(async (tx) => {
      const part = await tx.part.findUnique({ where: { id: partId, orgId: adjustOrgId }, select: { qtyOnHand: true, unitCost: true } });
      if (!part) return;

      const nextQty =
        type === "IN" ? part.qtyOnHand + Math.abs(qty)
        : type === "OUT" ? part.qtyOnHand - Math.abs(qty)
        : part.qtyOnHand + qty;

      // Prevent negative stock in normal operation.
      if (nextQty < 0) return;

      await tx.part.update({ where: { id: partId }, data: { qtyOnHand: nextQty } });
      await tx.partStockTransaction.create({
        data: {
          partId,
          type,
          quantity: type === "IN" ? Math.abs(qty) : type === "OUT" ? Math.abs(qty) : qty,
          reason: reason || null,
          createdById: session.user.id,
        },
      });
    });

    revalidatePath("/inventory");
  }

  async function togglePartActiveAction(formData: FormData) {
    "use server";
    const { user, orgId: toggleOrgId } = await requireOrgSession();
    if (!can.manageInventory(user)) redirect("/dashboard");
    const partId = String(formData.get("partId") ?? "").trim();
    const next = String(formData.get("next") ?? "").trim();
    if (!partId) return;

    await prisma.part.update({ where: { id: partId, orgId: toggleOrgId }, data: { isActive: next === "1" } });
    revalidatePath("/inventory");
  }

  async function updatePartAction(formData: FormData) {
    "use server";
    const { user, orgId: updateOrgId } = await requireOrgSession();
    if (!can.manageInventory(user)) redirect("/dashboard");
    const partId = String(formData.get("partId") ?? "").trim();
    const sku = String(formData.get("sku") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const manufacturer = String(formData.get("manufacturer") ?? "").trim();
    const unitCostRaw = String(formData.get("unitCost") ?? "").trim();
    const reorderRaw = String(formData.get("reorderLevel") ?? "").trim();
    if (!partId || !sku || !name) return;

    const unitCost = unitCostRaw ? Number(unitCostRaw) : null;
    const reorderLevel = reorderRaw ? Math.max(0, Math.floor(Number(reorderRaw))) : 0;

    await prisma.part.updateMany({
      where: { id: partId, orgId: updateOrgId },
      data: {
        sku,
        name,
        manufacturer: manufacturer || null,
        unitCost: unitCost !== null && Number.isFinite(unitCost) ? unitCost : null,
        reorderLevel,
      },
    });
    revalidatePath("/inventory");
  }

  const [parts, reservationStats, reservedByPart] = await Promise.all([
    prisma.part
      .findMany({
        where: { orgId, isActive: true },
        select: {
          id: true,
          sku: true,
          name: true,
          manufacturer: true,
          qtyOnHand: true,
          reorderLevel: true,
          unitCost: true,
        },
        orderBy: [{ qtyOnHand: "asc" }, { name: "asc" }],
      })
      .catch(() => [] as InventoryRow[]),
    prisma.partReservation
      .groupBy({
        by: ["status"],
        _count: { status: true },
      })
      .catch(() => []),
    prisma.partReservation
      .groupBy({
        by: ["partId"],
        where: { status: "RESERVED" },
        _sum: { quantity: true },
      })
      .catch(() => []),
  ]);

  const reservedMap = new Map<string, number>(
    reservedByPart.map((row: { partId: string; _sum: { quantity: number | null } }) => [row.partId, row._sum.quantity ?? 0]),
  );

  const lowStock = parts.filter((part) => part.qtyOnHand <= part.reorderLevel && part.reorderLevel > 0);
  const totalValue = parts.reduce((sum, part) => sum + (part.unitCost ?? 0) * part.qtyOnHand, 0);
  const reservedCount = reservationStats.find((row) => row.status === "RESERVED")?._count.status ?? 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="panel-shadow flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
        <p className="text-[13px] font-bold text-[var(--ink)]">
          Inventory{" "}
          <span className="font-normal text-[var(--ink-muted)]">· {parts.length} parts</span>
        </p>
        {canManage && (
            <div className="flex flex-wrap items-center gap-2">
            <Link href="/inventory/locations" className="inline-flex items-center rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">
              Locations
            </Link>
            <Link href="/inventory/transfers" className="inline-flex items-center rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">
              Transfers
            </Link>
            <Link href="/inventory/suppliers" className="inline-flex items-center rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">
              Suppliers
            </Link>
            <Link href="/inventory/purchase-orders" className="inline-flex items-center rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">
              Purchase Orders
            </Link>
          </div>
        )}
      </div>

      {/* KPI strip */}
      <div className="panel-shadow grid grid-cols-2 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] divide-x divide-y divide-[var(--line)] sm:grid-cols-4 sm:divide-y-0">
        <div className="flex items-center gap-3 px-4 py-2">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Active Parts</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--ink)]">{parts.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-2">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Low Stock</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-amber-500">{lowStock.length}</p>
            <p className="text-[10px] text-[var(--ink-muted)]">at or below reorder</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-2">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Reserved</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--ink)]">{reservedCount}</p>
            <p className="text-[10px] text-[var(--ink-muted)]">units held for jobs</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-2">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Stock Value</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--ink)]">{formatMoney(totalValue)}</p>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</div>
      ) : null}
      {created ? (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">Part added successfully.</div>
      ) : null}

      {/* Add Part — shown only when ?add=1 */}
      {canManage && showAdd ? (
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">Add Part</p>
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
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">Stock Monitor</p>
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

        {parts.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-[var(--ink-muted)]">
            No parts yet.{canManage ? <> <Link href="#add-part" className="text-[var(--accent)] hover:underline">Add your first part</Link> above.</> : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--panel-strong)] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
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
                {parts.map((part) => {
                  const isLow = part.reorderLevel > 0 && part.qtyOnHand <= part.reorderLevel;
                  const reserved = reservedMap.get(part.id) ?? 0;
                  const available = part.qtyOnHand - reserved;
                  const unitCost = part.unitCost ?? 0;
                  const stockValue = unitCost * part.qtyOnHand;
                  return (
                    <tr key={part.id} className={"border-t border-[var(--line)] " + (isLow ? "bg-amber-500/8" : "hover:bg-[var(--panel-strong)]/40")}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[var(--ink)]">{part.name}</p>
                        {isLow ? <p className="mt-0.5 text-[10px] font-semibold text-amber-600">Low stock</p> : null}
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
                          <RowActionsMenu label="Part actions">
                            <MenuSection label="Part Details" />
                            <form action={updatePartAction} className="space-y-2 p-3">
                              <input type="hidden" name="partId" value={part.id} />
                              <input name="sku" defaultValue={part.sku} required className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                              <input name="name" defaultValue={part.name} required className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                              <input name="manufacturer" defaultValue={part.manufacturer ?? ""} placeholder="Maker" className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                              <div className="grid grid-cols-2 gap-2">
                                <input name="unitCost" defaultValue={part.unitCost ?? ""} placeholder="Unit cost" inputMode="decimal" className="min-w-0 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                                <input name="reorderLevel" defaultValue={part.reorderLevel} placeholder="Reorder" inputMode="numeric" className="min-w-0 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                              </div>
                              <button type="submit" className="btn-premium w-full rounded-lg px-3 py-1.5 text-xs font-semibold">Save Details</button>
                            </form>
                            <MenuSection label="Adjust Stock" />
                            <form action={adjustStockAction} className="space-y-2 p-3">
                              <input type="hidden" name="partId" value={part.id} />
                              <div className="flex gap-2">
                                <select name="type" defaultValue="IN" className="rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]/50">
                                  <option value="IN">Stock In</option>
                                  <option value="OUT">Stock Out</option>
                                  <option value="ADJUST">Adjust</option>
                                </select>
                                <input name="quantity" inputMode="numeric" placeholder="Qty" className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                              </div>
                              <input name="reason" placeholder="Reason (optional)" className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                              <button type="submit" className="btn-premium w-full rounded-lg px-3 py-1.5 text-xs font-semibold">Save</button>
                            </form>
                            <MenuDestructiveRow>
                              <form action={togglePartActiveAction}>
                                <input type="hidden" name="partId" value={part.id} />
                                <input type="hidden" name="next" value="0" />
                                <button type="submit" className="text-xs font-semibold text-red-600 transition hover:text-red-700">Deactivate Part</button>
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
