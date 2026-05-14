import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { formatMoneyCompact, normalizeCurrency } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { assertOrgCanMutate } from "@/lib/org-write";
import { ConfirmSubmitButton } from "@/components/shared/ConfirmSubmitButton";
import { writeSystemAuditEvent } from "@/lib/commercial/audit";

function monthKey(d: Date) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function nextSaleNumber(orgId: string) {
  const prefix = `S-${monthKey(new Date())}-`;
  const last = await prisma.sale.findFirst({
    where: { orgId, saleNumber: { startsWith: prefix } },
    orderBy: { saleNumber: "desc" },
    select: { saleNumber: true },
  });
  const lastSeq = last?.saleNumber.slice(prefix.length);
  const n = lastSeq ? Number.parseInt(lastSeq, 10) : 0;
  const next = Number.isFinite(n) ? n + 1 : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export default async function PosPage() {
  const { user, orgId, org } = await requireOrgSession();
  if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role))) {
    redirect("/dashboard");
  }

  let dbNeedsFix = false;

  const branches = await prisma.branch.findMany({
    where: { orgId, isActive: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { id: true, name: true, isDefault: true },
  }).catch(() => []);

  const defaultBranchId = branches.find((b) => b.isDefault)?.id ?? branches[0]?.id ?? null;

  async function createSaleAction(formData: FormData) {
    "use server";
    const { user, orgId, session, org } = await requireOrgSession();
    if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role))) return;
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const branchId = String(formData.get("branchId") ?? "").trim() || null;
    const saleNumber = await nextSaleNumber(orgId);
    const sale = await prisma.sale.create({
      data: {
        orgId,
        branchId,
        saleNumber,
        status: "OPEN",
        currency: org.baseCurrency,
        createdById: session.user.id,
      },
      select: { id: true },
    });

    revalidatePath("/pos");
    redirect(`/pos/${sale.id}`);
  }

  async function deleteSaleAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (user.role !== "ADMIN") return;
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const saleId = String(formData.get("saleId") ?? "").trim();
    if (!saleId) return;

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, orgId },
      select: {
        id: true,
        status: true,
        invoicedAt: true,
        items: { select: { partId: true, quantity: true, description: true } },
        payments: { select: { id: true }, take: 1 },
        creditNotes: { select: { id: true }, take: 1 },
        refunds: { select: { id: true }, take: 1 },
        deliveryNotes: { select: { id: true }, take: 1 },
      },
    });
    if (!sale || sale.status !== "OPEN" || sale.invoicedAt || sale.payments.length || sale.creditNotes.length || sale.refunds.length || sale.deliveryNotes.length) return;

    await prisma.$transaction(async (tx) => {
      for (const item of sale.items) {
        if (!item.partId) continue;
        const part = await tx.part.findFirst({ where: { id: item.partId, orgId }, select: { id: true, qtyOnHand: true } });
        if (!part) continue;
        await tx.part.update({ where: { id: part.id }, data: { qtyOnHand: part.qtyOnHand + Math.abs(item.quantity) } });
        await tx.partStockTransaction.create({
          data: {
            partId: part.id,
            saleId: sale.id,
            type: "IN",
            quantity: Math.abs(item.quantity),
            reason: `POS sale deleted (${item.description})`,
            createdById: user.id,
          },
        });
      }
      await tx.sale.deleteMany({ where: { id: sale.id, orgId } });
    });
    await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Sale", entityId: sale.id, action: "POS_SALE_DELETED", summary: "Open POS sale deleted" });

    revalidatePath("/pos");
  }

  let sales: Array<{
    id: string;
    saleNumber: string;
    status: string;
    currency: string | null;
    totalAmount: number;
    paidAmount: number;
    invoicedAt: Date | null;
    createdAt: Date;
    branch: { name: string } | null;
    _count: { payments: number; creditNotes: number; refunds: number; deliveryNotes: number };
  }> = [];
  try {
    sales = await prisma.sale.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: 40,
        select: {
          id: true,
          saleNumber: true,
          status: true,
          currency: true,
          totalAmount: true,
          paidAmount: true,
          invoicedAt: true,
          createdAt: true,
          branch: { select: { name: true } },
          _count: { select: { payments: true, creditNotes: true, refunds: true, deliveryNotes: true } },
        },
      });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("no such table") && msg.includes("Sale")) dbNeedsFix = true;
    sales = [];
  }

  return (
    <div className="space-y-4">
      {dbNeedsFix ? (
        <section className="panel-shadow rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          <p className="font-semibold text-amber-50">POS database tables are missing.</p>
          <p className="mt-1 text-amber-100/90">
            Run <span className="mono">/api/admin/db-fix</span> as the platform admin to create <span className="mono">Sale</span> tables.
          </p>
          <a
            className="mt-3 inline-flex rounded-lg border border-amber-500/30 bg-black/20 px-3 py-2 text-xs font-semibold text-amber-50 hover:bg-black/30"
            href="/api/admin/db-fix"
            target="_blank"
            rel="noreferrer"
          >
            Open DB Fix
          </a>
        </section>
      ) : null}
      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">POS</p>
        <h1 className="mt-1 text-lg font-semibold text-[var(--ink)]">Sales</h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">Create a sale and take partial payments.</p>

        <form action={createSaleAction} className="mt-4 flex flex-wrap items-end gap-2">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Branch</p>
            <select
              name="branchId"
              defaultValue={defaultBranchId ?? ""}
              className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
            >
              <option value="">No branch</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <button className="btn-premium rounded-lg px-4 py-2 text-sm text-white">New Sale</button>
        </form>
      </section>

      <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="border-b border-[var(--line)] bg-[var(--panel-strong)] px-4 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Recent</p>
        </div>
        {sales.length === 0 ? (
          <div className="px-4 py-10 text-sm text-[var(--ink-muted)]">No sales yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-[var(--line)]">
                <tr className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                  <th className="px-4 py-2.5">Sale</th>
                  <th className="px-4 py-2.5">Branch</th>
                  <th className="px-4 py-2.5">Total</th>
                  <th className="px-4 py-2.5">Paid</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {sales.map((s) => {
                  const canDeleteSale = user.role === "ADMIN" && s.status === "OPEN" && !s.invoicedAt && s._count.payments === 0 && s._count.creditNotes === 0 && s._count.refunds === 0 && s._count.deliveryNotes === 0;
                  return (
                    <tr key={s.id} className="hover:bg-[var(--panel-strong)]/40">
                      <td className="px-4 py-3 mono font-semibold">{s.saleNumber}</td>
                      <td className="px-4 py-3 text-[var(--ink-muted)]">{s.branch?.name ?? "-"}</td>
                      <td className="px-4 py-3">{formatMoneyCompact(s.totalAmount, normalizeCurrency(s.currency, org.baseCurrency))}</td>
                      <td className="px-4 py-3">{formatMoneyCompact(s.paidAmount, normalizeCurrency(s.currency, org.baseCurrency))}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                          s.status === "PAID"
                            ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700"
                            : s.status === "VOID"
                              ? "border-red-500/20 bg-red-500/10 text-red-600"
                              : "border-amber-400/30 bg-amber-400/15 text-amber-700"
                        }`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/pos/${s.id}`} className="btn-premium-secondary rounded-md px-2.5 py-1.5 text-xs">Open/Edit</Link>
                          {canDeleteSale ? (
                            <form action={deleteSaleAction}>
                              <input type="hidden" name="saleId" value={s.id} />
                              <ConfirmSubmitButton message="Delete this open POS sale? Stock will be restored." className="rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50">Delete</ConfirmSubmitButton>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
