"use client";

import { Eye, Download, Send, Printer, FileText, X } from "lucide-react";
import { DocumentActionCell, type DocAction } from "@/components/shared/DocumentActionCell";
import { documentAction } from "@/app/(app)/documents/actions";

interface ReceiptActionCellProps {
  id: string;
  receiptNumber: string;
  voidedAt: Date | null;
  userRole: string;
}

export function ReceiptActionCell({ id, receiptNumber, voidedAt, userRole }: ReceiptActionCellProps) {
  const viewHref = `/documents/receipts/${encodeURIComponent(receiptNumber)}`;
  const pdfHref = `/api/receipts/${id}`;
  const isVoided = Boolean(voidedAt);
  const isAdmin = userRole === "ADMIN" || userRole === "MANAGER" || userRole === "FINANCE";

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

  if (!isVoided) {
    quickActions.push(
      { key: "view", label: "View receipt", icon: <Eye size={13} />, href: viewHref },
      { key: "download", label: "Download PDF", icon: <Download size={13} />, href: pdfHref, external: true },
      { key: "send", label: "Send receipt", icon: <Send size={13} />, serverAction: sa("receipt-send"), tone: "accent" },
      { key: "print", label: "Print", icon: <Printer size={13} />, href: pdfHref, external: true },
    );
    moreActions.push(
      { key: "duplicate", label: "Duplicate receipt", icon: <FileText size={13} />, serverAction: sa("receipt-duplicate") },
      { key: "div1", label: "", icon: null, divider: true },
      { key: "void", label: "Void receipt", icon: <X size={13} />, serverAction: sa("receipt-void"), confirm: "Void this receipt? This cannot be undone.", tone: "danger" },
    );
  } else {
    quickActions.push(
      { key: "view", label: "View receipt", icon: <Eye size={13} />, href: viewHref },
      { key: "download", label: "Download PDF", icon: <Download size={13} />, href: pdfHref, external: true },
    );
    if (isAdmin) {
      quickActions.push({ key: "dup", label: "Duplicate receipt", icon: <FileText size={13} />, serverAction: sa("receipt-duplicate") });
    }
  }

  return <DocumentActionCell quickActions={quickActions} moreActions={moreActions} label={`Actions for ${receiptNumber}`} />;
}