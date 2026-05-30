import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { NewPurchaseRequestForm } from "./NewPurchaseRequestForm";

export const dynamic = "force-dynamic";

export default async function NewPurchaseRequestPage() {
  const { user, orgId } = await requireOrgSession();
  if (!can.manageInventory(user)) redirect("/inventory");

  const [suppliers, parts] = await Promise.all([
    prisma.supplier.findMany({ where: { orgId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.part.findMany({ where: { orgId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, sku: true, name: true, unitCost: true } }),
  ]);

  return (
    <div className="max-w-3xl space-y-4">
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="px-4 py-3">
          <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Inventory</p>
          <p className="text-[13px] font-bold text-[var(--ink)]">New Purchase Request</p>
          <p className="text-[13px] text-[var(--ink-muted)]">Request approval before creating a purchase order.</p>
        </div>
      </div>
      <NewPurchaseRequestForm suppliers={suppliers} parts={parts} />
    </div>
  );
}
