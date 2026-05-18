import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import type { DeliveryMethod, InvoiceStatus, InvoiceType, PaymentMethod } from "@prisma/client";
import { Prisma } from "@prisma/client";

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

const PAYMENT_METHODS: PaymentMethod[]  = ["CASH","MOBILE_MONEY","BANK_TRANSFER","CARD","OTHER"];
const INVOICE_STATUSES: InvoiceStatus[] = ["DRAFT","ISSUED","PAID","VOID"];
const INVOICE_TYPES: InvoiceType[]      = ["REPAIR","SERVICE","MERCHANDISE","CONTRACT","OTHER"];
const DELIVERY_METHODS: DeliveryMethod[] = ["PICKUP","DELIVERY","COURIER"];

export const dynamic = "force-dynamic";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string; q?: string }>;
}) {
  await requireModule(OrgModule.INVOICING);
  const { user, orgId, org } = await requireOrgSession();
  if (!("ADMIN" === user.role || "OPS" === user.role || can.approveInvoices(user))) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const typeFilter = params.type ?? "all";
  const statusFilter = params.status ?? "all";
  const q = (params.q ?? "").trim();

  let dbNeedsFix = false;

  // ── Server actions ───────────────────────────────────────────────────────────

  async function createStandaloneInvoiceAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!["ADMIN", "OPS", "MANAGER", "FINANCE"].includes(user.role)) return;
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const clientId = String(formData.get("clientId") ?? "").trim();
    const subject = String(formData.get("subject") ?? "").trim();
    const invoiceTypeRaw = String(formData.get("invoiceType") ?? "SERVICE").trim();
    const totalAmountRaw = Number(String(formData.get("totalAmount") ?? "").trim());
    const currency = normalizeCurrency(formData.get("currency"), org.baseCurrency);
    const dueDateRaw = String(formData.get("dueDate") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();

    if (!clientId || !subject || !Number.isFinite(totalAmountRaw) || totalAmountRaw < 0) return;

    const client = await prisma.client.findFirst({ where: { id: clientId, orgId }, select: { id: true } });
    if (!client) return;

    const invoiceType = INVOICE_TYPES.includes(invoiceTypeRaw as InvoiceType) ? (invoiceTypeRaw as InvoiceType) : "SERVICE" as InvoiceType;
    const dueDate = dueDateRaw ? new Date(dueDateRaw) : null;

    const year = new Date().getFullYear();
    const count = await prisma.invoice.count({ where: { orgId } }).catch(() => 0);
    const invoiceNumber = `INV-${year}-${String(count + 1).padStart(4, "0")}`;

    await prisma.invoice.create({
      data: {
        orgId,
        clientId: client.id,
        invoiceType,
        subject,
        invoiceNumber,
        currency,
        status: "ISSUED" as InvoiceStatus,
        totalAmount: totalAmountRaw,
        dueDate,
        notes: notes || null,
      },
    });
    await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Invoice", entityId: invoiceNumber, action: "INVOICE_CREATED", summary: `${invoiceType} invoice created: ${subject}` });
    revalidatePath("/documents/invoices");
  }

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
      select: { id: true, totalAmount: true, paidAmount: true, jobId: true, status: true },
    });
    if (!invoice || invoice.status === "VOID") return;

    const existingPaid = invoice.paidAmount ?? 0;
    if (existingPaid + amount > invoice.totalAmount) return;

    const safeMethod: PaymentMethod = PAYMENT_METHODS.includes(method as PaymentMethod)
      ? (method as PaymentMethod)
      : "OTHER" as PaymentMethod;

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

      // Sync legacy job payment flags for repair invoices
      if (invoice.jobId) {
        await tx.job.update({
          where: { id: invoice.jobId },
          data: {
            clientPaid: isPaid,
            clientPaidAt: isPaid ? new Date() : null,
            clientPaidById: isPaid ? session.user.id : null,
            clientPaymentRef: reference || null,
          },
        });
      }
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
    const subject = String(formData.get("subject") ?? "").trim();
    if (!invoiceId) return;
    const status = INVOICE_STATUSES.includes(statusRaw as InvoiceStatus) ? (statusRaw as InvoiceStatus) : "ISSUED" as InvoiceStatus;

    await prisma.invoice.updateMany({
      where: { id: invoiceId, orgId },
      data: { status, notes: notes || null, subject: subject || null },
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
      if (invoice.jobId) {
        await tx.job.updateMany({
          where: { id: invoice.jobId, orgId },
          data: { invoiceIssuedAt: null, invoiceNumber: null },
        });
      }
    });
    await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Invoice", entityId: invoice.id, action: "INVOICE_DELETED", summary: "Invoice deleted" });
    revalidatePath("/documents/invoices");
  }

  async function createDeliveryNoteAction(formData: FormData) {
    "use server";
    const { user, orgId, org, session } = await requireOrgSession();
    if (!(can.viewFinancials(user) || ["ADMIN", "OPS"].includes(user.role))) redirect("/dashboard");
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const invoiceId = String(formData.get("invoiceId") ?? "").trim();
    const deliveredByName = String(formData.get("deliveredByName") ?? "").trim();
    const receivedByName = String(formData.get("receivedByName") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();
    const methodRaw = String(formData.get("deliveryMethod") ?? "").trim();
    if (!invoiceId || !deliveredByName || !receivedByName) return;

    const deliveryMethod = DELIVERY_METHODS.includes(methodRaw as DeliveryMethod) ? (methodRaw as DeliveryMethod) : null;
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, orgId },
      select: {
        id: true, invoiceNumber: true, paidAmount: true, totalAmount: true,
        subject: true,
        job: { select: { jobNumber: true, brand: true, model: true } },
      },
    });
    if (!invoice || invoice.paidAmount < invoice.totalAmount) return;

    await prisma.$transaction(async (tx) => {
      const year = new Date().getFullYear();
      const count = await tx.deliveryNote.count({ where: { orgId } }).catch(() => 0);
      const deliveryNoteNumber = `DN-${year}-${String(count + 1).padStart(4, "0")}`;
      const desc = invoice.job
        ? `Repair handover for ${invoice.job.jobNumber} (${invoice.job.brand} ${invoice.job.model})`
        : invoice.subject ?? invoice.invoiceNumber;
      await tx.deliveryNote.create({
        data: {
          orgId,
          invoiceId: invoice.id,
          deliveryNoteNumber,
          deliveryMethod,
          deliveredByName,
          receivedByName,
          note: note || null,
          createdById: session.user.id,
          items: { create: [{ description: desc, quantity: 1 }] },
        },
      });
    });
    await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Invoice", entityId: invoice.id, action: "DELIVERY_NOTE_CREATED", summary: "Delivery note created from paid invoice" });
    revalidatePath("/documents/invoices");
    revalidatePath("/documents/delivery-notes");
  }

  // ── Data fetching ────────────────────────────────────────────────────────────

  const where: Prisma.InvoiceWhereInput = { orgId };
  if (typeFilter !== "all") where.invoiceType = typeFilter as InvoiceType;
  if (statusFilter !== "all") where.status = statusFilter as InvoiceStatus;

  let invoices: Array<{
    id: string;
    invoiceNumber: string;
    invoiceType: string;
    subject: string | null;
    issuedAt: Date;
    dueDate: Date | null;
    currency: string | null;
    totalAmount: number;
    paidAmount: number;
    status: string;
    notes: string | null;
    job: { id: string; jobNumber: string; status: JobStatus; client: { fullName: string } } | null;
    client: { id: string; fullName: string } | null;
    payments: Array<{ id: string }>;
    deliveryNotes: Array<{ id: string }>;
  }> = [];

  try {
    const raw = await prisma.invoice.findMany({
      where,
      orderBy: { issuedAt: "desc" },
      take: 200,
      select: {
        id: true,
        invoiceNumber: true,
        invoiceType: true,
        subject: true,
        issuedAt: true,
        dueDate: true,
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
        client: { select: { id: true, fullName: true } },
        payments: { select: { id: true }, orderBy: { receivedAt: "desc" }, take: 1 },
        deliveryNotes: { select: { id: true }, take: 1 },
      },
    });
    invoices = raw.map((inv) => ({
      ...inv,
      invoiceType: inv.invoiceType ?? "REPAIR",
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("no such table") && msg.includes("Invoice")) dbNeedsFix = true;
    invoices = [];
  }

  // Filter by search query client-side after fetch
  const filtered = q
    ? invoices.filter((inv) => {
        const s = q.toLowerCase();
        return (
          inv.invoiceNumber.toLowerCase().includes(s) ||
          inv.subject?.toLowerCase().includes(s) ||
          inv.job?.client.fullName.toLowerCase().includes(s) ||
          inv.client?.fullName.toLowerCase().includes(s) ||
          inv.job?.jobNumber.toLowerCase().includes(s)
        );
      })
    : invoices;

  const readyJobs = await prisma.job
    .findMany({
      where: { orgId, status: { in: ["READY_FOR_PICKUP", "COMPLETED", "CLOSED"] }, invoiceIssuedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { id: true, jobNumber: true },
    })
    .catch(() => []);

  // Clients for standalone invoice creation
  const clients = await prisma.client
    .findMany({ where: { orgId }, orderBy: { fullName: "asc" }, take: 200, select: { id: true, fullName: true, phone: true } })
    .catch(() => []);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const totalOutstanding = filtered.reduce((sum, i) => sum + Math.max(0, i.totalAmount - i.paidAmount), 0);
  const byType = INVOICE_TYPES.map((t) => ({ type: t, count: invoices.filter((i) => i.invoiceType === t).length })).filter((x) => x.count > 0);

  return (
    <section className="space-y-4">
      {/* Header + KPI strip */}
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2.5">
          <p className="text-[13px] font-bold text-[var(--ink)]">Invoices</p>
          <div className="flex gap-2">
            <Link href="/jobs/new" className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-[12px] font-medium text-[var(--ink-muted)] hover:border-[var(--accent)]/40">New Job</Link>
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--line)] sm:grid-cols-4 sm:divide-y-0">
          <div className="px-4 py-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Total</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--ink)]">{filtered.length}</p>
            <p className="text-[10px] text-[var(--ink-muted)]">this month: {filtered.filter((i) => i.issuedAt >= monthStart).length}</p>
          </div>
          <div className="px-4 py-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Outstanding</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-amber-600">{filtered.filter((i) => i.totalAmount > i.paidAmount && i.status !== "VOID").length}</p>
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
        {/* By-type breakdown */}
        {byType.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-[var(--line)] px-4 py-2">
            {byType.map((b) => (
              <Link key={b.type} href={`/documents/invoices?type=${b.type}`} className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition ${typeFilter === b.type ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--accent)]/40"}`}>
                {b.type.charAt(0) + b.type.slice(1).toLowerCase()} · {b.count}
              </Link>
            ))}
            {typeFilter !== "all" && <Link href="/documents/invoices" className="rounded-full border border-[var(--line)] px-2.5 py-0.5 text-[11px] text-[var(--ink-muted)]">Clear</Link>}
          </div>
        )}
      </div>

      {dbNeedsFix && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <p className="font-semibold text-amber-600">Invoice tables need a DB fix.</p>
          <a className="mt-2 inline-flex rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs font-semibold text-amber-700" href="/api/admin/db-fix" target="_blank" rel="noreferrer">Run DB Fix</a>
        </div>
      )}

      {/* Filters */}
      <form method="GET" className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Search invoice, job, client…" className="h-8 flex-1 min-w-[160px] rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]" />
        <select name="type" defaultValue={typeFilter} className="h-8 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2 text-sm">
          <option value="all">All Types</option>
          {INVOICE_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
        </select>
        <select name="status" defaultValue={statusFilter} className="h-8 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2 text-sm">
          <option value="all">All Statuses</option>
          {INVOICE_STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
        </select>
        <button type="submit" className="h-8 rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-white">Filter</button>
      </form>

      {/* Standalone invoice creation */}
      {["ADMIN", "OPS", "MANAGER", "FINANCE"].includes(user.role) && clients.length > 0 && (
        <details className="group rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <summary className="cursor-pointer select-none px-4 py-2.5 text-[12px] font-semibold text-[var(--ink)] group-open:border-b group-open:border-[var(--line)]">
            + New Standalone Invoice (Service / Contract / Merchandise)
          </summary>
          <form action={createStandaloneInvoiceAction} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1 lg:col-span-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Client</label>
              <select name="clientId" required className="h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm">
                <option value="">Select client…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.fullName}{c.phone ? ` · ${c.phone}` : ""}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Invoice Type</label>
              <select name="invoiceType" defaultValue="SERVICE" className="h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm">
                {INVOICE_TYPES.filter((t) => t !== "REPAIR").map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Subject / Description</label>
              <input name="subject" required placeholder="e.g. IT Support — May 2026" className="h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Amount</label>
              <div className="flex gap-2">
                <input name="totalAmount" type="number" min="0" step="0.01" placeholder="0.00" required className="h-9 flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                <select name="currency" defaultValue={org.baseCurrency} className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2 text-sm">
                  {org.supportedCurrencies.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Due Date</label>
              <input name="dueDate" type="date" className="h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Notes</label>
              <input name="notes" placeholder="Optional notes" className="h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]" />
            </div>
            <div className="flex items-end sm:col-span-2 lg:col-span-3">
              <button type="submit" className="btn-premium h-9 rounded-lg px-5 text-sm font-semibold">Create Invoice</button>
            </div>
          </form>
        </details>
      )}

      {/* Repair jobs ready to invoice */}
      {readyJobs.length > 0 && (
        <div className="rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Repair Jobs Ready to Invoice</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {readyJobs.slice(0, 12).map((job) => (
              <a key={job.id} href={`/api/jobs/${job.id}/invoice`} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/30 bg-[var(--panel)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/60 hover:text-[var(--accent)]">
                {job.jobNumber}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-[var(--line)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel-strong)] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            <tr>
              <th className="px-4 py-3">Invoice</th>
              <th className="hidden px-4 py-3 md:table-cell">Client · Source</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Total</th>
              <th className="hidden px-4 py-3 lg:table-cell">Balance</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((inv) => {
              const balance = Math.max(0, inv.totalAmount - inv.paidAmount);
              const invoiceCurrency = normalizeCurrency(inv.currency, org.baseCurrency);
              const isPaid = balance <= 0 && inv.status !== "VOID";
              const isOverdue = !isPaid && inv.dueDate && inv.dueDate < now && inv.status !== "VOID";
              const statusCls = isPaid
                ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
                : inv.status === "VOID"
                  ? "bg-red-500/10 text-red-600 border-red-500/20"
                  : inv.status === "DRAFT"
                    ? "bg-[var(--panel-strong)] text-[var(--ink-muted)] border-[var(--line)]"
                    : isOverdue
                      ? "bg-red-400/15 text-red-700 border-red-400/30"
                      : "bg-amber-400/15 text-amber-700 border-amber-400/30";
              const statusLabel = isPaid ? "Paid" : inv.status === "VOID" ? "Void" : inv.status === "DRAFT" ? "Draft" : isOverdue ? "Overdue" : "Outstanding";
              const clientName = inv.job?.client.fullName ?? inv.client?.fullName ?? "—";
              const isRepair = inv.invoiceType === "REPAIR";
              const typeBadgeCls: Record<string, string> = {
                REPAIR: "bg-blue-50 text-blue-700",
                SERVICE: "bg-violet-50 text-violet-700",
                MERCHANDISE: "bg-orange-50 text-orange-700",
                CONTRACT: "bg-teal-50 text-teal-700",
                OTHER: "bg-slate-100 text-slate-600",
              };

              return (
                <tr key={inv.id} className="border-t border-[var(--line)] align-middle hover:bg-[var(--panel-strong)]/40">
                  <td className="px-4 py-3">
                    <p className="mono text-sm font-bold text-[var(--ink)]">{inv.invoiceNumber}</p>
                    <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">{inv.issuedAt.toLocaleDateString()}{inv.dueDate ? ` · due ${inv.dueDate.toLocaleDateString()}` : ""}</p>
                    <span className={`mt-0.5 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${typeBadgeCls[inv.invoiceType] ?? typeBadgeCls.OTHER}`}>
                      {inv.invoiceType.charAt(0) + inv.invoiceType.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <p className="font-medium text-[var(--ink)]">{clientName}</p>
                    {isRepair && inv.job ? (
                      <Link className="mono text-[11px] text-[var(--ink-muted)] hover:text-[var(--accent)]" href={`/jobs/${inv.job.id}`}>
                        {inv.job.jobNumber}
                      </Link>
                    ) : inv.subject ? (
                      <p className="text-[11px] text-[var(--ink-muted)]">{inv.subject}</p>
                    ) : null}
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
                      : inv.status !== "VOID"
                        ? <span className={`font-semibold ${isOverdue ? "text-red-600" : "text-amber-700"}`}>{formatMoney(balance, invoiceCurrency)}</span>
                        : <span className="text-[var(--ink-muted)]">—</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {isRepair && inv.job && (
                        <Link href={`/jobs/${inv.job.id}`} className="inline-flex items-center rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink)] hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">
                          Job
                        </Link>
                      )}
                      {isRepair && inv.job && canGenerateInvoiceForStatus(inv.job.status) ? (
                        <a href={`/api/jobs/${inv.job.id}/invoice`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2.5 py-1.5 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/20">PDF</a>
                      ) : null}
                      {inv.payments[0]?.id ? (
                        <a href={`/api/payments/${inv.payments[0].id}/receipt`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/20">Receipt</a>
                      ) : null}
                      <RowActionsMenu label="Invoice actions">
                        {balance > 0 && inv.status !== "VOID" ? (
                          <>
                            <MenuSection label="Record Payment" />
                            <form action={addPaymentAction} className="space-y-2 p-3">
                              <input type="hidden" name="invoiceId" value={inv.id} />
                              <div className="flex gap-2">
                                <input name="amount" inputMode="decimal" placeholder="Amount" className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                                <select name="currency" defaultValue={invoiceCurrency} className="rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-xs outline-none">
                                  {org.supportedCurrencies.map((c) => <option key={c} value={c}>{c}</option>)}
                                </select>
                              </div>
                              <div className="flex gap-2">
                                <select name="method" defaultValue="CASH" className="flex-1 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-xs outline-none">
                                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replaceAll("_", " ")}</option>)}
                                </select>
                                <input name="reference" placeholder="Ref" className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none" />
                              </div>
                              <button type="submit" className="btn-premium w-full rounded-lg px-3 py-1.5 text-xs font-semibold">Record Payment</button>
                            </form>
                          </>
                        ) : null}
                        {balance <= 0 && inv.status !== "VOID" ? (
                          <>
                            <MenuSection label="Delivery Note" />
                            <form action={createDeliveryNoteAction} className="space-y-2 p-3">
                              <input type="hidden" name="invoiceId" value={inv.id} />
                              <input name="deliveredByName" placeholder="Delivered by" className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none" />
                              <input name="receivedByName" placeholder="Received by" className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none" />
                              <select name="deliveryMethod" defaultValue="" className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none">
                                <option value="">No method</option>
                                {DELIVERY_METHODS.map((m) => <option key={m} value={m}>{m.replaceAll("_", " ")}</option>)}
                              </select>
                              <button type="submit" className="btn-premium w-full rounded-lg px-3 py-1.5 text-xs font-semibold">Create Note</button>
                            </form>
                          </>
                        ) : null}
                        <MenuSection label="Edit" />
                        <form action={updateInvoiceAction} className="space-y-2 p-3">
                          <input type="hidden" name="invoiceId" value={inv.id} />
                          {!isRepair && (
                            <input name="subject" defaultValue={inv.subject ?? ""} placeholder="Subject" className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none" />
                          )}
                          <select name="status" defaultValue={inv.status} className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none">
                            {INVOICE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <textarea name="notes" defaultValue={inv.notes ?? ""} placeholder="Notes" className="min-h-12 w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none" />
                          <button type="submit" className="btn-premium w-full rounded-lg px-3 py-1.5 text-xs font-semibold">Save</button>
                        </form>
                        {inv.payments.length === 0 && inv.deliveryNotes.length === 0 ? (
                          <MenuDestructiveRow>
                            <form action={deleteInvoiceAction}>
                              <input type="hidden" name="invoiceId" value={inv.id} />
                              <ConfirmSubmitButton message="Delete this invoice? This cannot be undone." className="text-xs font-semibold text-red-600 hover:text-red-700">Delete Invoice</ConfirmSubmitButton>
                            </form>
                          </MenuDestructiveRow>
                        ) : null}
                      </RowActionsMenu>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr className="border-t border-[var(--line)]">
                <td className="px-4 py-10 text-center text-sm text-[var(--ink-muted)]" colSpan={6}>
                  No invoices found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
