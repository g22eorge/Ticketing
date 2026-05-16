import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { DeliveryMethod, InvoiceStatus, PaymentMethod } from "@prisma/client";

import { formatMoney, isSupportedCurrency, normalizeCurrency, toBaseAmount } from "@/lib/currency";
import { canGenerateInvoiceForStatus } from "@/lib/documents";
import { JobStatus } from "@/lib/job-status";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { requireModule, OrgModule } from "@/lib/module-access";
import { assertOrgCanMutate } from "@/lib/org-write";
import { ConfirmSubmitButton } from "@/components/shared/ConfirmSubmitButton";
import { writeSystemAuditEvent } from "@/lib/commercial/audit";
import { RowActionsMenu, MenuSection, MenuDestructiveRow } from "@/components/shared/RowActionsMenu";

const PAYMENT_METHODS = Object.values(PaymentMethod);
const INVOICE_STATUSES = Object.values(InvoiceStatus);
const DELIVERY_METHODS = Object.values(DeliveryMethod);

export default async function InvoicesPage() {
  await requireModule(OrgModule.INVOICING);
  const { user, orgId, org } = await requireOrgSession();
  if (!("ADMIN" === user.role || "OPS" === user.role || can.approveInvoices(user))) {
    redirect("/dashboard");
  }

  let dbNeedsFix = false;

  async function addPaymentAction(formData: FormData) {
    "use server";
    const { user, orgId, session, org } = await requireOrgSession();
    if (!("ADMIN" === user.role || "OPS" === user.role || can.approveInvoices(user))) return;
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "PAYMENT" });

    const invoiceId = String(formData.get("invoiceId") ?? "").trim();
    const rawAmount = String(formData.get("amount") ?? "").trim();
    const method = String(formData.get("method") ?? "CASH").trim();
    const reference = String(formData.get("reference") ?? "").trim();
    const currency = normalizeCurrency(formData.get("currency"), org.baseCurrency);
    const exchangeRateToBaseRaw = String(formData.get("exchangeRateToBase") ?? "").trim();
    if (!invoiceId) return;

    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    if (!isSupportedCurrency(currency)) return;
    const exchangeRateToBase = currency === org.baseCurrency
      ? null
      : (exchangeRateToBaseRaw ? Number(exchangeRateToBaseRaw) : null);
    if (currency !== org.baseCurrency) {
      if (!exchangeRateToBase || !Number.isFinite(exchangeRateToBase) || exchangeRateToBase <= 0) return;
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, orgId },
      select: { id: true, totalAmount: true, jobId: true },
    });
    if (!invoice) return;

    const safeMethod: PaymentMethod = PAYMENT_METHODS.includes(method as PaymentMethod)
      ? (method as PaymentMethod)
      : PaymentMethod.OTHER;

    await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          orgId,
          invoiceId: invoice.id,
          currency,
          exchangeRateToBase,
          amount,
          method: safeMethod,
          reference: reference || null,
          createdById: session.user.id,
        },
      });

      // If multi-currency payments are present, recompute using stored exchange rates.
      const payments = await tx.payment.findMany({
        where: { invoiceId: invoice.id, orgId },
        select: { amount: true, currency: true, exchangeRateToBase: true },
      });
      const paidAmount = payments.reduce(
        (sum, p) => sum + toBaseAmount({ amount: p.amount, currency: p.currency, baseCurrency: org.baseCurrency, exchangeRateToBase: p.exchangeRateToBase }),
        0,
      );
      const isPaid = invoice.totalAmount > 0 && paidAmount >= invoice.totalAmount;

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount,
          paidAt: isPaid ? new Date() : null,
          status: invoice.totalAmount <= 0 ? "PAID" : isPaid ? "PAID" : "ISSUED",
        },
      });

      // Keep legacy job flags in sync for now.
      await tx.job.update({
        where: { id: invoice.jobId },
        data: {
          clientPaid: isPaid,
          clientPaidAt: isPaid ? new Date() : null,
          clientPaidById: isPaid ? session.user.id : null,
          clientPaymentRef: reference || null,
        },
      });
    });

    revalidatePath("/documents/invoices");
  }

  async function updateInvoiceAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!("ADMIN" === user.role || "OPS" === user.role || can.approveInvoices(user))) return;
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const invoiceId = String(formData.get("invoiceId") ?? "").trim();
    const statusRaw = String(formData.get("status") ?? "ISSUED").trim();
    const notes = String(formData.get("notes") ?? "").trim();
    if (!invoiceId) return;
    const status = INVOICE_STATUSES.includes(statusRaw as InvoiceStatus) ? (statusRaw as InvoiceStatus) : InvoiceStatus.ISSUED;

    await prisma.invoice.updateMany({
      where: { id: invoiceId, orgId },
      data: { status, notes: notes || null },
    });
    await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Invoice", entityId: invoiceId, action: "INVOICE_UPDATED", summary: `Invoice status set to ${status}` });

    revalidatePath("/documents/invoices");
  }

  async function deleteInvoiceAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!("ADMIN" === user.role || can.approveInvoices(user))) return;
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const invoiceId = String(formData.get("invoiceId") ?? "").trim();
    if (!invoiceId) return;

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, orgId },
      select: {
        id: true,
        jobId: true,
        payments: { select: { id: true }, take: 1 },
        deliveryNotes: { select: { id: true }, take: 1 },
      },
    });
    if (!invoice || invoice.payments.length > 0 || invoice.deliveryNotes.length > 0) return;

    await prisma.$transaction(async (tx) => {
      await tx.invoice.deleteMany({ where: { id: invoice.id, orgId } });
      await tx.job.updateMany({
        where: { id: invoice.jobId, orgId },
        data: { invoiceIssuedAt: null, invoiceNumber: null },
      });
    });
    await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Invoice", entityId: invoice.id, action: "INVOICE_DELETED", summary: "Invoice deleted" });

    revalidatePath("/documents/invoices");
  }

  async function createDeliveryNoteAction(formData: FormData) {
    "use server";
    const { user, orgId, org, session } = await requireOrgSession();
    if (!(can.viewFinancials(user) || ["ADMIN", "OPS"].includes(user.role))) return;
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const invoiceId = String(formData.get("invoiceId") ?? "").trim();
    const deliveredByName = String(formData.get("deliveredByName") ?? "").trim();
    const receivedByName = String(formData.get("receivedByName") ?? "").trim();
    const receivedBySignatureText = String(formData.get("receivedBySignatureText") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();
    const methodRaw = String(formData.get("deliveryMethod") ?? "").trim();
    if (!invoiceId || !deliveredByName || !receivedByName) return;

    const deliveryMethod = DELIVERY_METHODS.includes(methodRaw as DeliveryMethod) ? (methodRaw as DeliveryMethod) : null;
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, orgId },
      select: { id: true, invoiceNumber: true, paidAmount: true, totalAmount: true, job: { select: { jobNumber: true, brand: true, model: true } } },
    });
    if (!invoice || invoice.paidAmount < invoice.totalAmount) return;

    await prisma.$transaction(async (tx) => {
      const year = new Date().getFullYear();
      const count = await tx.deliveryNote.count({ where: { orgId } }).catch(() => 0);
      const deliveryNoteNumber = `DN-${year}-${String(count + 1).padStart(4, "0")}`;
      await tx.deliveryNote.create({
        data: {
          orgId,
          invoiceId: invoice.id,
          deliveryNoteNumber,
          deliveryMethod,
          deliveredByName,
          receivedByName,
          receivedBySignatureText: receivedBySignatureText || null,
          note: note || null,
          createdById: session.user.id,
          items: {
            create: [{
              description: `Repair handover for ${invoice.job.jobNumber} (${invoice.job.brand} ${invoice.job.model})`,
              quantity: 1,
            }],
          },
        },
      });
    });
    await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Invoice", entityId: invoice.id, action: "DELIVERY_NOTE_CREATED", summary: "Delivery note created from paid invoice" });

    revalidatePath("/documents/invoices");
    revalidatePath("/documents/delivery-notes");
  }

  let invoices: Array<{
    id: string;
    invoiceNumber: string;
    issuedAt: Date;
    currency: string | null;
    totalAmount: number;
    paidAmount: number;
    status: string;
    notes: string | null;
    job: { id: string; jobNumber: string; status: JobStatus; client: { fullName: string } };
    payments: Array<{ id: string }>;
    deliveryNotes: Array<{ id: string }>;
  }> = [];
  try {
    invoices = await prisma.invoice.findMany({
      where: { orgId },
      orderBy: { issuedAt: "desc" },
      take: 100,
      select: {
        id: true,
        invoiceNumber: true,
        issuedAt: true,
        currency: true,
        totalAmount: true,
        paidAmount: true,
        status: true,
        notes: true,
        job: {
          select: {
            id: true,
            jobNumber: true,
            status: true,
            client: { select: { fullName: true } },
          },
        },
        payments: { select: { id: true }, orderBy: { receivedAt: "desc" }, take: 1 },
        deliveryNotes: { select: { id: true }, take: 1 },
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("no such table") && msg.includes("Invoice")) dbNeedsFix = true;
    invoices = [];
  }

  const readyJobs = await prisma.job
    .findMany({
      where: {
        orgId,
        status: { in: ["READY_FOR_PICKUP", "COMPLETED", "CLOSED"] },
        invoiceIssuedAt: null,
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        jobNumber: true,
      },
    })
    .catch(() => []);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const totalCount = invoices.length;
  const thisMonthCount = invoices.filter((i) => i.issuedAt >= monthStart).length;
  const outstandingCount = invoices.filter((i) => i.totalAmount > i.paidAmount).length;
  const totalOutstanding = invoices.reduce((sum, i) => sum + Math.max(0, i.totalAmount - i.paidAmount), 0);

  return (
    <section className="space-y-4">
      {/* Header + KPI strip */}
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2.5">
          <p className="text-[13px] font-bold text-[var(--ink)]">Invoices</p>
          <Link href="/jobs/new" className="btn-premium rounded-lg px-3 py-1.5 text-[12px]">New Job</Link>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--line)] sm:grid-cols-4 sm:divide-y-0">
          <div className="px-4 py-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Total</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--ink)]">{totalCount}</p>
            <p className="text-[10px] text-[var(--ink-muted)]">this month: {thisMonthCount}</p>
          </div>
          <div className="px-4 py-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Outstanding</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-amber-600">{outstandingCount}</p>
          </div>
          <div className="px-4 py-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Amount Due</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--ink)]">{formatMoney(totalOutstanding, org.baseCurrency)}</p>
          </div>
          <div className="px-4 py-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Ready to Invoice</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--accent)]">{readyJobs.length}</p>
          </div>
        </div>
      </div>

      {dbNeedsFix ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <p className="font-semibold text-amber-600">Invoice tables are missing in the database.</p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">Run <span className="mono">/api/admin/db-fix</span> as platform admin.</p>
          <a className="mt-3 inline-flex rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-500/20" href="/api/admin/db-fix" target="_blank" rel="noreferrer">Open DB Fix</a>
        </div>
      ) : null}

      {readyJobs.length > 0 ? (
        <div className="rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Generate Invoice</p>
          <p className="mt-0.5 text-xs text-[var(--ink-muted)]">These jobs are ready — click to open the invoice PDF</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {readyJobs.slice(0, 12).map((job) => (
              <a key={job.id} href={`/api/jobs/${job.id}/invoice`} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/30 bg-[var(--panel)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/60 hover:text-[var(--accent)]">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                {job.jobNumber}
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {/* Table */}
      <div className="rounded-xl border border-[var(--line)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel-strong)] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            <tr>
              <th className="px-4 py-3">Invoice</th>
              <th className="hidden px-4 py-3 md:table-cell">Job · Client</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Total</th>
              <th className="hidden px-4 py-3 lg:table-cell">Balance</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const balance = Math.max(0, inv.totalAmount - inv.paidAmount);
              const invoiceCurrency = normalizeCurrency(inv.currency, org.baseCurrency);
              const isPaid = balance <= 0;
              const statusCls = isPaid
                ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
                : inv.status === "VOID"
                  ? "bg-red-500/10 text-red-600 border-red-500/20"
                  : inv.status === "DRAFT"
                    ? "bg-[var(--panel-strong)] text-[var(--ink-muted)] border-[var(--line)]"
                    : "bg-amber-400/15 text-amber-700 border-amber-400/30";
              const statusLabel = isPaid ? "Paid" : inv.status === "VOID" ? "Void" : inv.status === "DRAFT" ? "Draft" : "Outstanding";
              return (
                <tr key={inv.id} className="border-t border-[var(--line)] align-middle hover:bg-[var(--panel-strong)]/40">
                  <td className="px-4 py-3">
                    <p className="mono text-sm font-bold text-[var(--ink)]">{inv.invoiceNumber}</p>
                    <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">{inv.issuedAt.toLocaleDateString()}</p>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <Link className="mono text-sm font-bold text-[var(--ink)] transition-colors hover:text-[var(--accent)]" href={`/jobs/${inv.job.id}`}>
                      {inv.job.jobNumber}
                    </Link>
                    <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">{inv.job.client.fullName}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusCls}`}>{statusLabel}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-[var(--ink)]">{formatMoney(inv.totalAmount, invoiceCurrency)}</p>
                    {inv.paidAmount > 0 && !isPaid ? (
                      <p className="mt-0.5 text-[11px] text-emerald-700">{formatMoney(inv.paidAmount, invoiceCurrency)} paid</p>
                    ) : null}
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    {isPaid
                      ? <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">Cleared</span>
                      : <span className="font-semibold text-amber-700">{formatMoney(balance, invoiceCurrency)}</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link href={`/jobs/${inv.job.id}`} className="inline-flex items-center rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">
                        View
                      </Link>
                      {canGenerateInvoiceForStatus(inv.job.status) ? (
                        <a href={`/api/jobs/${inv.job.id}/invoice`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2.5 py-1.5 text-xs font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)]/20">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                          PDF
                        </a>
                      ) : null}
                      {inv.payments[0]?.id ? (
                        <a href={`/api/payments/${inv.payments[0].id}/receipt`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-500/20">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2h16v20l-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>
                          Receipt
                        </a>
                      ) : null}
                      <RowActionsMenu label="Invoice actions">
                        {balance > 0 ? (
                          <>
                            <MenuSection label="Record Payment" />
                            <form action={addPaymentAction} className="space-y-2 p-3">
                              <input type="hidden" name="invoiceId" value={inv.id} />
                              <div className="flex gap-2">
                                <input name="amount" inputMode="decimal" placeholder="Amount" className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                                <select name="currency" defaultValue={invoiceCurrency} className="rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50">
                                  {org.supportedCurrencies.map((c) => <option key={c} value={c}>{c}</option>)}
                                </select>
                              </div>
                              {invoiceCurrency !== org.baseCurrency ? (
                                <input name="exchangeRateToBase" inputMode="decimal" placeholder={`1 ${invoiceCurrency} = ? ${org.baseCurrency}`} className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                              ) : null}
                              <div className="flex gap-2">
                                <select name="method" defaultValue="CASH" className="flex-1 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50">
                                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replaceAll("_", " ")}</option>)}
                                </select>
                                <input name="reference" placeholder="Ref" className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                              </div>
                              <button className="btn-premium w-full rounded-lg px-3 py-1.5 text-xs font-semibold">Record Payment</button>
                            </form>
                          </>
                        ) : null}
                        {balance <= 0 ? (
                          <>
                            <MenuSection label="Delivery Note" />
                            <form action={createDeliveryNoteAction} className="space-y-2 p-3">
                              <input type="hidden" name="invoiceId" value={inv.id} />
                              <input name="deliveredByName" placeholder="Delivered by" className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                              <input name="receivedByName" placeholder="Received by" className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                              <select name="deliveryMethod" defaultValue="" className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50">
                                <option value="">No method</option>
                                {DELIVERY_METHODS.map((m) => <option key={m} value={m}>{m.replaceAll("_", " ")}</option>)}
                              </select>
                              <button className="btn-premium w-full rounded-lg px-3 py-1.5 text-xs font-semibold">Create Note</button>
                            </form>
                          </>
                        ) : null}
                        <MenuSection label="Edit" />
                        <form action={updateInvoiceAction} className="space-y-2 p-3">
                          <input type="hidden" name="invoiceId" value={inv.id} />
                          <select name="status" defaultValue={inv.status} className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50">
                            {INVOICE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <textarea name="notes" defaultValue={inv.notes ?? ""} placeholder="Notes" className="min-h-12 w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                          <button className="btn-premium w-full rounded-lg px-3 py-1.5 text-xs font-semibold">Save</button>
                        </form>
                        {inv.payments.length === 0 && inv.deliveryNotes.length === 0 ? (
                          <MenuDestructiveRow>
                            <form action={deleteInvoiceAction}>
                              <input type="hidden" name="invoiceId" value={inv.id} />
                              <ConfirmSubmitButton message="Delete this invoice? This cannot be undone." className="text-xs font-semibold text-red-600 transition hover:text-red-700">Delete Invoice</ConfirmSubmitButton>
                            </form>
                          </MenuDestructiveRow>
                        ) : null}
                      </RowActionsMenu>
                    </div>
                  </td>
                </tr>
              );
            })}

            {invoices.length === 0 ? (
              <tr className="border-t border-[var(--line)]">
                <td className="px-4 py-10 text-center text-sm text-[var(--ink-muted)]" colSpan={6}>
                  No invoices yet. Generate one from a completed job above.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
