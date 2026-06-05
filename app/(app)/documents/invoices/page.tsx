// @ts-nocheck
import Link from "next/link";
import { getCurrentUserRole } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import type { DeliveryMethod, InvoiceStatus, InvoiceType, PaymentMethod } from "@prisma/client";
import { Prisma } from "@prisma/client";

import {
  formatMoney,
  formatMoneyCompact,
  isSupportedCurrency,
  normalizeCurrency,
  toBaseAmount,
} from "@/lib/currency";
import { canGenerateInvoiceForStatus } from "@/lib/documents";
import { JobStatus } from "@/lib/job-status";
import { can } from "@/lib/permissions";
import { orgDb, prisma } from "@/lib/prisma";
import { ConfirmSubmitButton } from "@/components/shared/ConfirmSubmitButton";
import { RowActionsMenu, MenuSection, MenuDestructiveRow, MenuActionLink, MenuActionButton } from "@/components/shared/RowActionsMenu";
import { createReceiptForPayment, nextAvailableInvoiceNumber } from "@/lib/commercial/document-workflow";
import { writeSystemAuditEvent } from "@/lib/commercial/audit";
import { sendInvoiceViaWhatsAppAction } from "@/app/(app)/jobs/[id]/actions";

const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "OTHER"];
const INVOICE_STATUSES: InvoiceStatus[] = ["DRAFT", "ISSUED", "PAID", "VOID"];
const INVOICE_TYPES: InvoiceType[] = ["REPAIR", "SERVICE", "MERCHANDISE", "CONTRACT", "OTHER"];
const DELIVERY_METHODS: DeliveryMethod[] = ["PICKUP", "DELIVERY", "COURIER"];

export const dynamic = "force-dynamic";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string; q?: string; aging?: string; create?: string; collect?: string; pay?: string }>;
}) {
  const { user } = await getCurrentUserRole();
  const db = orgDb(user.orgId);
  const canCreateInvoice = can.createInvoices(user);
  const canManageInvoicePayments = "ADMIN" === user.role || "OPS" === user.role || can.approveInvoices(user);
  if (!(canCreateInvoice || canManageInvoicePayments)) {
    redirect("/dashboard");
  }

  // Org base currency for the Collect Revenue section totals
  const orgRow = user.orgId
    ? await prisma.organization.findUnique({ where: { id: user.orgId }, select: { baseCurrency: true } }).catch(() => null)
    : null;
  const orgCurrency = normalizeCurrency(orgRow?.baseCurrency, "UGX");

  const params = await searchParams;
  const createMode  = params.create === "1"; // mobile "New Invoice" → show creation form
  const collectMode = params.collect === "1"; // mobile "Collect Revenue" button → show panel
  const payInvoiceId = (params.pay ?? "").trim(); // inline payment form for this invoice ID
  const typeFilter = params.type ?? "all";
  const statusFilter = params.status ?? "all";
  const agingFilter = params.aging ?? "all";
  const q = (params.q ?? "").trim();

  let dbNeedsFix = false;

  // ── Server actions ───────────────────────────────────────────────────────────

  async function createStandaloneInvoiceAction(formData: FormData) {
    "use server";
    const { user } = await getCurrentUserRole();
    const orgId = user.orgId;
    const db = orgDb(orgId);
    if (!can.createInvoices(user)) return;

    const clientId = String(formData.get("clientId") ?? "").trim();
    const subject = String(formData.get("subject") ?? "").trim();
    const invoiceTypeRaw = String(formData.get("invoiceType") ?? "SERVICE").trim();
    const totalAmountRaw = Number(String(formData.get("totalAmount") ?? "").trim());
    const currency = normalizeCurrency(formData.get("currency"), "UGX");
    const dueDateRaw = String(formData.get("dueDate") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();

    if (!clientId || !subject || !Number.isFinite(totalAmountRaw) || totalAmountRaw < 0) return;

    const client = await db.client.findFirst({ where: { id: clientId }, select: { id: true } });
    if (!client) return;

    const invoiceType = INVOICE_TYPES.includes(invoiceTypeRaw as InvoiceType)
      ? (invoiceTypeRaw as InvoiceType)
      : ("SERVICE" as InvoiceType);
    const dueDate = dueDateRaw ? new Date(dueDateRaw) : null;

    const invoice = await prisma.$transaction(async (tx) => {
      const invoiceNumber = await nextAvailableInvoiceNumber(tx);
      return tx.invoice.create({
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
    });
    await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Invoice", entityId: invoice.id, action: "INVOICE_CREATED", summary: `${invoice.invoiceNumber} created: ${subject}` });
    revalidatePath("/documents/invoices");
  }

  async function addPaymentAction(formData: FormData) {
    "use server";
    const { user } = await getCurrentUserRole();
    const orgId = user.orgId;
    const db = orgDb(orgId);
    if (!("ADMIN" === user.role || "OPS" === user.role || can.approveInvoices(user))) return;

    const invoiceId = String(formData.get("invoiceId") ?? "").trim();
    // Strip commas / currency prefix so "50,000" or "UGX 50,000" parses correctly
    const rawAmount = String(formData.get("amount") ?? "").replace(/[^\d.]/g, "").trim();
    const method = String(formData.get("method") ?? "CASH").trim();
    const reference = String(formData.get("reference") ?? "").trim();
    const baseCurrency = "UGX";
    const currency = normalizeCurrency(formData.get("currency"), baseCurrency);
    const exchangeRateToBaseRaw = String(formData.get("exchangeRateToBase") ?? "").trim();
    if (!invoiceId) return;

    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (!isSupportedCurrency(currency)) return;

    // For the base currency (UGX) no exchange rate needed — null means 1:1
    const isBaseCurrency = currency === baseCurrency;
    const exchangeRateToBase = isBaseCurrency
      ? null
      : exchangeRateToBaseRaw
        ? Number(exchangeRateToBaseRaw)
        : null;
    // Only require exchange rate for non-base currencies
    if (!isBaseCurrency) {
      if (!exchangeRateToBase || !Number.isFinite(exchangeRateToBase) || exchangeRateToBase <= 0)
        return;
    }

    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId },
      select: { id: true, totalAmount: true, paidAmount: true, jobId: true, clientId: true, status: true },
    });
    if (!invoice || invoice.status === "VOID") return;

    const existingPaid = invoice.paidAmount ?? 0;
    if (existingPaid + amount > invoice.totalAmount) return;

    const safeMethod: PaymentMethod = PAYMENT_METHODS.includes(method as PaymentMethod)
      ? (method as PaymentMethod)
      : ("OTHER" as PaymentMethod);

    await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          currency,
          exchangeRateToBase,
          amount,
          method: safeMethod,
          reference: reference || null,
          createdById: user.id,
          orgId,
        },
      });
      await createReceiptForPayment(tx, {
        orgId,
        paymentId: payment.id,
        invoiceId: invoice.id,
        clientId: invoice.clientId,
        amount,
        currency,
        issuedById: user.id,
      });

      const payments = await tx.payment.findMany({
        where: { invoiceId: invoice.id },
        select: { amount: true, currency: true, exchangeRateToBase: true },
      });
      const paidAmount = payments.reduce(
        (sum, p) =>
          sum +
          toBaseAmount({
            amount: p.amount,
            currency: p.currency,
            baseCurrency: "UGX",
            exchangeRateToBase: p.exchangeRateToBase,
          }),
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

      if (invoice.jobId) {
        await tx.job.update({
          where: { id: invoice.jobId },
          data: {
            clientPaid: isPaid,
            clientPaidAt: isPaid ? new Date() : null,
            clientPaidById: isPaid ? user.id : null,
            clientPaymentRef: reference || null,
          },
        });
      }
    });

    revalidatePath("/documents/invoices");
    // Clear the ?pay= param by redirecting back to the clean URL
    redirect("/documents/invoices");
  }

  // Create an invoice record from a completed job, then redirect straight to
  // the inline payment form so the user can collect immediately in one flow.
  async function createAndCollectAction(formData: FormData) {
    "use server";
    const { user } = await getCurrentUserRole();
    const orgId = user.orgId;
    const db = orgDb(orgId);
    const canManagePayments = "ADMIN" === user.role || "OPS" === user.role || can.approveInvoices(user);
    if (!can.createInvoices(user) && !can.approveInvoices(user)) return;

    const jobId = String(formData.get("jobId") ?? "").trim();
    if (!jobId) return;

    const job = await db.job.findFirst({
      where: { id: jobId, ...(canManagePayments ? {} : { createdById: user.id }) },
      select: { id: true, jobNumber: true, clientId: true, clientBill: true, invoiceIssuedAt: true, invoiceNumber: true, status: true },
    });
    if (!job || !job.clientBill || job.clientBill <= 0) return;

    // If invoice already exists, go straight to collect
    if (job.invoiceIssuedAt && job.invoiceNumber) {
      const existing = await db.invoice.findFirst({ where: { jobId: job.id }, select: { id: true } });
      if (existing) {
        redirect(`/documents/invoices?pay=${existing.id}`);
      }
    }

    // Create the invoice record
    const invoice = await prisma.$transaction(async (tx) => {
      const invoiceNumber = await nextAvailableInvoiceNumber(tx);
      const inv = await tx.invoice.create({
        data: {
          orgId,
          jobId: job.id,
          clientId: job.clientId,
          invoiceType: "REPAIR",
          invoiceNumber,
          subject: `Repair job ${job.jobNumber}`,
          currency: orgCurrency,
          status: "ISSUED",
          totalAmount: job.clientBill!,
          issuedAt: new Date(),
        },
      });
      // Stamp invoice details on the job
      await tx.job.update({
        where: { id: job.id },
        data: { invoiceIssuedAt: new Date(), invoiceNumber },
      });
      return inv;
    });

    await writeSystemAuditEvent({
      orgId, actorUserId: user.id, entityType: "Invoice", entityId: invoice.id,
      action: "INVOICE_CREATED", summary: `${invoice.invoiceNumber} created from ${job.jobNumber}`,
    });

    revalidatePath("/documents/invoices");
    // Redirect straight to the inline payment form
    redirect(`/documents/invoices?pay=${invoice.id}`);
  }

  async function updateInvoiceAction(formData: FormData) {
    "use server";
    const { user } = await getCurrentUserRole();
    const db = orgDb(user.orgId);
    if (!("ADMIN" === user.role || "OPS" === user.role || can.approveInvoices(user))) return;

    const invoiceId = String(formData.get("invoiceId") ?? "").trim();
    const statusRaw = String(formData.get("status") ?? "ISSUED").trim();
    const notes = String(formData.get("notes") ?? "").trim();
    const subject = String(formData.get("subject") ?? "").trim();
    if (!invoiceId) return;
    const status = INVOICE_STATUSES.includes(statusRaw as InvoiceStatus)
      ? (statusRaw as InvoiceStatus)
      : ("ISSUED" as InvoiceStatus);

    await db.invoice.updateMany({
      where: { id: invoiceId },
      data: { status, notes: notes || null, subject: subject || null },
    });
    revalidatePath("/documents/invoices");
  }

  async function deleteInvoiceAction(formData: FormData) {
    "use server";
    const { user } = await getCurrentUserRole();
    const db = orgDb(user.orgId);
    if (!("ADMIN" === user.role || can.approveInvoices(user))) return;

    const invoiceId = String(formData.get("invoiceId") ?? "").trim();
    if (!invoiceId) return;

    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId },
      select: {
        id: true,
        jobId: true,
        payments: { select: { id: true }, take: 1 },
        deliveryNotes: { select: { id: true }, take: 1 },
      },
    });
    if (!invoice || invoice.payments.length > 0 || invoice.deliveryNotes.length > 0) return;

    await prisma.$transaction(async (tx) => {
      await tx.invoice.deleteMany({ where: { id: invoice.id } });
      if (invoice.jobId) {
        await tx.job.updateMany({
          where: { id: invoice.jobId },
          data: { invoiceIssuedAt: null, invoiceNumber: null },
        });
      }
    });
    revalidatePath("/documents/invoices");
  }

  async function sendInvoiceWhatsAppFromRowAction(formData: FormData) {
    "use server";
    const jobId = String(formData.get("jobId") ?? "").trim();
    if (!jobId) return;
    await sendInvoiceViaWhatsAppAction(jobId);
    revalidatePath("/documents/invoices");
  }

  async function createDeliveryNoteAction(formData: FormData) {
    "use server";
    const { user } = await getCurrentUserRole();
    const db = orgDb(user.orgId);
    if (!(can.viewFinancials(user) || ["ADMIN", "OPS"].includes(user.role))) redirect("/dashboard");

    const invoiceId = String(formData.get("invoiceId") ?? "").trim();
    const deliveredByName = String(formData.get("deliveredByName") ?? "").trim();
    const receivedByName = String(formData.get("receivedByName") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();
    const methodRaw = String(formData.get("deliveryMethod") ?? "").trim();
    if (!invoiceId || !deliveredByName || !receivedByName) return;

    const deliveryMethod = DELIVERY_METHODS.includes(methodRaw as DeliveryMethod)
      ? (methodRaw as DeliveryMethod)
      : null;
    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId },
      select: {
        id: true,
        invoiceNumber: true,
        paidAmount: true,
        totalAmount: true,
        subject: true,
        job: { select: { jobNumber: true, brand: true, model: true } },
      },
    });
    if (!invoice || invoice.paidAmount < invoice.totalAmount) return;

    await prisma.$transaction(async (tx) => {
      const deliveryNoteNumber = await nextDocumentNumber(tx, "DN", "deliveryNote");
      const desc = invoice.job
        ? `Repair handover for ${invoice.job.jobNumber} (${invoice.job.brand} ${invoice.job.model})`
        : (invoice.subject ?? invoice.invoiceNumber);
      await tx.deliveryNote.create({
        data: {
          invoiceId: invoice.id,
          orgId: user.orgId,
          deliveryNoteNumber,
          deliveryMethod,
          deliveredByName,
          receivedByName,
          note: note || null,
          createdById: user.id,
          items: { create: [{ description: desc, quantity: 1 }] },
        },
      });
    });
    revalidatePath("/documents/invoices");
    revalidatePath("/documents/delivery-notes");
  }

  // ── Data fetching ────────────────────────────────────────────────────────────

  const where: Prisma.InvoiceWhereInput = {};
  if (typeFilter !== "all") where.invoiceType = typeFilter as InvoiceType;
  if (statusFilter !== "all") where.status = statusFilter as InvoiceStatus;

  type InvoiceRow = {
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
  };

  let invoices: InvoiceRow[] = [];

  try {
    const raw = await db.invoice.findMany({
      where,
      orderBy: { issuedAt: "desc" },
      take: 300,
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
    invoices = raw.map((inv) => ({ ...inv, invoiceType: inv.invoiceType ?? "REPAIR" }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("no such table") && msg.includes("Invoice")) dbNeedsFix = true;
    invoices = [];
  }

  const now = new Date();
  // Compute aging for each outstanding invoice
  const withAging = invoices.map((inv) => {
    const balance = Math.max(0, inv.totalAmount - inv.paidAmount);
    const isPaid = balance <= 0 || inv.status === "PAID";
    const isVoid = inv.status === "VOID";
    let daysOverdue = 0;
    if (!isPaid && !isVoid) {
      const dueOrIssued = inv.dueDate ?? inv.issuedAt;
      daysOverdue = Math.floor((now.getTime() - dueOrIssued.getTime()) / 86400000);
    }
    return { ...inv, balance, isPaid, isVoid, daysOverdue };
  });

  // Apply aging filter
  const filtered = (() => {
    let base = withAging;
    if (q) {
      const s = q.toLowerCase();
      base = base.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(s) ||
          inv.subject?.toLowerCase().includes(s) ||
          inv.job?.client.fullName.toLowerCase().includes(s) ||
          inv.client?.fullName.toLowerCase().includes(s) ||
          inv.job?.jobNumber.toLowerCase().includes(s),
      );
    }
    if (agingFilter === "current") return base.filter((i) => !i.isVoid && !i.isPaid && i.daysOverdue <= 0);
    if (agingFilter === "1-30") return base.filter((i) => !i.isVoid && !i.isPaid && i.daysOverdue >= 1 && i.daysOverdue <= 30);
    if (agingFilter === "31-60") return base.filter((i) => !i.isVoid && !i.isPaid && i.daysOverdue >= 31 && i.daysOverdue <= 60);
    if (agingFilter === "61+") return base.filter((i) => !i.isVoid && !i.isPaid && i.daysOverdue >= 61);
    return base;
  })();

  const readyJobs = await db.job
    .findMany({
      where: {
        status: { in: ["READY_FOR_PICKUP", "COMPLETED", "CLOSED"] },
        invoiceIssuedAt: null,
        ...(canManageInvoicePayments ? {} : { createdById: user.id }),
      },
      orderBy: { completedAt: "asc" }, // oldest first — most urgent to collect
      take: 20,
      select: {
        id: true,
        jobNumber: true,
        status: true,
        brand: true,
        model: true,
        clientBill: true,
        completedAt: true,
        receivedAt: true,
        client: { select: { fullName: true, phone: true } },
      },
    })
    .catch(() => []);
  const readyJobsTotal = readyJobs.reduce((s, j) => s + (j.clientBill ?? 0), 0);

  const clients = await db.client
    .findMany({
      where: {},
      orderBy: { fullName: "asc" },
      take: 200,
      select: { id: true, fullName: true, phone: true },
    })
    .catch(() => []);

  // ── Aging analysis ────────────────────────────────────────────────────────
  const outstanding = withAging.filter((i) => !i.isPaid && !i.isVoid);
  const agingBands = [
    {
      label: "Current",
      key: "current",
      items: outstanding.filter((i) => i.daysOverdue <= 0),
      color: "text-[var(--ink)]",
      bg: "bg-[var(--panel)]",
      border: "border-[var(--line)]",
    },
    {
      label: "1–30 days",
      key: "1-30",
      items: outstanding.filter((i) => i.daysOverdue >= 1 && i.daysOverdue <= 30),
      color: "text-amber-700",
      bg: "bg-amber-500/8",
      border: "border-amber-400/30",
    },
    {
      label: "31–60 days",
      key: "31-60",
      items: outstanding.filter((i) => i.daysOverdue >= 31 && i.daysOverdue <= 60),
      color: "text-orange-700",
      bg: "bg-orange-500/8",
      border: "border-orange-400/30",
    },
    {
      label: "61+ days",
      key: "61+",
      items: outstanding.filter((i) => i.daysOverdue >= 61),
      color: "text-red-700",
      bg: "bg-red-500/10",
      border: "border-red-400/30",
    },
  ];

  const totalBilled = invoices.filter((i) => i.status !== "VOID").reduce((s, i) => s + i.totalAmount, 0);
  const totalCollected = invoices.filter((i) => i.status !== "VOID").reduce((s, i) => s + i.paidAmount, 0);
  const totalOutstanding = outstanding.reduce((s, i) => s + i.balance, 0);
  const collectionRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0;
  const byType = INVOICE_TYPES.map((t) => ({
    type: t,
    count: invoices.filter((i) => i.invoiceType === t).length,
  })).filter((x) => x.count > 0);
  const criticalOverdue = [...agingBands[3].items, ...agingBands[2].items]
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
    .slice(0, 5);

  const typeBadgeCls: Record<string, string> = {
    REPAIR:       "border border-blue-400/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
    SERVICE:      "border border-violet-400/30 bg-violet-500/10 text-violet-700 dark:text-violet-400",
    MERCHANDISE:  "border border-orange-400/30 bg-orange-500/10 text-orange-700 dark:text-orange-400",
    CONTRACT:     "border border-teal-400/30 bg-teal-500/10 text-teal-700 dark:text-teal-400",
    OTHER:        "border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",
  };

  return (
    <section className="space-y-4">
      {/* ══════════════════════════════════════════════════════════════════════
          MOBILE ONLY — premium dark header + context-aware action panel
          Hidden on desktop (lg:hidden). Desktop panel below takes over.
          ════════════════════════════════════════════════════════════════════ */}
      <div className="lg:hidden -mx-4">

        {/* ── Top bar: title + New Invoice ── */}
        <div className="flex items-center justify-between gap-3 px-4 pb-3">
          <div>
            <h2 className="text-[20px] font-black tracking-tight text-[var(--ink)]">Invoices</h2>
            <p className="text-[13px] text-[var(--ink-muted)] mt-0.5">
              {filtered.length} {statusFilter !== "all" ? statusFilter.toLowerCase() : agingFilter !== "all" ? "overdue" : "total"}
            </p>
          </div>
          <Link href="/documents/invoices?create=1#create-invoice"
            className="inline-flex items-center gap-1.5 rounded-2xl bg-[var(--accent)] px-4 py-2.5 text-[13px] font-black text-black shadow-[0_4px_16px_rgba(212,175,55,0.3)]">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Invoice
          </Link>
        </div>

        {/* ── Status chips — 4 chips fill the row evenly, no scroll needed ── */}
        <div className="grid grid-cols-4 gap-2 px-4 pb-3">
          {([
            { label: "All",     count: invoices.filter(i=>!i.isVoid).length, href: "/documents/invoices",            active: statusFilter === "all" && agingFilter === "all" },
            { label: "Unpaid",  count: invoices.filter(i=>!i.isPaid && !i.isVoid && i.status !== "DRAFT").length,     href: "/documents/invoices?status=ISSUED",  active: statusFilter === "ISSUED" },
            { label: "Paid",    count: invoices.filter(i=>i.isPaid).length,                                           href: "/documents/invoices?status=PAID",    active: statusFilter === "PAID"   },
            { label: "Overdue", count: invoices.filter(i=>!i.isPaid && !i.isVoid && i.daysOverdue > 0).length,        href: "/documents/invoices?aging=1-30",     active: agingFilter !== "all"     },
          ] as const).map((chip) => (
            <Link key={chip.href} href={chip.href}
              className={`rounded-full px-2 py-1.5 text-center text-[12px] font-bold transition ${
                chip.active
                  ? "bg-[var(--accent)] text-black"
                  : "border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]"
              }`}>
              {chip.label}{chip.count > 0 ? ` ${chip.count}` : ""}
            </Link>
          ))}
        </div>

        {/* ── Context-aware action panel — changes with filter ── */}
        {(() => {
          // OVERDUE filter: show overdue invoices with urgency
          if (agingFilter !== "all") {
            const overdueInvs = filtered.filter(i => !i.isPaid && !i.isVoid && i.daysOverdue > 0)
              .sort((a,b) => b.daysOverdue - a.daysOverdue).slice(0, 5);
            if (overdueInvs.length === 0) return null;
            const overdueTotal = overdueInvs.reduce((s,i) => s + i.balance, 0);
            return (
              <div className="mx-4 mb-3 overflow-hidden rounded-2xl border border-red-500/20 bg-red-500/[0.06]">
                <div className="flex items-center justify-between px-4 py-3 border-b border-red-500/15">
                  <div>
                    <p className="text-[12px] font-black uppercase tracking-[0.16em] text-red-500">⚠ Overdue</p>
                    <p className="text-[13px] text-[var(--ink-muted)]">{overdueInvs.length} invoice{overdueInvs.length !== 1 ? "s" : ""} past due</p>
                  </div>
                  <p className="text-[16px] font-black text-red-500">{formatMoneyCompact(overdueTotal, orgCurrency)}</p>
                </div>
                {overdueInvs.map(inv => {
                  const client = inv.job?.client?.fullName ?? inv.client?.fullName ?? "Client";
                  return (
                    <div key={inv.id} className="flex items-center gap-3 px-4 py-3 border-b border-red-500/10 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-[13px] font-semibold text-[var(--ink)]">{client}</p>
                        <p className="text-[12px] text-red-500 font-bold">{inv.daysOverdue}d overdue · {inv.invoiceNumber}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[13px] font-black text-red-500">{formatMoneyCompact(inv.balance, orgCurrency)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          }

          // UNPAID filter: show collect payment actions
          if (statusFilter === "ISSUED") {
            const unpaidInvs = filtered.filter(i => !i.isPaid && !i.isVoid).slice(0, 5);
            if (unpaidInvs.length === 0) return null;
            const unpaidTotal = unpaidInvs.reduce((s,i) => s + i.balance, 0);
            return (
              <div className="mx-4 mb-3 overflow-hidden rounded-2xl border border-amber-500/20 bg-amber-500/[0.06]">
                <div className="flex items-center justify-between px-4 py-3 border-b border-amber-500/15">
                  <div>
                    <p className="text-[12px] font-black uppercase tracking-[0.16em] text-amber-500">Collect Payment</p>
                    <p className="text-[13px] text-[var(--ink-muted)]">{unpaidInvs.length} awaiting payment</p>
                  </div>
                  <p className="text-[16px] font-black text-amber-500">{formatMoneyCompact(unpaidTotal, orgCurrency)}</p>
                </div>
                {unpaidInvs.map(inv => {
                  const client = inv.job?.client?.fullName ?? inv.client?.fullName ?? "Client";
                  return (
                    <div key={inv.id} className="flex items-center gap-3 px-4 py-3 border-b border-amber-500/10 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-[13px] font-semibold text-[var(--ink)]">{client}</p>
                        <p className="text-[12px] text-[var(--ink-muted)]">{inv.invoiceNumber} · {formatMoneyCompact(inv.balance, orgCurrency)}</p>
                      </div>
                      <span className="text-[13px] font-bold text-amber-500 shrink-0">Pending →</span>
                    </div>
                  );
                })}
              </div>
            );
          }

          // ALL / default filter: always show Collect Revenue panel (no longer hidden behind a tap)
          if (readyJobs.length > 0 && (statusFilter === "all" || !statusFilter)) {
            // Legacy tap-to-show button kept for backward compat but skipped — panel always shows now
            if (false && !collectMode) {
              return (
                <div className="mx-4 mb-3">
                  <Link
                    href="/documents/invoices?collect=1"
                    className="flex w-full items-center justify-between rounded-2xl border border-emerald-500/30 bg-emerald-500/8 px-4 py-3.5 transition active:opacity-80"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                      </span>
                      <div>
                        <p className="text-[13px] font-bold text-emerald-600">Collect Revenue</p>
                        <p className="text-[13px] text-[var(--ink-muted)]">{readyJobs.length} job{readyJobs.length !== 1 ? "s" : ""} ready to invoice</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[15px] font-black text-emerald-600">{formatMoneyCompact(readyJobsTotal, orgCurrency)}</p>
                      <p className="text-[12px] text-emerald-500/70">tap to view →</p>
                    </div>
                  </Link>
                </div>
              );
            }
            return (
              <div className="mx-4 mb-3 overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06]">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-emerald-500/15 px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-emerald-600">Collect Revenue</p>
                    <p className="text-[13px] text-[var(--ink-muted)]">{readyJobs.length} repair{readyJobs.length !== 1 ? "s" : ""} ready to invoice</p>
                  </div>
                  <p className="text-[16px] font-black text-emerald-600">{formatMoneyCompact(readyJobsTotal, orgCurrency)}</p>
                </div>
                {/* All ready jobs — tap Invoice → creates invoice record + opens inline payment */}
                {readyJobs.map(job => {
                  const ageDays = Math.floor((Date.now() - new Date(job.completedAt ?? job.receivedAt).getTime()) / 86_400_000);
                  return (
                    <div key={job.id} className="flex items-center gap-3 border-b border-emerald-500/10 px-4 py-3 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-[13px] font-semibold text-[var(--ink)]">{job.client?.fullName ?? "Client"}</p>
                        <p className="text-[12px] text-[var(--ink-muted)]">
                          {[job.brand, job.model].filter(Boolean).join(" ")} · {ageDays === 0 ? "today" : `${ageDays}d ago`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {job.clientBill ? <p className="text-[13px] font-black text-emerald-600">{formatMoneyCompact(job.clientBill, orgCurrency)}</p> : null}
                        {/* Server action: creates invoice record + redirects to inline payment form */}
                        <form action={createAndCollectAction}>
                          <input type="hidden" name="jobId" value={job.id} />
                          <button type="submit"
                            className="rounded-xl bg-emerald-600 px-3 py-1.5 text-[13px] font-bold text-white active:opacity-80">
                            Invoice →
                          </button>
                        </form>
                      </div>
                    </div>
                  );
                })}
                {/* Dismiss panel */}
                <div className="border-t border-emerald-500/10 px-4 py-2.5">
                  <Link href="/documents/invoices" className="text-[12px] font-medium text-[var(--ink-muted)]">
                    Done collecting →
                  </Link>
                </div>
              </div>
            );
          }

          return null;
        })()}

      </div>
      {/* ══════════════════════════════════════════════════════════════════════ */}

      {/* ── DESKTOP ONLY: full header panel ──────────────────────────────── */}
      <div className="panel-shadow hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] lg:block">
        {/* Desktop title + actions */}
        <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2.5">
          <div>
            <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Documents</p>
            <p className="text-[13px] font-bold text-[var(--ink)]">Invoices</p>
          </div>
          <div className="flex gap-2">
            {canManageInvoicePayments ? (
              <Link href={`/api/reports/export?type=invoices&month=${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`}
                className="btn-premium-secondary rounded-lg px-3 py-1.5 text-[12px] font-medium">
                ↓ Export CSV
              </Link>
            ) : null}
            <a href="#create-invoice" className="btn-premium rounded-lg px-3 py-1.5 text-[12px]">+ New Invoice</a>
          </div>
        </div>

        {/* Receivables summary (desktop only) */}
        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--line)] sm:grid-cols-4 sm:divide-y-0">
          <div className="px-4 py-3">
            <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Total Billed</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--ink)]">
              {formatMoneyCompact(totalBilled, "UGX")}
            </p>
            <p className="text-[12px] text-[var(--ink-muted)]">{invoices.filter((i) => i.status !== "VOID").length} invoices</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Collected</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-emerald-600">
              {formatMoneyCompact(totalCollected, "UGX")}
            </p>
            <p className="text-[12px] text-emerald-700">{collectionRate}% collection rate</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Outstanding</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-amber-600">
              {formatMoneyCompact(totalOutstanding, "UGX")}
            </p>
            <p className="text-[12px] text-[var(--ink-muted)]">{outstanding.length} invoices</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Ready to Invoice</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--accent)]">
              {readyJobs.length}
            </p>
            <p className="text-[12px] text-[var(--ink-muted)]">jobs awaiting invoice</p>
          </div>
        </div>

        {/* Collection progress bar */}
        {totalBilled > 0 && (
          <div className="border-t border-[var(--line)] px-4 py-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[12px] text-[var(--ink-muted)]">Collection progress</span>
              <span className="text-[12px] font-semibold text-[var(--ink)]">{collectionRate}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--panel-strong)]">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${collectionRate}%` }}
              />
            </div>
          </div>
        )}

        {/* By-type breakdown */}
        {byType.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-[var(--line)] px-4 py-2">
            {byType.map((b) => (
              <Link
                key={b.type}
                href={`/documents/invoices?type=${b.type}`}
                className={`rounded-full border px-2.5 py-0.5 text-[13px] font-semibold transition ${
                  typeFilter === b.type
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--accent)]/40"
                }`}
              >
                {b.type.charAt(0) + b.type.slice(1).toLowerCase()} · {b.count}
              </Link>
            ))}
            {typeFilter !== "all" && (
              <Link
                href="/documents/invoices"
                className="rounded-full border border-[var(--line)] px-2.5 py-0.5 text-[13px] text-[var(--ink-muted)]"
              >
                Clear
              </Link>
            )}
          </div>
        )}
      </div>

      {/* ── AGING ANALYSIS (desktop only — mobile uses status chips above) ── */}
      <div className="hidden lg:grid grid-cols-2 gap-3 sm:grid-cols-4">
        {agingBands.map((band) => {
          const bandTotal = band.items.reduce((s, i) => s + i.balance, 0);
          const isActive = agingFilter === band.key;
          return (
            <Link
              key={band.key}
              href={`/documents/invoices?aging=${isActive ? "all" : band.key}`}
              className={`panel-shadow rounded-xl border p-4 transition hover:opacity-90 ${band.border} ${band.bg} ${isActive ? "ring-2 ring-[var(--accent)]" : ""}`}
            >
              <p className={`text-[12px] font-bold uppercase tracking-wide ${band.color}`}>
                {band.label}
              </p>
              <p className={`mt-1.5 text-2xl font-bold tabular-nums ${band.color}`}>
                {formatMoneyCompact(bandTotal, "UGX")}
              </p>
              <p className={`mt-1 text-[13px] ${band.color} opacity-80`}>
                {band.items.length} invoice{band.items.length !== 1 ? "s" : ""}
              </p>
            </Link>
          );
        })}
      </div>

      {/* ── CRITICAL OVERDUE ALERTS (desktop only — mobile sees Collect Revenue) ── */}
      {criticalOverdue.length > 0 && (
        <div className="hidden lg:block rounded-xl border border-red-300/40 bg-red-500/5 p-4">
          <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-red-700">
            Overdue — Needs Attention
          </p>
          <div className="space-y-2">
            {criticalOverdue.map((inv) => {
              const clientName = inv.job?.client.fullName ?? inv.client?.fullName ?? "—";
              return (
                <div
                  key={inv.id}
                  className="flex items-center justify-between rounded-lg bg-[var(--panel)] px-3 py-2"
                >
                  <div>
                    <span className="font-mono text-xs font-bold text-[var(--ink)]">
                      {inv.invoiceNumber}
                    </span>
                    <span className="mx-2 text-[var(--ink-muted)]">·</span>
                    <span className="text-sm text-[var(--ink)]">{clientName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold tabular-nums text-red-600">
                      {formatMoneyCompact(inv.balance, "UGX")}
                    </span>
                    <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[12px] font-bold text-red-700">
                      {inv.daysOverdue}d overdue
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {dbNeedsFix && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <p className="font-semibold text-amber-600">Invoice tables need a DB fix.</p>
          <a
            className="mt-2 inline-flex rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs font-semibold text-amber-700"
            href="/api/admin/db-fix"
            target="_blank"
            rel="noreferrer"
          >
            Run DB Fix
          </a>
        </div>
      )}

      {/* ── FILTERS (desktop only — mobile uses chips in native header) ── */}
      <form method="GET" className="hidden lg:flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search invoice, job, client…"
          className="h-8 min-w-[160px] flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
        <select
          name="type"
          defaultValue={typeFilter}
          className="h-8 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2 text-sm"
        >
          <option value="all">All Types</option>
          {INVOICE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.charAt(0) + t.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={statusFilter}
          className="h-8 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2 text-sm"
        >
          <option value="all">All Statuses</option>
          {INVOICE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-8 rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-white"
        >
          Filter
        </button>
      </form>

      {/* ── STANDALONE INVOICE CREATION ─────────────────────────────────────── */}
      {/* Desktop: always available. Mobile: only when ?create=1 (from "New Invoice" button) */}
      {canCreateInvoice && clients.length > 0 && (
        <details id="create-invoice" open={createMode}
          className={`group rounded-xl border border-[var(--line)] bg-[var(--panel)] ${createMode ? "" : "hidden lg:block"}`}>
          <summary className="cursor-pointer select-none px-4 py-2.5 text-[12px] font-semibold text-[var(--ink)] group-open:border-b group-open:border-[var(--line)]">
            + Create Invoice (Service / Contract / Merchandise)
          </summary>
          <form
            action={createStandaloneInvoiceAction}
            className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <div className="space-y-1 lg:col-span-2">
              <label className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Client</label>
              <select
                name="clientId"
                required
                className="h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm"
              >
                <option value="">Select client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Invoice Type</label>
              <select
                name="invoiceType"
                defaultValue="SERVICE"
                className="h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm"
              >
                {INVOICE_TYPES.filter((t) => t !== "REPAIR").map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0) + t.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Subject / Description</label>
              <input
                name="subject"
                required
                placeholder="e.g. IT Support — May 2026"
                className="h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Amount</label>
              <div className="flex gap-2">
                <input
                  name="totalAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  required
                  className="h-9 flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
                <input type="hidden" name="currency" value="UGX" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Due Date</label>
              <input
                name="dueDate"
                type="date"
                className="h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Notes</label>
              <input
                name="notes"
                placeholder="Optional notes"
                className="h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>
            <div className="flex items-end sm:col-span-2 lg:col-span-3">
              <button
                type="submit"
                className="btn-premium h-9 rounded-lg px-5 text-sm font-semibold"
              >
                Create Invoice
              </button>
            </div>
          </form>
        </details>
      )}

      {/* ── COLLECT REVENUE (desktop only — mobile has dynamic version in header) ── */}
      {readyJobs.length > 0 && (
        <div className="hidden lg:block overflow-hidden rounded-xl border border-emerald-500/20 bg-[var(--panel)]">

          {/* Header row */}
          <div className="flex items-center justify-between gap-3 border-b border-emerald-500/15 bg-emerald-500/8 px-4 py-3">
            <div>
              <p className="text-[12px] font-black uppercase tracking-[0.16em] text-emerald-600">
                Collect Revenue
              </p>
              <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">
                {readyJobs.length} repair{readyJobs.length !== 1 ? "s" : ""} completed but not yet invoiced
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[18px] font-black leading-none text-emerald-600">
                {formatMoneyCompact(readyJobsTotal, orgCurrency)}
              </p>
              <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">potential</p>
            </div>
          </div>

          {/* Job rows */}
          <div className="divide-y divide-[var(--line)]/60">
            {readyJobs.map((job) => {
              const device = [job.brand, job.model].filter(Boolean).join(" ") || "Device";
              const doneAt  = job.completedAt ?? job.receivedAt;
              const ageDays = Math.floor((Date.now() - new Date(doneAt).getTime()) / 86_400_000);
              const isStale = ageDays >= 3;
              return (
                <div key={job.id} className="flex items-center gap-3 px-4 py-3">
                  {/* Client + device */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-[var(--ink)]">
                      {job.client?.fullName ?? "Client"}
                    </p>
                    <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">
                      {device} · {job.jobNumber}
                    </p>
                  </div>

                  {/* Age indicator */}
                  <div className="shrink-0 text-right">
                    <span className={`text-[13px] font-semibold ${isStale ? "text-amber-500" : "text-[var(--ink-muted)]"}`}>
                      {ageDays === 0 ? "Today" : `${ageDays}d ago`}
                    </span>
                    {job.clientBill ? (
                      <p className="mt-0.5 text-[12px] font-black text-emerald-600">
                        {formatMoneyCompact(job.clientBill, orgCurrency)}
                      </p>
                    ) : null}
                  </div>

                  {/* Invoice action */}
                  <a
                    href={`/api/jobs/${job.id}/invoice`}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-[13px] font-bold text-emerald-700 transition hover:bg-emerald-500/20"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    Invoice
                  </a>
                </div>
              );
            })}
          </div>

          {readyJobs.length >= 20 && (
            <div className="border-t border-[var(--line)]/60 px-4 py-2.5 text-center">
              <p className="text-[13px] text-[var(--ink-muted)]">Showing 20 most urgent — visit <Link href="/jobs" className="text-[var(--accent)] hover:underline">/jobs</Link> for all</p>
            </div>
          )}
        </div>
      )}

      {/* ── MOBILE INVOICE LIST (lg:hidden) ──────────────────────────────── */}
      <div className="lg:hidden">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-10 text-center text-sm text-[var(--ink-muted)]">
            No invoices found
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[var(--line)] divide-y divide-[var(--line)]">
            {filtered.map((inv) => {
              const clientName = inv.job?.client.fullName ?? inv.client?.fullName ?? inv.subject ?? "No client";
              const isPaid = inv.isPaid;
              const isOverdue = !isPaid && inv.daysOverdue > 0 && inv.status !== "VOID";
              const isDraft = inv.status === "DRAFT";
              const isVoid = inv.isVoid;
              const isRepair = inv.invoiceType === "REPAIR";
              const invoiceCurrency = inv.currency ?? orgCurrency;
              const initial = (clientName.replace(/^No /, "")[0] ?? inv.invoiceNumber[0] ?? "?").toUpperCase();
              const hasActions = (isRepair && !!inv.job) || inv.payments[0]?.id || (inv.balance > 0 && !isVoid);

              const statusLabel = isPaid ? "Paid"
                : isOverdue ? `${inv.daysOverdue}d overdue`
                : isDraft ? "Draft"
                : isVoid ? "Void"
                : "Outstanding";

              const avatarCls = isPaid
                ? "bg-emerald-500/15 text-emerald-600"
                : isOverdue
                  ? "bg-red-500/15 text-red-600"
                  : isDraft || isVoid
                    ? "bg-[var(--panel-strong)] text-[var(--ink-muted)]"
                    : "bg-amber-500/15 text-amber-700";

              const amountCls = isPaid
                ? "text-emerald-600"
                : isOverdue
                  ? "text-red-500"
                  : "text-[var(--ink)]";

              const statusCls = isPaid
                ? "bg-emerald-500/15 text-emerald-700"
                : isOverdue
                  ? "bg-red-500/15 text-red-700"
                  : isDraft
                    ? "bg-[var(--panel-strong)] text-[var(--ink-muted)]"
                    : isVoid
                      ? "bg-[var(--panel-strong)] text-[var(--ink-muted)]"
                      : "bg-amber-500/15 text-amber-700";

              const cardHref = isRepair && inv.job ? `/jobs/${inv.job.id}` : "#";

              return (
                <div key={inv.id} className="bg-[var(--panel)]">
                  {/* ── Main 2-line row ── */}
                  <a href={cardHref} className="flex items-center gap-3 px-4 py-3 active:bg-[var(--panel-strong)]/50">
                    {/* Status-colored avatar */}
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-[15px] font-black ${avatarCls}`}>
                      {initial}
                    </div>
                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-[14px] font-bold text-[var(--ink)]">{clientName}</p>
                        <p className={`shrink-0 text-[14px] font-black tabular-nums ${amountCls}`}>
                          {formatMoneyCompact(inv.totalAmount, invoiceCurrency)}
                        </p>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p className="truncate text-[13px] text-[var(--ink-muted)]">
                          {inv.invoiceNumber} · {inv.issuedAt.toLocaleDateString("en-UG", { day: "numeric", month: "short" })}
                        </p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] font-bold ${statusCls}`}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                  </a>

                  {/* ── Action strip ── */}
                  {hasActions ? (
                    <div className="flex items-center justify-end border-t border-[var(--line)]/60 px-4 pb-2.5 pt-2">
                      <RowActionsMenu label={`Invoice actions for ${inv.invoiceNumber}`}>
                        <div className="py-1 text-left">
                          {isRepair && inv.job ? (
                            <MenuActionLink href={`/jobs/${inv.job.id}`} icon="job">
                              Open Job
                            </MenuActionLink>
                          ) : null}
                          {isRepair && inv.job && canGenerateInvoiceForStatus(inv.job.status) ? (
                            <MenuActionLink href={`/api/jobs/${inv.job.id}/invoice`} external icon="invoice" tone="accent">
                              Download Invoice PDF
                            </MenuActionLink>
                          ) : null}
                          {isRepair && inv.job && canGenerateInvoiceForStatus(inv.job.status) ? (
                            <form action={sendInvoiceWhatsAppFromRowAction}>
                              <input type="hidden" name="jobId" value={inv.job.id} />
                              <MenuActionButton icon="whatsapp" tone="success">
                                Share Invoice on WhatsApp
                              </MenuActionButton>
                            </form>
                          ) : null}
                          {inv.payments[0]?.id ? (
                            <MenuActionLink href={`/api/payments/${inv.payments[0].id}/receipt`} external icon="receipt" tone="success">
                              Download Receipt PDF
                            </MenuActionLink>
                          ) : null}
                          {inv.deliveryNotes[0]?.id ? (
                            <MenuActionLink href={`/api/delivery-notes/${inv.deliveryNotes[0].id}`} external icon="delivery" tone="accent">
                              Download Delivery Note
                            </MenuActionLink>
                          ) : null}
                          {inv.balance > 0 && !isVoid ? (
                            payInvoiceId === inv.id ? (
                              <MenuActionLink href="/documents/invoices" icon="close">
                                Cancel Collection
                              </MenuActionLink>
                            ) : (
                              <MenuActionLink href={`/documents/invoices?pay=${inv.id}`} icon="payment" tone="success">
                                Collect Payment
                              </MenuActionLink>
                            )
                          ) : null}
                        </div>
                      </RowActionsMenu>
                    </div>
                  ) : null}

                  {/* Inline payment form — expands in-place when ?pay=this_id */}
                  {payInvoiceId === inv.id && inv.balance > 0 && !isVoid ? (
                    <div className="border-t border-[var(--accent)]/20 bg-[var(--accent)]/5 p-4 space-y-3">
                      <p className="text-sm font-semibold text-[var(--ink)]">
                        Collect payment
                        <span className="ml-2 text-xs font-normal text-[var(--ink-muted)]">Balance: {formatMoneyCompact(inv.balance, invoiceCurrency)}</span>
                      </p>
                      <form action={addPaymentAction} className="space-y-3">
                        <input type="hidden" name="invoiceId" value={inv.id} />
                        <input type="hidden" name="currency" value="UGX" />
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-[var(--ink-muted)]">Amount (UGX)</label>
                          <input
                            name="amount"
                            inputMode="decimal"
                            autoFocus
                            placeholder={`e.g. ${inv.balance.toLocaleString()}`}
                            className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-base outline-none focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/15"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-[var(--ink-muted)]">Payment method</label>
                          <select name="method" defaultValue="CASH"
                            className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-base outline-none">
                            {PAYMENT_METHODS.map((m) => (
                              <option key={m} value={m}>{m.replaceAll("_", " ")}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-[var(--ink-muted)]">Reference <span className="text-[var(--ink-muted)]/60">(optional)</span></label>
                          <input name="reference" placeholder="e.g. MTN MoMo ref"
                            className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-base outline-none focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/15"
                          />
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button type="submit"
                            className="btn-premium flex-1 rounded-xl py-3 text-base font-bold">
                            Record Payment
                          </button>
                          <a href="/documents/invoices"
                            className="flex items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 text-sm font-medium text-[var(--ink-muted)]">
                            Cancel
                          </a>
                        </div>
                      </form>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── INVOICE TABLE (desktop only) ──────────────────────────────────── */}
      <div className="hidden lg:block doc-list overflow-x-auto rounded-xl border border-[var(--line)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel-strong)] text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            <tr>
              <th className="px-3 py-2.5">Invoice</th>
              <th className="hidden px-3 py-2.5 md:table-cell">Client · Source</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Total</th>
              <th className="hidden px-3 py-2.5 lg:table-cell">Balance</th>
              <th className="hidden px-3 py-2.5 lg:table-cell">Overdue</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((inv) => {
              const invoiceCurrency = normalizeCurrency(inv.currency, "UGX");
              const isOverdue = !inv.isPaid && !inv.isVoid && inv.daysOverdue > 0;
              const statusCls = inv.isPaid
                ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
                : inv.status === "VOID"
                  ? "bg-red-500/10 text-red-600 border-red-500/20"
                  : inv.status === "DRAFT"
                    ? "bg-[var(--panel-strong)] text-[var(--ink-muted)] border-[var(--line)]"
                    : isOverdue
                      ? "bg-red-400/15 text-red-700 border-red-400/30"
                      : "bg-amber-400/15 text-amber-700 border-amber-400/30";
              const statusLabel = inv.isPaid
                ? "Paid"
                : inv.status === "VOID"
                  ? "Void"
                  : inv.status === "DRAFT"
                    ? "Draft"
                    : isOverdue
                      ? "Overdue"
                      : "Outstanding";
              const clientName = inv.job?.client.fullName ?? inv.client?.fullName ?? "—";
              const isRepair = inv.invoiceType === "REPAIR";

              return (
                <tr
                  key={inv.id}
                  className="border-t border-[var(--line)] align-middle hover:bg-[var(--panel-strong)]/40"
                >
                  <td className="px-3 py-2.5">
                    <p className="mono text-sm font-bold text-[var(--ink)]">{inv.invoiceNumber}</p>
                    <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">
                      {inv.issuedAt.toLocaleDateString()}
                      {inv.dueDate ? ` · due ${inv.dueDate.toLocaleDateString()}` : ""}
                    </p>
                    <span
                      className={`mt-0.5 inline-flex rounded px-1.5 py-0.5 text-[12px] font-semibold ${typeBadgeCls[inv.invoiceType] ?? typeBadgeCls.OTHER}`}
                    >
                      {inv.invoiceType.charAt(0) + inv.invoiceType.slice(1).toLowerCase()}
                    </span>
                    {/* Client name visible on mobile (only when not empty) */}
                    {clientName && clientName !== "—" && (
                      <p className="mt-1 text-[12px] font-medium text-[var(--ink)] md:hidden">{clientName}</p>
                    )}
                  </td>
                  <td className="doc-list-hide hidden px-3 py-2.5 md:table-cell">
                    <p className="font-medium text-[var(--ink)]">{clientName}</p>
                    {isRepair && inv.job ? (
                      <Link
                        className="mono text-[13px] text-[var(--ink-muted)] hover:text-[var(--accent)]"
                        href={`/jobs/${inv.job.id}`}
                      >
                        {inv.job.jobNumber}
                      </Link>
                    ) : inv.subject ? (
                      <p className="text-[13px] text-[var(--ink-muted)]">{inv.subject}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full border px-2.5 py-0.5 text-[13px] font-semibold ${statusCls}`}>
                      {statusLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="font-bold text-[var(--ink)]">
                      {formatMoney(inv.totalAmount, invoiceCurrency)}
                    </p>
                    {inv.paidAmount > 0 && !inv.isPaid ? (
                      <p className="mt-0.5 text-[13px] text-emerald-700">
                        {formatMoney(inv.paidAmount, invoiceCurrency)} paid
                      </p>
                    ) : null}
                  </td>
                  <td className="doc-list-hide hidden px-3 py-2.5 lg:table-cell">
                    {inv.isPaid ? (
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[13px] font-semibold text-emerald-700">
                        Cleared
                      </span>
                    ) : inv.status !== "VOID" ? (
                      <span className={`font-semibold ${isOverdue ? "text-red-600" : "text-amber-700"}`}>
                        {formatMoney(inv.balance, invoiceCurrency)}
                      </span>
                    ) : (
                      <span className="text-[var(--ink-muted)]">—</span>
                    )}
                  </td>
                  <td className="doc-list-hide hidden px-3 py-2.5 lg:table-cell">
                    {isOverdue ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[12px] font-bold ${
                          inv.daysOverdue >= 61
                            ? "bg-red-500/15 text-red-700"
                            : inv.daysOverdue >= 31
                              ? "bg-orange-500/15 text-orange-700"
                              : "bg-amber-500/15 text-amber-700"
                        }`}
                      >
                        {inv.daysOverdue}d
                      </span>
                    ) : inv.isPaid ? (
                      <span className="text-[13px] text-[var(--ink-muted)]">—</span>
                    ) : (
                      <span className="text-[13px] text-emerald-600">On time</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      {(isRepair && inv.job) || inv.payments[0]?.id || inv.deliveryNotes[0]?.id || canManageInvoicePayments || "ADMIN" === user.role ? (
                        <RowActionsMenu label={`Invoice actions for ${inv.invoiceNumber}`}>
                          <div className="py-1 text-left">
                            {isRepair && inv.job ? (
                              <MenuActionLink href={`/jobs/${inv.job.id}`} icon="job">
                                Open Job
                              </MenuActionLink>
                            ) : null}
                            {isRepair && inv.job && canGenerateInvoiceForStatus(inv.job.status) ? (
                              <MenuActionLink href={`/api/jobs/${inv.job.id}/invoice`} external icon="invoice" tone="accent">
                                Download Invoice PDF
                              </MenuActionLink>
                            ) : null}
                            {isRepair && inv.job && canGenerateInvoiceForStatus(inv.job.status) ? (
                              <form action={sendInvoiceWhatsAppFromRowAction}>
                                <input type="hidden" name="jobId" value={inv.job.id} />
                                <MenuActionButton icon="whatsapp" tone="success">
                                  Share Invoice on WhatsApp
                                </MenuActionButton>
                              </form>
                            ) : null}
                            {inv.payments[0]?.id ? (
                              <MenuActionLink href={`/api/payments/${inv.payments[0].id}/receipt`} external icon="receipt" tone="success">
                                Download Receipt PDF
                              </MenuActionLink>
                            ) : null}
                            {inv.deliveryNotes[0]?.id ? (
                              <MenuActionLink href={`/api/delivery-notes/${inv.deliveryNotes[0].id}`} external icon="delivery" tone="accent">
                                Download Delivery Note
                              </MenuActionLink>
                            ) : null}
                          </div>
                          {canManageInvoicePayments && inv.balance > 0 && inv.status !== "VOID" ? (
                          <>
                            <MenuSection label="Generate Receipt" />
                            <form action={addPaymentAction} className="space-y-2 p-3">
                              <input type="hidden" name="invoiceId" value={inv.id} />
                              <div className="flex gap-2">
                                <input
                                  name="amount"
                                  inputMode="decimal"
                                  placeholder="Amount"
                                  className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50"
                                />
                                <input type="hidden" name="currency" value="UGX" />
                              </div>
                              <div className="flex gap-2">
                                <select
                                  name="method"
                                  defaultValue="CASH"
                                  className="flex-1 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-xs outline-none"
                                >
                                  {PAYMENT_METHODS.map((m) => (
                                    <option key={m} value={m}>{m.replaceAll("_", " ")}</option>
                                  ))}
                                </select>
                                <input
                                  name="reference"
                                  placeholder="Ref"
                                  className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none"
                                />
                              </div>
                              <MenuActionButton icon="receipt" tone="success" className="bg-emerald-500/8">
                                Generate Receipt
                              </MenuActionButton>
                            </form>
                          </>
                        ) : null}
                        {canManageInvoicePayments && inv.balance <= 0 && inv.status !== "VOID" ? (
                          <>
                            <MenuSection label="Generate Delivery Note" />
                            <form action={createDeliveryNoteAction} className="space-y-2 p-3">
                              <input type="hidden" name="invoiceId" value={inv.id} />
                              <input
                                name="deliveredByName"
                                placeholder="Delivered by"
                                className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none"
                              />
                              <input
                                name="receivedByName"
                                placeholder="Received by"
                                className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none"
                              />
                              <select
                                name="deliveryMethod"
                                defaultValue=""
                                className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none"
                              >
                                <option value="">No method</option>
                                {DELIVERY_METHODS.map((m) => (
                                  <option key={m} value={m}>{m.replaceAll("_", " ")}</option>
                                ))}
                              </select>
                              <MenuActionButton icon="delivery" tone="accent" className="bg-[var(--accent)]/8">
                                Generate Delivery Note
                              </MenuActionButton>
                            </form>
                          </>
                        ) : null}
                        {canManageInvoicePayments ? (
                          <>
                            <MenuSection label="Edit" />
                            <form action={updateInvoiceAction} className="space-y-2 p-3">
                              <input type="hidden" name="invoiceId" value={inv.id} />
                              {!isRepair && (
                                <input
                                  name="subject"
                                  defaultValue={inv.subject ?? ""}
                                  placeholder="Subject"
                                  className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none"
                                />
                              )}
                              <select
                                name="status"
                                defaultValue={inv.status}
                                className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none"
                              >
                                {INVOICE_STATUSES.map((s) => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                              <textarea
                                name="notes"
                                defaultValue={inv.notes ?? ""}
                                placeholder="Notes"
                                className="min-h-12 w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none"
                              />
                              <MenuActionButton icon="save" tone="accent" className="bg-[var(--accent)]/8">
                                Save
                              </MenuActionButton>
                            </form>
                          </>
                        ) : null}
                        {"ADMIN" === user.role && inv.payments.length === 0 && inv.deliveryNotes.length === 0 ? (
                          <MenuDestructiveRow>
                            <form action={deleteInvoiceAction}>
                              <input type="hidden" name="invoiceId" value={inv.id} />
                              <ConfirmSubmitButton
                                message="Delete this invoice? This cannot be undone."
                                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-600 transition hover:bg-red-500/10 hover:text-red-700"
                              >
                                Delete Invoice
                              </ConfirmSubmitButton>
                            </form>
                          </MenuDestructiveRow>
                        ) : null}
                        </RowActionsMenu>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr className="border-t border-[var(--line)]">
                <td className="px-4 py-10 text-center text-sm text-[var(--ink-muted)]" colSpan={7}>
                  No invoices found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {filtered.length > 0 && (
          <div className="flex items-center justify-between border-t border-[var(--line)] px-4 py-2.5">
            <p className="text-[13px] text-[var(--ink-muted)]">
              Showing {filtered.length} of {invoices.length} invoices
            </p>
            <p className="text-[12px] font-bold text-[var(--ink)]">
              Balance due: {formatMoneyCompact(filtered.filter((i) => !i.isPaid && !i.isVoid).reduce((s, i) => s + i.balance, 0), "UGX")}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
