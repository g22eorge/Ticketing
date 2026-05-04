import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { getCurrentUserRole } from "@/lib/session";

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
  const { user } = await getCurrentUserRole();
  if (!["ADMIN", "OPS", "TECHNICIAN_INTERNAL"].includes(user.role)) {
    redirect("/dashboard");
  }

  const params = (((await searchParams?.catch(() => ({}))) ?? {}) as Record<string, string | string[] | undefined>);
  const created = String(params.created ?? "") === "1";
  const error = typeof params.error === "string" ? params.error : "";

  const canManage = user.role === "ADMIN" || user.role === "OPS";

  async function createPartAction(formData: FormData) {
    "use server";
    const { user } = await getCurrentUserRole();
    if (!(user.role === "ADMIN" || user.role === "OPS")) return;

    const sku = String(formData.get("sku") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const manufacturer = String(formData.get("manufacturer") ?? "").trim();
    const unitCostRaw = String(formData.get("unitCost") ?? "").trim();
    const reorderRaw = String(formData.get("reorderLevel") ?? "").trim();

    if (!sku || !name) return;
    const unitCost = unitCostRaw ? Number(unitCostRaw) : null;
    const reorderLevel = reorderRaw ? Math.max(0, Math.floor(Number(reorderRaw))) : 0;

    try {
      await prisma.part.create({
        data: {
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
    const { session, user } = await getCurrentUserRole();
    if (!(user.role === "ADMIN" || user.role === "OPS")) return;

    const partId = String(formData.get("partId") ?? "").trim();
    const type = String(formData.get("type") ?? "").trim().toUpperCase() as StockTxnType;
    const qty = Math.floor(Number(String(formData.get("quantity") ?? "0").trim()));
    const reason = String(formData.get("reason") ?? "").trim();

    if (!partId) return;
    if (!(["IN", "OUT", "ADJUST"] as const).includes(type)) return;
    if (!Number.isFinite(qty) || qty === 0) return;

    await prisma.$transaction(async (tx) => {
      const part = await tx.part.findUnique({ where: { id: partId }, select: { qtyOnHand: true, unitCost: true } });
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
    const { user } = await getCurrentUserRole();
    if (!(user.role === "ADMIN" || user.role === "OPS")) return;

    const partId = String(formData.get("partId") ?? "").trim();
    const next = String(formData.get("next") ?? "").trim();
    if (!partId) return;

    await prisma.part.update({ where: { id: partId }, data: { isActive: next === "1" } });
    revalidatePath("/inventory");
  }

  const [parts, reservationStats, reservedByPart] = await Promise.all([
    prisma.part
      .findMany({
        where: { isActive: true },
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
      {error ? (
        <div className="panel-shadow rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}
      {created ? (
        <div className="panel-shadow rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Part added.
        </div>
      ) : null}
      <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <article className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Active Parts</p>
            <p className="text-base font-semibold leading-none text-[var(--ink)]">{parts.length}</p>
          </div>
        </article>
        <article className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Low Stock</p>
            <p className="text-base font-semibold leading-none text-[var(--accent)]">{lowStock.length}</p>
          </div>
        </article>
        <article className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Reserved</p>
            <p className="text-base font-semibold leading-none text-[var(--ink)]">{reservedCount}</p>
          </div>
        </article>
        <article className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Stock Value</p>
            <p className="text-sm font-semibold leading-none text-[var(--ink)]">{formatMoney(totalValue)}</p>
          </div>
        </article>
      </section>

      {canManage ? (
        <section id="add-part" className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <header className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-2.5">
            <div>
              <h2 className="text-sm font-semibold text-[var(--ink)]">Add Part</h2>
              <p className="text-xs text-[var(--ink-muted)]">SKU and name are required.</p>
            </div>
            <span className="hidden rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)] md:inline-flex">
              Admin/OPS
            </span>
          </header>
          <form action={createPartAction} className="space-y-2 p-3 md:p-4">
            <div className="grid gap-2 md:grid-cols-12">
              <input
                name="sku"
                placeholder="SKU"
                required
                className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/14 md:col-span-3"
              />
              <input
                name="name"
                placeholder="Part name"
                required
                className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/14 md:col-span-7"
              />
              <div className="md:col-span-2 flex justify-end">
                <button type="submit" className="btn-premium w-full rounded-lg px-4 py-2 text-sm font-semibold md:w-auto">
                  Add
                </button>
              </div>
            </div>
          </form>
        </section>
      ) : null}

      <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <header className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--ink)]">Stock Monitor</h2>
            <p className="text-xs text-[var(--ink-muted)]">Parts at or below reorder level are highlighted.</p>
          </div>
           <Link href="/jobs" className="btn-premium-secondary rounded-lg px-3 py-2 text-xs">
             Open Jobs
           </Link>
         </header>

        {parts.length === 0 ? (
          <div className="px-4 py-10 text-sm text-[var(--ink-muted)]">
            <p>No parts yet.</p>
            {canManage ? (
              <p className="mt-2">
                <Link href="#add-part" className="text-[var(--accent)] underline-offset-2 hover:underline">
                  Add your first part
                </Link>{" "}
                to start tracking stock and reservations.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--panel-strong)]/50 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">
                <tr>
                  <th className="px-4 py-2.5 text-left">Part</th>
                  <th className="px-4 py-2.5 text-left">SKU</th>
                  <th className="px-4 py-2.5 text-left">Maker</th>
                  <th className="px-4 py-2.5 text-right">On Hand</th>
                  <th className="px-4 py-2.5 text-right">Reserved</th>
                  <th className="px-4 py-2.5 text-right">Available</th>
                  <th className="px-4 py-2.5 text-right">Reorder</th>
                  {canManage ? <th className="px-4 py-2.5 text-right">Adjust</th> : null}
                </tr>
              </thead>
              <tbody>
                {parts.map((part) => {
                  const isLow = part.reorderLevel > 0 && part.qtyOnHand <= part.reorderLevel;
                  const reserved = reservedMap.get(part.id) ?? 0;
                  const available = part.qtyOnHand - reserved;
                  return (
                    <tr key={part.id} className={"border-t border-[var(--line)] transition-colors " + (isLow ? "bg-[var(--accent)]/10" : "hover:bg-[var(--panel-strong)]/40")}>
                      <td className="px-4 py-2.5 text-[var(--ink)]">{part.name}</td>
                      <td className="px-4 py-2.5 text-[var(--ink-muted)]">{part.sku}</td>
                      <td className="px-4 py-2.5 text-[var(--ink-muted)]">{part.manufacturer ?? "-"}</td>
                      <td className="px-4 py-2.5 text-right text-[var(--ink)]">{part.qtyOnHand}</td>
                      <td className="px-4 py-2.5 text-right text-[var(--ink-muted)]">{reserved}</td>
                      <td className={"px-4 py-2.5 text-right " + (available < 0 ? "text-red-600" : "text-[var(--ink)]")}>{available}</td>
                      <td className="px-4 py-2.5 text-right text-[var(--ink-muted)]">{part.reorderLevel}</td>
                      {canManage ? (
                        <td className="px-4 py-2.5">
                          <form action={adjustStockAction} className="flex items-center justify-end gap-2">
                            <input type="hidden" name="partId" value={part.id} />
                            <select name="type" defaultValue="IN" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1 text-xs text-[var(--ink)] outline-none">
                              <option value="IN">IN</option>
                              <option value="OUT">OUT</option>
                              <option value="ADJUST">ADJ</option>
                            </select>
                            <input name="quantity" inputMode="numeric" placeholder="Qty" className="w-20 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1 text-xs outline-none" />
                            <input name="reason" placeholder="Reason" className="hidden w-40 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1 text-xs outline-none lg:block" />
                            <button type="submit" className="btn-premium-secondary rounded-lg px-2.5 py-1 text-xs">Save</button>
                          </form>
                          <form action={togglePartActiveAction} className="mt-1 flex justify-end">
                            <input type="hidden" name="partId" value={part.id} />
                            <input type="hidden" name="next" value="0" />
                            <button type="submit" className="text-[11px] text-[var(--ink-muted)] underline-offset-2 hover:underline">Deactivate</button>
                          </form>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
