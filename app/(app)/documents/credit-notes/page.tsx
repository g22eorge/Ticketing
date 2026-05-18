import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PaymentMethod } from "@prisma/client";

import { formatMoney, normalizeCurrency } from "@/lib/currency";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { requireModule, OrgModule } from "@/lib/module-access";
import { assertOrgCanMutate } from "@/lib/org-write";
import { ConfirmSubmitButton } from "@/components/shared/ConfirmSubmitButton";

const PAYMENT_METHODS = Object.values(PaymentMethod);

export const dynamic = "force-dynamic";

export default async function CreditNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  await requireModule(OrgModule.INVOICING);
  const { user, orgId, org } = await requireOrgSession();
  if (!can.viewFinancials(user) && !["ADMIN", "OPS", "MANAGER"].includes(user.role)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const filter = params.filter ?? "all";

  // ── Server actions ───────────────────────────────────────────────────────────

  async function markItemsReceivedAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!can.viewFinancials(user) && !["ADMIN", "OPS"].includes(user.role)) return;
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "PAYMENT" });

    const creditNoteId = String(formData.get("creditNoteId") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();
    if (!creditNoteId) return;

    const cn = await prisma.creditNote.findFirst({ where: { id: creditNoteId, orgId }, select: { id: true, itemsReceivedBackAt: true } });
    if (!cn || cn.itemsReceivedBackAt) return;

    const { user: actor } = await requireOrgSession();
    await prisma.creditNote.update({
      where: { id: creditNoteId },
      data: { itemsReceivedBackAt: new Date(), itemsReceivedBackById: actor.id, itemsReceivedBackNote: note || null },
    });
    revalidatePath("/documents/credit-notes");
  }

  async function issueRefundFromCreditNoteAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!["ADMIN", "OPS", "MANAGER"].includes(user.role)) return;
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "PAYMENT" });

    const creditNoteId = String(formData.get("creditNoteId") ?? "").trim();
    const amountRaw = Number(String(formData.get("amount") ?? "").trim());
    const methodRaw = String(formData.get("method") ?? "CASH").trim();
    const reference = String(formData.get("reference") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();
    if (!creditNoteId || !Number.isFinite(amountRaw) || amountRaw <= 0) return;

    const cn = await prisma.creditNote.findFirst({
      where: { id: creditNoteId, orgId },
      select: { id: true, saleId: true, totalAmount: true, currency: true, refunds: { select: { amount: true } } },
    });
    if (!cn) return;

    const alreadyRefunded = cn.refunds.reduce((s, r) => s + r.amount, 0);
    if (alreadyRefunded + amountRaw > cn.totalAmount) return;

    const method = PAYMENT_METHODS.includes(methodRaw as PaymentMethod) ? (methodRaw as PaymentMethod) : PaymentMethod.CASH;

    await prisma.refund.create({
      data: {
        orgId,
        saleId: cn.saleId,
        creditNoteId: cn.id,
        currency: cn.currency,
        amount: amountRaw,
        method,
        reference: reference || null,
        note: note || null,
        createdById: user.id,
        refundedAt: new Date(),
      },
    });
    revalidatePath("/documents/credit-notes");
    revalidatePath("/documents/refunds");
  }

  async function createCreditNoteAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!["ADMIN", "OPS", "MANAGER"].includes(user.role)) return;
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const saleId = String(formData.get("saleId") ?? "").trim();
    const reason = String(formData.get("reason") ?? "").trim();
    const itemsJson = String(formData.get("items") ?? "[]");
    if (!saleId || !reason) return;

    let items: Array<{ description: string; quantity: number; unitPrice: number }> = [];
    try { items = JSON.parse(itemsJson); } catch { return; }
    if (!items.length) return;

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, orgId },
      select: { id: true, currency: true, saleNumber: true },
    });
    if (!sale) return;

    const totalAmount = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

    const countThisMonth = await prisma.creditNote.count({ where: { orgId } });
    const creditNoteNumber = `CN-${new Date().getFullYear()}-${String(countThisMonth + 1).padStart(4, "0")}`;

    await prisma.creditNote.create({
      data: {
        orgId,
        saleId,
        creditNoteNumber,
        currency: sale.currency,
        totalAmount,
        reason,
        createdById: user.id,
        items: {
          create: items.map((i) => ({
            description: i.description,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            lineTotal: i.quantity * i.unitPrice,
          })),
        },
      },
    });
    revalidatePath("/documents/credit-notes");
  }

  async function deleteCreditNoteAction(formData: FormData) {
    "use server";
    const { user, orgId } = await requireOrgSession();
    if (user.role !== "ADMIN") return;

    const id = String(formData.get("id") ?? "").trim();
    if (!id) return;

    const cn = await prisma.creditNote.findFirst({
      where: { id, orgId },
      select: { id: true, refunds: { select: { id: true } } },
    });
    if (!cn || cn.refunds.length > 0) return;

    await prisma.creditNote.delete({ where: { id } });
    revalidatePath("/documents/credit-notes");
  }

  // ── Data ─────────────────────────────────────────────────────────────────────

  const [creditNotes, eligibleSales] = await Promise.all([
    prisma.creditNote.findMany({
      where: {
        orgId,
        ...(filter === "pending" ? { itemsReceivedBackAt: null } : {}),
        ...(filter === "received" ? { itemsReceivedBackAt: { not: null } } : {}),
        ...(q
          ? {
              OR: [
                { creditNoteNumber: { contains: q } },
                { reason: { contains: q } },
                { sale: { saleNumber: { contains: q } } },
              ],
            }
          : {}),
      },
      include: {
        sale: { select: { saleNumber: true, client: { select: { fullName: true } } } },
        items: { select: { description: true, quantity: true, unitPrice: true, lineTotal: true } },
        refunds: { select: { amount: true, method: true, refundedAt: true } },
        itemsReceivedBackBy: { select: { name: true } },
      },
      orderBy: { issuedAt: "desc" },
      take: 100,
    }).catch(() => []),
    prisma.sale.findMany({
      where: { orgId, status: "PAID" },
      select: { id: true, saleNumber: true, totalAmount: true, currency: true, client: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }).catch(() => []),
  ]);

  const totalValue = creditNotes.reduce((s, cn) => s + cn.totalAmount, 0);
  const pendingReturn = creditNotes.filter((cn) => !cn.itemsReceivedBackAt).length;
  const totalRefunded = creditNotes.reduce((s, cn) => s + cn.refunds.reduce((r, rf) => r + rf.amount, 0), 0);
  const currency = org.baseCurrency;

  const fmt = (d: Date | string | null) =>
    d ? new Date(d).toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" }) : "—";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--ink)]">Credit Notes</h1>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">Sales returns and adjustments</p>
        </div>
        {["ADMIN", "OPS", "MANAGER"].includes(user.role) && (
          <details className="group relative">
            <summary className="cursor-pointer list-none rounded-lg border border-[var(--gold)]/40 bg-[var(--gold)]/10 px-4 py-2 text-sm font-semibold text-[var(--gold)] hover:bg-[var(--gold)]/20">
              + New Credit Note
            </summary>
            <div className="absolute right-0 top-full z-20 mt-1 w-80 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 shadow-lg">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Issue Credit Note</p>
              <form action={createCreditNoteAction} className="space-y-3">
                <select name="saleId" required className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]">
                  <option value="">Select sale…</option>
                  {eligibleSales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.saleNumber}{s.client?.fullName ? ` — ${s.client.fullName}` : ""} ({formatMoney(s.totalAmount, s.currency)})
                    </option>
                  ))}
                </select>
                <textarea name="reason" required placeholder="Reason for credit note…" rows={2} className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] resize-none" />
                <input type="hidden" name="items" value={JSON.stringify([{ description: "Credit for returned items", quantity: 1, unitPrice: 0 }])} />
                <p className="text-[11px] text-[var(--ink-muted)]">Items and amounts can be managed after creation.</p>
                <button type="submit" className="w-full rounded-lg bg-[var(--gold)]/20 py-2 text-sm font-semibold text-[var(--gold)] hover:bg-[var(--gold)]/30">
                  Create Credit Note
                </button>
              </form>
            </div>
          </details>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total Credit Notes", value: creditNotes.length, mono: false },
          { label: "Pending Return", value: pendingReturn, mono: false, warn: pendingReturn > 0 },
          { label: "Total Value", value: formatMoney(totalValue, currency), mono: true },
          { label: "Total Refunded", value: formatMoney(totalRefunded, currency), mono: true },
        ].map((kpi) => (
          <div key={kpi.label} className={`rounded-xl border px-4 py-3 ${kpi.warn ? "border-amber-200 bg-amber-50" : "border-[var(--line)] bg-[var(--panel)]"}`}>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">{kpi.label}</p>
            <p className={`mt-1 text-xl font-bold ${kpi.mono ? "font-mono tabular-nums" : ""} ${kpi.warn ? "text-amber-700" : "text-[var(--ink)]"}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex-1">
          <input name="q" defaultValue={q} placeholder="Search credit note, sale, reason…" className="w-full max-w-xs rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm text-[var(--ink)]" />
          {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
        </form>
        {(["all", "pending", "received"] as const).map((f) => (
          <Link
            key={f}
            href={`?filter=${f}${q ? `&q=${q}` : ""}`}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${filter === f ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--line)] text-[var(--ink-muted)] hover:text-[var(--ink)]"}`}
          >
            {f === "all" ? "All" : f === "pending" ? "Awaiting Return" : "Items Received"}
          </Link>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-left text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                <th className="px-4 py-3">Credit Note #</th>
                <th className="px-4 py-3">Sale</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3 text-right">Value</th>
                <th className="px-4 py-3 text-right">Refunded</th>
                <th className="px-4 py-3">Items Return</th>
                <th className="px-4 py-3">Issued</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {creditNotes.map((cn) => {
                const refundedTotal = cn.refunds.reduce((s, r) => s + r.amount, 0);
                const outstanding = cn.totalAmount - refundedTotal;
                return (
                  <tr key={cn.id} className="hover:bg-[var(--gold)]/5">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-[var(--ink)]">{cn.creditNoteNumber}</td>
                    <td className="px-4 py-3 text-[var(--ink-muted)]">{cn.sale?.saleNumber ?? "—"}</td>
                    <td className="px-4 py-3 text-[var(--ink)]">{cn.sale?.client?.fullName ?? <span className="text-[var(--ink-muted)]">Walk-in</span>}</td>
                    <td className="px-4 py-3 max-w-[180px] truncate text-[var(--ink-muted)]">{cn.reason}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-[var(--ink)]">{formatMoney(cn.totalAmount, cn.currency)}</td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-700">{refundedTotal > 0 ? formatMoney(refundedTotal, cn.currency) : "—"}</td>
                    <td className="px-4 py-3">
                      {cn.itemsReceivedBackAt ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          Received {fmt(cn.itemsReceivedBackAt)}
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Pending</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--ink-muted)]">{fmt(cn.issuedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {!cn.itemsReceivedBackAt && (
                          <form action={markItemsReceivedAction}>
                            <input type="hidden" name="creditNoteId" value={cn.id} />
                            <button type="submit" className="rounded border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50">
                              Mark Received
                            </button>
                          </form>
                        )}
                        {outstanding > 0 && (
                          <details className="group relative">
                            <summary className="cursor-pointer list-none rounded border border-[var(--gold)]/40 px-2 py-0.5 text-[11px] font-semibold text-[var(--gold)] hover:bg-[var(--gold)]/10">
                              Refund
                            </summary>
                            <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 shadow-lg">
                              <form action={issueRefundFromCreditNoteAction} className="space-y-2">
                                <input type="hidden" name="creditNoteId" value={cn.id} />
                                <div>
                                  <label className="mb-0.5 block text-[10px] font-semibold uppercase text-[var(--ink-muted)]">Amount</label>
                                  <input name="amount" type="number" step="0.01" max={outstanding} defaultValue={outstanding} className="w-full rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1 text-sm text-[var(--ink)]" />
                                  <p className="mt-0.5 text-[10px] text-[var(--ink-muted)]">Max: {formatMoney(outstanding, cn.currency)}</p>
                                </div>
                                <div>
                                  <label className="mb-0.5 block text-[10px] font-semibold uppercase text-[var(--ink-muted)]">Method</label>
                                  <select name="method" className="w-full rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1 text-sm text-[var(--ink)]">
                                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
                                  </select>
                                </div>
                                <input name="reference" placeholder="Reference (optional)" className="w-full rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1 text-sm text-[var(--ink)]" />
                                <button type="submit" className="w-full rounded bg-[var(--gold)]/20 py-1.5 text-xs font-semibold text-[var(--gold)] hover:bg-[var(--gold)]/30">
                                  Issue Refund
                                </button>
                              </form>
                            </div>
                          </details>
                        )}
                        {user.role === "ADMIN" && cn.refunds.length === 0 && (
                          <form action={deleteCreditNoteAction}>
                            <input type="hidden" name="id" value={cn.id} />
                            <ConfirmSubmitButton
                              message={`Delete credit note ${cn.creditNoteNumber}? This cannot be undone.`}
                              confirmLabel="Delete"
                              className="rounded border border-red-200 px-2 py-0.5 text-[11px] font-semibold text-red-600 hover:bg-red-50"
                            >Delete</ConfirmSubmitButton>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {creditNotes.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm text-[var(--ink-muted)]">
                    {q || filter !== "all" ? "No credit notes match the filter." : "No credit notes yet. Create one from a completed sale."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
