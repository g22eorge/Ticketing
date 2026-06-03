import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { OutboundMessageType, type PaymentMethod } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { formatMoney, normalizeCurrency } from "@/lib/currency";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { requireModule, OrgModule } from "@/lib/module-access";
import { assertOrgCanMutate } from "@/lib/org-write";
import { ConfirmSubmitButton } from "@/components/shared/ConfirmSubmitButton";
import { RowActionsMenu, MenuActionButton, MenuActionLink, MenuDestructiveRow, MenuSection } from "@/components/shared/RowActionsMenu";
import { enqueueEmailMessage, enqueueWhatsAppMessage } from "@/lib/notifications/whatsapp-outbox";

const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "OTHER"];

export const dynamic = "force-dynamic";

export default async function RefundsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; method?: string; type?: string }>;
}) {
  await requireModule(OrgModule.INVOICING);
  const { user, orgId, org } = await requireOrgSession();
  if (!can.viewFinancials(user) && !["ADMIN", "OPS", "MANAGER", "FINANCE"].includes(user.role)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const methodFilter = params.method ?? "all";
  const typeFilter = params.type ?? "all";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // ── Server actions ───────────────────────────────────────────────────────────

  async function createRefundAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!["ADMIN", "OPS", "MANAGER", "FINANCE"].includes(user.role)) return;
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "PAYMENT" });

    const invoiceId = String(formData.get("invoiceId") ?? "").trim() || null;
    const saleId = String(formData.get("saleId") ?? "").trim() || null;
    const creditNoteId = String(formData.get("creditNoteId") ?? "").trim() || null;
    const amountRaw = Number(String(formData.get("amount") ?? "").trim());
    const methodRaw = String(formData.get("method") ?? "CASH").trim();
    const reference = String(formData.get("reference") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();

    if (!invoiceId && !saleId) return;
    if (!Number.isFinite(amountRaw) || amountRaw <= 0) return;

    const method = PAYMENT_METHODS.includes(methodRaw as PaymentMethod)
      ? (methodRaw as PaymentMethod)
      : "CASH" as PaymentMethod;

    if (invoiceId) {
      const inv = await prisma.invoice.findFirst({ where: { id: invoiceId, orgId }, select: { id: true } });
      if (!inv) return;
    }
    if (saleId) {
      const sale = await prisma.sale.findFirst({ where: { id: saleId, orgId }, select: { id: true } });
      if (!sale) return;
    }

    await prisma.refund.create({
      data: {
        orgId,
        invoiceId: invoiceId || null,
        saleId: saleId || null,
        creditNoteId: creditNoteId || null,
        amount: amountRaw,
        method,
        reference: reference || null,
        note: note || null,
        createdById: user.id,
      },
    });
    revalidatePath("/documents/refunds");
    redirect("/documents/refunds");
  }

  async function deleteRefundAction(formData: FormData) {
    "use server";
    const { user, orgId } = await requireOrgSession();
    if (user.role !== "ADMIN") return;

    const refundId = String(formData.get("refundId") ?? "").trim();
    if (!refundId) return;

    const refund = await prisma.refund.findFirst({ where: { id: refundId, orgId }, select: { id: true } });
    if (!refund) return;

    await prisma.refund.delete({ where: { id: refundId } });
    revalidatePath("/documents/refunds");
  }

  async function shareRefundWhatsAppAction(formData: FormData) {
    "use server";
    const { user, orgId } = await requireOrgSession();
    if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "MANAGER", "FINANCE"].includes(user.role))) return;

    const refundId = String(formData.get("refundId") ?? "").trim();
    if (!refundId) return;
    const refund = await prisma.refund.findFirst({
      where: { id: refundId, orgId },
      select: {
        id: true,
        amount: true,
        currency: true,
        invoice: { select: { invoiceNumber: true, job: { select: { id: true, jobNumber: true, client: { select: { fullName: true, phone: true } } } }, client: { select: { fullName: true, phone: true } } } },
        sale: { select: { saleNumber: true, client: { select: { fullName: true, phone: true } } } },
        creditNote: { select: { creditNoteNumber: true, sale: { select: { client: { select: { fullName: true, phone: true } } } } } },
      },
    });
    const recipient = refund?.invoice?.job?.client ?? refund?.invoice?.client ?? refund?.sale?.client ?? refund?.creditNote?.sale.client ?? null;
    if (!refund || !recipient?.phone) return;

    const source = refund.invoice?.invoiceNumber ?? refund.sale?.saleNumber ?? refund.creditNote?.creditNoteNumber ?? "refund";
    const pdfUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/refunds/${refund.id}`;
    await enqueueWhatsAppMessage({
      orgId,
      jobId: refund.invoice?.job?.id,
      to: recipient.phone,
      type: OutboundMessageType.JOB_STATUS_UPDATE,
      body: `Hi ${recipient.fullName}, your refund document for ${source} is ready.\n\nAmount: ${formatMoney(refund.amount, refund.currency)}\nDownload PDF: ${pdfUrl}`,
    });
    revalidatePath("/documents/refunds");
  }

  async function shareRefundEmailAction(formData: FormData) {
    "use server";
    const { user, orgId } = await requireOrgSession();
    if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "MANAGER", "FINANCE"].includes(user.role))) return;

    const refundId = String(formData.get("refundId") ?? "").trim();
    if (!refundId) return;
    const refund = await prisma.refund.findFirst({
      where: { id: refundId, orgId },
      select: {
        id: true,
        amount: true,
        currency: true,
        invoice: { select: { invoiceNumber: true, job: { select: { id: true, jobNumber: true, client: { select: { fullName: true, email: true } } } }, client: { select: { fullName: true, email: true } } } },
        sale: { select: { saleNumber: true, client: { select: { fullName: true, email: true } } } },
        creditNote: { select: { creditNoteNumber: true, sale: { select: { client: { select: { fullName: true, email: true } } } } } },
      },
    });
    const recipient = refund?.invoice?.job?.client ?? refund?.invoice?.client ?? refund?.sale?.client ?? refund?.creditNote?.sale.client ?? null;
    if (!refund || !recipient?.email) return;

    const source = refund.invoice?.invoiceNumber ?? refund.sale?.saleNumber ?? refund.creditNote?.creditNoteNumber ?? "refund";
    const pdfUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/refunds/${refund.id}`;
    await enqueueEmailMessage({
      orgId,
      jobId: refund.invoice?.job?.id,
      to: recipient.email,
      subject: `Refund document for ${source}`,
      body: `Hi ${recipient.fullName},\n\nYour refund document for ${source} is ready.\n\nAmount: ${formatMoney(refund.amount, refund.currency)}\nDownload PDF: ${pdfUrl}`,
      type: OutboundMessageType.JOB_STATUS_UPDATE,
    });
    revalidatePath("/documents/refunds");
  }

  // ── Data fetching ────────────────────────────────────────────────────────────

  const baseWhere: Prisma.RefundWhereInput = { orgId };
  if (methodFilter !== "all") baseWhere.method = methodFilter as PaymentMethod;
  if (typeFilter === "invoice") baseWhere.invoiceId = { not: null };
  if (typeFilter === "sale") baseWhere.saleId = { not: null };

  const [refunds, kpiData, invoiceRefundTotal, saleRefundTotal] = await Promise.all([
    prisma.refund.findMany({
      where: baseWhere,
      orderBy: { refundedAt: "desc" },
      take: 100,
      select: {
        id: true,
        amount: true,
        currency: true,
        method: true,
        reference: true,
        note: true,
        refundedAt: true,
        createdAt: true,
        invoiceId: true,
        saleId: true,
        creditNoteId: true,
        invoice: { select: { invoiceNumber: true, client: { select: { fullName: true, phone: true, email: true } }, job: { select: { id: true, client: { select: { fullName: true, phone: true, email: true } } } } } },
        sale: { select: { saleNumber: true, client: { select: { fullName: true, phone: true, email: true } } } },
        creditNote: { select: { creditNoteNumber: true, sale: { select: { client: { select: { fullName: true, phone: true, email: true } } } } } },
        createdBy: { select: { name: true } },
      },
    }).catch(() => [] as never[]),
    prisma.refund.aggregate({
      where: { orgId },
      _count: { id: true },
      _sum: { amount: true },
    }).catch(() => ({ _count: { id: 0 }, _sum: { amount: null } })),
    prisma.refund.aggregate({
      where: { orgId, invoiceId: { not: null } },
      _sum: { amount: true },
    }).catch(() => ({ _sum: { amount: null } })),
    prisma.refund.aggregate({
      where: { orgId, saleId: { not: null } },
      _sum: { amount: true },
    }).catch(() => ({ _sum: { amount: null } })),
  ]);

  const filtered = q
    ? refunds.filter((r) => {
        const search = q.toLowerCase();
        return (
          r.invoice?.invoiceNumber?.toLowerCase().includes(search) ||
          r.sale?.saleNumber?.toLowerCase().includes(search) ||
          r.creditNote?.creditNoteNumber?.toLowerCase().includes(search) ||
          r.invoice?.job?.client?.fullName?.toLowerCase().includes(search) ||
          r.sale?.client?.fullName?.toLowerCase().includes(search) ||
          r.reference?.toLowerCase().includes(search) ||
          r.note?.toLowerCase().includes(search)
        );
      })
    : refunds;

  const currency = org.baseCurrency;
  const totalRefunds = kpiData._count.id ?? 0;
  const totalAmount = kpiData._sum.amount ?? 0;
  const invoiceAmount = invoiceRefundTotal._sum.amount ?? 0;
  const saleAmount = saleRefundTotal._sum.amount ?? 0;

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header + KPI panel */}
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2.5">
          <div>
            <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Documents</p>
            <p className="text-[13px] font-bold text-[var(--ink)]">Refunds</p>
            <p className="text-[13px] text-[var(--ink-muted)]">All cash refunds issued against invoices and sales</p>
          </div>
          {["ADMIN", "OPS", "MANAGER", "FINANCE"].includes(user.role) && (
            <details className="group relative">
              <summary className="btn-premium cursor-pointer list-none rounded-lg px-3 py-1.5 text-[12px]">
                + New Refund
              </summary>
              <div className="absolute right-0 top-full z-30 mt-2 w-[min(92vw,720px)] rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 text-left shadow-xl">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Issue New Refund</p>
                <form action={createRefundAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1">
                    <label className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                      Invoice ID
                    </label>
                    <input
                      name="invoiceId"
                      placeholder="Invoice ID"
                      className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                      Sale ID
                    </label>
                    <input
                      name="saleId"
                      placeholder="Sale ID"
                      className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                      Credit Note ID
                    </label>
                    <input
                      name="creditNoteId"
                      placeholder="Optional"
                      className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                      Amount ({currency})
                    </label>
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="0.00"
                      required
                      className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                      Method
                    </label>
                    <select
                      name="method"
                      className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>{m.replace(/_/g, " ")}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                      Reference
                    </label>
                    <input
                      name="reference"
                      placeholder="Optional"
                      className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                    <label className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                      Note
                    </label>
                    <input
                      name="note"
                      placeholder="Optional reason for refund"
                      className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                  </div>
                  <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-3">
                    <button type="submit" className="h-9 rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-white hover:opacity-90">
                      Issue Refund
                    </button>
                  </div>
                </form>
              </div>
            </details>
          )}
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--line)] sm:grid-cols-4 sm:divide-y-0">
          <div className="px-4 py-2.5">
            <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Total Refunds</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--ink)]">{totalRefunds}</p>
            <p className="text-[12px] text-[var(--ink-muted)]">all time</p>
          </div>
          <div className="px-4 py-2.5">
            <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Total Refunded</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--ink)]">{formatMoney(totalAmount, currency)}</p>
          </div>
          <div className="px-4 py-2.5">
            <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Invoice Refunds</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--ink)]">{formatMoney(invoiceAmount, currency)}</p>
          </div>
          <div className="px-4 py-2.5">
            <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Sale Refunds</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--accent)]">{formatMoney(saleAmount, currency)}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <form method="GET" className="hidden lg:flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search invoice, sale, client, reference…"
          className="h-8 flex-1 min-w-[160px] rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
        <select
          name="type"
          defaultValue={typeFilter}
          className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
        >
          <option value="all">All Types</option>
          <option value="invoice">Invoice Refunds</option>
          <option value="sale">Sale Refunds</option>
        </select>
        <select
          name="method"
          defaultValue={methodFilter}
          className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
        >
          <option value="all">All Methods</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>{m.replace(/_/g, " ")}</option>
          ))}
        </select>
        <button
          type="submit"
          className="h-8 rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-white"
        >
          Filter
        </button>
        {(q || methodFilter !== "all" || typeFilter !== "all") && (
          <Link href="/documents/refunds" className="flex h-8 items-center rounded-lg border border-[var(--border)] px-3 text-sm text-[var(--ink-muted)]">
            Clear
          </Link>
        )}
      </form>

      {/* Table */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-[var(--ink-muted)]">No refunds found</div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="divide-y divide-[var(--line)] lg:hidden">
              {filtered.map((r) => {
                const refundCurrencyM = normalizeCurrency(r.currency, currency);
                const sourceLabelM = r.invoice ? r.invoice.invoiceNumber : r.sale ? r.sale.saleNumber : r.creditNote ? r.creditNote.creditNoteNumber : "—";
                const sourceHrefM = r.invoiceId ? `/documents/invoices?id=${r.invoiceId}` : r.saleId ? `/sales/${r.saleId}` : null;
                const clientNameM = r.invoice?.job?.client?.fullName ?? r.invoice?.client?.fullName ?? r.sale?.client?.fullName ?? r.creditNote?.sale.client?.fullName ?? "—";
                const recipientPhoneM = r.invoice?.job?.client?.phone ?? r.invoice?.client?.phone ?? r.sale?.client?.phone ?? r.creditNote?.sale.client?.phone ?? null;
                const recipientEmailM = r.invoice?.job?.client?.email ?? r.invoice?.client?.email ?? r.sale?.client?.email ?? r.creditNote?.sale.client?.email ?? null;
                const refundUrlM = `${appUrl}/api/refunds/${r.id}`;
                const refundShareTextM = encodeURIComponent(`Your refund document is ready.\n\n${sourceLabelM}\nAmount: ${formatMoney(r.amount, refundCurrencyM)}\nPDF: ${refundUrlM}`);
                const refundWaPhoneM = recipientPhoneM?.replace(/\D/g, "").replace(/^0/, "256");
                return (
                  <div key={`m-${r.id}`} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {sourceHrefM ? (
                          <Link href={sourceHrefM} className="font-mono text-xs font-semibold text-[var(--accent)] hover:underline">{sourceLabelM}</Link>
                        ) : (
                          <span className="font-mono text-xs font-semibold text-[var(--ink)]">{sourceLabelM}</span>
                        )}
                        <span className={`rounded px-1 py-0.5 text-[12px] font-semibold ${r.invoiceId ? "border border-blue-400/30 bg-blue-500/10 text-blue-700 dark:text-blue-400" : "border border-violet-400/30 bg-violet-500/10 text-violet-700 dark:text-violet-400"}`}>
                          {r.invoiceId ? "Invoice" : "Sale"}
                        </span>
                      </div>
                      <span className="shrink-0 rounded border border-[var(--line)] bg-[var(--panel-strong)] px-1.5 py-0.5 text-[13px] font-semibold text-[var(--ink-muted)]">{r.method.replace(/_/g, " ")}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px]">
                      <span className="font-medium text-[var(--ink)]">{clientNameM}</span>
                      <span className="font-bold tabular-nums text-[var(--ink)]">{formatMoney(r.amount, refundCurrencyM)}</span>
                      <span className="text-[var(--ink-muted)]">{r.refundedAt.toLocaleDateString()}</span>
                    </div>
                    {(r.reference || r.note) && (
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-[13px] text-[var(--ink-muted)]">
                        {r.reference && <span>Ref: <span className="font-mono">{r.reference}</span></span>}
                        {r.note && <span className="line-clamp-1">{r.note}</span>}
                      </div>
                    )}
                    <div className="mt-1 flex items-center justify-between text-[13px] text-[var(--ink-muted)]">
                      <span>By: {r.createdBy?.name ?? "—"}</span>
                      <RowActionsMenu label={`Refund actions for ${sourceLabelM}`}>
                        <div className="py-1 text-left">
                          <MenuActionLink href={`/api/refunds/${r.id}`} external icon="receipt" tone="accent">
                            Download Refund PDF
                          </MenuActionLink>
                        </div>
                        <MenuSection label="Share" />
                        {recipientPhoneM ? (
                          <form action={shareRefundWhatsAppAction}>
                            <input type="hidden" name="refundId" value={r.id} />
                            <MenuActionButton icon="whatsapp" tone="success">Send via WhatsApp</MenuActionButton>
                          </form>
                        ) : (
                          <span className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[var(--ink-muted)]">WhatsApp unavailable</span>
                        )}
                        {recipientEmailM ? (
                          <form action={shareRefundEmailAction}>
                            <input type="hidden" name="refundId" value={r.id} />
                            <MenuActionButton icon="open">Email refund</MenuActionButton>
                          </form>
                        ) : (
                          <span className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[var(--ink-muted)]">Email unavailable</span>
                        )}
                        {refundWaPhoneM ? (
                          <MenuActionLink href={`https://wa.me/${refundWaPhoneM}?text=${refundShareTextM}`} external icon="whatsapp" tone="success">
                            Open WhatsApp Link
                          </MenuActionLink>
                        ) : null}
                        {user.role === "ADMIN" ? (
                          <MenuDestructiveRow>
                            <form action={deleteRefundAction}>
                              <input type="hidden" name="refundId" value={r.id} />
                              <ConfirmSubmitButton message="Delete this refund? This cannot be undone." confirmLabel="Delete" className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-600 transition hover:bg-red-500/10 hover:text-red-700">Delete Refund</ConfirmSubmitButton>
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
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Source</th>
                    <th className="px-4 py-3 text-left">Client</th>
                    <th className="px-4 py-3 text-left">Method</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-left">Reference</th>
                    <th className="px-4 py-3 text-left">Note</th>
                    <th className="px-4 py-3 text-left">Issued By</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
              <tbody>
                {filtered.map((r) => {
                  const refundCurrency = normalizeCurrency(r.currency, currency);
                  const sourceLabel = r.invoice
                    ? r.invoice.invoiceNumber
                    : r.sale
                    ? r.sale.saleNumber
                    : r.creditNote
                    ? r.creditNote.creditNoteNumber
                    : "—";
                  const sourceHref = r.invoiceId
                    ? `/documents/invoices?id=${r.invoiceId}`
                    : r.saleId
                    ? `/sales/${r.saleId}`
                    : null;
                  const clientName =
                    r.invoice?.job?.client?.fullName ??
                    r.invoice?.client?.fullName ??
                    r.sale?.client?.fullName ??
                    r.creditNote?.sale.client?.fullName ??
                    "—";
                  const recipientPhone =
                    r.invoice?.job?.client?.phone ??
                    r.invoice?.client?.phone ??
                    r.sale?.client?.phone ??
                    r.creditNote?.sale.client?.phone ??
                    null;
                  const recipientEmail =
                    r.invoice?.job?.client?.email ??
                    r.invoice?.client?.email ??
                    r.sale?.client?.email ??
                    r.creditNote?.sale.client?.email ??
                    null;
                  const refundUrl = `${appUrl}/api/refunds/${r.id}`;
                  const refundShareText = encodeURIComponent(`Your refund document is ready.\n\n${sourceLabel}\nAmount: ${formatMoney(r.amount, refundCurrency)}\nPDF: ${refundUrl}`);
                  const refundWaPhone = recipientPhone?.replace(/\D/g, "").replace(/^0/, "256");

                  return (
                    <tr key={r.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-raised)]">
                      <td className="whitespace-nowrap px-4 py-3 text-[var(--ink-muted)]">
                        {r.refundedAt.toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          {sourceHref ? (
                            <Link href={sourceHref} className="font-mono text-xs font-semibold text-[var(--accent)] hover:underline">
                              {sourceLabel}
                            </Link>
                          ) : (
                            <span className="font-mono text-xs font-semibold">{sourceLabel}</span>
                          )}
                          {r.creditNote && (
                            <span className="text-[12px] text-[var(--ink-muted)]">
                              CN: {r.creditNote.creditNoteNumber}
                            </span>
                          )}
                          <span className={`inline-flex w-fit rounded px-1 py-0.5 text-[12px] font-semibold ${r.invoiceId ? "border border-blue-400/30 bg-blue-500/10 text-blue-700 dark:text-blue-400" : "border border-violet-400/30 bg-violet-500/10 text-violet-700 dark:text-violet-400"}`}>
                            {r.invoiceId ? "Invoice" : "Sale"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--ink)]">{clientName}</td>
                      <td className="px-4 py-3">
                        <span className="rounded border border-[var(--line)] bg-[var(--panel-strong)] px-1.5 py-0.5 text-[13px] font-semibold text-[var(--ink-muted)]">
                          {r.method.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-[var(--ink)]">
                        {formatMoney(r.amount, refundCurrency)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--ink-muted)]">
                        {r.reference || "—"}
                      </td>
                      <td className="max-w-[160px] truncate px-4 py-3 text-[var(--ink-muted)]">
                        {r.note || "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[var(--ink-muted)]">
                        {r.createdBy?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <a href={`/api/refunds/${r.id}`} target="_blank" rel="noreferrer" title="Download PDF" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)] transition hover:bg-[var(--accent)]/20">
                            PDF
                          </a>
                          <RowActionsMenu label={`Refund actions for ${sourceLabel}`}>
                            <div className="py-1 text-left">
                              <MenuActionLink href={`/api/refunds/${r.id}`} external icon="receipt" tone="accent">
                                Download Refund PDF
                              </MenuActionLink>
                            </div>
                            <MenuSection label="Share" />
                            {recipientPhone ? (
                              <form action={shareRefundWhatsAppAction}>
                                <input type="hidden" name="refundId" value={r.id} />
                                <MenuActionButton icon="whatsapp" tone="success">Send via WhatsApp</MenuActionButton>
                              </form>
                            ) : (
                              <span className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[var(--ink-muted)]">WhatsApp unavailable</span>
                            )}
                            {recipientEmail ? (
                              <form action={shareRefundEmailAction}>
                                <input type="hidden" name="refundId" value={r.id} />
                                <MenuActionButton icon="open">Email refund</MenuActionButton>
                              </form>
                            ) : (
                              <span className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[var(--ink-muted)]">Email unavailable</span>
                            )}
                            {refundWaPhone ? (
                              <MenuActionLink href={`https://wa.me/${refundWaPhone}?text=${refundShareText}`} external icon="whatsapp" tone="success">
                                Open WhatsApp Link
                              </MenuActionLink>
                            ) : null}
                            {user.role === "ADMIN" ? (
                              <MenuDestructiveRow>
                                <form action={deleteRefundAction}>
                                  <input type="hidden" name="refundId" value={r.id} />
                                  <ConfirmSubmitButton
                                    message="Delete this refund? This cannot be undone."
                                    confirmLabel="Delete"
                                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-600 transition hover:bg-red-500/10 hover:text-red-700"
                                  >Delete Refund</ConfirmSubmitButton>
                                </form>
                              </MenuDestructiveRow>
                            ) : null}
                          </RowActionsMenu>
                        </div>
                      </td>
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
