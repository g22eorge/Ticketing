export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOrgSession } from "@/lib/org-context";

type Tile = { label: string; href: string; icon: string; color: string; description: string };

const GROUPS: { label: string; tiles: Tile[] }[] = [
  {
    label: "Daily",
    tiles: [
      {
        label: "Job Cards",
        href: "/documents/job-cards",
        icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2|M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2|M9 5a2 2 0 0 0 2-2h2a2 2 0 0 0 2 2|M9 12h6|M9 16h4",
        color: "text-sky-500",
        description: "Print and share repair job cards",
      },
      {
        label: "Quotations",
        href: "/documents/quotations",
        icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M10 13h4|M8 17h8|M8 9h2",
        color: "text-teal-500",
        description: "Issue and track customer quotes",
      },
      {
        label: "Invoices",
        href: "/documents/invoices",
        icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M16 13H8|M16 17H8|M10 9H8",
        color: "text-amber-500",
        description: "Bill customers and collect payment",
      },
      {
        label: "Receipts",
        href: "/documents/receipts",
        icon: "M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z|M9 12h6|M9 16h6|M9 8h2",
        color: "text-emerald-500",
        description: "Proof of payment for customers",
      },
    ],
  },
  {
    label: "Post-Sale",
    tiles: [
      {
        label: "Delivery Notes",
        href: "/documents/delivery-notes",
        icon: "M5 8h14M5 8a2 2 0 1 0-4 0v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8m-4 0V6a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v2|M10 14l2 2 4-4",
        color: "text-blue-500",
        description: "Confirm devices handed back to client",
      },
      {
        label: "Credit Notes",
        href: "/documents/credit-notes",
        icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M9 15l2 2 4-4|M9 9h6",
        color: "text-cyan-500",
        description: "Issue credit against invoices",
      },
      {
        label: "Refunds",
        href: "/documents/refunds",
        icon: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8|M3 3v5h5|M12 7v5l4 2",
        color: "text-orange-400",
        description: "Process and track customer refunds",
      },
    ],
  },
  {
    label: "Configuration",
    tiles: [
      {
        label: "Templates",
        href: "/documents/templates",
        icon: "M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5z|M4 13a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6z|M16 13a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-6z",
        color: "text-slate-400",
        description: "Manage document and message templates",
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

export default async function DocumentsHubPage() {
  const { user } = await requireOrgSession();
  if (!["ADMIN", "MANAGER", "TECH_MANAGER", "OPS", "FRONT_DESK", "TECHNICIAN_INTERNAL", "SALES", "SALES_MANAGER", "SALES_CORPORATE", "SALES_RETAIL", "FINANCE"].includes(user.role)) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6 pb-24 lg:pb-6">

      {/* Page header */}
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="px-4 py-4">
          <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Documents</p>
          <p className="text-[15px] font-bold text-[var(--ink)]">Documents Hub</p>
          <p className="text-[13px] text-[var(--ink-muted)]">All document types — from quotes to refunds</p>
        </div>
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
