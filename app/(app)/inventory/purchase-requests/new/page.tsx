import { redirect } from "next/navigation";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { NewPurchaseRequestForm } from "./NewPurchaseRequestForm";

export const dynamic = "force-dynamic";

export default async function NewPurchaseRequestPage() {
  const { user, orgId } = await requireOrgSession();
  if (!can.manageInventory(user)) redirect("/inventory");

  const [suppliers, parts, openRequestCount, urgentRequestCount] = await Promise.all([
    prisma.supplier.findMany({ where: { orgId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.part.findMany({ where: { orgId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, sku: true, name: true, unitCost: true } }),
    prisma.purchaseRequest.count({ where: { orgId, status: { in: ["DRAFT", "SUBMITTED", "APPROVED"] } } }).catch(() => 0),
    prisma.purchaseRequest.count({ where: { orgId, priority: "URGENT", status: { in: ["DRAFT", "SUBMITTED", "APPROVED"] } } }).catch(() => 0),
  ]);

  return (
    <div className="space-y-4">
      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Inventory · Purchase Request</p>
            <p className="text-[13px] font-bold text-[var(--ink)]">New Purchase Request</p>
            <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">Capture the buying case before it becomes a purchase order.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/inventory/purchase-requests" className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">
              Request Register
            </Link>
            <Link href="/inventory/suppliers" className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">
              Suppliers
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Open Requests" value={openRequestCount.toLocaleString()} hint={`${urgentRequestCount} urgent`} tone={urgentRequestCount > 0 ? "amber" : "neutral"} />
        <Metric label="Suppliers" value={suppliers.length.toLocaleString()} hint="active vendors" tone="neutral" />
        <Metric label="Catalog Items" value={parts.length.toLocaleString()} hint="available to request" tone="neutral" />
        <Metric label="Workflow" value="PR -> PO" hint="approve before ordering" tone="green" />
      </div>

      <NewPurchaseRequestForm suppliers={suppliers} parts={parts} />
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
