import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { PaymentMethod } from "@prisma/client";

import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";

const METHODS = Object.values(PaymentMethod);

export default async function SalePage({ params }: { params: Promise<{ id: string }> }) {
  const { user, orgId } = await requireOrgSession();
  if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role))) {
    redirect("/dashboard");
  }

  const { id } = await params;

  const sale = await prisma.sale.findFirst({
    where: { id, orgId },
    select: {
      id: true,
      saleNumber: true,
      status: true,
      subtotal: true,
      vatAmount: true,
      totalAmount: true,
      paidAmount: true,
      paidAt: true,
      createdAt: true,
      notes: true,
      branch: { select: { name: true } },
      client: { select: { fullName: true } },
      items: { select: { id: true, description: true, quantity: true, unitPrice: true, lineTotal: true }, orderBy: { createdAt: "asc" } },
      payments: { select: { id: true, amount: true, method: true, reference: true, receivedAt: true }, orderBy: { receivedAt: "desc" } },
    },
  });

  if (!sale) redirect("/pos");

  const orgBranding = await prisma.documentBrandingSettings.findFirst({
    where: { orgId },
    select: { vatRatePercent: true },
  }).catch(() => null);
  const vatRate = Math.max(0, orgBranding?.vatRatePercent ?? 18) / 100;

  async function addItemAction(formData: FormData) {
    "use server";
    const { user, orgId } = await requireOrgSession();
    if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role))) return;

    const saleId = String(formData.get("saleId") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const qty = Number(String(formData.get("quantity") ?? "1").trim());
    const unitPrice = Number(String(formData.get("unitPrice") ?? "0").trim());
    const vat = String(formData.get("vat") ?? "on") === "on";

    if (!saleId || !description) return;
    if (!Number.isFinite(qty) || qty <= 0) return;
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return;

    const existingSale = await prisma.sale.findFirst({ where: { id: saleId, orgId }, select: { id: true, status: true } });
    if (!existingSale || existingSale.status !== "OPEN") return;

    const lineTotal = unitPrice * qty;

    await prisma.$transaction(async (tx) => {
      await tx.saleItem.create({
        data: { saleId, description, quantity: qty, unitPrice, lineTotal },
      });

      const itemsAgg = await tx.saleItem.aggregate({ where: { saleId }, _sum: { lineTotal: true } });
      const subtotal = itemsAgg._sum.lineTotal ?? 0;
      const vatAmount = vat ? subtotal * vatRate : 0;
      const totalAmount = subtotal + vatAmount;

      const payAgg = await tx.payment.aggregate({ where: { saleId, orgId }, _sum: { amount: true } });
      const paidAmount = payAgg._sum.amount ?? 0;
      const isPaid = totalAmount > 0 && paidAmount >= totalAmount;

      await tx.sale.update({
        where: { id: saleId },
        data: {
          subtotal,
          vatAmount,
          totalAmount,
          paidAmount,
          paidAt: isPaid ? new Date() : null,
          status: isPaid ? "PAID" : "OPEN",
        },
      });
    });

    revalidatePath(`/pos/${saleId}`);
  }

  async function addPaymentAction(formData: FormData) {
    "use server";
    const { user, orgId, session } = await requireOrgSession();
    if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role))) return;

    const saleId = String(formData.get("saleId") ?? "").trim();
    const rawAmount = String(formData.get("amount") ?? "").trim();
    const method = String(formData.get("method") ?? "CASH").trim();
    const reference = String(formData.get("reference") ?? "").trim();
    if (!saleId) return;

    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    const existingSale = await prisma.sale.findFirst({ where: { id: saleId, orgId }, select: { id: true, totalAmount: true, status: true } });
    if (!existingSale || existingSale.status === "VOID") return;

    const safeMethod: PaymentMethod = METHODS.includes(method as PaymentMethod)
      ? (method as PaymentMethod)
      : PaymentMethod.OTHER;

    await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          orgId,
          saleId,
          invoiceId: null,
          amount,
          method: safeMethod,
          reference: reference || null,
          createdById: session.user.id,
        },
      });

      const payAgg = await tx.payment.aggregate({ where: { saleId, orgId }, _sum: { amount: true } });
      const paidAmount = payAgg._sum.amount ?? 0;
      const isPaid = existingSale.totalAmount > 0 && paidAmount >= existingSale.totalAmount;

      await tx.sale.update({
        where: { id: saleId },
        data: {
          paidAmount,
          paidAt: isPaid ? new Date() : null,
          status: isPaid ? "PAID" : "OPEN",
        },
      });
    });

    revalidatePath(`/pos/${saleId}`);
    revalidatePath("/reports");
  }

  const balance = Math.max(0, sale.totalAmount - sale.paidAmount);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/pos" className="btn-premium-secondary rounded-lg px-3 py-2 text-sm">Sales</Link>
        <div className="rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-muted)]">
          {sale.branch?.name ?? "No branch"}
        </div>
      </div>

      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">POS</p>
        <h1 className="mt-1 text-lg font-semibold text-[var(--ink)]">{sale.saleNumber}</h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">Status: {sale.status}</p>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Total</p>
            <p className="mt-1 text-lg font-bold text-[var(--ink)]">{formatMoney(sale.totalAmount)}</p>
          </div>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Paid</p>
            <p className="mt-1 text-lg font-bold text-emerald-700">{formatMoney(sale.paidAmount)}</p>
          </div>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Balance</p>
            <p className="mt-1 text-lg font-bold text-amber-700">{formatMoney(balance)}</p>
          </div>
        </div>
      </section>

      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Items</p>

        {sale.status === "OPEN" ? (
          <form action={addItemAction} className="mt-3 grid gap-2 md:grid-cols-[2fr_80px_140px_auto]">
            <input type="hidden" name="saleId" value={sale.id} />
            <input
              name="description"
              placeholder="Description"
              className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
              required
            />
            <input
              name="quantity"
              placeholder="Qty"
              defaultValue={1}
              inputMode="numeric"
              className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
              required
            />
            <input
              name="unitPrice"
              placeholder="Price"
              inputMode="decimal"
              className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
              required
            />
            <button className="btn-premium rounded-lg px-4 py-2 text-sm text-white">Add</button>
          </form>
        ) : null}

        <div className="mt-3 overflow-hidden rounded-lg border border-[var(--line)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--panel-strong)] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((it) => (
                <tr key={it.id} className="border-t border-[var(--line)]">
                  <td className="px-3 py-2">{it.description}</td>
                  <td className="px-3 py-2">{it.quantity}</td>
                  <td className="px-3 py-2">{formatMoney(it.unitPrice)}</td>
                  <td className="px-3 py-2">{formatMoney(it.lineTotal)}</td>
                </tr>
              ))}
              {sale.items.length === 0 ? (
                <tr className="border-t border-[var(--line)]">
                  <td className="px-3 py-6 text-sm text-[var(--ink-muted)]" colSpan={4}>No items yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Payments</p>

        {sale.status !== "VOID" && balance > 0 ? (
          <form action={addPaymentAction} className="mt-3 grid gap-2 md:grid-cols-[140px_180px_1fr_auto]">
            <input type="hidden" name="saleId" value={sale.id} />
            <input
              name="amount"
              inputMode="decimal"
              placeholder="Amount"
              className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
              required
            />
            <select
              name="method"
              defaultValue={PaymentMethod.CASH}
              className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>{m.replaceAll("_", " ")}</option>
              ))}
            </select>
            <input
              name="reference"
              placeholder="Ref (optional)"
              className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
            />
            <button className="btn-premium rounded-lg px-4 py-2 text-sm text-white">Add</button>
          </form>
        ) : null}

        <div className="mt-3 overflow-hidden rounded-lg border border-[var(--line)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--panel-strong)] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Method</th>
                <th className="px-3 py-2">Ref</th>
                <th className="px-3 py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sale.payments.map((p) => (
                <tr key={p.id} className="border-t border-[var(--line)]">
                  <td className="px-3 py-2 text-[var(--ink-muted)]">{p.receivedAt.toLocaleString()}</td>
                  <td className="px-3 py-2">{p.method.replaceAll("_", " ")}</td>
                  <td className="px-3 py-2 text-[var(--ink-muted)]">{p.reference ?? "-"}</td>
                  <td className="px-3 py-2 font-semibold">{formatMoney(p.amount)}</td>
                </tr>
              ))}
              {sale.payments.length === 0 ? (
                <tr className="border-t border-[var(--line)]">
                  <td className="px-3 py-6 text-sm text-[var(--ink-muted)]" colSpan={4}>No payments yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
