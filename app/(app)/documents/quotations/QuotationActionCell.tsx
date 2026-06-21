"use client";

import { DocumentActionCell, type DocAction } from "@/components/shared/DocumentActionCell";
import { documentAction } from "@/app/(app)/documents/actions";

const ICO = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex h-[13px] w-[13px] items-center justify-center text-[11px] leading-none">{children}</span>
);

interface QuotationActionCellProps {
  id: string;
  quoteNumber: string;
  status: string;
  convertedToInvoiceId: string | null;
  userRole: string;
}

export function QuotationActionCell({ id, quoteNumber, status, convertedToInvoiceId, userRole }: QuotationActionCellProps) {
  const viewHref = `/sales/quotations/${encodeURIComponent(quoteNumber)}`;
  const pdfHref = `/api/quotations/${id}`;
  const isAdmin = userRole === "ADMIN" || userRole === "MANAGER" || userRole === "SALES_MANAGER";

  function sa(actionName: string) {
    return () => {
      const fd = new FormData();
      fd.set("action", actionName);
      fd.set("id", id);
      return documentAction(fd);
    };
  }

  const quickActions: DocAction[] = [];
  const moreActions: DocAction[] = [];

  if (status === "DRAFT") {
    quickActions.push(
      { key: "view", label: "View quotation", icon: <ICO>👁</ICO>, href: viewHref },
      { key: "edit", label: "Edit quotation", icon: <ICO>✏</ICO>, href: viewHref, tone: "accent" },
      { key: "download", label: "Download PDF", icon: <ICO>↓</ICO>, href: pdfHref, external: true },
    );
    moreActions.push(
      { key: "send", label: "Send to client", icon: <ICO>↗</ICO>, serverAction: sa("quotation-send"), tone: "accent" },
      { key: "duplicate", label: "Duplicate quotation", icon: <ICO>📄</ICO>, serverAction: sa("quotation-duplicate") },
      { key: "div1", label: "", icon: null, divider: true },
      { key: "delete", label: "Delete draft", icon: <ICO>🗑</ICO>, serverAction: sa("quotation-delete"), confirm: "Delete this draft? This cannot be undone.", tone: "danger" },
    );
  } else if (status === "SENT") {
    quickActions.push(
      { key: "view", label: "View quotation", icon: <ICO>👁</ICO>, href: viewHref },
      { key: "download", label: "Download PDF", icon: <ICO>↓</ICO>, href: pdfHref, external: true },
      { key: "resend", label: "Resend quotation", icon: <ICO>↗</ICO>, serverAction: sa("quotation-send"), tone: "accent" },
      { key: "approve", label: "Approve quotation", icon: <ICO>✓</ICO>, serverAction: sa("quotation-approve"), confirm: "Approve this quotation?", tone: "success" },
    );
    moreActions.push(
      { key: "edit", label: "Edit quotation", icon: <ICO>✏</ICO>, href: viewHref, tone: "accent" },
      { key: "duplicate", label: "Duplicate quotation", icon: <ICO>📄</ICO>, serverAction: sa("quotation-duplicate") },
      { key: "div1", label: "", icon: null, divider: true },
      { key: "reject", label: "Reject quotation", icon: <ICO>✕</ICO>, serverAction: sa("quotation-reject"), confirm: "Reject this quotation?", tone: "danger" },
    );
  } else if (status === "ACCEPTED" && !convertedToInvoiceId) {
    quickActions.push(
      { key: "view", label: "View quotation", icon: <ICO>👁</ICO>, href: viewHref },
      { key: "download", label: "Download PDF", icon: <ICO>↓</ICO>, href: pdfHref, external: true },
      { key: "send", label: "Send to client", icon: <ICO>↗</ICO>, serverAction: sa("quotation-send"), tone: "accent" },
      { key: "convert", label: "Convert to invoice", icon: <ICO>→</ICO>, serverAction: sa("quotation-convert"), confirm: "Convert this quotation to an invoice?", tone: "success" },
    );
    moreActions.push(
      { key: "duplicate", label: "Duplicate quotation", icon: <ICO>📄</ICO>, serverAction: sa("quotation-duplicate") },
      { key: "div1", label: "", icon: null, divider: true },
      { key: "convert", label: "Convert to invoice", icon: <ICO>→</ICO>, serverAction: sa("quotation-convert"), confirm: "Convert this quotation to an invoice?", tone: "success" },
    );
  } else if (convertedToInvoiceId) {
    quickActions.push(
      { key: "view", label: "View quotation", icon: <ICO>👁</ICO>, href: viewHref },
      { key: "download", label: "Download PDF", icon: <ICO>↓</ICO>, href: pdfHref, external: true },
      { key: "invoice", label: "View invoice", icon: <ICO>🧾</ICO>, href: "/documents/invoices", tone: "success" },
      { key: "dup", label: "Duplicate quotation", icon: <ICO>📄</ICO>, serverAction: sa("quotation-duplicate") },
    );
    moreActions.push(
      { key: "send", label: "Send to client", icon: <ICO>↗</ICO>, serverAction: sa("quotation-send"), tone: "accent" },
      { key: "print", label: "Print", icon: <ICO>⎙</ICO>, href: pdfHref, external: true },
    );
  } else {
    quickActions.push(
      { key: "view", label: "View quotation", icon: <ICO>👁</ICO>, href: viewHref },
      { key: "download", label: "Download PDF", icon: <ICO>↓</ICO>, href: pdfHref, external: true },
    );
    if (isAdmin) {
      quickActions.push({ key: "dup", label: "Duplicate quotation", icon: <ICO>📄</ICO>, serverAction: sa("quotation-duplicate") });
      moreActions.push(
        { key: "delete", label: "Delete", icon: <ICO>🗑</ICO>, serverAction: sa("quotation-delete"), confirm: "Permanently delete this quotation?", tone: "danger" },
      );
    }
  }

  return <DocumentActionCell quickActions={quickActions} moreActions={moreActions} label={`Actions for ${quoteNumber}`} />;
}