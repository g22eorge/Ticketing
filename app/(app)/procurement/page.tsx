import Link from "next/link";
import { redirect } from "next/navigation";

import { requireModule, OrgModule } from "@/lib/module-access";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";

const workflows = [
  {
    href: "/inventory/purchase-requests",
    title: "Purchase Requests",
    description: "Raise, review, approve, and convert requests into purchase orders.",
  },
  {
    href: "/inventory/purchase-orders",
    title: "Purchase Orders",
    description: "Create supplier orders and track order status through receiving.",
  },
  {
    href: "/inventory/goods-received",
    title: "Goods Received",
    description: "Post GRNs and update stock at receiving locations.",
  },
  {
    href: "/inventory/supplier-bills",
    title: "Supplier Bills",
    description: "Record supplier invoices, match them to POs/GRNs, and track payments.",
  },
  {
    href: "/inventory/suppliers",
    title: "Suppliers",
    description: "Manage supplier details and negotiated part price lists.",
  },
] as const;

export default async function ProcurementPage() {
  await requireModule(OrgModule.INVENTORY);
  const { user } = await requireOrgSession();

  if (!can.manageInventory(user)) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-4">
      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        <p className="text-[13px] font-bold text-[var(--ink)]">Procurement</p>
        <p className="mt-1 text-[12px] text-[var(--ink-muted)]">
          Supplier purchasing, receiving, and supplier bill payment workflows.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {workflows.map((workflow) => (
          <Link
            key={workflow.href}
            href={workflow.href}
            className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:border-[var(--accent)]/50 hover:shadow-md"
          >
            <p className="text-sm font-bold text-[var(--ink)]">{workflow.title}</p>
            <p className="mt-2 text-xs leading-5 text-[var(--ink-muted)]">{workflow.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
