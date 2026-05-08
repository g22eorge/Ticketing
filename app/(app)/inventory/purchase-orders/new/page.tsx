import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { NewPurchaseOrderForm } from "./NewPurchaseOrderForm";

export const dynamic = "force-dynamic";

export default async function NewPurchaseOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ supplierId?: string }>;
}) {
  const { user, orgId } = await requireOrgSession();
  if (!can.manageUsers(user)) redirect("/inventory");

  const { supplierId } = await searchParams;

  const [suppliers, parts] = await Promise.all([
    prisma.supplier.findMany({
      where: { orgId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.part.findMany({
      where: { orgId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true, unitCost: true },
    }),
  ]);

  if (suppliers.length === 0) {
    redirect("/inventory/suppliers/new");
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-[var(--ink)]">New Purchase Order</h1>
        <p className="mt-0.5 text-sm text-[var(--ink-muted)]">Order stock from a supplier.</p>
      </div>
      <NewPurchaseOrderForm
        suppliers={suppliers}
        parts={parts}
        defaultSupplierId={supplierId}
      />
    </div>
  );
}
