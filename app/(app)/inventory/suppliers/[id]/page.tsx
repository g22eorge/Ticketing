import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { RowActionsMenu } from "@/components/shared/RowActionsMenu";
import { SupplierEditForm } from "./SupplierEditForm";
import { createSupplierPriceAction, deleteSupplierPriceAction, updateSupplierPriceAction } from "../actions";

export const dynamic = "force-dynamic";

const PO_STATUS_COLORS: Record<string, string> = {
  DRAFT: "border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",
  ORDERED: "border border-blue-400/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  PARTIAL: "border border-amber-400/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  RECEIVED: "border border-green-400/30 bg-green-500/10 text-green-700 dark:text-green-400",
  CANCELLED: "border border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-400",
};

const BILL_STATUS_COLORS: Record<string, string> = {
  POSTED: "border border-sky-400/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  PART_PAID: "border border-amber-400/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  PAID: "border border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  CANCELLED: "border border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-400",
};

const REQUEST_STATUS_COLORS: Record<string, string> = {
  DRAFT: "border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",
  SUBMITTED: "border border-sky-400/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  APPROVED: "border border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  REJECTED: "border border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-400",
  CANCELLED: "border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",
  CONVERTED: "border border-violet-400/30 bg-violet-500/10 text-violet-700 dark:text-violet-400",
};

const GRN_STATUS_COLORS: Record<string, string> = {
  DRAFT: "border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",
  POSTED: "border border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
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
  if (!can.manageInventory(user)) redirect("/inventory");

  const supplier = await prisma.supplier.findFirst({
    where: { id, orgId },
    include: {
      _count: {
        select: {
          purchaseOrders: true,
          purchaseRequests: true,
          supplierBills: true,
          goodsReceivedNotes: true,
        },
      },
      purchaseOrders: {
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          id: true,
          reference: true,
          status: true,
          orderedAt: true,
          expectedAt: true,
          createdAt: true,
          items: { select: { qtyOrdered: true, qtyReceived: true, unitCost: true } },
          _count: { select: { items: true } },
        },
      },
      purchaseRequests: {
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          id: true,
          requestNumber: true,
          status: true,
          priority: true,
          neededBy: true,
          createdAt: true,
          _count: { select: { items: true } },
        },
      },
      supplierBills: {
        orderBy: { issuedAt: "desc" },
        take: 8,
        select: {
          id: true,
          billNumber: true,
          status: true,
          totalAmount: true,
          paidAmount: true,
          issuedAt: true,
          dueAt: true,
          currency: true,
        },
      },
      goodsReceivedNotes: {
        orderBy: { receivedAt: "desc" },
        take: 6,
        select: {
          id: true,
          grnNumber: true,
          status: true,
          receivedAt: true,
          _count: { select: { items: true } },
        },
      },
    },
  }).catch(() => null);

  if (!supplier) notFound();

  const [prices, parts, billTotals, overdueBillCount, openPoCount] = await Promise.all([
    prisma.supplierPrice.findMany({ where: { orgId, supplierId: supplier.id }, orderBy: { validFrom: "desc" } }),
    prisma.part.findMany({ where: { orgId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, sku: true, name: true } }),
    prisma.supplierBill.aggregate({
      where: { orgId, supplierId: supplier.id, status: { not: "CANCELLED" } },
      _sum: { totalAmount: true, paidAmount: true },
    }),
    prisma.supplierBill.count({
      where: { orgId, supplierId: supplier.id, dueAt: { lt: new Date() }, status: { notIn: ["PAID", "CANCELLED"] } },
    }),
    prisma.purchaseOrder.count({
      where: { orgId, supplierId: supplier.id, status: { in: ["DRAFT", "ORDERED", "PARTIAL"] } },
    }),
  ]);

  const partLabel = new Map(parts.map((part) => [part.id, `${part.sku} · ${part.name}`]));
  const totalBillAmount = billTotals._sum.totalAmount ?? 0;
  const totalPaidAmount = billTotals._sum.paidAmount ?? 0;
  const supplierBalance = Math.max(0, totalBillAmount - totalPaidAmount);
  const leadTimes = prices.map((price) => price.leadTimeDays).filter((days): days is number => days != null);
  const averageLeadDays = leadTimes.length > 0 ? Math.round(leadTimes.reduce((sum, days) => sum + days, 0) / leadTimes.length) : null;
  const recentPoValue = supplier.purchaseOrders.reduce(
    (sum, po) => sum + po.items.reduce((lineSum, item) => lineSum + item.qtyOrdered * item.unitCost, 0),
    0,
  );
  const lastActivityAt = [
    supplier.updatedAt,
    ...supplier.purchaseOrders.map((po) => po.createdAt),
    ...supplier.purchaseRequests.map((request) => request.createdAt),
    ...supplier.supplierBills.map((bill) => bill.issuedAt),
    ...supplier.goodsReceivedNotes.map((grn) => grn.receivedAt),
  ].sort((a, b) => b.getTime() - a.getTime())[0];

  const fmt = (d: Date | null) =>
    d ? d.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" }) : "-";

  return (
    <div className="space-y-4">
      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Inventory · Supplier</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-black leading-tight text-[var(--ink)]">{supplier.name}</h1>
              <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${supplier.isActive ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]"}`}>
                {supplier.isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="mt-1 text-[13px] text-[var(--ink-muted)]">
              {supplier.contactName || supplier.phone || supplier.email ? [supplier.contactName, supplier.phone, supplier.email].filter(Boolean).join(" · ") : "No contact details captured"}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Link href="/inventory/suppliers" className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">Suppliers</Link>
            {supplier.isActive ? (
              <>
                <Link href={`/inventory/purchase-orders/new?supplierId=${supplier.id}`} className="btn-premium rounded-lg px-3 py-2 text-xs font-semibold">New PO</Link>
                <Link href={`/inventory/supplier-bills/new?supplierId=${supplier.id}`} className="rounded-lg border border-[var(--gold)]/30 bg-[var(--gold)]/10 px-3 py-2 text-xs font-semibold text-[var(--gold)] transition hover:bg-[var(--gold)]/15">New Bill</Link>
              </>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Open POs" value={openPoCount.toLocaleString()} hint={`${supplier._count.purchaseOrders.toLocaleString()} total`} tone={openPoCount > 0 ? "amber" : "neutral"} />
        <Metric label="Bill Balance" value={formatMoney(supplierBalance)} hint={`${overdueBillCount} overdue`} tone={supplierBalance > 0 ? "amber" : "green"} />
        <Metric label="Price Lines" value={prices.length.toLocaleString()} hint={averageLeadDays != null ? `${averageLeadDays}d avg lead` : "no lead times"} tone="neutral" />
        <Metric label="Recent PO Value" value={formatMoney(recentPoValue)} hint="latest 12 orders" tone="neutral" />
        <Metric label="Last Activity" value={fmt(lastActivityAt)} hint={`${supplier._count.goodsReceivedNotes} GRNs`} tone="neutral" />
      </section>

      {typeof qs.error === "string" ? <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-500">{qs.error}</div> : null}
      {String(qs.priceCreated ?? "") === "1" ? <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">Supplier price added.</div> : null}
      {String(qs.priceSaved ?? "") === "1" ? <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">Supplier price updated.</div> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.4fr)]">
        <div className="space-y-4">
          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] pb-3">
              <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Contact</p>
              <span className="rounded-md border border-[var(--line)] px-2 py-1 text-[11px] font-semibold text-[var(--ink-muted)]">Since {fmt(supplier.createdAt)}</span>
            </div>
            <div className="mt-3 divide-y divide-[var(--line)]">
              <InfoRow label="Person">{supplier.contactName || "-"}</InfoRow>
              <InfoRow label="Phone">{supplier.phone ? <a href={`tel:${supplier.phone}`} className="font-semibold text-[var(--ink)] hover:text-[var(--accent)]">{supplier.phone}</a> : "-"}</InfoRow>
              <InfoRow label="Email">{supplier.email ? <a href={`mailto:${supplier.email}`} className="font-semibold text-[var(--ink)] hover:text-[var(--accent)]">{supplier.email}</a> : "-"}</InfoRow>
              <InfoRow label="Address">{supplier.address || "-"}</InfoRow>
            </div>
            {supplier.notes ? (
              <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--ink)]">{supplier.notes}</p>
              </div>
            ) : null}
          </section>

          <SupplierEditForm supplier={supplier} />
        </div>

        <div className="space-y-4">
          <section id="price-list" className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
              <div>
                <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Price List</p>
                <p className="text-[13px] text-[var(--ink-muted)]">{prices.length} supplier terms captured</p>
              </div>
              {averageLeadDays != null ? <span className="rounded-md border border-[var(--line)] px-2.5 py-1 text-xs font-semibold text-[var(--ink-muted)]">{averageLeadDays}d avg lead</span> : null}
            </div>

            <form action={createSupplierPriceAction} className="grid gap-2 border-b border-[var(--line)] p-3 md:grid-cols-[1.2fr_1fr_0.7fr_0.55fr_0.55fr_0.55fr_auto]">
              <input type="hidden" name="supplierId" value={supplier.id} />
              <select name="partId" className="min-w-0 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]/60">
                <option value="">No linked item</option>
                {parts.map((part) => <option key={part.id} value={part.id}>{part.sku} · {part.name}</option>)}
              </select>
              <input name="description" placeholder="Description *" required className="min-w-0 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]/60" />
              <input name="sku" placeholder="SKU" className="min-w-0 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]/60" />
              <input name="unitCost" placeholder="Cost *" required inputMode="decimal" className="min-w-0 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]/60" />
              <input name="minQuantity" placeholder="MOQ" inputMode="numeric" className="min-w-0 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]/60" />
              <input name="leadTimeDays" placeholder="Lead" inputMode="numeric" className="min-w-0 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]/60" />
              <button type="submit" className="btn-premium rounded-lg px-4 py-2 text-[13px] font-semibold">Add</button>
            </form>

            {prices.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--ink-muted)]">No supplier prices yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-[var(--line)] text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                      <th className="px-4 py-2.5 text-left">Item</th>
                      <th className="px-4 py-2.5 text-right">Unit Cost</th>
                      <th className="px-4 py-2.5 text-right">MOQ</th>
                      <th className="px-4 py-2.5 text-right">Lead</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {prices.map((price) => (
                      <tr key={price.id} className="align-top hover:bg-[var(--gold)]/5">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-[var(--ink)]">{price.partId ? partLabel.get(price.partId) ?? price.description : price.description}</p>
                          <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{price.sku ?? "No SKU"} · valid from {fmt(price.validFrom)}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--ink)]">{formatMoney(price.unitCost, price.currency)}</td>
                        <td className="px-4 py-3 text-right text-[var(--ink-muted)]">{price.minQuantity ?? "-"}</td>
                        <td className="px-4 py-3 text-right text-[var(--ink-muted)]">{price.leadTimeDays != null ? `${price.leadTimeDays}d` : "-"}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end">
                            <RowActionsMenu label={`Supplier price actions for ${price.description}`}>
                              <div className="w-72 p-3">
                                <form action={updateSupplierPriceAction} className="grid gap-2 text-left">
                                  <input type="hidden" name="id" value={price.id} />
                                  <input type="hidden" name="supplierId" value={supplier.id} />
                                  <select name="partId" defaultValue={price.partId ?? ""} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60">
                                    <option value="">No linked item</option>
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
                                <form action={deleteSupplierPriceAction} className="mt-2 border-t border-[var(--line)] pt-2">
                                  <input type="hidden" name="id" value={price.id} />
                                  <input type="hidden" name="supplierId" value={supplier.id} />
                                  <button type="submit" className="text-xs font-semibold text-red-600 hover:text-red-700">Delete</button>
                                </form>
                              </div>
                            </RowActionsMenu>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="grid gap-4 2xl:grid-cols-2">
            <ActivitySection
              title="Purchase Orders"
              count={supplier._count.purchaseOrders}
              action={<Link href={`/inventory/purchase-orders/new?supplierId=${supplier.id}`} className="rounded-md bg-[var(--gold)]/15 px-3 py-1 text-xs font-semibold text-[var(--gold)] hover:bg-[var(--gold)]/25">New PO</Link>}
            >
              {supplier.purchaseOrders.length === 0 ? (
                <EmptyText>No purchase orders yet.</EmptyText>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <tbody className="divide-y divide-[var(--line)]">
                      {supplier.purchaseOrders.map((po) => {
                        const orderedQty = po.items.reduce((sum, item) => sum + item.qtyOrdered, 0);
                        const receivedQty = po.items.reduce((sum, item) => sum + item.qtyReceived, 0);
                        return (
                          <tr key={po.id} className="hover:bg-[var(--gold)]/5">
                            <td className="px-4 py-3">
                              <Link href={`/inventory/purchase-orders/${po.id}`} className="font-mono text-xs font-bold text-[var(--ink)] hover:text-[var(--accent)]">{po.reference ?? po.id.slice(-6).toUpperCase()}</Link>
                              <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{fmt(po.orderedAt)} · {receivedQty}/{orderedQty} received</p>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PO_STATUS_COLORS[po.status] ?? PO_STATUS_COLORS.DRAFT}`}>{po.status}</span>
                            </td>
                            <td className="px-4 py-3 text-right text-xs text-[var(--ink-muted)]">{po._count.items} lines</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </ActivitySection>

            <ActivitySection
              title="Supplier Bills"
              count={supplier._count.supplierBills}
              action={<Link href={`/inventory/supplier-bills/new?supplierId=${supplier.id}`} className="rounded-md bg-[var(--gold)]/15 px-3 py-1 text-xs font-semibold text-[var(--gold)] hover:bg-[var(--gold)]/25">New Bill</Link>}
            >
              {supplier.supplierBills.length === 0 ? (
                <EmptyText>No supplier bills yet.</EmptyText>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <tbody className="divide-y divide-[var(--line)]">
                      {supplier.supplierBills.map((bill) => {
                        const balance = Math.max(0, bill.totalAmount - bill.paidAmount);
                        return (
                          <tr key={bill.id} className="hover:bg-[var(--gold)]/5">
                            <td className="px-4 py-3">
                              <Link href={`/inventory/supplier-bills/${bill.id}`} className="font-mono text-xs font-bold text-[var(--ink)] hover:text-[var(--accent)]">{bill.billNumber}</Link>
                              <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{fmt(bill.issuedAt)} · due {fmt(bill.dueAt)}</p>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BILL_STATUS_COLORS[bill.status] ?? BILL_STATUS_COLORS.POSTED}`}>{bill.status}</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <p className="text-xs font-bold tabular-nums text-[var(--ink)]">{formatMoney(bill.totalAmount, bill.currency)}</p>
                              <p className="text-xs text-[var(--ink-muted)]">bal {formatMoney(balance, bill.currency)}</p>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </ActivitySection>
          </div>

          <div className="grid gap-4 2xl:grid-cols-2">
            <ActivitySection title="Purchase Requests" count={supplier._count.purchaseRequests}>
              {supplier.purchaseRequests.length === 0 ? (
                <EmptyText>No requests for this supplier.</EmptyText>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <tbody className="divide-y divide-[var(--line)]">
                      {supplier.purchaseRequests.map((request) => (
                        <tr key={request.id} className="hover:bg-[var(--gold)]/5">
                          <td className="px-4 py-3">
                            <Link href={`/inventory/purchase-requests/${request.id}`} className="font-mono text-xs font-bold text-[var(--ink)] hover:text-[var(--accent)]">{request.requestNumber}</Link>
                            <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{request.priority} · needed {fmt(request.neededBy)}</p>
                          </td>
                          <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${REQUEST_STATUS_COLORS[request.status] ?? REQUEST_STATUS_COLORS.SUBMITTED}`}>{request.status}</span></td>
                          <td className="px-4 py-3 text-right text-xs text-[var(--ink-muted)]">{request._count.items} lines</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ActivitySection>

            <ActivitySection title="Goods Received" count={supplier._count.goodsReceivedNotes}>
              {supplier.goodsReceivedNotes.length === 0 ? (
                <EmptyText>No goods received records yet.</EmptyText>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <tbody className="divide-y divide-[var(--line)]">
                      {supplier.goodsReceivedNotes.map((grn) => (
                        <tr key={grn.id} className="hover:bg-[var(--gold)]/5">
                          <td className="px-4 py-3">
                            <Link href={`/inventory/goods-received/${grn.id}`} className="font-mono text-xs font-bold text-[var(--ink)] hover:text-[var(--accent)]">{grn.grnNumber}</Link>
                            <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{fmt(grn.receivedAt)}</p>
                          </td>
                          <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${GRN_STATUS_COLORS[grn.status] ?? GRN_STATUS_COLORS.POSTED}`}>{grn.status}</span></td>
                          <td className="px-4 py-3 text-right text-xs text-[var(--ink-muted)]">{grn._count.items} lines</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ActivitySection>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: "neutral" | "amber" | "green" }) {
  const color = tone === "amber" ? "text-amber-600" : tone === "green" ? "text-emerald-600" : "text-[var(--ink)]";
  return (
    <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
      <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">{label}</p>
      <p className={`mt-1 truncate text-lg font-black tabular-nums ${color}`}>{value}</p>
      <p className="mt-0.5 truncate text-[12px] text-[var(--ink-muted)]">{hint}</p>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-3 py-2 text-sm">
      <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">{label}</p>
      <div className="min-w-0 whitespace-pre-wrap text-[var(--ink)]">{children}</div>
    </div>
  );
}

function ActivitySection({ title, count, action, children }: { title: string; count: number; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
        <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">{title} ({count})</p>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyText({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-[var(--ink-muted)]">{children}</p>;
}
