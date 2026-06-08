import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const GRN_STATUS_COLORS: Record<string, string> = {
  DRAFT: "border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",
  POSTED: "border border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  CANCELLED: "border border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-400",
};

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

export default async function GoodsReceivedDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, orgId } = await requireOrgSession();
  if (!can.manageInventory(user)) redirect("/inventory");

  const grn = await prisma.goodsReceived.findFirst({
    where: { id, orgId },
    include: {
      supplier: { select: { id: true, name: true, contactName: true, phone: true, email: true } },
      po: {
        select: {
          id: true,
          reference: true,
          status: true,
          orderedAt: true,
          expectedAt: true,
          items: { select: { qtyOrdered: true, qtyReceived: true, unitCost: true } },
        },
      },
      location: { select: { name: true, code: true } },
      createdBy: { select: { name: true, email: true } },
      supplierBills: {
        orderBy: { issuedAt: "desc" },
        select: {
          id: true,
          billNumber: true,
          status: true,
          supplierRef: true,
          totalAmount: true,
          paidAmount: true,
          currency: true,
          issuedAt: true,
          dueAt: true,
        },
      },
      items: {
        include: { part: { select: { id: true, sku: true, name: true, qtyOnHand: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  }).catch(() => null);

  if (!grn) notFound();

  const fmt = (d: Date | null) => d ? d.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" }) : "-";
  const total = grn.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  const totalQty = grn.items.reduce((sum, item) => sum + item.quantity, 0);
  const linkedInventoryLines = grn.items.filter((item) => item.partId).length;
  const linkedPoLines = grn.items.filter((item) => item.poItemId).length;
  const avgUnitCost = totalQty > 0 ? total / totalQty : 0;
  const billTotal = grn.supplierBills.reduce((sum, bill) => sum + bill.totalAmount, 0);
  const billPaid = grn.supplierBills.reduce((sum, bill) => sum + bill.paidAmount, 0);
  const billBalance = Math.max(0, billTotal - billPaid);
  const poOrderedQty = grn.po?.items.reduce((sum, item) => sum + item.qtyOrdered, 0) ?? 0;
  const poReceivedQty = grn.po?.items.reduce((sum, item) => sum + item.qtyReceived, 0) ?? 0;
  const poProgress = poOrderedQty > 0 ? Math.min(100, Math.round((poReceivedQty / poOrderedQty) * 100)) : null;
  const locationLabel = `${grn.location.name}${grn.location.code ? ` (${grn.location.code})` : ""}`;
  const poLabel = grn.po ? grn.po.reference ?? `PO-${grn.po.id.slice(-6).toUpperCase()}` : null;
  const postedBy = grn.createdBy.name || grn.createdBy.email;
  const billParams = new URLSearchParams({ supplierId: grn.supplier.id, grnId: grn.id });
  if (grn.po) billParams.set("poId", grn.po.id);
  const newBillHref = `/inventory/supplier-bills/new?${billParams.toString()}`;

  return (
    <div className="space-y-4">
      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Inventory · GRN</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-lg font-black leading-tight text-[var(--ink)]">{grn.grnNumber}</h1>
              <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${GRN_STATUS_COLORS[grn.status] ?? GRN_STATUS_COLORS.POSTED}`}>
                {grn.status}
              </span>
            </div>
            <p className="mt-1 text-[13px] text-[var(--ink-muted)]">
              Received from <Link href={`/inventory/suppliers/${grn.supplier.id}`} className="font-semibold text-[var(--gold)] hover:underline">{grn.supplier.name}</Link> into {locationLabel}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Link href="/inventory/goods-received" className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">All GRNs</Link>
            <Link href={`/api/procurement/documents/goods-received/${grn.id}`} target="_blank" className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">Print / PDF</Link>
            <Link href={newBillHref} className="btn-premium rounded-lg px-3 py-2 text-xs font-semibold">Create Bill</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Receipt Value" value={formatMoney(total)} hint={`${grn.items.length} lines`} tone="neutral" />
        <Metric label="Quantity In" value={totalQty.toLocaleString()} hint={`${linkedInventoryLines}/${grn.items.length} inventory-linked`} tone="green" />
        <Metric label="PO Match" value={poProgress != null ? `${poProgress}%` : "Unlinked"} hint={grn.po ? `${poReceivedQty}/${poOrderedQty} PO qty` : "no purchase order"} tone={poProgress === 100 ? "green" : "amber"} />
        <Metric label="Billing" value={grn.supplierBills.length ? `${grn.supplierBills.length} bill${grn.supplierBills.length === 1 ? "" : "s"}` : "No bill"} hint={grn.supplierBills.length ? `${formatMoney(billBalance)} balance` : "finance pending"} tone={billBalance > 0 || grn.supplierBills.length === 0 ? "amber" : "green"} />
        <Metric label="Avg Unit Cost" value={formatMoney(avgUnitCost)} hint="received weighted avg" tone="neutral" />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.4fr)]">
        <div className="space-y-4">
          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] pb-3">
              <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Receiving Trail</p>
              <span className="rounded-md border border-[var(--line)] px-2 py-1 text-[11px] font-semibold text-[var(--ink-muted)]">{fmt(grn.receivedAt)}</span>
            </div>
            <div className="mt-3 divide-y divide-[var(--line)]">
              <InfoRow label="Supplier">
                <Link href={`/inventory/suppliers/${grn.supplier.id}`} className="font-semibold text-[var(--ink)] hover:text-[var(--accent)]">{grn.supplier.name}</Link>
              </InfoRow>
              <InfoRow label="PO">
                {grn.po ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <Link href={`/inventory/purchase-orders/${grn.po.id}`} className="font-semibold text-[var(--ink)] hover:text-[var(--accent)]">{poLabel}</Link>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PO_STATUS_COLORS[grn.po.status] ?? PO_STATUS_COLORS.DRAFT}`}>{grn.po.status}</span>
                  </span>
                ) : "-"}
              </InfoRow>
              <InfoRow label="Location">{locationLabel}</InfoRow>
              <InfoRow label="Posted By">{postedBy}</InfoRow>
              <InfoRow label="Created">{fmt(grn.createdAt)}</InfoRow>
            </div>
            {grn.po ? (
              <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
                <div className="flex items-center justify-between gap-3 text-xs font-semibold">
                  <span className="text-[var(--ink-muted)]">PO receiving progress</span>
                  <span className="tabular-nums text-[var(--ink)]">{poReceivedQty}/{poOrderedQty}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--bg)]">
                  <div className="h-full rounded-full bg-[var(--gold)]" style={{ width: `${poProgress ?? 0}%` }} />
                </div>
              </div>
            ) : null}
          </section>

          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] pb-3">
              <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Supplier Contact</p>
              <Link href={`/inventory/suppliers/${grn.supplier.id}`} className="text-xs font-semibold text-[var(--gold)] hover:underline">Open Supplier</Link>
            </div>
            <div className="mt-3 divide-y divide-[var(--line)]">
              <InfoRow label="Person">{grn.supplier.contactName || "-"}</InfoRow>
              <InfoRow label="Phone">{grn.supplier.phone ? <a href={`tel:${grn.supplier.phone}`} className="font-semibold text-[var(--ink)] hover:text-[var(--accent)]">{grn.supplier.phone}</a> : "-"}</InfoRow>
              <InfoRow label="Email">{grn.supplier.email ? <a href={`mailto:${grn.supplier.email}`} className="font-semibold text-[var(--ink)] hover:text-[var(--accent)]">{grn.supplier.email}</a> : "-"}</InfoRow>
            </div>
          </section>

          <ActivitySection
            title="Billing Trail"
            count={grn.supplierBills.length}
            action={<Link href={newBillHref} className="rounded-md bg-[var(--gold)]/15 px-3 py-1 text-xs font-semibold text-[var(--gold)] hover:bg-[var(--gold)]/25">Create Bill</Link>}
          >
            {grn.supplierBills.length === 0 ? (
              <EmptyText>No supplier bill has been linked to this GRN.</EmptyText>
            ) : (
              <div className="divide-y divide-[var(--line)]">
                {grn.supplierBills.map((bill) => {
                  const balance = Math.max(0, bill.totalAmount - bill.paidAmount);
                  return (
                    <Link key={bill.id} href={`/inventory/supplier-bills/${bill.id}`} className="block px-4 py-3 hover:bg-[var(--panel-strong)]/40">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-mono text-xs font-bold text-[var(--ink)]">{bill.billNumber}</p>
                          <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{fmt(bill.issuedAt)} · due {fmt(bill.dueAt)}{bill.supplierRef ? ` · ref ${bill.supplierRef}` : ""}</p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BILL_STATUS_COLORS[bill.status] ?? BILL_STATUS_COLORS.POSTED}`}>{bill.status}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-semibold tabular-nums text-[var(--ink)]">{formatMoney(bill.totalAmount, bill.currency)}</span>
                        <span className="text-[var(--ink-muted)]">balance {formatMoney(balance, bill.currency)}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </ActivitySection>

          {grn.note ? (
            <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
              <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Receiving Note</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--ink)]">{grn.note}</p>
            </section>
          ) : null}
        </div>

        <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Received Items</p>
              <p className="text-[13px] text-[var(--ink-muted)]">{linkedPoLines}/{grn.items.length} matched to PO lines</p>
            </div>
            <span className="rounded-md border border-[var(--line)] px-2.5 py-1 text-xs font-semibold text-[var(--ink-muted)]">{formatMoney(total)}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                  <th className="px-4 py-2.5 text-left">Description</th>
                  <th className="px-4 py-2.5 text-left">Inventory Item</th>
                  <th className="px-4 py-2.5 text-right">Qty</th>
                  <th className="px-4 py-2.5 text-right">Unit Cost</th>
                  <th className="px-4 py-2.5 text-right">Line Total</th>
                  <th className="px-4 py-2.5 text-right">On Hand</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {grn.items.map((item) => (
                  <tr key={item.id} className="align-top hover:bg-[var(--gold)]/5">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[var(--ink)]">{item.description}</p>
                      <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{item.poItemId ? "PO matched" : "manual receipt line"}</p>
                    </td>
                    <td className="px-4 py-3">
                      {item.part ? (
                        <Link href={`/inventory/${item.part.id}`} className="font-semibold text-[var(--ink)] hover:text-[var(--accent)]">{item.part.sku} · {item.part.name}</Link>
                      ) : (
                        <span className="text-[var(--ink-muted)]">Not linked</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--ink)]">{item.quantity.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--ink-muted)]">{formatMoney(item.unitCost)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--ink)]">{formatMoney(item.quantity * item.unitCost)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--ink-muted)]">{item.part ? item.part.qtyOnHand.toLocaleString() : "-"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[var(--line)] bg-[var(--panel-strong)]">
                  <td colSpan={2} className="px-4 py-3 text-right text-xs font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Totals</td>
                  <td className="px-4 py-3 text-right font-black tabular-nums text-[var(--ink)]">{totalQty.toLocaleString()}</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right font-black tabular-nums text-[var(--ink)]">{formatMoney(total)}</td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
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
