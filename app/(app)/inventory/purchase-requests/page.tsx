import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { deletePurchaseRequestAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",
  SUBMITTED: "border-sky-500/30 bg-sky-500/15 text-sky-700",
  APPROVED: "border-emerald-500/30 bg-emerald-500/15 text-emerald-700",
  REJECTED: "border-red-500/20 bg-red-500/10 text-red-600",
  CONVERTED: "border-violet-500/30 bg-violet-500/15 text-violet-700",
  CANCELLED: "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",
};

export default async function PurchaseRequestsPage() {
  const { user, orgId } = await requireOrgSession();
  if (!can.manageInventory(user)) redirect("/inventory");

  const requests = await prisma.purchaseRequest.findMany({
    where: { orgId },
    include: {
      supplier: { select: { name: true } },
      requestedBy: { select: { name: true, email: true } },
      convertedPo: { select: { id: true, reference: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  }).catch(() => []);

  const fmt = (d: Date | null) => d ? d.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" }) : "-";

  return (
    <div className="space-y-4">
      <div className="panel-shadow flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
        <div>
          <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Inventory</p>
          <p className="text-[13px] font-bold text-[var(--ink)]">Purchase Requests <span className="font-normal text-[var(--ink-muted)]">· {requests.length}</span></p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/api/procurement/export?type=purchase-requests" className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-[12px] font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">Export CSV</Link>
          <Link href="/inventory/purchase-requests/new" className="btn-premium rounded-lg px-3 py-1.5 text-[12px]">New Request</Link>
        </div>
      </div>

      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--panel-strong)] text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              <tr>
                <th className="px-4 py-2.5 text-left">Request</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-left hidden md:table-cell">Supplier</th>
                <th className="px-4 py-2.5 text-left hidden sm:table-cell">Needed</th>
                <th className="px-4 py-2.5 text-center">Items</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id} className="border-t border-[var(--line)] align-middle hover:bg-[var(--panel-strong)]/40">
                  <td className="px-4 py-3"><p className="mono text-sm font-bold text-[var(--ink)]">{request.requestNumber}</p><p className="text-xs text-[var(--ink-muted)]">{request.priority} · {fmt(request.createdAt)}</p></td>
                  <td className="px-4 py-3"><span className={`rounded-full border px-2.5 py-0.5 text-[13px] font-semibold ${STATUS_COLORS[request.status] ?? STATUS_COLORS.SUBMITTED}`}>{request.status}</span></td>
                  <td className="px-4 py-3 hidden md:table-cell text-[var(--ink-muted)]">{request.supplier?.name ?? "No preference"}</td>
                  <td className="px-4 py-3 hidden sm:table-cell text-[var(--ink-muted)]">{fmt(request.neededBy)}</td>
                  <td className="px-4 py-3 text-center text-[var(--ink-muted)]">{request._count.items}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      <Link href={`/inventory/purchase-requests/${request.id}`} className="inline-flex items-center rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">View</Link>
                      {!request.convertedPo ? (
                        <form action={deletePurchaseRequestAction}>
                          <input type="hidden" name="id" value={request.id} />
                          <button type="submit" className="rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-600">Delete</button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {requests.length === 0 ? <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-[var(--ink-muted)]">No purchase requests yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
