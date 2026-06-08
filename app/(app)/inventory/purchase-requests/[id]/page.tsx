import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { convertPurchaseRequestToPoAction, deletePurchaseRequestAction, reviewPurchaseRequestAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function PurchaseRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, orgId } = await requireOrgSession();
  if (!can.manageInventory(user)) redirect("/inventory");

  const request = await prisma.purchaseRequest.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, name: true } },
      requestedBy: { select: { name: true, email: true } },
      reviewedBy: { select: { name: true, email: true } },
      convertedPo: { select: { id: true, reference: true } },
      items: { include: { part: { select: { sku: true, name: true } } }, orderBy: { createdAt: "asc" } },
    },
  }).catch(() => null);
  if (!request || request.orgId !== orgId) notFound();

  const suppliers = await prisma.supplier.findMany({ where: { orgId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const fmt = (d: Date | null) => d ? d.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" }) : "-";
  const total = request.items.reduce((sum, item) => sum + item.quantity * (item.estimatedUnitCost ?? 0), 0);
  const canReview = ["DRAFT", "SUBMITTED", "APPROVED"].includes(request.status);
  const canConvert = request.status === "APPROVED";

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Inventory · Purchase Request</p>
          <p className="mt-0.5 font-mono text-[13px] font-bold text-[var(--ink)]">{request.requestNumber}</p>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">Requested by {request.requestedBy.name || request.requestedBy.email}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link href={`/api/procurement/documents/purchase-request/${request.id}`} target="_blank" className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">
            Print / PDF
          </Link>
          <form action={deletePurchaseRequestAction}>
            <input type="hidden" name="id" value={request.id} />
            <button type="submit" className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-600">
              Delete
            </button>
          </form>
          <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-700 dark:text-sky-400">{request.status}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2"><p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Priority</p><p className="mt-0.5 text-sm font-semibold text-[var(--ink)]">{request.priority}</p></div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2"><p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Needed</p><p className="mt-0.5 text-sm font-semibold text-[var(--ink)]">{fmt(request.neededBy)}</p></div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2"><p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Supplier</p><p className="mt-0.5 text-sm font-semibold text-[var(--ink)]">{request.supplier?.name ?? "No preference"}</p></div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2"><p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Estimate</p><p className="mt-0.5 text-sm font-semibold text-[var(--ink)] tabular-nums">{total.toLocaleString()}</p></div>
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] overflow-x-auto">
        <div className="px-5 py-3 border-b border-[var(--line)]"><p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Items</p></div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[var(--line)] text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]"><th className="px-4 py-2.5 text-left">Description</th><th className="px-4 py-2.5 text-left hidden sm:table-cell">Item</th><th className="px-4 py-2.5 text-right">Qty</th><th className="px-4 py-2.5 text-right">Est. Cost</th><th className="px-4 py-2.5 text-right">Total</th></tr></thead>
          <tbody className="divide-y divide-[var(--line)]">{request.items.map((item) => <tr key={item.id}><td className="px-4 py-2 text-[var(--ink)]">{item.description}</td><td className="px-4 py-2 hidden sm:table-cell text-xs text-[var(--ink-muted)]">{item.part ? `${item.part.sku} · ${item.part.name}` : "-"}</td><td className="px-4 py-2 text-right tabular-nums text-[var(--ink-muted)]">{item.quantity}</td><td className="px-4 py-2 text-right tabular-nums text-[var(--ink-muted)]">{(item.estimatedUnitCost ?? 0).toLocaleString()}</td><td className="px-4 py-2 text-right tabular-nums font-semibold text-[var(--ink)]">{(item.quantity * (item.estimatedUnitCost ?? 0)).toLocaleString()}</td></tr>)}</tbody>
        </table>
      </div>

      {request.reason || request.notes || request.reviewNote ? <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-5 py-4 text-sm text-[var(--ink)]"><p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)] mb-2">Notes</p>{request.reason ? <p><strong>Reason:</strong> {request.reason}</p> : null}{request.notes ? <p className="mt-2 whitespace-pre-wrap">{request.notes}</p> : null}{request.reviewNote ? <p className="mt-2"><strong>Review:</strong> {request.reviewNote}</p> : null}</div> : null}

      {request.convertedPo ? <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-700">Converted to <Link href={`/inventory/purchase-orders/${request.convertedPo.id}`} className="font-semibold underline">{request.convertedPo.reference ?? "purchase order"}</Link>.</div> : null}

      {canConvert ? <form action={convertPurchaseRequestToPoAction} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-3"><input type="hidden" name="id" value={request.id} /><p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Convert to Purchase Order</p><div className="grid gap-3 sm:grid-cols-3"><select name="supplierId" defaultValue={request.supplierId ?? ""} required className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm"><option value="">Select supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select><input name="reference" placeholder="PO reference" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm" /><input name="expectedAt" type="date" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm" /></div><button type="submit" className="btn-premium rounded-lg px-4 py-2 text-sm font-semibold">Create PO</button></form> : null}

      {canReview ? <div className="grid gap-3 sm:grid-cols-3"><form action={reviewPurchaseRequestAction} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 space-y-2"><input type="hidden" name="id" value={request.id} /><input type="hidden" name="action" value="APPROVED" /><textarea name="reviewNote" rows={2} placeholder="Approval note" className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-xs" /><button type="submit" className="w-full rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-700">Approve</button></form><form action={reviewPurchaseRequestAction} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 space-y-2"><input type="hidden" name="id" value={request.id} /><input type="hidden" name="action" value="REJECTED" /><textarea name="reviewNote" rows={2} placeholder="Rejection reason" className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-xs" /><button type="submit" className="w-full rounded-lg bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600">Reject</button></form><form action={reviewPurchaseRequestAction} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 space-y-2"><input type="hidden" name="id" value={request.id} /><input type="hidden" name="action" value="CANCELLED" /><textarea name="reviewNote" rows={2} placeholder="Cancel note" className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-xs" /><button type="submit" className="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--ink-muted)]">Cancel</button></form></div> : null}
    </div>
  );
}
