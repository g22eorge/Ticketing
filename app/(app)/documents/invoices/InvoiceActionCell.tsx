"use client";

import { Eye, Pencil, Download, Send, FileText, Trash2, X, Receipt, Printer, Banknote } from "lucide-react";
import { DocumentActionCell, type DocAction } from "@/components/shared/DocumentActionCell";
import { documentAction } from "@/app/(app)/documents/actions";

interface InvoiceActionCellProps {
  id: string;
  invoiceNumber: string;
  status: string;
  userRole: string;
  ticketId: string | null;
  hasReceipt: boolean;
}

export function InvoiceActionCell({ id, invoiceNumber, status, userRole, ticketId, hasReceipt }: InvoiceActionCellProps) {
  const viewHref = `/documents/invoices/${encodeURIComponent(invoiceNumber)}`;
  const pdfHref = `/api/invoices/${id}`;
  const isAdmin = userRole === "ADMIN" || userRole === "MANAGER" || userRole === "SALES_MANAGER" || userRole === "FINANCE";

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
      { key: "view", label: "View invoice", icon: <Eye size={13} />, href: viewHref },
      { key: "edit", label: "Edit invoice", icon: <Pencil size={13} />, href: viewHref, tone: "accent" },
      { key: "send", label: "Send invoice", icon: <Send size={13} />, serverAction: sa("invoice-send"), tone: "accent" },
      { key: "download", label: "Download PDF", icon: <Download size={13} />, href: pdfHref, external: true },
    );
    moreActions.push(
      { key: "duplicate", label: "Duplicate invoice", icon: <FileText size={13} />, serverAction: sa("invoice-duplicate") },
      { key: "div1", label: "", icon: null, divider: true },
      { key: "delete", label: "Delete draft", icon: <Trash2 size={13} />, serverAction: sa("invoice-delete-draft"), confirm: "Delete this draft invoice?", tone: "danger" },
    );
  } else if (status === "ISSUED") {
    quickActions.push(
      { key: "view", label: "View invoice", icon: <Eye size={13} />, href: viewHref },
      { key: "download", label: "Download PDF", icon: <Download size={13} />, href: pdfHref, external: true },
      { key: "resend", label: "Resend invoice", icon: <Send size={13} />, serverAction: sa("invoice-send"), tone: "accent" },
      { key: "mark-paid", label: "Mark as paid", icon: <Banknote size={13} />, serverAction: sa("invoice-mark-paid"), confirm: "Mark this invoice as paid?", tone: "success" },
    );
    moreActions.push(
      { key: "duplicate", label: "Duplicate invoice", icon: <FileText size={13} />, serverAction: sa("invoice-duplicate") },
      { key: "print", label: "Print", icon: <Printer size={13} />, href: pdfHref, external: true },
    );
    if (ticketId && !hasReceipt) {
      moreActions.push({ key: "receipt", label: "Record Payment", icon: <Receipt size={13} />, href: `/tickets/${ticketId}/create-receipt` });
    }
    moreActions.push(
      { key: "div1", label: "", icon: null, divider: true },
      { key: "void", label: "Void invoice", icon: <X size={13} />, serverAction: sa("invoice-void"), confirm: "Void this invoice? This cannot be undone.", tone: "danger" },
    );
  } else if (status === "PAID") {
    quickActions.push(
      { key: "view", label: "View invoice", icon: <Eye size={13} />, href: viewHref },
      { key: "download", label: "Download PDF", icon: <Download size={13} />, href: pdfHref, external: true },
      { key: "receipt", label: "View receipt", icon: <Receipt size={13} />, href: hasReceipt ? "/documents/receipts" : viewHref, tone: "success" },
      { key: "duplicate", label: "Duplicate invoice", icon: <FileText size={13} />, serverAction: sa("invoice-duplicate") },
    );
    moreActions.push(
      { key: "send", label: "Send to client", icon: <Send size={13} />, serverAction: sa("invoice-send"), tone: "accent" },
      { key: "print", label: "Print", icon: <Printer size={13} />, href: pdfHref, external: true },
    );
  } else if (status === "VOID") {
    quickActions.push(
      { key: "view", label: "View invoice", icon: <Eye size={13} />, href: viewHref },
      { key: "download", label: "Download PDF", icon: <Download size={13} />, href: pdfHref, external: true },
    );
    if (isAdmin) {
      quickActions.push({ key: "duplicate", label: "Duplicate invoice", icon: <FileText size={13} />, serverAction: sa("invoice-duplicate") });
    }
  } else {
    quickActions.push(
      { key: "view", label: "View invoice", icon: <Eye size={13} />, href: viewHref },
      { key: "download", label: "Download PDF", icon: <Download size={13} />, href: pdfHref, external: true },
    );
  }

  return <DocumentActionCell quickActions={quickActions} moreActions={moreActions} label={`Actions for ${invoiceNumber}`} />;
}