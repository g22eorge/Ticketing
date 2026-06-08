export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOrgSession } from "@/lib/org-context";

type Tile = { label: string; href: string; icon: string; color: string; description: string };

const GROUPS: { label: string; tiles: Tile[] }[] = [
  {
    label: "Locations & Movement",
    tiles: [
      {
        label: "Locations",
        href: "/inventory/locations",
        icon: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z|M12 10m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
        color: "text-blue-500",
        description: "Warehouses, shelves, and storage areas",
      },
      {
        label: "Transfers",
        href: "/inventory/transfers",
        icon: "M5 12h14|M12 5l7 7-7 7",
        color: "text-violet-500",
        description: "Move stock between locations",
      },
      {
        label: "Stock Counts",
        href: "/inventory/stock-counts",
        icon: "M9 11l3 3L22 4|M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
        color: "text-emerald-500",
        description: "Physical inventory audits",
      },
    ],
  },
  {
    label: "Suppliers & Procurement",
    tiles: [
      {
        label: "Suppliers",
        href: "/inventory/suppliers",
        icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M23 21v-2a4 4 0 0 1-3-3.87|M16 3.13a4 4 0 0 1 0 7.75|M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0",
        color: "text-amber-500",
        description: "Manage your supplier directory",
      },
      {
        label: "Goods Received",
        href: "/inventory/goods-received",
        icon: "M5 8h14M5 8a2 2 0 1 0-4 0v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8m-4 0V6a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v2",
        color: "text-teal-500",
        description: "Record incoming stock deliveries",
      },
      {
        label: "Supplier Bills",
        href: "/inventory/supplier-bills",
        icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M16 13H8|M16 17H8",
        color: "text-rose-500",
        description: "Track and reconcile supplier invoices",
      },
    ],
  },
];

function NavIcon({ d, color }: { d: string; color: string }) {
  const paths = d.split("|");
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={color} aria-hidden="true">
      {paths.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

export default async function StockOpsPage() {
  const { user } = await requireOrgSession();
  if (!["ADMIN", "MANAGER", "TECH_MANAGER", "OPS"].includes(user.role)) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6 pb-24 lg:pb-6">

      {/* Page header */}
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="px-4 py-4">
          <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Stock & Supply</p>
          <p className="text-[15px] font-bold text-[var(--ink)]">Stock Operations</p>
          <p className="text-[13px] text-[var(--ink-muted)]">Locations, suppliers, counts, and goods received</p>
        </div>
      </div>

      {/* Quick links back to daily items */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: "← Inventory Items", href: "/inventory" },
          { label: "Purchase Requests", href: "/inventory/purchase-requests" },
          { label: "Purchase Orders",  href: "/inventory/purchase-orders"  },
        ].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-[12px] font-semibold text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)] hover:bg-[var(--panel-strong)]"
          >
            {l.label}
          </Link>
        ))}
      </div>

      {/* Grouped tiles */}
      <div className="space-y-5">
        {GROUPS.map((group) => (
          <section key={group.label}>
            <h2 className="mb-2.5 px-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              {group.label}
            </h2>
            {/* Mobile */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:hidden">
              {group.tiles.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 rounded-2xl bg-[var(--panel)] px-4 py-3.5 transition-all active:opacity-75"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--panel-strong)]">
                    <NavIcon d={item.icon} color={item.color} />
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--ink)]">{item.label}</p>
                    <p className="text-[11px] text-[var(--ink-muted)]">{item.description}</p>
                  </div>
                </Link>
              ))}
            </div>
            {/* Desktop */}
            <div className="hidden gap-3 lg:grid lg:grid-cols-4">
              {group.tiles.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-4 transition-all hover:border-[var(--accent)]/30 hover:bg-[var(--panel-strong)] active:scale-[0.97]"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--panel-strong)]">
                    <NavIcon d={item.icon} color={item.color} />
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--ink)]">{item.label}</p>
                    <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">{item.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

    </div>
  );
}
