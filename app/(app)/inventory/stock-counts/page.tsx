// @ts-nocheck
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserRole } from "@/lib/session";

import { orgDb, prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function StockCountsPage() {
  const { user } = await getCurrentUserRole();
  const db = orgDb(user.orgId);
  if (!can.manageInventory(user)) redirect("/inventory");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [counts, inProgressCount, completedThisMonth, varianceItems] = await Promise.all([
    db.stockCount.findMany({
      where: {},
      include: { location: { select: { name: true, code: true } }, createdBy: { select: { name: true, email: true } }, _count: { select: { items: true } } },
      orderBy: { countedAt: "desc" },
      take: 100,
    }).catch(() => []),
    db.stockCount.count({ where: { status: { in: ["DRAFT", "SUBMITTED"] } } }).catch(() => 0),
    db.stockCount.count({ where: { status: "APPROVED", countedAt: { gte: monthStart } } }).catch(() => 0),
    prisma.stockCountItem.count({ where: { varianceQty: { not: 0 } } }).catch(() => 0),
  ]);

  const varianceCount = varianceItems;

  const fmt = (d: Date) => d.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="space-y-4">
      <div className="panel-shadow flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
        <div>
          <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Inventory</p>
          <p className="text-[13px] font-bold text-[var(--ink)]">Stock Counts <span className="font-normal text-[var(--ink-muted)]">· {counts.length}</span></p>
        </div>
        <Link href="/inventory/stock-counts/new" className="btn-premium rounded-lg px-3 py-1.5 text-[12px]">New Count</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Total Counts</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{counts.length}</p>
          <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">all time</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">In Progress</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{inProgressCount}</p>
          <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">draft or submitted</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Completed This Month</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{completedThisMonth}</p>
          <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">approved counts</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Variance Items</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{varianceCount}</p>
          <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">counted ≠ expected</p>
        </div>
      </div>

      <div className="panel-shadow overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--panel-strong)] text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            <tr>
              <th className="px-4 py-2.5 text-left">Count</th>
              <th className="px-4 py-2.5 text-left">Status</th>
              <th className="px-4 py-2.5 text-left hidden sm:table-cell">Location</th>
              <th className="px-4 py-2.5 text-center">Items</th>
              <th className="px-4 py-2.5 text-right">Date</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {counts.map((count) => (
              <tr key={count.id} className="border-t border-[var(--line)] hover:bg-[var(--panel-strong)]/40">
                <td className="px-4 py-3">
                  <p className="mono text-sm font-bold text-[var(--ink)]">{count.countNumber}</p>
                  <p className="text-xs text-[var(--ink-muted)]">{count.createdBy.name || count.createdBy.email}</p>
                </td>
                <td className="px-4 py-3 text-xs font-semibold text-[var(--ink-muted)]">{count.status}</td>
                <td className="px-4 py-3 hidden sm:table-cell text-[var(--ink-muted)]">{count.location.name}{count.location.code ? ` (${count.location.code})` : ""}</td>
                <td className="px-4 py-3 text-center text-[var(--ink-muted)]">{count._count.items}</td>
                <td className="px-4 py-3 text-right text-[var(--ink-muted)]">{fmt(count.countedAt)}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/inventory/stock-counts/${count.id}`} className="inline-flex items-center rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">View</Link>
                </td>
              </tr>
            ))}
            {counts.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-[var(--ink-muted)]">No stock counts yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
