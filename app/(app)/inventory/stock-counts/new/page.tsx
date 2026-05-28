import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { NewStockCountForm } from "./NewStockCountForm";

export const dynamic = "force-dynamic";

export default async function NewStockCountPage() {
  const { user, orgId } = await requireOrgSession();
  if (!can.manageInventory(user)) redirect("/inventory");

  const [locations, parts] = await Promise.all([
    prisma.stockLocation.findMany({ where: { orgId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }).catch(() => []),
    prisma.part.findMany({ where: { orgId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, sku: true, name: true, qtyOnHand: true } }),
  ]);

  if (locations.length === 0) redirect("/inventory/locations");

  return (
    <div className="max-w-4xl space-y-4">
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="px-4 py-3">
          <p className="text-[13px] font-bold text-[var(--ink)]">New Stock Count</p>
          <p className="text-[11px] text-[var(--ink-muted)]">Record physical counts and submit variances for approval.</p>
        </div>
      </div>
      <NewStockCountForm locations={locations} parts={parts.map((part) => ({ id: part.id, sku: part.sku, name: part.name, qty: part.qtyOnHand }))} />
    </div>
  );
}
