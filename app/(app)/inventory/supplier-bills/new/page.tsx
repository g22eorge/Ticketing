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
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[var(--ink)]">New Supplier Bill</h1>
        <p className="mt-0.5 text-sm text-[var(--ink-muted)]">Record a supplier invoice for procurement costs.</p>
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
