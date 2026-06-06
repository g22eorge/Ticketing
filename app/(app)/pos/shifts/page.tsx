// @ts-nocheck
import { redirect } from "next/navigation";
import { getCurrentUserRole } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmitButton } from "@/components/shared/ConfirmSubmitButton";

export const dynamic = "force-dynamic";

export default async function CashierShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { user } = await getCurrentUserRole();

  if (!["ADMIN", "OPS", "FRONT_DESK"].includes(user.role)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const statusFilter = params.status ?? "all";

  // ── Server actions ───────────────────────────────────────────────────────────

  async function openShiftAction(formData: FormData) {
    "use server";
    const { user: _u } = await getCurrentUserRole();
    if (!["ADMIN", "OPS", "FRONT_DESK"].includes(user.role)) return;

    const openingCashRaw = Number(String(formData.get("openingCash") ?? "0").trim());
    const notes = String(formData.get("notes") ?? "").trim();
    const openingCash = Number.isFinite(openingCashRaw) && openingCashRaw >= 0 ? openingCashRaw : 0;

    // Only one open shift per cashier at a time
    const existing = await prisma.cashierShift.findFirst({
      where: { cashierId: user.id, status: "OPEN" },
      select: { id: true },
    }).catch(() => null);
    if (existing) return;

    await prisma.cashierShift.create({
      data: {
        cashierId: user.id,
        status: "OPEN",
        openingCash,
        notes: notes || null,
      },
    }).catch(() => {});
    revalidatePath("/pos/shifts");
  }

  async function closeShiftAction(formData: FormData) {
    "use server";
    const { user: _u } = await getCurrentUserRole();
    if (!["ADMIN", "OPS", "FRONT_DESK"].includes(user.role)) return;

    const shiftId = String(formData.get("shiftId") ?? "").trim();
    const closingCashRaw = Number(String(formData.get("closingCash") ?? "0").trim());
    const notes = String(formData.get("notes") ?? "").trim();
    if (!shiftId) return;

    const closingCash = Number.isFinite(closingCashRaw) && closingCashRaw >= 0 ? closingCashRaw : 0;

    const shift = await prisma.cashierShift.findFirst({
      where: {
        id: shiftId,
        status: "OPEN",
        // non-admins can only close their own shift
        ...( !["ADMIN"].includes(user.role) ? { cashierId: user.id } : {} ),
      },
      select: { id: true },
    }).catch(() => null);
    if (!shift) return;

    await prisma.cashierShift.update({
      where: { id: shiftId },
      data: { status: "CLOSED", closingCash, closedAt: new Date(), notes: notes || null },
    }).catch(() => {});
    revalidatePath("/pos/shifts");
  }

  async function deleteShiftAction(formData: FormData) {
    "use server";
    const { user: _u } = await getCurrentUserRole();
    if (user.role !== "ADMIN") return;

    const shiftId = String(formData.get("shiftId") ?? "").trim();
    if (!shiftId) return;

    await prisma.cashierShift.delete({ where: { id: shiftId } }).catch(() => {});
    revalidatePath("/pos/shifts");
  }

  // ── Data fetching ────────────────────────────────────────────────────────────

  const where: Prisma.CashierShiftWhereInput = {};
  if (statusFilter === "open") where.status = "OPEN";
  if (statusFilter === "closed") where.status = "CLOSED";

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [shifts, openCount, totalShifts, closedThisMonth, cashCollectedAgg] = await Promise.all([
    prisma.cashierShift.findMany({
      where,
      orderBy: { openedAt: "desc" },
      take: 100,
    }).catch(() => []),
    prisma.cashierShift.count({ where: { status: "OPEN" } }).catch(() => 0),
    prisma.cashierShift.count({ where: {} }).catch(() => 0),
    prisma.cashierShift.count({ where: { status: "CLOSED", closedAt: { gte: monthStart } } }).catch(() => 0),
    prisma.cashierShift.aggregate({ _sum: { closingCash: true }, where: { status: "CLOSED", closedAt: { gte: monthStart } } }).catch(() => ({ _sum: { closingCash: 0 } })),
  ]);
  const cashCollectedThisMonth = cashCollectedAgg._sum.closingCash ?? 0;

  // Fetch cashier names in one query
  const cashierIds = [...new Set(shifts.map((s) => s.cashierId))];
  const cashiers = cashierIds.length
    ? await prisma.user.findMany({
        where: { id: { in: cashierIds } },
        select: { id: true, name: true },
      }).catch(() => [])
    : [];
  const cashierMap = Object.fromEntries(cashiers.map((c) => [c.id, c.name]));

  const myOpenShift = shifts.find((s) => s.cashierId === user.id && s.status === "OPEN") ?? null;

  const currency = "UGX";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <p className="text-[13px] font-bold text-[var(--ink)]">Cashier Shifts</p>
            <p className="text-[13px] text-[var(--ink-muted)]">Open and close shifts, reconcile cash at end of day</p>
          </div>
        </div>
      </div>

      {/* ── KPI tiles ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Total Shifts</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{totalShifts}</p>
          <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">all time</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Open Shifts</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{openCount}</p>
          <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">currently open</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Closed This Month</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{closedThisMonth}</p>
          <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">this month</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Cash Collected This Month</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{formatMoney(cashCollectedThisMonth, currency)}</p>
          <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">closing cash, this month</p>
        </div>
      </div>

      {/* Open my shift panel */}
      {!myOpenShift && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="mb-3 text-sm font-bold text-[var(--ink)]">Open Your Shift</h2>
          <form action={openShiftAction} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                Opening Cash ({currency})
              </label>
              <input
                name="openingCash"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0"
                className="h-9 w-40 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                Notes (optional)
              </label>
              <input
                name="notes"
                placeholder="Handover note, branch info…"
                className="h-9 w-64 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>
            <button
              type="submit"
              className="btn-premium h-9 rounded-lg px-5 text-sm font-semibold"
            >
              Open Shift
            </button>
          </form>
        </div>
      )}

      {/* Close my open shift */}
      {myOpenShift && (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold text-emerald-700 dark:text-emerald-300">Your Shift is Open</h2>
              <p className="text-[12px] text-emerald-700 dark:text-emerald-400">
                Opened {myOpenShift.openedAt.toLocaleString()} · Opening cash: {formatMoney(myOpenShift.openingCash, currency)}
              </p>
            </div>
          </div>
          <form action={closeShiftAction} className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="shiftId" value={myOpenShift.id} />
            <div className="space-y-1">
              <label className="text-[13px] font-semibold uppercase tracking-wide text-emerald-700">
                Closing Cash ({currency})
              </label>
              <input
                name="closingCash"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0"
                required
                className="h-9 w-40 rounded-lg border border-emerald-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[13px] font-semibold uppercase tracking-wide text-emerald-700">
                Closing Notes
              </label>
              <input
                name="notes"
                placeholder="End-of-day notes…"
                className="h-9 w-64 rounded-lg border border-emerald-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <ConfirmSubmitButton
              message="Close this shift? This will record the closing cash and mark the shift as closed."
              confirmLabel="Close Shift"
              className="h-9 rounded-lg bg-emerald-700 px-5 text-sm font-semibold text-white hover:opacity-90"
            >Close Shift</ConfirmSubmitButton>
          </form>
        </div>
      )}

      {/* Filter */}
      <form method="GET" className="flex gap-2">
        {(["all", "open", "closed"] as const).map((s) => (
          <button
            key={s}
            name="status"
            value={s}
            type="submit"
            className={`h-8 rounded-lg px-3 text-sm font-semibold capitalize transition-colors ${
              statusFilter === s
                ? "bg-[var(--accent)] text-white"
                : "border border-[var(--border)] text-[var(--ink-muted)] hover:bg-[var(--surface-raised)]"
            }`}
          >
            {s}
          </button>
        ))}
      </form>

      {/* Shifts table */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        {shifts.length === 0 ? (
          <div className="py-16 text-center text-sm text-[var(--ink-muted)]">No shifts found</div>
        ) : (<>
          {/* Mobile */}
          <div className="divide-y divide-[var(--border)] lg:hidden">
            {shifts.map((shift) => {
              const variance = shift.closingCash != null ? shift.closingCash - shift.openingCash : null;
              const isOpen = shift.status === "OPEN";
              return (
                <div key={`m-${shift.id}`} className="px-4 py-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-medium text-[var(--ink)]">
                      {cashierMap[shift.cashierId] ?? shift.cashierId.slice(0, 8)}
                      {shift.cashierId === user.id && <span className="ml-1.5 rounded border border-blue-400/30 bg-blue-500/10 px-1 py-0.5 text-[12px] font-semibold text-blue-700 dark:text-blue-400">you</span>}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-[13px] font-semibold ${isOpen ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]"}`}>{shift.status}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[13px] text-[var(--ink-muted)]">
                    <span>Open: {shift.openedAt.toLocaleString()}</span>
                    {shift.closedAt && <span>Close: {shift.closedAt.toLocaleString()}</span>}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[12px]">
                    <span className="text-[var(--ink-muted)]">Opening {formatMoney(shift.openingCash, currency)}</span>
                    {shift.closingCash != null && <span className="text-[var(--ink)]">Closing {formatMoney(shift.closingCash, currency)}</span>}
                    {variance != null && <span className={variance < 0 ? "font-semibold text-red-600" : variance > 0 ? "font-semibold text-emerald-600" : "text-[var(--ink-muted)]"}>{variance >= 0 ? "+" : ""}{formatMoney(variance, currency)}</span>}
                  </div>
                  {["ADMIN"].includes(user.role) && (
                    <div className="mt-2 flex items-center gap-2">
                      {isOpen && shift.cashierId !== user.id && (
                        <form action={closeShiftAction}>
                          <input type="hidden" name="shiftId" value={shift.id} />
                          <input type="hidden" name="closingCash" value="0" />
                          <ConfirmSubmitButton message="Force close this shift? Closing cash will be set to 0." confirmLabel="Force Close" className="rounded border border-orange-400/30 px-2 py-0.5 text-[13px] font-semibold text-orange-600 hover:bg-orange-500/10 dark:text-orange-400">Force close</ConfirmSubmitButton>
                        </form>
                      )}
                      {user.role === "ADMIN" && !isOpen && (
                        <form action={deleteShiftAction}>
                          <input type="hidden" name="shiftId" value={shift.id} />
                          <ConfirmSubmitButton message="Delete this shift record? This cannot be undone." confirmLabel="Delete" className="rounded border border-red-400/30 px-2 py-0.5 text-[13px] font-semibold text-red-600 hover:bg-red-500/10 dark:text-red-400">Delete</ConfirmSubmitButton>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {/* Desktop */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                  <th className="px-4 py-3 text-left">Cashier</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Opened</th>
                  <th className="px-4 py-3 text-left">Closed</th>
                  <th className="px-4 py-3 text-right">Opening Cash</th>
                  <th className="px-4 py-3 text-right">Closing Cash</th>
                  <th className="px-4 py-3 text-right">Variance</th>
                  <th className="px-4 py-3 text-left">Notes</th>
                  {["ADMIN"].includes(user.role) && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {shifts.map((shift) => {
                  const variance = shift.closingCash != null ? shift.closingCash - shift.openingCash : null;
                  const isOpen = shift.status === "OPEN";
                  return (
                    <tr key={`d-${shift.id}`} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-raised)]">
                      <td className="px-4 py-3 font-medium text-[var(--ink)]">
                        {cashierMap[shift.cashierId] ?? shift.cashierId.slice(0, 8)}
                        {shift.cashierId === user.id && <span className="ml-1.5 rounded border border-blue-400/30 bg-blue-500/10 px-1 py-0.5 text-[12px] font-semibold text-blue-700 dark:text-blue-400">you</span>}
                      </td>
                      <td className="px-4 py-3"><span className={`rounded px-1.5 py-0.5 text-[13px] font-semibold ${isOpen ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]"}`}>{shift.status}</span></td>
                      <td className="whitespace-nowrap px-4 py-3 text-[var(--ink-muted)]">{shift.openedAt.toLocaleString()}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-[var(--ink-muted)]">{shift.closedAt ? shift.closedAt.toLocaleString() : "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[var(--ink)]">{formatMoney(shift.openingCash, currency)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[var(--ink)]">{shift.closingCash != null ? formatMoney(shift.closingCash, currency) : "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{variance != null ? <span className={variance < 0 ? "font-semibold text-red-600" : variance > 0 ? "font-semibold text-emerald-600" : "text-[var(--ink-muted)]"}>{variance >= 0 ? "+" : ""}{formatMoney(variance, currency)}</span> : "—"}</td>
                      <td className="max-w-[160px] truncate px-4 py-3 text-[var(--ink-muted)]">{shift.notes || "—"}</td>
                      {["ADMIN"].includes(user.role) && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {isOpen && shift.cashierId !== user.id && (
                              <form action={closeShiftAction}><input type="hidden" name="shiftId" value={shift.id} /><input type="hidden" name="closingCash" value="0" /><ConfirmSubmitButton message="Force close this shift? Closing cash will be set to 0." confirmLabel="Force Close" className="rounded border border-orange-400/30 px-2 py-0.5 text-[13px] font-semibold text-orange-600 hover:bg-orange-500/10 dark:text-orange-400">Force close</ConfirmSubmitButton></form>
                            )}
                            {user.role === "ADMIN" && !isOpen && (
                              <form action={deleteShiftAction}><input type="hidden" name="shiftId" value={shift.id} /><ConfirmSubmitButton message="Delete this shift record? This cannot be undone." confirmLabel="Delete" className="rounded border border-red-400/30 px-2 py-0.5 text-[13px] font-semibold text-red-600 hover:bg-red-500/10 dark:text-red-400">Delete</ConfirmSubmitButton></form>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
        )}
      </div>
    </div>
  );
}
