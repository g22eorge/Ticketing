import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { SupplierEditForm } from "./SupplierEditForm";
import { createSupplierPriceAction, deleteSupplierPriceAction, updateSupplierPriceAction } from "../actions";

export const dynamic = "force-dynamic";

const PO_STATUS_COLORS: Record<string, string> = {
  DRAFT:     "border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",
  ORDERED:   "border border-blue-400/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  PARTIAL:   "border border-amber-400/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  RECEIVED:  "border border-green-400/30 bg-green-500/10 text-green-700 dark:text-green-400",
  CANCELLED: "border border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-400",
};

export default async function SupplierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const qs = (((await searchParams?.catch(() => ({}))) ?? {}) as Record<string, string | string[] | undefined>);
  const { user, orgId } = await requireOrgSession();
  if (!can.manageUsers(user)) redirect("/inventory");

  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: {
      purchaseOrders: {
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { items: true } } },
      },
      supplierBills: {
        orderBy: { issuedAt: "desc" },
        take: 8,
        select: { id: true, billNumber: true, status: true, totalAmount: true, paidAmount: true, issuedAt: true, dueAt: true, currency: true },
      },
    },
  });

  if (!supplier || supplier.orgId !== orgId) notFound();

  const [prices, parts] = await Promise.all([
    prisma.supplierPrice.findMany({ where: { orgId, supplierId: supplier.id }, orderBy: { validFrom: "desc" } }),
    prisma.part.findMany({ where: { orgId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, sku: true, name: true } }),
  ]);
  const partLabel = new Map(parts.map((part) => [part.id, `${part.sku} · ${part.name}`]));

  const fmt = (d: Date | null) =>
    d ? d.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" }) : "—";

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/inventory/suppliers" className="text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]">
            ← Suppliers
          </Link>
          <h1 className="mt-1 text-xl font-bold text-[var(--ink)]">{supplier.name}</h1>
        </div>
        <span className={`mt-1 rounded-full px-3 py-1 text-xs font-semibold ${supplier.isActive ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]"}`}>
          {supplier.isActive ? "Active" : "Inactive"}
        </span>
      </div>

      {/* Edit form */}
      <SupplierEditForm supplier={supplier} />

      {typeof qs.error === "string" ? <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-500">{qs.error}</div> : null}
      {String(qs.priceCreated ?? "") === "1" ? <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">Supplier price added.</div> : null}
      {String(qs.priceSaved ?? "") === "1" ? <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">Supplier price updated.</div> : null}

      {/* Supplier price list */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] overflow-x-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--line)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Price List ({prices.length})</p>
        </div>
        <form action={createSupplierPriceAction} className="grid gap-2 border-b border-[var(--line)] p-4 md:grid-cols-[1.4fr_1fr_0.7fr_0.6fr_0.7fr_auto]">
          <input type="hidden" name="supplierId" value={supplier.id} />
          <select name="partId" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60">
            <option value="">No linked part</option>
            {parts.map((part) => <option key={part.id} value={part.id}>{part.sku} · {part.name}</option>)}
          </select>
          <input name="description" placeholder="Description *" required className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60" />
          <input name="sku" placeholder="SKU" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60" />
          <input name="unitCost" placeholder="Cost *" required inputMode="decimal" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60" />
          <input name="leadTimeDays" placeholder="Lead days" inputMode="numeric" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60" />
          <button type="submit" className="btn-premium rounded-lg px-4 py-1.5 text-[13px] font-semibold">Add</button>
        </form>
        {prices.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--ink-muted)]">No supplier prices yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                <th className="px-4 py-2 text-left">Item</th>
                <th className="px-4 py-2 text-right">Unit Cost</th>
                <th className="hidden px-4 py-2 text-right sm:table-cell">MOQ</th>
                <th className="hidden px-4 py-2 text-right sm:table-cell">Lead</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {prices.map((price) => (
                <tr key={price.id} className="align-top hover:bg-[var(--gold)]/5">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[var(--ink)]">{price.partId ? partLabel.get(price.partId) ?? price.description : price.description}</p>
                    <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{price.sku ?? "No SKU"} · {price.currency}</p>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--ink)]">{price.unitCost.toLocaleString()}</td>
                  <td className="hidden px-4 py-3 text-right text-[var(--ink-muted)] sm:table-cell">{price.minQuantity ?? "—"}</td>
                  <td className="hidden px-4 py-3 text-right text-[var(--ink-muted)] sm:table-cell">{price.leadTimeDays != null ? `${price.leadTimeDays}d` : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <details className="group">
                      <summary className="cursor-pointer list-none text-xs font-semibold text-[var(--gold)] hover:underline">Edit</summary>
                      <form action={updateSupplierPriceAction} className="mt-3 grid min-w-[280px] gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 text-left shadow-xl">
                        <input type="hidden" name="id" value={price.id} />
                        <input type="hidden" name="supplierId" value={supplier.id} />
                        <select name="partId" defaultValue={price.partId ?? ""} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60">
                          <option value="">No linked part</option>
                          {parts.map((part) => <option key={part.id} value={part.id}>{part.sku} · {part.name}</option>)}
                        </select>
                        <input name="description" defaultValue={price.description} required className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60" />
                        <input name="sku" defaultValue={price.sku ?? ""} placeholder="SKU" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60" />
                        <input name="unitCost" defaultValue={price.unitCost} required inputMode="decimal" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60" />
                        <div className="grid grid-cols-2 gap-2">
                          <input name="minQuantity" defaultValue={price.minQuantity ?? ""} placeholder="MOQ" inputMode="numeric" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60" />
                          <input name="leadTimeDays" defaultValue={price.leadTimeDays ?? ""} placeholder="Lead days" inputMode="numeric" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60" />
                        </div>
                        <input name="currency" defaultValue={price.currency} placeholder="Currency" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] uppercase outline-none focus:border-[var(--accent)]/60" />
                        <button type="submit" className="btn-premium rounded-lg px-3 py-1.5 text-xs font-semibold">Save Price</button>
                      </form>
                      <form action={deleteSupplierPriceAction} className="mt-2">
                        <input type="hidden" name="id" value={price.id} />
                        <input type="hidden" name="supplierId" value={supplier.id} />
                        <button type="submit" className="text-xs font-semibold text-red-600 hover:text-red-700">Delete</button>
                      </form>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] overflow-x-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--line)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
            Supplier Bills ({supplier.supplierBills.length})
          </p>
          <Link
            href={`/inventory/supplier-bills/new?supplierId=${supplier.id}`}
            className="rounded-md bg-[var(--gold)]/15 px-3 py-1 text-xs font-semibold text-[var(--gold)] hover:bg-[var(--gold)]/25"
          >
            + New Bill
          </Link>
        </div>
        {supplier.supplierBills.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--ink-muted)]">No supplier bills yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                <th className="px-4 py-2 text-left">Bill</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-right hidden sm:table-cell">Balance</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {supplier.supplierBills.map((bill) => (
                <tr key={bill.id} className="hover:bg-[var(--gold)]/5">
                  <td className="px-4 py-2"><p className="font-mono text-xs font-semibold text-[var(--ink)]">{bill.billNumber}</p><p className="text-xs text-[var(--ink-muted)]">{fmt(bill.issuedAt)}</p></td>
                  <td className="px-4 py-2 text-xs font-semibold text-[var(--ink-muted)]">{bill.status}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums text-[var(--ink)]">{bill.currency} {bill.totalAmount.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right hidden sm:table-cell tabular-nums text-[var(--ink-muted)]">{(bill.totalAmount - bill.paidAmount).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/inventory/supplier-bills/${bill.id}`} className="text-xs font-semibold text-[var(--gold)] hover:underline">View →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Purchase orders */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] overflow-x-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--line)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
            Purchase Orders ({supplier.purchaseOrders.length})
          </p>
          <Link
            href={`/inventory/purchase-orders/new?supplierId=${supplier.id}`}
            className="rounded-md bg-[var(--gold)]/15 px-3 py-1 text-xs font-semibold text-[var(--gold)] hover:bg-[var(--gold)]/25"
          >
            + New PO
          </Link>
        </div>
        {supplier.purchaseOrders.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--ink-muted)]">No purchase orders yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                <th className="px-4 py-2 text-left">Reference</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left hidden sm:table-cell">Ordered</th>
                <th className="px-4 py-2 text-left hidden sm:table-cell">Expected</th>
                <th className="px-4 py-2 text-center">Items</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {supplier.purchaseOrders.map((po) => (
                <tr key={po.id} className="hover:bg-[var(--gold)]/5">
                  <td className="px-4 py-2 font-mono text-xs text-[var(--ink)]">{po.reference ?? po.id.slice(-6).toUpperCase()}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PO_STATUS_COLORS[po.status] ?? ""}`}>
                      {po.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-[var(--ink-muted)] hidden sm:table-cell">{fmt(po.orderedAt)}</td>
                  <td className="px-4 py-2 text-[var(--ink-muted)] hidden sm:table-cell">{fmt(po.expectedAt)}</td>
                  <td className="px-4 py-2 text-center text-[var(--ink-muted)]">{po._count.items}</td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/inventory/purchase-orders/${po.id}`} className="text-xs font-semibold text-[var(--gold)] hover:underline">
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
