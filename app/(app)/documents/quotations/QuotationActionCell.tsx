"use client";

import { Eye, Pencil, Check, Download, Send, FileText, Trash2, X, Receipt, Printer, ArrowRight } from "lucide-react";
import { DocumentActionCell, type DocAction } from "@/components/shared/DocumentActionCell";
import { documentAction } from "@/app/(app)/documents/actions";

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
      { key: "view", label: "View quotation", icon: <Eye size={13} />, href: viewHref },
      { key: "edit", label: "Edit quotation", icon: <Pencil size={13} />, href: viewHref, tone: "accent" },
      { key: "approve", label: "Approve quotation", icon: <Check size={13} />, serverAction: sa("quotation-approve"), confirm: "Approve this quotation?", tone: "success" },
      { key: "download", label: "Download PDF", icon: <Download size={13} />, href: pdfHref, external: true },
    );
    moreActions.push(
      { key: "send", label: "Send to client", icon: <Send size={13} />, serverAction: sa("quotation-send"), tone: "accent" },
      { key: "duplicate", label: "Duplicate quotation", icon: <FileText size={13} />, serverAction: sa("quotation-duplicate") },
      { key: "div1", label: "", icon: null, divider: true },
      { key: "delete", label: "Delete draft", icon: <Trash2 size={13} />, serverAction: sa("quotation-delete"), confirm: "Delete this draft? This cannot be undone.", tone: "danger" },
    );
  } else if (status === "SENT") {
    quickActions.push(
      { key: "view", label: "View quotation", icon: <Eye size={13} />, href: viewHref },
      { key: "download", label: "Download PDF", icon: <Download size={13} />, href: pdfHref, external: true },
      { key: "resend", label: "Resend quotation", icon: <Send size={13} />, serverAction: sa("quotation-send"), tone: "accent" },
      { key: "approve", label: "Approve quotation", icon: <Check size={13} />, serverAction: sa("quotation-approve"), confirm: "Approve this quotation?", tone: "success" },
    );
    moreActions.push(
      { key: "edit", label: "Edit quotation", icon: <Pencil size={13} />, href: viewHref, tone: "accent" },
      { key: "duplicate", label: "Duplicate quotation", icon: <FileText size={13} />, serverAction: sa("quotation-duplicate") },
      { key: "div1", label: "", icon: null, divider: true },
      { key: "reject", label: "Reject quotation", icon: <X size={13} />, serverAction: sa("quotation-reject"), confirm: "Reject this quotation?", tone: "danger" },
    );
  } else if (status === "ACCEPTED" && !convertedToInvoiceId) {
    quickActions.push(
      { key: "view", label: "View quotation", icon: <Eye size={13} />, href: viewHref },
      { key: "download", label: "Download PDF", icon: <Download size={13} />, href: pdfHref, external: true },
      { key: "send", label: "Send to client", icon: <Send size={13} />, serverAction: sa("quotation-send"), tone: "accent" },
      { key: "convert", label: "Convert to invoice", icon: <ArrowRight size={13} />, serverAction: sa("quotation-convert"), confirm: "Convert this quotation to an invoice?", tone: "success" },
    );
    moreActions.push(
      { key: "duplicate", label: "Duplicate quotation", icon: <FileText size={13} />, serverAction: sa("quotation-duplicate") },
    );
  } else if (convertedToInvoiceId) {
    quickActions.push(
      { key: "view", label: "View quotation", icon: <Eye size={13} />, href: viewHref },
      { key: "download", label: "Download PDF", icon: <Download size={13} />, href: pdfHref, external: true },
      { key: "invoice", label: "View invoice", icon: <Receipt size={13} />, href: "/documents/invoices", tone: "success" },
      { key: "dup", label: "Duplicate quotation", icon: <FileText size={13} />, serverAction: sa("quotation-duplicate") },
    );
    moreActions.push(
      { key: "send", label: "Send to client", icon: <Send size={13} />, serverAction: sa("quotation-send"), tone: "accent" },
      { key: "print", label: "Print", icon: <Printer size={13} />, href: pdfHref, external: true },
    );
  } else {
    quickActions.push(
      { key: "view", label: "View quotation", icon: <Eye size={13} />, href: viewHref },
      { key: "download", label: "Download PDF", icon: <Download size={13} />, href: pdfHref, external: true },
    );
    if (isAdmin) {
      quickActions.push({ key: "dup", label: "Duplicate quotation", icon: <FileText size={13} />, serverAction: sa("quotation-duplicate") });
      moreActions.push(
        { key: "delete", label: "Delete", icon: <Trash2 size={13} />, serverAction: sa("quotation-delete"), confirm: "Permanently delete this quotation?", tone: "danger" },
      );
    }
  }

  return <DocumentActionCell quickActions={quickActions} moreActions={moreActions} label={`Actions for ${quoteNumber}`} />;
}