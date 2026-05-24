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
  SUPPORTED_CURRENCIES,
} from "@/lib/currency";
import { canGenerateInvoiceForStatus } from "@/lib/documents";
import { JobStatus } from "@/lib/job-status";
import { can } from "@/lib/permissions";
import { orgDb, prisma } from "@/lib/prisma";
import { ConfirmSubmitButton } from "@/components/shared/ConfirmSubmitButton";
import { RowActionsMenu, MenuSection, MenuDestructiveRow } from "@/components/shared/RowActionsMenu";

const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "OTHER"];
const INVOICE_STATUSES: InvoiceStatus[] = ["DRAFT", "ISSUED", "PAID", "VOID"];
const INVOICE_TYPES: InvoiceType[] = ["REPAIR", "SERVICE", "MERCHANDISE", "CONTRACT", "OTHER"];
const DELIVERY_METHODS: DeliveryMethod[] = ["PICKUP", "DELIVERY", "COURIER"];

export const dynamic = "force-dynamic";

// ── Aging buckets ────────────────────────────────────────────────────────────
const AGING_BUCKETS = [
  { label: "Current",       min: -Infinity, max: 0,   color: "text-[var(--ink)]",   bg: "bg-[var(--panel)]",       border: "border-[var(--line)]" },
  { label: "1–30 days",     min: 1,         max: 30,  color: "text-amber-700",      bg: "bg-amber-500/8",          border: "border-amber-400/30" },
  { label: "31–60 days",    min: 31,        max: 60,  color: "text-orange-700",     bg: "bg-orange-500/8",         border: "border-orange-400/30" },
  { label: "61+ days",      min: 61,        max: Infinity, color: "text-red-700",   bg: "bg-red-500/8",            border: "border-red-400/30" },
] as const;

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string; q?: string; aging?: string }>;
}) {
  const { user } = await getCurrentUserRole();
  const db = orgDb(user.orgId);
  if (!("ADMIN" === user.role || "OPS" === user.role || can.approveInvoices(user))) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const typeFilter = params.type ?? "all";
  const statusFilter = params.status ?? "all";
  const agingFilter = params.aging ?? "all";
  const q = (params.q ?? "").trim();

  let dbNeedsFix = false;

  // ── Server actions ───────────────────────────────────────────────────────────

  async function createStandaloneInvoiceAction(formData: FormData) {
    "use server";
    const { user: _u } = await getCurrentUserRole();
    const db = orgDb(user.orgId);
    if (!["ADMIN", "OPS"].includes(user.role)) return;

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

    const year = new Date().getFullYear();
    const count = await db.invoice.count({ where: {} }).catch(() => 0);
    const invoiceNumber = `INV-${year}-${String(count + 1).padStart(4, "0")}`;

    await db.invoice.create({
      data: {
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
    revalidatePath("/documents/invoices");
  }

  async function addPaymentAction(formData: FormData) {
    "use server";
    const { user: _u } = await getCurrentUserRole();
    const db = orgDb(user.orgId);
    if (!("ADMIN" === user.role || "OPS" === user.role || can.approveInvoices(user))) return;

    const invoiceId = String(formData.get("invoiceId") ?? "").trim();
    const rawAmount = String(formData.get("amount") ?? "").trim();
    const method = String(formData.get("method") ?? "CASH").trim();
    const reference = String(formData.get("reference") ?? "").trim();
    const currency = normalizeCurrency(formData.get("currency"), "UGX");
    const exchangeRateToBaseRaw = String(formData.get("exchangeRateToBase") ?? "").trim();
    if (!invoiceId) return;

    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (!isSupportedCurrency(currency)) return;

    const exchangeRateToBase =
      currency === null
        ? null
        : exchangeRateToBaseRaw
          ? Number(exchangeRateToBaseRaw)
          : null;
    if (currency !== null) {
      if (!exchangeRateToBase || !Number.isFinite(exchangeRateToBase) || exchangeRateToBase <= 0)
        return;
    }

    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId },
      select: { id: true, totalAmount: true, paidAmount: true, jobId: true, status: true },
    });
    if (!invoice || invoice.status === "VOID") return;

    const existingPaid = invoice.paidAmount ?? 0;
    if (existingPaid + amount > invoice.totalAmount) return;

    const safeMethod: PaymentMethod = PAYMENT_METHODS.includes(method as PaymentMethod)
      ? (method as PaymentMethod)
      : ("OTHER" as PaymentMethod);

    await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          currency,
          exchangeRateToBase,
          amount,
          method: safeMethod,
          reference: reference || null,
          createdById: user.id,
        },
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
  }

  async function updateInvoiceAction(formData: FormData) {
    "use server";
    const { user: _u } = await getCurrentUserRole();
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
    const { user: _u } = await getCurrentUserRole();
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

  async function createDeliveryNoteAction(formData: FormData) {
    "use server";
    const { user: _u } = await getCurrentUserRole();
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
      const year = new Date().getFullYear();
      const count = await tx.deliveryNote.count({ where: {} }).catch(() => 0);
      const deliveryNoteNumber = `DN-${year}-${String(count + 1).padStart(4, "0")}`;
      const desc = invoice.job
        ? `Repair handover for ${invoice.job.jobNumber} (${invoice.job.brand} ${invoice.job.model})`
        : (invoice.subject ?? invoice.invoiceNumber);
      await tx.deliveryNote.create({
        data: {
          invoiceId: invoice.id,
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
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

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
      where: { status: { in: ["READY_FOR_PICKUP", "COMPLETED", "CLOSED"] }, invoiceIssuedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { id: true, jobNumber: true },
    })
    .catch(() => []);

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
    REPAIR: "bg-blue-50 text-blue-700",
    SERVICE: "bg-violet-50 text-violet-700",
    MERCHANDISE: "bg-orange-50 text-orange-700",
    CONTRACT: "bg-teal-50 text-teal-700",
    OTHER: "bg-slate-100 text-slate-600",
  };

  return (
    <section className="space-y-4">
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2.5">
          <p className="text-[13px] font-bold text-[var(--ink)]">Invoices</p>
          <div className="flex gap-2">
            <Link
              href="/jobs/new"
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-[12px] font-medium text-[var(--ink-muted)] hover:border-[var(--accent)]/40"
            >
              New Job
            </Link>
            <Link
              href={`/api/reports/export?type=invoices&month=${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`}
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-[12px] font-medium text-[var(--ink-muted)] hover:border-[var(--accent)]/40"
            >
              ↓ Export CSV
            </Link>
          </div>
        </div>

        {/* Receivables summary */}
        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--line)] sm:grid-cols-4 sm:divide-y-0">
          <div className="px-4 py-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Total Billed</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--ink)]">
              {formatMoneyCompact(totalBilled, "UGX")}
            </p>
            <p className="text-[10px] text-[var(--ink-muted)]">{invoices.filter((i) => i.status !== "VOID").length} invoices</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Collected</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-emerald-600">
              {formatMoneyCompact(totalCollected, "UGX")}
            </p>
            <p className="text-[10px] text-emerald-700">{collectionRate}% collection rate</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Outstanding</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-amber-600">
              {formatMoneyCompact(totalOutstanding, "UGX")}
            </p>
            <p className="text-[10px] text-[var(--ink-muted)]">{outstanding.length} invoices</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Ready to Invoice</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--accent)]">
              {readyJobs.length}
            </p>
            <p className="text-[10px] text-[var(--ink-muted)]">jobs awaiting invoice</p>
          </div>
        </div>

        {/* Collection progress bar */}
        {totalBilled > 0 && (
          <div className="border-t border-[var(--line)] px-4 py-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-[var(--ink-muted)]">Collection progress</span>
              <span className="text-[10px] font-semibold text-[var(--ink)]">{collectionRate}%</span>
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
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition ${
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
                className="rounded-full border border-[var(--line)] px-2.5 py-0.5 text-[11px] text-[var(--ink-muted)]"
              >
                Clear
              </Link>
            )}
          </div>
        )}
      </div>

      {/* ── AGING ANALYSIS ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {agingBands.map((band) => {
          const bandTotal = band.items.reduce((s, i) => s + i.balance, 0);
          const isActive = agingFilter === band.key;
          return (
            <Link
              key={band.key}
              href={`/documents/invoices?aging=${isActive ? "all" : band.key}`}
              className={`panel-shadow rounded-xl border p-4 transition hover:opacity-90 ${band.border} ${band.bg} ${isActive ? "ring-2 ring-[var(--accent)]" : ""}`}
            >
              <p className={`text-[10px] font-bold uppercase tracking-wide ${band.color}`}>
                {band.label}
              </p>
              <p className={`mt-1.5 text-2xl font-bold tabular-nums ${band.color}`}>
                {formatMoneyCompact(bandTotal, "UGX")}
              </p>
              <p className={`mt-1 text-[11px] ${band.color} opacity-80`}>
                {band.items.length} invoice{band.items.length !== 1 ? "s" : ""}
              </p>
            </Link>
          );
        })}
      </div>

      {/* ── CRITICAL OVERDUE ALERTS ────────────────────────────────────────── */}
      {criticalOverdue.length > 0 && (
        <div className="rounded-xl border border-red-300/40 bg-red-500/5 p-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-red-700">
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
                    <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-700">
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

      {/* ── FILTERS ────────────────────────────────────────────────────────── */}
      <form method="GET" className="flex flex-wrap gap-2">
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
      {["ADMIN", "OPS"].includes(user.role) && clients.length > 0 && (
        <details className="group rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <summary className="cursor-pointer select-none px-4 py-2.5 text-[12px] font-semibold text-[var(--ink)] group-open:border-b group-open:border-[var(--line)]">
            + New Standalone Invoice (Service / Contract / Merchandise)
          </summary>
          <form
            action={createStandaloneInvoiceAction}
            className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <div className="space-y-1 lg:col-span-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Client</label>
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
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Invoice Type</label>
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
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Subject / Description</label>
              <input
                name="subject"
                required
                placeholder="e.g. IT Support — May 2026"
                className="h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Amount</label>
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
                <select
                  name="currency"
                  defaultValue="UGX"
                  className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2 text-sm"
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Due Date</label>
              <input
                name="dueDate"
                type="date"
                className="h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Notes</label>
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

      {/* ── REPAIR JOBS READY TO INVOICE ──────────────────────────────────── */}
      {readyJobs.length > 0 && (
        <div className="rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">
            Repair Jobs Ready to Invoice
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {readyJobs.slice(0, 12).map((job) => (
              <a
                key={job.id}
                href={`/api/jobs/${job.id}/invoice`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/30 bg-[var(--panel)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/60 hover:text-[var(--accent)]"
              >
                {job.jobNumber}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ── INVOICE TABLE ──────────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel-strong)] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            <tr>
              <th className="px-4 py-3">Invoice</th>
              <th className="hidden px-4 py-3 md:table-cell">Client · Source</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Total</th>
              <th className="hidden px-4 py-3 lg:table-cell">Balance</th>
              <th className="hidden px-4 py-3 lg:table-cell">Overdue</th>
              <th className="px-4 py-3 text-right">Actions</th>
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
                  <td className="px-4 py-3">
                    <p className="mono text-sm font-bold text-[var(--ink)]">{inv.invoiceNumber}</p>
                    <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">
                      {inv.issuedAt.toLocaleDateString()}
                      {inv.dueDate ? ` · due ${inv.dueDate.toLocaleDateString()}` : ""}
                    </p>
                    <span
                      className={`mt-0.5 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${typeBadgeCls[inv.invoiceType] ?? typeBadgeCls.OTHER}`}
                    >
                      {inv.invoiceType.charAt(0) + inv.invoiceType.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <p className="font-medium text-[var(--ink)]">{clientName}</p>
                    {isRepair && inv.job ? (
                      <Link
                        className="mono text-[11px] text-[var(--ink-muted)] hover:text-[var(--accent)]"
                        href={`/jobs/${inv.job.id}`}
                      >
                        {inv.job.jobNumber}
                      </Link>
                    ) : inv.subject ? (
                      <p className="text-[11px] text-[var(--ink-muted)]">{inv.subject}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusCls}`}>
                      {statusLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-[var(--ink)]">
                      {formatMoney(inv.totalAmount, invoiceCurrency)}
                    </p>
                    {inv.paidAmount > 0 && !inv.isPaid ? (
                      <p className="mt-0.5 text-[11px] text-emerald-700">
                        {formatMoney(inv.paidAmount, invoiceCurrency)} paid
                      </p>
                    ) : null}
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    {inv.isPaid ? (
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
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
                  <td className="hidden px-4 py-3 lg:table-cell">
                    {isOverdue ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
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
                      <span className="text-[11px] text-[var(--ink-muted)]">—</span>
                    ) : (
                      <span className="text-[11px] text-emerald-600">On time</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {isRepair && inv.job && (
                        <Link
                          href={`/jobs/${inv.job.id}`}
                          className="inline-flex items-center rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink)] hover:border-[var(--accent)]/50 hover:text-[var(--accent)]"
                        >
                          Job
                        </Link>
                      )}
                      {isRepair && inv.job && canGenerateInvoiceForStatus(inv.job.status) ? (
                        <a
                          href={`/api/jobs/${inv.job.id}/invoice`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2.5 py-1.5 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/20"
                        >
                          PDF
                        </a>
                      ) : null}
                      {inv.payments[0]?.id ? (
                        <a
                          href={`/api/payments/${inv.payments[0].id}/receipt`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/20"
                        >
                          Receipt
                        </a>
                      ) : null}
                      <RowActionsMenu label="Invoice actions">
                        {inv.balance > 0 && inv.status !== "VOID" ? (
                          <>
                            <MenuSection label="Record Payment" />
                            <form action={addPaymentAction} className="space-y-2 p-3">
                              <input type="hidden" name="invoiceId" value={inv.id} />
                              <div className="flex gap-2">
                                <input
                                  name="amount"
                                  inputMode="decimal"
                                  placeholder="Amount"
                                  className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50"
                                />
                                <select
                                  name="currency"
                                  defaultValue={invoiceCurrency}
                                  className="rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-xs outline-none"
                                >
                                  {SUPPORTED_CURRENCIES.map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                  ))}
                                </select>
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
                              <button
                                type="submit"
                                className="btn-premium w-full rounded-lg px-3 py-1.5 text-xs font-semibold"
                              >
                                Record Payment
                              </button>
                            </form>
                          </>
                        ) : null}
                        {inv.balance <= 0 && inv.status !== "VOID" ? (
                          <>
                            <MenuSection label="Delivery Note" />
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
                              <button
                                type="submit"
                                className="btn-premium w-full rounded-lg px-3 py-1.5 text-xs font-semibold"
                              >
                                Create Note
                              </button>
                            </form>
                          </>
                        ) : null}
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
                          <button
                            type="submit"
                            className="btn-premium w-full rounded-lg px-3 py-1.5 text-xs font-semibold"
                          >
                            Save
                          </button>
                        </form>
                        {inv.payments.length === 0 && inv.deliveryNotes.length === 0 ? (
                          <MenuDestructiveRow>
                            <form action={deleteInvoiceAction}>
                              <input type="hidden" name="invoiceId" value={inv.id} />
                              <ConfirmSubmitButton
                                message="Delete this invoice? This cannot be undone."
                                className="text-xs font-semibold text-red-600 hover:text-red-700"
                              >
                                Delete Invoice
                              </ConfirmSubmitButton>
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
                <td className="px-4 py-10 text-center text-sm text-[var(--ink-muted)]" colSpan={7}>
                  No invoices found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {filtered.length > 0 && (
          <div className="flex items-center justify-between border-t border-[var(--line)] px-4 py-2.5">
            <p className="text-[11px] text-[var(--ink-muted)]">
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
