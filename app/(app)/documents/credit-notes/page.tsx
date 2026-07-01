import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { OutboundMessageType, type PaymentMethod } from "@prisma/client";

import { formatMoney, formatMoneyCompact } from "@/lib/currency";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { requireModule, OrgModule } from "@/lib/module-access";
import { assertOrgCanMutate } from "@/lib/org-write";
import { ConfirmSubmitButton } from "@/components/shared/ConfirmSubmitButton";
import { RowActionsMenu, MenuActionButton, MenuActionLink, MenuDestructiveRow, MenuSection } from "@/components/shared/RowActionsMenu";
import { nextDocumentNumber } from "@/lib/commercial/document-workflow";
import { enqueueEmailMessage, enqueueWhatsAppMessage } from "@/lib/notifications/whatsapp-outbox";
import { notifyCreditNoteIssued, notifyRefundIssued } from "@/lib/notifications";
import { CreateCreditNoteDialog } from "./CreateCreditNoteDialog";

const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "OTHER"];

export const dynamic = "force-dynamic";

export default async function CreditNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string; period?: string }>;
}) {
  await requireModule(OrgModule.INVOICING);
  const { user, orgId, org } = await requireOrgSession();
  if (!can.viewFinancials(user) && !["ADMIN", "OPS", "MANAGER"].includes(user.role)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const filter = params.filter ?? "all";
  const periodFilter = params.period ?? "all";
  const nowCN = new Date();
  const cnThisMonthStart = new Date(nowCN.getFullYear(), nowCN.getMonth(), 1);
  const cnLastMonthStart = new Date(nowCN.getFullYear(), nowCN.getMonth() - 1, 1);
  const cnLastMonthEnd = new Date(nowCN.getFullYear(), nowCN.getMonth(), 0, 23, 59, 59);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

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
    redirect("/documents/credit-notes");
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
      select: { id: true, saleId: true, totalAmount: true, currency: true, creditNoteNumber: true, refunds: { select: { amount: true } } },
    });
    if (!cn) return;

    const alreadyRefunded = cn.refunds.reduce((s, r) => s + r.amount, 0);
    if (alreadyRefunded + amountRaw > cn.totalAmount) return;

    const method = PAYMENT_METHODS.includes(methodRaw as PaymentMethod) ? (methodRaw as PaymentMethod) : "CASH" as PaymentMethod;

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
    notifyRefundIssued({
      orgId,
      creditNoteNumber: cn.creditNoteNumber,
      clientName: `CN ${cn.creditNoteNumber}`,
      amount: amountRaw,
      actorName: user.name ?? user.email ?? "Unknown",
    }).catch(() => {});
    revalidatePath("/documents/credit-notes");
    revalidatePath("/documents/refunds");
    redirect("/documents/credit-notes");
  }

  async function shareCreditNoteWhatsAppAction(formData: FormData) {
    "use server";
    const { user, orgId } = await requireOrgSession();
    if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "MANAGER"].includes(user.role))) return;

    const creditNoteId = String(formData.get("creditNoteId") ?? "").trim();
    if (!creditNoteId) return;
    const creditNote = await prisma.creditNote.findFirst({
      where: { id: creditNoteId, orgId },
      select: {
        id: true,
        creditNoteNumber: true,
        totalAmount: true,
        currency: true,
        sale: { select: { saleNumber: true, client: { select: { fullName: true, phone: true } } } },
      },
    });
    const recipient = creditNote?.sale.client ?? null;
    if (!creditNote || !recipient?.phone) return;

    const pdfUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/credit-notes/${creditNote.id}`;
    await enqueueWhatsAppMessage({
      orgId,
      to: recipient.phone,
      type: OutboundMessageType.JOB_STATUS_UPDATE,
      body: `Hi ${recipient.fullName}, your credit note ${creditNote.creditNoteNumber} for ${creditNote.sale.saleNumber} is ready.\n\nAmount: ${formatMoney(creditNote.totalAmount, creditNote.currency)}\nDownload PDF: ${pdfUrl}`,
    });
    revalidatePath("/documents/credit-notes");
    redirect("/documents/credit-notes");
  }

  async function shareCreditNoteEmailAction(formData: FormData) {
    "use server";
    const { user, orgId } = await requireOrgSession();
    if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "MANAGER"].includes(user.role))) return;

    const creditNoteId = String(formData.get("creditNoteId") ?? "").trim();
    if (!creditNoteId) return;
    const creditNote = await prisma.creditNote.findFirst({
      where: { id: creditNoteId, orgId },
      select: {
        id: true,
        creditNoteNumber: true,
        totalAmount: true,
        currency: true,
        sale: { select: { saleNumber: true, client: { select: { fullName: true, email: true } } } },
      },
    });
    const recipient = creditNote?.sale.client ?? null;
    if (!creditNote || !recipient?.email) return;

    const pdfUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/credit-notes/${creditNote.id}`;
    await enqueueEmailMessage({
      orgId,
      to: recipient.email,
      subject: `Credit note ${creditNote.creditNoteNumber}`,
      body: `Hi ${recipient.fullName},\n\nYour credit note ${creditNote.creditNoteNumber} for ${creditNote.sale.saleNumber} is ready.\n\nAmount: ${formatMoney(creditNote.totalAmount, creditNote.currency)}\nDownload PDF: ${pdfUrl}`,
      type: OutboundMessageType.JOB_STATUS_UPDATE,
    });
    revalidatePath("/documents/credit-notes");
    redirect("/documents/credit-notes");
  }

  async function createCreditNoteAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!["ADMIN", "OPS", "MANAGER"].includes(user.role)) return;
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const saleId = String(formData.get("saleId") ?? "").trim();
    const reason = String(formData.get("reason") ?? "").trim();
    const itemIds = formData.getAll("itemId").map((value) => String(value)).filter(Boolean);
    if (!saleId || !reason) return;
    if (!itemIds.length) return;

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, orgId },
      select: {
        id: true,
        currency: true,
        saleNumber: true,
        items: {
          where: { id: { in: itemIds } },
          select: { id: true, partId: true, description: true, quantity: true, unitPrice: true },
        },
      },
    });
    if (!sale || sale.items.length === 0) return;

    const items = sale.items
      .map((item) => {
        const requestedQuantity = Number(String(formData.get(`quantity:${item.id}`) ?? item.quantity).trim());
        const quantity = Math.max(1, Math.min(item.quantity, Math.floor(Number.isFinite(requestedQuantity) ? requestedQuantity : item.quantity)));
        return {
          partId: item.partId,
          description: item.description,
          quantity,
          unitPrice: item.unitPrice,
        };
      })
      .filter((item) => item.quantity > 0);
    if (!items.length) return;

    const totalAmount = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

    let creditNoteNumber = "";
    await prisma.$transaction(async (tx) => {
      creditNoteNumber = await nextDocumentNumber(tx, "CN", "creditNote");
      await tx.creditNote.create({
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
              partId: i.partId,
              description: i.description,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              lineTotal: i.quantity * i.unitPrice,
            })),
          },
        },
      });
    });
    notifyCreditNoteIssued({
      orgId,
      creditNoteNumber,
      clientName: `Sale ${sale.saleNumber}`,
      amount: totalAmount,
      actorName: user.name ?? user.email ?? "Unknown",
    }).catch(() => {});
    revalidatePath("/documents/credit-notes");
    redirect("/documents/credit-notes");
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
    redirect("/documents/credit-notes");
  }

  // ── Data ─────────────────────────────────────────────────────────────────────

  const [creditNotes, eligibleSales] = await Promise.all([
    prisma.creditNote.findMany({
      where: {
        orgId,
        ...(filter === "pending" ? { itemsReceivedBackAt: null } : {}),
        ...(filter === "received" ? { itemsReceivedBackAt: { not: null } } : {}),
        ...(periodFilter === "this_month" ? { issuedAt: { gte: cnThisMonthStart } } : {}),
        ...(periodFilter === "last_month" ? { issuedAt: { gte: cnLastMonthStart, lte: cnLastMonthEnd } } : {}),
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
        sale: { select: { saleNumber: true, client: { select: { fullName: true, phone: true, email: true } } } },
        items: { select: { description: true, quantity: true, unitPrice: true, lineTotal: true } },
        refunds: { select: { amount: true, method: true, refundedAt: true } },
        itemsReceivedBackBy: { select: { name: true } },
      },
      orderBy: { issuedAt: "desc" },
      take: 100,
    }).catch(() => []),
    prisma.sale.findMany({
      where: { orgId, status: "PAID" },
      select: {
        id: true,
        saleNumber: true,
        totalAmount: true,
        currency: true,
        client: { select: { fullName: true } },
        items: { select: { id: true, description: true, quantity: true, unitPrice: true, lineTotal: true }, orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }).catch(() => []),
  ]);

  const totalValue = creditNotes.reduce((s, cn) => s + cn.totalAmount, 0);
  const pendingReturn = creditNotes.filter((cn) => !cn.itemsReceivedBackAt).length;
  const currency = org.baseCurrency;

  const fmt = (d: Date | string | null) =>
    d ? new Date(d).toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" }) : "—";

  return (
    <div className="space-y-4">
      {/* Header panel */}
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2.5">
          <div>
            <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Documents</p>
            <p className="text-[13px] font-bold text-[var(--ink)]">Credit Notes</p>
            <p className="text-[13px] text-[var(--ink-muted)]">Sales returns and adjustments</p>
          </div>
          <div className="flex items-center gap-3">
            {pendingReturn > 0 && (
              <span className="rounded-full bg-amber-400/20 px-2.5 py-0.5 text-[13px] font-semibold text-amber-700">
                {pendingReturn} awaiting return
              </span>
            )}
            {["ADMIN", "OPS", "MANAGER"].includes(user.role) && (
              <CreateCreditNoteDialog eligibleSales={eligibleSales} action={createCreditNoteAction} />
            )}
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Total", value: creditNotes.length, sub: "credit notes" },
          { label: "Total Value", value: formatMoneyCompact(totalValue, currency), sub: "issued" },
          { label: "Pending Return", value: pendingReturn, sub: "items not received back", tone: pendingReturn > 0 ? "text-amber-600" : "text-[var(--ink)]" },
          { label: "Settled", value: creditNotes.length - pendingReturn, sub: "items returned", tone: "text-emerald-600" },
        ].map(({ label, value, sub, tone = "text-[var(--ink)]" }) => (
          <div key={label} className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">{label}</p>
            <p className={`mt-1 text-lg font-bold tabular-nums ${tone}`}>{value}</p>
            <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">{sub}</p>
          </div>
        ))}
      </div>

      {/* Period chips */}
      <div className="flex gap-2">
        {([
          { label: "All time", value: "all" },
          { label: "This month", value: "this_month" },
          { label: "Last month", value: "last_month" },
        ] as const).map(({ label, value }) => (
          <Link key={value}
            href={`/documents/credit-notes?${new URLSearchParams({ ...(q ? { q } : {}), filter, period: value === "all" ? "" : value }).toString()}`}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${periodFilter === value ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--ink)]"}`}>
            {label}
          </Link>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex-1">
          <input name="q" defaultValue={q} placeholder="Search credit note, sale, reason…" className="w-full max-w-xs rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm text-[var(--ink)]" />
          {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
          {periodFilter !== "all" && <input type="hidden" name="period" value={periodFilter} />}
        </form>
        {(["all", "pending", "received"] as const).map((f) => (
          <Link
            key={f}
            href={`?filter=${f}${q ? `&q=${q}` : ""}${periodFilter !== "all" ? `&period=${periodFilter}` : ""}`}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${filter === f ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--line)] text-[var(--ink-muted)] hover:text-[var(--ink)]"}`}
          >
            {f === "all" ? "All" : f === "pending" ? "Awaiting Return" : "Items Received"}
          </Link>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        {/* Mobile cards */}
        <div className="divide-y divide-[var(--line)] lg:hidden">
          {creditNotes.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-[var(--ink-muted)]">
              {q || filter !== "all" ? "No credit notes match the filter." : "No credit notes yet. Create one from a completed sale."}
            </p>
          ) : creditNotes.map((cn) => {
            const refundedTotalM = cn.refunds.reduce((s, r) => s + r.amount, 0);
            const outstandingM = cn.totalAmount - refundedTotalM;
            const recipientPhoneM = cn.sale?.client?.phone ?? null;
            const recipientEmailM = cn.sale?.client?.email ?? null;
            const creditNoteUrlM = `${appUrl}/api/credit-notes/${cn.id}`;
            const creditNoteShareTextM = encodeURIComponent(`Your credit note is ready.\n\n${cn.creditNoteNumber}\nSale: ${cn.sale?.saleNumber ?? "-"}\nAmount: ${formatMoney(cn.totalAmount, cn.currency)}\nPDF: ${creditNoteUrlM}`);
            const creditNoteWaPhoneM = recipientPhoneM?.replace(/\D/g, "").replace(/^0/, "256");
            return (
              <div key={`m-${cn.id}`} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-mono text-xs font-semibold text-[var(--ink)]">{cn.creditNoteNumber}</p>
                  {cn.itemsReceivedBackAt ? (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[12px] font-bold text-emerald-700">Received</span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[12px] font-bold text-amber-700">Pending Return</span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-[var(--ink-muted)]">
                  {cn.sale?.saleNumber && <span>Sale: <span className="font-mono text-[var(--accent)]">{cn.sale.saleNumber}</span></span>}
                  <span>Client: <span className="text-[var(--ink)]">{cn.sale?.client?.fullName ?? "Walk-in"}</span></span>
                </div>
                <p className="mt-1 line-clamp-2 text-[13px] text-[var(--ink-muted)]">{cn.reason}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px]">
                  <span className="font-mono font-semibold text-[var(--ink)]">{formatMoney(cn.totalAmount, cn.currency)}</span>
                  {refundedTotalM > 0 && <span className="text-emerald-700">Refunded: <span className="font-mono">{formatMoney(refundedTotalM, cn.currency)}</span></span>}
                  <span className="text-[var(--ink-muted)]">Issued {fmt(cn.issuedAt)}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <a href={`/api/credit-notes/${cn.id}`} target="_blank" rel="noreferrer" className="rounded border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2 py-0.5 text-[13px] font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/20">PDF</a>
                  <RowActionsMenu label={`Credit note actions for ${cn.creditNoteNumber}`}>
                    <div className="py-1 text-left">
                      <MenuActionLink href={`/api/credit-notes/${cn.id}`} external icon="quote" tone="accent">
                        Download Credit Note PDF
                      </MenuActionLink>
                    </div>
                    <MenuSection label="Share" />
                    {recipientPhoneM ? (
                      <form action={shareCreditNoteWhatsAppAction}>
                        <input type="hidden" name="creditNoteId" value={cn.id} />
                        <MenuActionButton icon="whatsapp" tone="success">Send via WhatsApp</MenuActionButton>
                      </form>
                    ) : (
                      <span className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[var(--ink-muted)]">WhatsApp unavailable</span>
                    )}
                    {recipientEmailM ? (
                      <form action={shareCreditNoteEmailAction}>
                        <input type="hidden" name="creditNoteId" value={cn.id} />
                        <MenuActionButton icon="open">Email credit note</MenuActionButton>
                      </form>
                    ) : (
                      <span className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[var(--ink-muted)]">Email unavailable</span>
                    )}
                    {creditNoteWaPhoneM ? (
                      <MenuActionLink href={`https://wa.me/${creditNoteWaPhoneM}?text=${creditNoteShareTextM}`} external icon="whatsapp" tone="success">
                        Open WhatsApp Link
                      </MenuActionLink>
                    ) : null}
                    {!cn.itemsReceivedBackAt ? (
                      <>
                        <MenuSection label="Inventory Return" />
                        <form action={markItemsReceivedAction} className="p-3">
                          <input type="hidden" name="creditNoteId" value={cn.id} />
                          <MenuActionButton icon="save" tone="success">Mark Items Received</MenuActionButton>
                        </form>
                      </>
                    ) : null}
                    {outstandingM > 0 ? (
                      <>
                        <MenuSection label="Refund" />
                        <div className="w-64 p-3">
                        <form action={issueRefundFromCreditNoteAction} className="space-y-2">
                          <input type="hidden" name="creditNoteId" value={cn.id} />
                          <div>
                            <label className="mb-0.5 block text-[12px] font-semibold uppercase text-[var(--ink-muted)]">Amount</label>
                            <input name="amount" type="number" step="0.01" max={outstandingM} defaultValue={outstandingM} className="w-full rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1 text-sm text-[var(--ink)]" />
                            <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">Max: {formatMoney(outstandingM, cn.currency)}</p>
                          </div>
                          <div>
                            <label className="mb-0.5 block text-[12px] font-semibold uppercase text-[var(--ink-muted)]">Method</label>
                            <select name="method" className="w-full rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1 text-sm text-[var(--ink)]">
                              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
                            </select>
                          </div>
                          <input name="reference" placeholder="Reference (optional)" className="w-full rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1 text-sm text-[var(--ink)]" />
                          <button type="submit" className="w-full rounded bg-[var(--gold)]/20 py-1.5 text-xs font-semibold text-[var(--gold)] hover:bg-[var(--gold)]/30">Issue Refund</button>
                        </form>
                        </div>
                      </>
                    ) : null}
                    {user.role === "ADMIN" && cn.refunds.length === 0 ? (
                      <MenuDestructiveRow>
                        <form action={deleteCreditNoteAction}>
                          <input type="hidden" name="id" value={cn.id} />
                          <ConfirmSubmitButton
                            message={`Delete credit note ${cn.creditNoteNumber}? This cannot be undone.`}
                            confirmLabel="Delete"
                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-600 transition hover:bg-red-500/10 hover:text-red-700"
                          >Delete Credit Note</ConfirmSubmitButton>
                        </form>
                      </MenuDestructiveRow>
                    ) : null}
                  </RowActionsMenu>
                </div>
              </div>
            );
          })}
        </div>
        {/* Desktop table */}
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--panel-strong)] text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              <tr className="border-b border-[var(--line)]">
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
            <tbody>
              {creditNotes.map((cn) => {
                const refundedTotal = cn.refunds.reduce((s, r) => s + r.amount, 0);
                const outstanding = cn.totalAmount - refundedTotal;
                const recipientPhone = cn.sale?.client?.phone ?? null;
                const recipientEmail = cn.sale?.client?.email ?? null;
                const creditNoteUrl = `${appUrl}/api/credit-notes/${cn.id}`;
                const creditNoteShareText = encodeURIComponent(`Your credit note is ready.\n\n${cn.creditNoteNumber}\nSale: ${cn.sale?.saleNumber ?? "-"}\nAmount: ${formatMoney(cn.totalAmount, cn.currency)}\nPDF: ${creditNoteUrl}`);
                const creditNoteWaPhone = recipientPhone?.replace(/\D/g, "").replace(/^0/, "256");
                return (
                  <tr key={cn.id} className="border-t border-[var(--line)] align-middle hover:bg-[var(--panel-strong)]/40">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-[var(--ink)]">{cn.creditNoteNumber}</td>
                    <td className="px-4 py-3 text-[var(--ink-muted)]">{cn.sale?.saleNumber ?? "—"}</td>
                    <td className="px-4 py-3 text-[var(--ink)]">{cn.sale?.client?.fullName ?? <span className="text-[var(--ink-muted)]">Walk-in</span>}</td>
                    <td className="px-4 py-3 max-w-[180px] truncate text-[var(--ink-muted)]">{cn.reason}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-[var(--ink)]">{formatMoney(cn.totalAmount, cn.currency)}</td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-700">{refundedTotal > 0 ? formatMoney(refundedTotal, cn.currency) : "—"}</td>
                    <td className="px-4 py-3">
                      {cn.itemsReceivedBackAt ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[13px] font-semibold text-emerald-700">
                          Received {fmt(cn.itemsReceivedBackAt)}
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[13px] font-semibold text-amber-700">Pending</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--ink-muted)]">{fmt(cn.issuedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <a href={`/api/credit-notes/${cn.id}`} target="_blank" rel="noreferrer" title="Download PDF" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)] transition hover:bg-[var(--accent)]/20">
                          PDF
                        </a>
                        <RowActionsMenu label={`Credit note actions for ${cn.creditNoteNumber}`}>
                          <div className="py-1 text-left">
                            <MenuActionLink href={`/api/credit-notes/${cn.id}`} external icon="quote" tone="accent">
                              Download Credit Note PDF
                            </MenuActionLink>
                          </div>
                          <MenuSection label="Share" />
                          {recipientPhone ? (
                            <form action={shareCreditNoteWhatsAppAction}>
                              <input type="hidden" name="creditNoteId" value={cn.id} />
                              <MenuActionButton icon="whatsapp" tone="success">Send via WhatsApp</MenuActionButton>
                            </form>
                          ) : (
                            <span className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[var(--ink-muted)]">WhatsApp unavailable</span>
                          )}
                          {recipientEmail ? (
                            <form action={shareCreditNoteEmailAction}>
                              <input type="hidden" name="creditNoteId" value={cn.id} />
                              <MenuActionButton icon="open">Email credit note</MenuActionButton>
                            </form>
                          ) : (
                            <span className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[var(--ink-muted)]">Email unavailable</span>
                          )}
                          {creditNoteWaPhone ? (
                            <MenuActionLink href={`https://wa.me/${creditNoteWaPhone}?text=${creditNoteShareText}`} external icon="whatsapp" tone="success">
                              Open WhatsApp Link
                            </MenuActionLink>
                          ) : null}
                          {!cn.itemsReceivedBackAt ? (
                            <>
                              <MenuSection label="Inventory Return" />
                              <form action={markItemsReceivedAction} className="p-3">
                                <input type="hidden" name="creditNoteId" value={cn.id} />
                                <MenuActionButton icon="save" tone="success">Mark Items Received</MenuActionButton>
                              </form>
                            </>
                          ) : null}
                          {outstanding > 0 ? (
                            <>
                              <MenuSection label="Refund" />
                              <div className="w-64 p-3">
                              <form action={issueRefundFromCreditNoteAction} className="space-y-2">
                                <input type="hidden" name="creditNoteId" value={cn.id} />
                                <div>
                                  <label className="mb-0.5 block text-[12px] font-semibold uppercase text-[var(--ink-muted)]">Amount</label>
                                  <input name="amount" type="number" step="0.01" max={outstanding} defaultValue={outstanding} className="w-full rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1 text-sm text-[var(--ink)]" />
                                  <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">Max: {formatMoney(outstanding, cn.currency)}</p>
                                </div>
                                <div>
                                  <label className="mb-0.5 block text-[12px] font-semibold uppercase text-[var(--ink-muted)]">Method</label>
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
                            </>
                          ) : null}
                          {user.role === "ADMIN" && cn.refunds.length === 0 ? (
                            <MenuDestructiveRow>
                              <form action={deleteCreditNoteAction}>
                                <input type="hidden" name="id" value={cn.id} />
                                <ConfirmSubmitButton
                                  message={`Delete credit note ${cn.creditNoteNumber}? This cannot be undone.`}
                                  confirmLabel="Delete"
                                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-600 transition hover:bg-red-500/10 hover:text-red-700"
                                >Delete Credit Note</ConfirmSubmitButton>
                              </form>
                            </MenuDestructiveRow>
                          ) : null}
                        </RowActionsMenu>
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
