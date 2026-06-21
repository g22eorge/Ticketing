"use client";

import Link from "next/link";
import { Download, Send, Printer, FileText, X } from "lucide-react";
import { DocumentActionCell } from "@/components/shared/DocumentActionCell";
import { StatusBadge, receiptStatusVariant } from "@/components/ui/StatusBadge";
import { formatMoney } from "@/lib/currency";
import { formatEATDate, formatEATDateTime } from "@/lib/date-eat";
import { documentAction } from "@/app/(app)/documents/actions";

interface ReceiptDetailPageProps {
  receiptNumber: string;
  amount: number;
  currency: string;
  issuedAt: Date;
  voidedAt: Date | null;
  voidReason?: string | null;
  id: string;
  invoiceNumber?: string | null;
  clientName?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  clientAddress?: string | null;
  clientOrganization?: string | null;
}

export function ReceiptDetailView(props: ReceiptDetailPageProps) {
  const {
    receiptNumber, amount, currency, issuedAt, voidedAt, voidReason,
    id, invoiceNumber, clientName, clientPhone, clientEmail,
    clientAddress, clientOrganization,
  } = props;
  const isVoided = Boolean(voidedAt);

  function sa(actionName: string) {
    return () => {
      const fd = new FormData();
      fd.set("action", actionName);
      fd.set("id", id);
      return documentAction(fd);
    };
  }

  const quickActions = !isVoided
    ? [
        { key: "download", label: "Download PDF", icon: <Download size={13} />, href: `/api/receipts/${id}`, external: true },
        { key: "send", label: "Send receipt", icon: <Send size={13} />, serverAction: sa("receipt-send"), tone: "accent" as const },
        { key: "print", label: "Print", icon: <Printer size={13} />, href: `/api/receipts/${id}`, external: true },
        { key: "duplicate", label: "Duplicate receipt", icon: <FileText size={13} />, serverAction: sa("receipt-duplicate") },
      ]
    : [
        { key: "download", label: "Download PDF", icon: <Download size={13} />, href: `/api/receipts/${id}`, external: true },
        { key: "dup", label: "Duplicate receipt", icon: <FileText size={13} />, serverAction: sa("receipt-duplicate") },
      ];

  const moreActions = !isVoided
    ? [
        { key: "div1", label: "", icon: null, divider: true },
        { key: "void", label: "Void receipt", icon: <X size={13} />, serverAction: sa("receipt-void"), confirm: "Void this receipt? This cannot be undone.", tone: "danger" as const },
      ]
    : [];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Header */}
      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Documents · Receipt</p>
            <h1 className="mt-0.5 font-mono text-lg font-bold text-[var(--ink)]">{receiptNumber}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[var(--ink-muted)]">
              {clientName ? (
                <>
                  <span>{clientName}</span>
                  <span className="opacity-40">·</span>
                </>
              ) : null}
              <span>Issued {formatEATDate(issuedAt)}</span>
            </div>
          </div>
          <StatusBadge
            label={voidedAt ? "Voided" : "Issued"}
            variant={receiptStatusVariant(voidedAt ? "VOIDED" : "ISSUED")}
          />
        </div>
      </div>

      {/* Amount highlight card */}
      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Amount Received</p>
            <p className="mt-1 tabular-nums text-[22px] font-black text-[var(--ink)]">{formatMoney(amount, currency)}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Status</p>
            <p className={`mt-1 text-sm font-bold ${voidedAt ? "text-red-500" : "text-emerald-600"}`}>
              {voidedAt ? `Voided ${formatEATDate(voidedAt)}` : "Issued and valid"}
            </p>
          </div>
        </div>
        {invoiceNumber && (
          <div className="mt-3 border-t border-[var(--line)] pt-3">
            <p className="text-[11px] text-[var(--ink-muted)]">Invoice</p>
            <Link
              href={`/documents/invoices/${encodeURIComponent(invoiceNumber)}`}
              className="mt-0.5 inline-flex items-center gap-1 text-sm font-bold text-[var(--accent)] hover:underline"
            >
              {invoiceNumber}
            </Link>
          </div>
        )}
      </div>

      {/* Client info — only show if we have data */}
      {(clientName || clientPhone || clientEmail || clientAddress) && (
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-4">
          <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Client</p>
          <p className="text-sm font-bold text-[var(--ink)]">{clientName ?? "—"}</p>
          {clientOrganization ? <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{clientOrganization}</p> : null}
          <div className="mt-1.5 space-y-0.5 text-xs text-[var(--ink-muted)]">
            {clientPhone ? <p className="tabular-nums">{clientPhone}</p> : null}
            {clientEmail ? <p>{clientEmail}</p> : null}
            {clientAddress ? <p className="leading-relaxed">{clientAddress}</p> : null}
          </div>
        </div>
      )}

      {/* Details */}
      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-4">
        <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Details</p>
        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[var(--ink-muted)]">Issued</dt>
            <dd className="tabular-nums font-medium text-[var(--ink)]">{formatEATDateTime(issuedAt)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[var(--ink-muted)]">Currency</dt>
            <dd className="font-medium text-[var(--ink)]">{currency}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[var(--ink-muted)]">Receipt number</dt>
            <dd className="font-mono font-medium text-[var(--ink)]">{receiptNumber}</dd>
          </div>
        </dl>
      </div>

      {/* Void alert */}
      {voidedAt && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-500/20 dark:bg-red-500/10">
          <p className="text-sm font-bold text-red-700 dark:text-red-400">This receipt has been voided</p>
          {voidReason ? (
            <p className="mt-1 text-xs text-red-600 dark:text-red-500">{voidReason}</p>
          ) : (
            <p className="mt-1 text-xs text-red-600 dark:text-red-500">Voided on {formatEATDateTime(voidedAt)}</p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <DocumentActionCell
            quickActions={quickActions}
            moreActions={moreActions}
            label={`Actions for ${receiptNumber}`}
          />
        </div>
      </div>
    </div>
  );
}