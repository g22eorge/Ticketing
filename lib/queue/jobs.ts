/**
 * Canonical job-name constants and payload types for every BullMQ job.
 * Import these from other modules — never use raw strings.
 */

export const QUEUE_NAME = "eagle-info-main";

// ── Job names ────────────────────────────────────────────────────────────────

export const Jobs = {
  // PDF generation
  PDF_JOB_CARD:            "pdf:job-card",
  PDF_INVOICE:             "pdf:invoice",
  PDF_QUOTATION:           "pdf:quotation",
  PDF_STOCK_TRANSFER:      "pdf:stock-transfer",
  PDF_PURCHASE_ORDER:      "pdf:purchase-order",
  PDF_PARTS_REQUEST:       "pdf:parts-request",
  PDF_DELIVERY_NOTE:       "pdf:delivery-note",
  PDF_SUPPLIER_STATEMENT:  "pdf:supplier-statement",

  // SLA / escalation
  SLA_APPROVAL_ESCALATE:   "sla:approval-escalate",
  SLA_REPAIR_OVERDUE:      "sla:repair-overdue",
  SLA_PO_OVERDUE:          "sla:po-overdue",

  // Approval reminders
  APPROVAL_REMINDER:       "approval:reminder",
  APPROVAL_FINAL_NOTICE:   "approval:final-notice",

  // Landed cost
  LANDED_COST_RECALC:      "landed-cost:recalculate",
  LANDED_COST_ALLOCATE:    "landed-cost:allocate",

  // Misc
  STOCK_REORDER_CHECK:     "stock:reorder-check",
  NOTIFICATION_SEND:       "notification:send",
} as const;

export type JobName = (typeof Jobs)[keyof typeof Jobs];

// ── Payload types ─────────────────────────────────────────────────────────────

export interface PdfJobPayload {
  orgId: string;
  recordId: string;
  documentType: string;
  requestedBy: string;
}

export interface SlaEscalatePayload {
  orgId: string;
  approvalRequestId: string;
  level: number;
  escalateTo: string;
}

export interface SlaRepairOverduePayload {
  orgId: string;
  jobId: string;
  assignedTo: string;
  managerId: string;
}

export interface SlaPoOverduePayload {
  orgId: string;
  poId: string;
  poNumber: string;
  supplierId: string;
}

export interface ApprovalReminderPayload {
  orgId: string;
  approvalRequestId: string;
  approverUserId: string;
  module: string;
  documentNumber: string;
  amount?: number;
  currency?: string;
  isFinalNotice?: boolean;
}

export interface LandedCostRecalcPayload {
  orgId: string;
  landedCostId: string;
  poId: string;
  triggeredBy: string;
}

export interface StockReorderCheckPayload {
  orgId: string;
  branchId?: string;
}

export interface NotificationSendPayload {
  orgId: string;
  userId: string;
  channel: "email" | "sms" | "in_app";
  subject: string;
  body: string;
  meta?: Record<string, unknown>;
}
