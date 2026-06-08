import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { NewSupplierBillForm } from "./NewSupplierBillForm";

export const dynamic = "force-dynamic";

export default async function NewSupplierBillPage({
  searchParams,
}: {
  searchParams: Promise<{ supplierId?: string; poId?: string; grnId?: string }>;
}) {
  const { user, orgId, org } = await requireOrgSession();
  if (!can.manageInventory(user)) redirect("/inventory");
  const params = await searchParams;

  const [suppliers, purchaseOrders, goodsReceived] = await Promise.all([
    prisma.supplier.findMany({ where: { orgId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.purchaseOrder.findMany({ where: { orgId, status: { in: ["ORDERED", "PARTIAL", "RECEIVED"] } }, orderBy: { createdAt: "desc" }, select: { id: true, supplierId: true, reference: true } }).catch(() => []),
    prisma.goodsReceived.findMany({ where: { orgId, status: "POSTED" }, orderBy: { receivedAt: "desc" }, select: { id: true, supplierId: true, poId: true, grnNumber: true } }).catch(() => []),
  ]);

  if (suppliers.length === 0) redirect("/inventory/suppliers/new");

  return (
    <div className="max-w-5xl space-y-4">
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="px-4 py-3">
          <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Inventory</p>
          <p className="text-[13px] font-bold text-[var(--ink)]">New Supplier Bill</p>
          <p className="text-[13px] text-[var(--ink-muted)]">Record a supplier invoice for procurement costs.</p>
        </div>
      </div>
      <NewSupplierBillForm
        suppliers={suppliers}
        purchaseOrders={purchaseOrders}
        goodsReceived={goodsReceived}
        defaultSupplierId={params.supplierId}
        defaultPoId={params.poId}
        defaultGrnId={params.grnId}
        baseCurrency={org.baseCurrency}
      />
    </div>
  );
}
