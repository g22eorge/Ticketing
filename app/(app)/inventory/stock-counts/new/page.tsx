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

  return <div className="max-w-4xl space-y-4"><div><h1 className="text-xl font-bold text-[var(--ink)]">New Stock Count</h1><p className="mt-0.5 text-sm text-[var(--ink-muted)]">Record physical counts and submit variances for approval.</p></div><NewStockCountForm locations={locations} parts={parts.map((part) => ({ id: part.id, sku: part.sku, name: part.name, qty: part.qtyOnHand }))} /></div>;
}
