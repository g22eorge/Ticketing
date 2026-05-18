import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { requireModule, OrgModule } from "@/lib/module-access";
import { assertOrgCanMutate } from "@/lib/org-write";
import { ConfirmSubmitButton } from "@/components/shared/ConfirmSubmitButton";

export const dynamic = "force-dynamic";

export default async function CashierShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireModule(OrgModule.POS);
  const { user, orgId, org } = await requireOrgSession();

  if (!["ADMIN", "MANAGER", "OPS", "FINANCE", "FRONT_DESK"].includes(user.role)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const statusFilter = params.status ?? "all";

  // ── Server actions ───────────────────────────────────────────────────────────

  async function openShiftAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!["ADMIN", "MANAGER", "OPS", "FINANCE", "FRONT_DESK"].includes(user.role)) return;
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const openingCashRaw = Number(String(formData.get("openingCash") ?? "0").trim());
    const notes = String(formData.get("notes") ?? "").trim();
    const openingCash = Number.isFinite(openingCashRaw) && openingCashRaw >= 0 ? openingCashRaw : 0;

    // Only one open shift per cashier at a time
    const existing = await prisma.cashierShift.findFirst({
      where: { orgId, cashierId: user.id, status: "OPEN" },
      select: { id: true },
    }).catch(() => null);
    if (existing) return;

    await prisma.cashierShift.create({
      data: {
        orgId,
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
    const { user, orgId, org } = await requireOrgSession();
    if (!["ADMIN", "MANAGER", "OPS", "FINANCE", "FRONT_DESK"].includes(user.role)) return;
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const shiftId = String(formData.get("shiftId") ?? "").trim();
    const closingCashRaw = Number(String(formData.get("closingCash") ?? "0").trim());
    const notes = String(formData.get("notes") ?? "").trim();
    if (!shiftId) return;

    const closingCash = Number.isFinite(closingCashRaw) && closingCashRaw >= 0 ? closingCashRaw : 0;

    const shift = await prisma.cashierShift.findFirst({
      where: {
        id: shiftId,
        orgId,
        status: "OPEN",
        // non-admins can only close their own shift
        ...( !["ADMIN", "MANAGER"].includes(user.role) ? { cashierId: user.id } : {} ),
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
    const { user, orgId } = await requireOrgSession();
    if (user.role !== "ADMIN") return;

    const shiftId = String(formData.get("shiftId") ?? "").trim();
    if (!shiftId) return;

    await prisma.cashierShift.delete({ where: { id: shiftId, orgId } }).catch(() => {});
    revalidatePath("/pos/shifts");
  }

  // ── Data fetching ────────────────────────────────────────────────────────────

  const where: Prisma.CashierShiftWhereInput = { orgId };
  if (statusFilter === "open") where.status = "OPEN";
  if (statusFilter === "closed") where.status = "CLOSED";

  const [shifts, openCount, totalShifts] = await Promise.all([
    prisma.cashierShift.findMany({
      where,
      orderBy: { openedAt: "desc" },
      take: 100,
    }).catch(() => []),
    prisma.cashierShift.count({ where: { orgId, status: "OPEN" } }).catch(() => 0),
    prisma.cashierShift.count({ where: { orgId } }).catch(() => 0),
  ]);

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

  const currency = org.baseCurrency;
  const totalOpeningCash = shifts
    .filter((s) => s.status === "OPEN")
    .reduce((sum, s) => sum + s.openingCash, 0);

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--ink)]">Cashier Shifts</h1>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">Open and close shifts, reconcile cash at end of day</p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: "Open Shifts", value: String(openCount), accent: openCount > 0 },
          { label: "Total Shifts", value: String(totalShifts), accent: false },
          { label: "Cash Float (open)", value: formatMoney(totalOpeningCash, currency), accent: false },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className={`rounded-xl border p-3 ${kpi.accent && openCount > 0 ? "border-emerald-200 bg-emerald-50" : "border-[var(--border)] bg-[var(--surface)]"}`}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ink-muted)]">{kpi.label}</p>
            <p className={`mt-1 text-[15px] font-black tabular-nums ${kpi.accent && openCount > 0 ? "text-emerald-700" : "text-[var(--ink)]"}`}>
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      {/* Open my shift panel */}
      {!myOpenShift && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="mb-3 text-sm font-bold text-[var(--ink)]">Open Your Shift</h2>
          <form action={openShiftAction} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
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
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
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
              className="h-9 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:opacity-90"
            >
              Open Shift
            </button>
          </form>
        </div>
      )}

      {/* Close my open shift */}
      {myOpenShift && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold text-emerald-800">Your Shift is Open</h2>
              <p className="text-[12px] text-emerald-700">
                Opened {myOpenShift.openedAt.toLocaleString()} · Opening cash: {formatMoney(myOpenShift.openingCash, currency)}
              </p>
            </div>
          </div>
          <form action={closeShiftAction} className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="shiftId" value={myOpenShift.id} />
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
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
              <label className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
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
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                  <th className="px-4 py-3 text-left">Cashier</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Opened</th>
                  <th className="px-4 py-3 text-left">Closed</th>
                  <th className="px-4 py-3 text-right">Opening Cash</th>
                  <th className="px-4 py-3 text-right">Closing Cash</th>
                  <th className="px-4 py-3 text-right">Variance</th>
                  <th className="px-4 py-3 text-left">Notes</th>
                  {["ADMIN", "MANAGER"].includes(user.role) && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {shifts.map((shift) => {
                  const variance =
                    shift.closingCash != null
                      ? shift.closingCash - shift.openingCash
                      : null;
                  const isOpen = shift.status === "OPEN";

                  return (
                    <tr key={shift.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-raised)]">
                      <td className="px-4 py-3 font-medium text-[var(--ink)]">
                        {cashierMap[shift.cashierId] ?? shift.cashierId.slice(0, 8)}
                        {shift.cashierId === user.id && (
                          <span className="ml-1.5 rounded bg-blue-50 px-1 py-0.5 text-[10px] font-semibold text-blue-700">you</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${isOpen ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                          {shift.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[var(--ink-muted)]">
                        {shift.openedAt.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[var(--ink-muted)]">
                        {shift.closedAt ? shift.closedAt.toLocaleString() : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[var(--ink)]">
                        {formatMoney(shift.openingCash, currency)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[var(--ink)]">
                        {shift.closingCash != null ? formatMoney(shift.closingCash, currency) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                        {variance != null ? (
                          <span className={variance < 0 ? "font-semibold text-red-600" : variance > 0 ? "font-semibold text-emerald-600" : "text-[var(--ink-muted)]"}>
                            {variance >= 0 ? "+" : ""}{formatMoney(variance, currency)}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="max-w-[160px] truncate px-4 py-3 text-[var(--ink-muted)]">
                        {shift.notes || "—"}
                      </td>
                      {["ADMIN", "MANAGER"].includes(user.role) && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {isOpen && shift.cashierId !== user.id && (
                              <form action={closeShiftAction}>
                                <input type="hidden" name="shiftId" value={shift.id} />
                                <input type="hidden" name="closingCash" value="0" />
                                <ConfirmSubmitButton
                                  message="Force close this shift? Closing cash will be set to 0."
                                  confirmLabel="Force Close"
                                  className="rounded border border-orange-200 px-2 py-0.5 text-[11px] font-semibold text-orange-600 hover:bg-orange-50"
                                >Force close</ConfirmSubmitButton>
                              </form>
                            )}
                            {user.role === "ADMIN" && !isOpen && (
                              <form action={deleteShiftAction}>
                                <input type="hidden" name="shiftId" value={shift.id} />
                                <ConfirmSubmitButton
                                  message="Delete this shift record? This cannot be undone."
                                  confirmLabel="Delete"
                                  className="rounded border border-red-200 px-2 py-0.5 text-[11px] font-semibold text-red-600 hover:bg-red-50"
                                >Delete</ConfirmSubmitButton>
                              </form>
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
        )}
      </div>
    </div>
  );
}
