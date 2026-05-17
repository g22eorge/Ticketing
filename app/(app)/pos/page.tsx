import { redirect } from "next/navigation";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { getCurrentUserRole } from "@/lib/session";
import { formatMoney } from "@/lib/currency";
import { openSession } from "./actions";

export default async function PosPage() {
  const { user } = await getCurrentUserRole();
  if (!can.openPosSession(user)) {
    redirect("/");
  }

  const [activeSessions, pastSessions] = await Promise.all([
    prisma.posSession.findMany({
      where: { status: "OPEN" },
      include: { operator: { select: { name: true } } },
      orderBy: { openedAt: "desc" },
    }),
    prisma.posSession.findMany({
      where: { status: "CLOSED" },
      include: { operator: { select: { name: true } } },
      orderBy: { closedAt: "desc" },
      take: 30,
    }),
  ]);

  async function openSessionAction(formData: FormData) {
    "use server";
    const floatRaw = String(formData.get("openingFloat") ?? "0");
    const openingFloat = parseFloat(floatRaw) || 0;
    const session = await openSession(openingFloat);
    redirect(`/pos/${session.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--ink)]">Point of Sale</h1>
          <p className="text-sm text-[var(--ink-muted)]">Manage POS sessions and sales</p>
        </div>
      </div>

      {activeSessions.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Active Sessions</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeSessions.map((s) => (
              <Link
                key={s.id}
                href={`/pos/${s.id}`}
                className="panel-shadow block rounded-xl border border-[var(--accent)]/30 bg-[var(--panel)] p-4 transition hover:border-[var(--accent)]/60"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[var(--ink)]">{s.operator.name}</p>
                    <p className="text-xs text-[var(--ink-muted)]">
                      Opened {new Date(s.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                    OPEN
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-[var(--ink-muted)]">Total sales</span>
                  <span className="text-sm font-semibold text-[var(--ink)]">{formatMoney(s.totalSales)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--ink-muted)]">Sales count</span>
                  <span className="text-sm text-[var(--ink)]">{s.salesCount}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <header className="border-b border-[var(--line)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Open New Session</h2>
        </header>
        <form action={openSessionAction} className="flex items-end gap-3 p-4">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-[var(--ink-muted)]">Opening float</label>
            <input
              name="openingFloat"
              type="number"
              step="any"
              min="0"
              placeholder="0"
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/14"
            />
          </div>
          <button type="submit" className="btn-premium rounded-lg px-5 py-2 text-sm font-semibold">
            Open Session
          </button>
        </form>
      </section>

      {pastSessions.length > 0 ? (
        <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <header className="border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--ink)]">Past Sessions</h2>
          </header>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--panel-strong)]/50 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">
                <tr>
                  <th className="px-4 py-2.5 text-left">Operator</th>
                  <th className="px-4 py-2.5 text-left">Date</th>
                  <th className="px-4 py-2.5 text-right">Sales</th>
                  <th className="px-4 py-2.5 text-right">Count</th>
                  <th className="px-4 py-2.5 text-left">Closed</th>
                </tr>
              </thead>
              <tbody>
                {pastSessions.map((s) => (
                  <tr key={s.id} className="border-t border-[var(--line)] hover:bg-[var(--panel-strong)]/40">
                    <td className="px-4 py-2.5 text-[var(--ink)]">{s.operator.name}</td>
                    <td className="px-4 py-2.5 text-[var(--ink-muted)]">
                      {new Date(s.openedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[var(--ink)]">{formatMoney(s.totalSales)}</td>
                    <td className="px-4 py-2.5 text-right text-[var(--ink-muted)]">{s.salesCount}</td>
                    <td className="px-4 py-2.5 text-[var(--ink-muted)]">
                      {s.closedAt ? new Date(s.closedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
