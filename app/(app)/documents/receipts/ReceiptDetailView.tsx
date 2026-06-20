"use client";

import Link from "next/link";
import { Download, Send, Printer, FileText, X } from "lucide-react";
import { DocumentActionCell } from "@/components/shared/DocumentActionCell";
import { StatusBadge, receiptStatusVariant } from "@/components/ui/StatusBadge";
import { formatMoney } from "@/lib/currency";
import { formatEATDate } from "@/lib/date-eat";
import { documentAction } from "@/app/(app)/documents/actions";

interface ReceiptDetailPageProps {
  receiptNumber: string;
  amount: number;
  currency: string;
  issuedAt: Date;
  voidedAt: Date | null;
  id: string;
  invoiceNumber?: string | null;
  clientName?: string | null;
}

export function ReceiptDetailView(props: ReceiptDetailPageProps) {
  const { receiptNumber, amount, currency, issuedAt, voidedAt, id, invoiceNumber, clientName } = props;
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
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--ink)]">{receiptNumber}</h1>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
            Issued {formatEATDate(issuedAt)} · {clientName ?? "Guest"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge
            label={voidedAt ? "Voided" : "Issued"}
            variant={receiptStatusVariant(voidedAt ? "VOIDED" : "ISSUED")}
          />
          <DocumentActionCell
            quickActions={quickActions}
            moreActions={moreActions}
            label={`Actions for ${receiptNumber}`}
          />
        </div>
      </div>

      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="border-b border-[var(--line)] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Receipt Summary</p>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-[var(--ink-muted)]">Amount</p>
            <p className="text-lg font-bold text-[var(--ink)]">{formatMoney(amount, currency)}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--ink-muted)]">Status</p>
            <p className="text-sm font-medium text-[var(--ink)]">{voidedAt ? "Voided" : "Issued"}</p>
          </div>
          {invoiceNumber && (
            <div>
              <p className="text-xs text-[var(--ink-muted)]">Invoice</p>
              <Link href={`/documents/invoices/${encodeURIComponent(invoiceNumber)}`} className="text-sm font-medium text-[var(--accent)] hover:underline">
                {invoiceNumber}
              </Link>
            </div>
          )}
        </div>
      </div>

      {voidedAt && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          This receipt has been voided and is no longer valid.
        </div>
      )}
    </div>
  );
}