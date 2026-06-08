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
  if (!can.manageInventory(user)) redirect("/inventory");

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

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Procurement</p>
            <h1 className="text-base font-bold text-[var(--ink)]">New Purchase Order</h1>
          </div>
          <p className="text-xs text-[var(--ink-muted)]">Draft or issue a supplier order.</p>
        </div>
      </div>
      <NewPurchaseOrderForm
        suppliers={suppliers}
        parts={parts}
        defaultSupplierId={supplierId}
      />
    </div>
  );
}
