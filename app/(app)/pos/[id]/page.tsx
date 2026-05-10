import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { PaymentMethod } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { formatMoney, normalizeCurrency } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";

const METHODS = Object.values(PaymentMethod);

export default async function SalePage({ params }: { params: Promise<{ id: string }> }) {
  const { user, orgId, org, session } = await requireOrgSession();
  if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role))) {
    redirect("/dashboard");
  }

  const { id } = await params;

  let dbNeedsFix = false;
  let sale: {
    id: string;
    saleNumber: string;
    status: string;
    currency: string | null;
    subtotal: number;
    discountAmount: number;
    vatAmount: number;
    totalAmount: number;
    paidAmount: number;
    paidAt: Date | null;
    createdAt: Date;
    notes: string | null;
    branch: { name: string } | null;
    client: { fullName: string } | null;
    items: Array<{ id: string; description: string; quantity: number; unitPrice: number; lineTotal: number }>;
    payments: Array<{ id: string; amount: number; method: PaymentMethod; reference: string | null; receivedAt: Date; currency: string | null }>;
  } | null = null;

  let creditNotes: Array<{
    id: string;
    creditNoteNumber: string;
    currency: string;
    totalAmount: number;
    issuedAt: Date;
    reason: string | null;
    itemsReceivedBackAt: Date | null;
    itemsReceivedBackNote: string | null;
    items: Array<{ id: string; description: string; quantity: number; unitPrice: number; lineTotal: number; partId: string | null }>;
  }> = [];

  let refunds: Array<{
    id: string;
    amount: number;
    currency: string;
    exchangeRateToBase: number | null;
    method: PaymentMethod;
    reference: string | null;
    refundedAt: Date;
    creditNoteId: string | null;
  }> = [];

  try {
    sale = await prisma.sale.findFirst({
      where: { id, orgId },
      select: {
        id: true,
        saleNumber: true,
        status: true,
        currency: true,
        subtotal: true,
        discountAmount: true,
        vatAmount: true,
        totalAmount: true,
        paidAmount: true,
        paidAt: true,
        createdAt: true,
        notes: true,
        branch: { select: { name: true } },
        client: { select: { fullName: true } },
        items: { select: { id: true, description: true, quantity: true, unitPrice: true, lineTotal: true }, orderBy: { createdAt: "asc" } },
        payments: { select: { id: true, amount: true, method: true, reference: true, receivedAt: true, currency: true }, orderBy: { receivedAt: "desc" } },
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("no such table") && msg.includes("Sale")) dbNeedsFix = true;
    sale = null;
  }

  if (!sale) {
    if (dbNeedsFix) redirect("/pos");
    redirect("/pos");
  }

  const orgBranding = await prisma.documentBrandingSettings.findFirst({
    where: { orgId },
    select: { vatRatePercent: true },
  }).catch(() => null);
  const vatRate = Math.max(0, orgBranding?.vatRatePercent ?? 18) / 100;

  const saleCurrency = normalizeCurrency(sale.currency, org.baseCurrency);

  // Credit notes / refunds are optional features; keep page working if tables are missing.
  try {
    creditNotes = await prisma.creditNote.findMany({
      where: { orgId, saleId: sale.id },
      orderBy: { issuedAt: "desc" },
      select: {
        id: true,
        creditNoteNumber: true,
        currency: true,
        totalAmount: true,
        issuedAt: true,
        reason: true,
        itemsReceivedBackAt: true,
        itemsReceivedBackNote: true,
        items: { select: { id: true, description: true, quantity: true, unitPrice: true, lineTotal: true, partId: true }, orderBy: { createdAt: "asc" } },
      },
    });
  } catch {
    creditNotes = [];
  }

  try {
    refunds = await prisma.refund.findMany({
      where: { orgId, saleId: sale.id },
      orderBy: { refundedAt: "desc" },
      select: {
        id: true,
        amount: true,
        currency: true,
        exchangeRateToBase: true,
        method: true,
        reference: true,
        refundedAt: true,
        creditNoteId: true,
      },
    });
  } catch {
    refunds = [];
  }

  const parts = await prisma.part.findMany({
    where: { orgId, isActive: true },
    orderBy: [{ name: "asc" }],
    select: { id: true, sku: true, name: true, qtyOnHand: true },
    take: 300,
  }).catch(() => []);

  async function recalcSaleTotals(tx: Prisma.TransactionClient, saleId: string, includeVat: boolean) {
    const itemsAgg = await tx.saleItem.aggregate({ where: { saleId }, _sum: { lineTotal: true } });
    const subtotal = itemsAgg._sum.lineTotal ?? 0;
    const current = await tx.sale.findUnique({ where: { id: saleId }, select: { discountAmount: true } });
    const discountAmount = Math.max(0, Math.min(current?.discountAmount ?? 0, subtotal));
    const taxable = Math.max(0, subtotal - discountAmount);
    const vatAmount = includeVat ? taxable * vatRate : 0;
    const totalAmount = taxable + vatAmount;

    const payAgg = await tx.payment.aggregate({ where: { saleId, orgId }, _sum: { amount: true } });
    const paidAmount = payAgg._sum.amount ?? 0;
    const isPaid = totalAmount > 0 && paidAmount >= totalAmount;

    await tx.sale.update({
      where: { id: saleId },
      data: {
        subtotal,
        discountAmount,
        vatAmount,
        totalAmount,
        paidAmount,
        paidAt: isPaid ? new Date() : null,
        status: isPaid ? "PAID" : "OPEN",
      },
    });
  }

  async function addItemAction(formData: FormData) {
    "use server";
    const { user, orgId } = await requireOrgSession();
    if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role))) return;

    const saleId = String(formData.get("saleId") ?? "").trim();
    const partId = String(formData.get("partId") ?? "").trim() || null;
    const description = String(formData.get("description") ?? "").trim();
    const qty = Number(String(formData.get("quantity") ?? "1").trim());
    const unitPrice = Number(String(formData.get("unitPrice") ?? "0").trim());
    const vat = String(formData.get("vat") ?? "on") === "on";

    if (!saleId) return;
    if (!partId && !description) return;
    if (!Number.isFinite(qty) || qty <= 0) return;
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return;

    const existingSale = await prisma.sale.findFirst({ where: { id: saleId, orgId }, select: { id: true, status: true } });
    if (!existingSale || existingSale.status !== "OPEN") return;

    const lineTotal = unitPrice * qty;

    await prisma.$transaction(async (tx) => {
      let resolvedDescription = description;
      let resolvedPartId: string | null = null;

      if (partId) {
        const part = await tx.part.findFirst({ where: { id: partId, orgId, isActive: true }, select: { id: true, sku: true, name: true, qtyOnHand: true } });
        if (!part) return;
        if (part.qtyOnHand - Math.abs(qty) < 0) return;

        resolvedPartId = part.id;
        resolvedDescription = `${part.sku} ${part.name}`;

        await tx.part.update({ where: { id: part.id }, data: { qtyOnHand: part.qtyOnHand - Math.abs(qty) } });
        await tx.partStockTransaction.create({
          data: {
            partId: part.id,
            saleId,
            type: "OUT",
            quantity: Math.abs(qty),
            reason: `POS sale item (${resolvedDescription})`,
          },
        });
      }

      await tx.saleItem.create({
        data: { saleId, partId: resolvedPartId, description: resolvedDescription, quantity: qty, unitPrice, lineTotal },
      });

      await recalcSaleTotals(tx, saleId, vat);
    });

    revalidatePath(`/pos/${saleId}`);
  }

  async function addPaymentAction(formData: FormData) {
    "use server";
    const { user, orgId, session, org } = await requireOrgSession();
    if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role))) return;

    const saleId = String(formData.get("saleId") ?? "").trim();
    const rawAmount = String(formData.get("amount") ?? "").trim();
    const method = String(formData.get("method") ?? "CASH").trim();
    const reference = String(formData.get("reference") ?? "").trim();
    if (!saleId) return;

    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    const existingSale = await prisma.sale.findFirst({ where: { id: saleId, orgId }, select: { id: true, totalAmount: true, status: true, currency: true } });
    if (!existingSale || existingSale.status === "VOID") return;

    const saleCurrency = normalizeCurrency(existingSale.currency, org.baseCurrency);
    if (saleCurrency !== org.baseCurrency) {
      // POS currently assumes sale totals and payments are in org base currency.
      // When enabling non-base POS currencies, collect FX rate at payment time.
      return;
    }

    const safeMethod: PaymentMethod = METHODS.includes(method as PaymentMethod)
      ? (method as PaymentMethod)
      : PaymentMethod.OTHER;

    await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          orgId,
          saleId,
          invoiceId: null,
          currency: saleCurrency,
          exchangeRateToBase: null,
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

  async function createCreditNoteAction(formData: FormData) {
    "use server";
    const { user, orgId, org, session } = await requireOrgSession();
    if (!(can.viewFinancials(user) || ["ADMIN", "OPS"].includes(user.role))) return;

    const saleId = String(formData.get("saleId") ?? "").trim();
    if (!saleId) return;

    const reason = String(formData.get("reason") ?? "").trim() || null;

    const existingSale = await prisma.sale.findFirst({
      where: { id: saleId, orgId },
      select: { id: true, status: true, saleNumber: true, currency: true },
    });
    if (!existingSale || existingSale.status !== "PAID") return;

    const items = await prisma.saleItem.findMany({
      where: { saleId },
      select: { id: true, description: true, quantity: true, unitPrice: true, lineTotal: true, partId: true },
      orderBy: { createdAt: "asc" },
    });

    const picked: Array<{ saleItemId: string; description: string; quantity: number; unitPrice: number; lineTotal: number; partId: string | null }> = [];
    for (const it of items) {
      const raw = String(formData.get(`returnQty:${it.id}`) ?? "").trim();
      if (!raw) continue;
      const qty = Math.max(0, Math.floor(Number(raw)));
      if (!Number.isFinite(qty) || qty <= 0) continue;
      if (qty > it.quantity) continue;
      picked.push({
        saleItemId: it.id,
        description: it.description,
        quantity: qty,
        unitPrice: it.unitPrice,
        lineTotal: it.unitPrice * qty,
        partId: it.partId,
      });
    }
    if (picked.length === 0) return;

    const currency = normalizeCurrency(existingSale.currency, org.baseCurrency);
    const totalAmount = picked.reduce((sum, p) => sum + p.lineTotal, 0);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) return;

    await prisma.$transaction(async (tx) => {
      const count = await tx.creditNote.count({ where: { orgId, saleId } }).catch(() => 0);
      const baseNumber = `CN-${existingSale.saleNumber}-${String(count + 1).padStart(2, "0")}`;
      let creditNoteNumber = baseNumber;

      // Try insert; if number collides (rare), suffix with timestamp.
      const created = await tx.creditNote.create({
        data: {
          orgId,
          saleId,
          creditNoteNumber,
          currency,
          totalAmount,
          reason,
          createdById: session.user.id,
        },
        select: { id: true },
      }).catch(async () => {
        creditNoteNumber = `${baseNumber}-${Date.now()}`;
        return tx.creditNote.create({
          data: {
            orgId,
            saleId,
            creditNoteNumber,
            currency,
            totalAmount,
            reason,
            createdById: session.user.id,
          },
          select: { id: true },
        });
      });

      await tx.creditNoteItem.createMany({
        data: picked.map((p) => ({
          creditNoteId: created.id,
          partId: p.partId,
          description: p.description,
          quantity: p.quantity,
          unitPrice: p.unitPrice,
          lineTotal: p.lineTotal,
        })),
      });
    });

    revalidatePath(`/pos/${saleId}`);
  }

  async function markItemsReceivedBackAction(formData: FormData) {
    "use server";
    const { user, orgId, session } = await requireOrgSession();
    if (!(can.viewFinancials(user) || ["ADMIN", "OPS"].includes(user.role))) return;

    const saleId = String(formData.get("saleId") ?? "").trim();
    const creditNoteId = String(formData.get("creditNoteId") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim() || null;
    if (!saleId || !creditNoteId) return;

    const creditNote = await prisma.creditNote.findFirst({
      where: { id: creditNoteId, orgId, saleId },
      select: { id: true, creditNoteNumber: true, itemsReceivedBackAt: true },
    });
    if (!creditNote || creditNote.itemsReceivedBackAt) return;

    await prisma.$transaction(async (tx) => {
      const items = await tx.creditNoteItem.findMany({ where: { creditNoteId }, select: { partId: true, quantity: true, description: true } });

      for (const it of items) {
        if (!it.partId) continue;
        const part = await tx.part.findFirst({ where: { id: it.partId, orgId, isActive: true }, select: { id: true, qtyOnHand: true, sku: true, name: true } });
        if (!part) continue;
        await tx.part.update({ where: { id: part.id }, data: { qtyOnHand: part.qtyOnHand + Math.abs(it.quantity) } });
        await tx.partStockTransaction.create({
          data: {
            partId: part.id,
            saleId,
            type: "IN",
            quantity: Math.abs(it.quantity),
            reason: `Return (${creditNote.creditNoteNumber}) ${it.description || `${part.sku} ${part.name}`}`,
            createdById: session.user.id,
          },
        });
      }

      await tx.creditNote.update({
        where: { id: creditNoteId },
        data: {
          itemsReceivedBackAt: new Date(),
          itemsReceivedBackById: session.user.id,
          itemsReceivedBackNote: note,
        },
      });
    });

    revalidatePath(`/pos/${saleId}`);
  }

  async function createRefundAction(formData: FormData) {
    "use server";
    const { user, orgId, org, session } = await requireOrgSession();
    if (!(can.viewFinancials(user) || ["ADMIN", "OPS"].includes(user.role))) return;

    const saleId = String(formData.get("saleId") ?? "").trim();
    const creditNoteId = String(formData.get("creditNoteId") ?? "").trim();
    const rawAmount = String(formData.get("amount") ?? "").trim();
    const rawRate = String(formData.get("exchangeRateToBase") ?? "").trim();
    const method = String(formData.get("method") ?? "CASH").trim();
    const reference = String(formData.get("reference") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();
    if (!saleId || !creditNoteId) return;

    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    const existingSale = await prisma.sale.findFirst({ where: { id: saleId, orgId }, select: { id: true, status: true } });
    if (!existingSale || existingSale.status !== "PAID") return;

    const creditNote = await prisma.creditNote.findFirst({
      where: { id: creditNoteId, orgId, saleId },
      select: { id: true, currency: true, totalAmount: true },
    });
    if (!creditNote) return;

    const refundedAgg = await prisma.refund.aggregate({ where: { orgId, creditNoteId: creditNote.id }, _sum: { amount: true } }).catch(() => ({ _sum: { amount: 0 } }));
    const refundedSoFar = refundedAgg._sum.amount ?? 0;
    const refundable = Math.max(0, creditNote.totalAmount - refundedSoFar);
    if (amount > refundable) return;

    const safeMethod: PaymentMethod = METHODS.includes(method as PaymentMethod)
      ? (method as PaymentMethod)
      : PaymentMethod.OTHER;

    const currency = normalizeCurrency(creditNote.currency, org.baseCurrency);
    const exchangeRateToBase = currency === org.baseCurrency ? null : (rawRate ? Number(rawRate) : null);
    if (currency !== org.baseCurrency) {
      if (!exchangeRateToBase || !Number.isFinite(exchangeRateToBase) || exchangeRateToBase <= 0) return;
    }

    await prisma.refund.create({
      data: {
        orgId,
        saleId,
        invoiceId: null,
        creditNoteId: creditNote.id,
        currency,
        exchangeRateToBase,
        amount,
        method: safeMethod,
        reference: reference || null,
        createdById: session.user.id,
        note: note || null,
      },
    });

    revalidatePath(`/pos/${saleId}`);
    revalidatePath("/reports");
    revalidatePath("/dashboard");
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
            <p className="mt-1 text-lg font-bold text-[var(--ink)]">{formatMoney(sale.totalAmount, saleCurrency)}</p>
          </div>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Paid</p>
            <p className="mt-1 text-lg font-bold text-emerald-700">{formatMoney(sale.paidAmount, saleCurrency)}</p>
          </div>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Balance</p>
            <p className="mt-1 text-lg font-bold text-amber-700">{formatMoney(balance, saleCurrency)}</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--ink-muted)]">
          <span>Subtotal: {formatMoney(sale.subtotal, saleCurrency)}</span>
          <span>Discount: {sale.discountAmount > 0 ? `-${formatMoney(sale.discountAmount, saleCurrency)}` : formatMoney(0, saleCurrency)}</span>
          <span>VAT: {formatMoney(sale.vatAmount, saleCurrency)}</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={`/api/sales/${sale.id}/receipt`}
            target="_blank"
            rel="noreferrer"
            className="btn-premium-secondary rounded-lg px-3 py-2 text-sm"
          >
            Receipt PDF
          </a>
        </div>
      </section>

      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Items</p>

        {sale.status === "OPEN" ? (
          <form action={addItemAction} className="mt-3 grid gap-2 md:grid-cols-[1.2fr_1.8fr_80px_140px_auto]">
            <input type="hidden" name="saleId" value={sale.id} />
            <select
              name="partId"
              defaultValue=""
              className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
              title="Optional: pick a part to deduct stock"
            >
              <option value="">Custom item</option>
              {parts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} · {p.name} ({p.qtyOnHand})
                </option>
              ))}
            </select>
            <input
              name="description"
              placeholder="Description"
              className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
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

        {sale.status === "OPEN" ? (
          <form
            action={async (formData: FormData) => {
              "use server";
              const { user, orgId } = await requireOrgSession();
              if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role))) return;
              const saleId = String(formData.get("saleId") ?? "").trim();
              const raw = String(formData.get("discountAmount") ?? "").trim();
              if (!saleId) return;
              const discountAmount = Math.max(0, Number(raw || "0"));
              if (!Number.isFinite(discountAmount)) return;

              const existingSale = await prisma.sale.findFirst({ where: { id: saleId, orgId }, select: { id: true, status: true } });
              if (!existingSale || existingSale.status !== "OPEN") return;

              await prisma.$transaction(async (tx) => {
                const itemsAgg = await tx.saleItem.aggregate({ where: { saleId }, _sum: { lineTotal: true } });
                const subtotal = itemsAgg._sum.lineTotal ?? 0;
                const capped = Math.max(0, Math.min(discountAmount, subtotal));
                await tx.sale.update({ where: { id: saleId }, data: { discountAmount: capped } });
                await recalcSaleTotals(tx, saleId, true);
              });

              revalidatePath(`/pos/${saleId}`);
            }}
            className="mt-3 flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="saleId" value={sale.id} />
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Discount</p>
              <input
                name="discountAmount"
                inputMode="decimal"
                defaultValue={sale.discountAmount}
                placeholder="0"
                className="w-36 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
              />
            </div>
            <button className="btn-premium-secondary rounded-lg px-3 py-2 text-sm">Apply</button>
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
                  <td className="px-3 py-2">{formatMoney(it.unitPrice, saleCurrency)}</td>
                  <td className="px-3 py-2">{formatMoney(it.lineTotal, saleCurrency)}</td>
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
                  <td className="px-3 py-2 font-semibold">{formatMoney(p.amount, normalizeCurrency(p.currency, saleCurrency))}</td>
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

      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Returns & Refunds</p>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">
          Credit notes and refunds are only available for paid sales. Stock is only returned when you mark items received back.
        </p>

        {sale.status === "PAID" ? (
          <div className="mt-3 space-y-4">
            <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Issue Credit Note</p>
              <form action={createCreditNoteAction} className="mt-2 space-y-2">
                <input type="hidden" name="saleId" value={sale.id} />
                <input
                  name="reason"
                  placeholder="Reason (optional)"
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
                />

                <div className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[var(--panel-strong)] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                      <tr>
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2">Sold</th>
                        <th className="px-3 py-2">Return Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sale.items.map((it) => (
                        <tr key={it.id} className="border-t border-[var(--line)]">
                          <td className="px-3 py-2">{it.description}</td>
                          <td className="px-3 py-2 text-[var(--ink-muted)]">{it.quantity}</td>
                          <td className="px-3 py-2">
                            <input
                              name={`returnQty:${it.id}`}
                              defaultValue={0}
                              inputMode="numeric"
                              className="w-28 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1 text-sm outline-none focus:border-[var(--accent)]/50"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button className="btn-premium rounded-lg px-4 py-2 text-sm text-white">Create Credit Note</button>
              </form>
            </div>

            <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Refund (Requires Credit Note)</p>
              {creditNotes.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--ink-muted)]">Create a credit note first.</p>
              ) : (
                <form action={createRefundAction} className="mt-2 grid gap-2 md:grid-cols-[220px_140px_180px_1fr_auto]">
                  <input type="hidden" name="saleId" value={sale.id} />
                  <select name="creditNoteId" defaultValue={creditNotes[0]?.id} className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50">
                    {creditNotes.map((cn) => (
                      <option key={cn.id} value={cn.id}>
                        {cn.creditNoteNumber} · {formatMoney(cn.totalAmount, normalizeCurrency(cn.currency, saleCurrency))}
                      </option>
                    ))}
                  </select>
                  <input
                    name="amount"
                    inputMode="decimal"
                    placeholder="Amount"
                    className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
                    required
                  />
                  <input
                    name="exchangeRateToBase"
                    inputMode="decimal"
                    placeholder={`Rate to ${org.baseCurrency} (if needed)`}
                    className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
                    title={`Only required when currency differs from ${org.baseCurrency}`}
                  />
                  <input
                    name="reference"
                    placeholder="Ref (optional)"
                    className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
                  />
                  <button className="btn-premium rounded-lg px-4 py-2 text-sm text-white">Refund</button>
                </form>
              )}
            </div>

            <div className="overflow-hidden rounded-lg border border-[var(--line)]">
              <div className="bg-[var(--panel-strong)] px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Credit Notes</p>
              </div>
              <div className="bg-[var(--panel)] p-3 space-y-3">
                {creditNotes.length === 0 ? (
                  <p className="text-sm text-[var(--ink-muted)]">No credit notes yet.</p>
                ) : creditNotes.map((cn) => (
                  <div key={cn.id} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="mono text-sm font-bold text-[var(--ink)]">{cn.creditNoteNumber}</p>
                        <p className="text-xs text-[var(--ink-muted)]">{cn.issuedAt.toLocaleString()}</p>
                        {cn.reason ? <p className="text-xs text-[var(--ink-muted)]">Reason: {cn.reason}</p> : null}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-[var(--ink-muted)]">Total</p>
                        <p className="text-sm font-semibold">{formatMoney(cn.totalAmount, normalizeCurrency(cn.currency, saleCurrency))}</p>
                        <p className="text-xs text-[var(--ink-muted)]">
                          {cn.itemsReceivedBackAt ? "Stock received" : "Awaiting stock return"}
                        </p>
                      </div>
                    </div>

                    {cn.items.length ? (
                      <div className="mt-2 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-[var(--panel-strong)] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                            <tr>
                              <th className="px-3 py-2">Item</th>
                              <th className="px-3 py-2">Qty</th>
                              <th className="px-3 py-2">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cn.items.map((it) => (
                              <tr key={it.id} className="border-t border-[var(--line)]">
                                <td className="px-3 py-2">{it.description}</td>
                                <td className="px-3 py-2 text-[var(--ink-muted)]">{it.quantity}</td>
                                <td className="px-3 py-2">{formatMoney(it.lineTotal, normalizeCurrency(cn.currency, saleCurrency))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}

                    {!cn.itemsReceivedBackAt ? (
                      <form action={markItemsReceivedBackAction} className="mt-2 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="saleId" value={sale.id} />
                        <input type="hidden" name="creditNoteId" value={cn.id} />
                        <input
                          name="note"
                          placeholder="Stock received note (optional)"
                          className="min-w-[240px] flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
                        />
                        <button className="btn-premium-secondary rounded-lg px-3 py-2 text-sm">Mark Items Received Back</button>
                      </form>
                    ) : cn.itemsReceivedBackNote ? (
                      <p className="mt-2 text-xs text-[var(--ink-muted)]">Note: {cn.itemsReceivedBackNote}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-[var(--line)]">
              <div className="bg-[var(--panel-strong)] px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Refunds</p>
              </div>
              <div className="bg-[var(--panel)] p-3">
                {refunds.length === 0 ? (
                  <p className="text-sm text-[var(--ink-muted)]">No refunds yet.</p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-[var(--line)]">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[var(--panel-strong)] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                        <tr>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Credit Note</th>
                          <th className="px-3 py-2">Method</th>
                          <th className="px-3 py-2">Ref</th>
                          <th className="px-3 py-2">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {refunds.map((r) => (
                          <tr key={r.id} className="border-t border-[var(--line)]">
                            <td className="px-3 py-2 text-[var(--ink-muted)]">{r.refundedAt.toLocaleString()}</td>
                            <td className="px-3 py-2 mono text-[var(--ink-muted)]">
                              {r.creditNoteId ? (creditNotes.find((c) => c.id === r.creditNoteId)?.creditNoteNumber ?? "-") : "-"}
                            </td>
                            <td className="px-3 py-2">{r.method.replaceAll("_", " ")}</td>
                            <td className="px-3 py-2 text-[var(--ink-muted)]">{r.reference ?? "-"}</td>
                            <td className="px-3 py-2 font-semibold">{formatMoney(r.amount, normalizeCurrency(r.currency, saleCurrency))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--ink-muted)]">This sale must be PAID before you can issue credit notes or refunds.</p>
        )}
      </section>
    </div>
  );
}
