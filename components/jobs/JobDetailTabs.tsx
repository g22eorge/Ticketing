"use client";

import { Role } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { markMessagesReadAction, sendManualReplyAction, sendQuotationViaWhatsAppAction, updateJobAction, updateOneTimeExternalAssignmentAction } from "@/app/(app)/jobs/[id]/actions";
import { JobStatusBadge } from "@/components/jobs/JobStatusBadge";
import { AuditTimeline } from "@/components/shared/AuditTimeline";
import { PhotoUploader } from "@/components/shared/PhotoUploader";
import { formatEATDateTime } from "@/lib/date-eat";
import { canGenerateInvoiceForStatus, canGenerateQuotationForStatus } from "@/lib/documents";
import { JobStatus, normalizeJobStatus } from "@/lib/job-status";
import { can } from "@/lib/permissions";

const tabs = ["overview", "client", "diagnosis", "repair", "financials", "timeline", "photos", "messages"] as const;

function formatUtcDateTime(value: Date | string) {
  return formatEATDateTime(value);
}

function formatBillAmount(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function prettyEnum(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (char) => char.toUpperCase());
}

function communicationLabel(value: Props["job"]["communicationStatus"]) {
  if (!value || value === "NONE") return "No update yet";
  if (value === "AWAITING_RESPONSE") return "Awaiting client response";
  if (value === "APPROVED") return "Client approved";
  if (value === "DECLINED") return "Client declined";
  return prettyEnum(value);
}

function recommendationLabel(value: Props["job"]["recommendationOption"]) {
  if (!value) return "Not set";
  if (value === "PROCEED_REPAIR") return "Proceed with repair";
  if (value === "REPLACE_DEVICE") return "Replace device";
  if (value === "RETURN_UNREPAIRED") return "Return unrepaired";
  return prettyEnum(value);
}

function hoursSince(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60)));
}

function previewText(value: string | null | undefined, max = 240) {
  if (!value) return "-";
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

function statusWatchLabel(status: JobStatus, ageHours: number) {
  if (status === "AWAITING_APPROVAL" && ageHours >= 24) return "Client response delayed";
  if (status === "DIAGNOSING" && ageHours >= 12) return "Diagnosis aging";
  if (status === "RECEIVED" && ageHours >= 8) return "Needs triage";
  if (status === "IN_REPAIR" && ageHours >= 48) return "Repair duration high";
  if (status === "READY_FOR_PICKUP" && ageHours >= 24) return "Pickup follow-up due";
  return null;
}

const panelShellClass =
  "panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4";
const softSectionClass =
  "space-y-3 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)]/70 p-3";
const fieldClass =
  "w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none transition focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14";
const areaClass =
  "min-h-24 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none transition focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14";

type InboundMsg = {
  id: string;
  from: string;
  body: string | null;
  mediaType: string | null;
  mediaCaption: string | null;
  timestamp: Date;
  isRead: boolean;
};

type OutboundMsg = {
  id: string;
  to: string;
  body: string;
  type: string;
  sentAt: Date | null;
  createdAt: Date;
  providerDeliveryStatus: string | null;
};

type ThreadEntry =
  | { kind: "inbound"; msg: InboundMsg; sortAt: Date }
  | { kind: "outbound"; msg: OutboundMsg; sortAt: Date };

function formatMsgTime(d: Date) {
  return new Intl.DateTimeFormat("en-UG", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(d));
}

function DeliveryDot({ status }: { status: string | null }) {
  if (!status) return null;
  const color =
    status === "read" ? "text-blue-500"
    : status === "delivered" ? "text-emerald-500"
    : status === "sent" ? "text-[var(--ink-muted)]"
    : status === "failed" ? "text-red-500"
    : "text-[var(--ink-muted)]";
  return (
    <span className={`text-[10px] font-medium ${color}`} title={status}>
      {status === "read" ? "Read" : status === "delivered" ? "Delivered" : status === "sent" ? "Sent" : status === "failed" ? "Failed" : status}
    </span>
  );
}

function MessagesTab({
  jobId,
  clientPhone,
  canSendQuote,
  inbound,
  outbound,
}: {
  jobId: string;
  clientPhone: string | null | undefined;
  canSendQuote: boolean;
  inbound: InboundMsg[];
  outbound: OutboundMsg[];
}) {
  const router = useRouter();
  const [isMarkingRead, startMarkReadTransition] = useTransition();
  const [isSending, startSendTransition] = useTransition();
  const [isSendingQuote, startSendQuoteTransition] = useTransition();
  const [replyText, setReplyText] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const thread: ThreadEntry[] = [
    ...inbound.map((msg) => ({ kind: "inbound" as const, msg, sortAt: new Date(msg.timestamp) })),
    ...outbound.map((msg) => ({ kind: "outbound" as const, msg, sortAt: new Date(msg.sentAt ?? msg.createdAt) })),
  ].sort((a, b) => a.sortAt.getTime() - b.sortAt.getTime());

  const unread = inbound.filter((m) => !m.isRead);

  function handleMarkRead() {
    startMarkReadTransition(async () => {
      await markMessagesReadAction(jobId);
      router.refresh();
    });
  }

  function handleSend() {
    if (!replyText.trim()) return;
    setSendError(null);
    startSendTransition(async () => {
      const res = await sendManualReplyAction(jobId, replyText);
      if (res.success) {
        setReplyText("");
        router.refresh();
      } else {
        setSendError(res.error ?? "Failed to send");
      }
    });
  }

  function handleSendQuote() {
    setQuoteError(null);
    startSendQuoteTransition(async () => {
      const res = await sendQuotationViaWhatsAppAction(jobId);
      if (res.success) {
        router.refresh();
      } else {
        setQuoteError(res.error ?? "Failed to send quotation");
      }
    });
  }

  return (
    <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
          WhatsApp Thread
        </p>
        {unread.length > 0 ? (
          <button
            type="button"
            disabled={isMarkingRead}
            onClick={handleMarkRead}
            className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1 text-xs font-medium text-[var(--ink)] transition hover:border-[var(--accent)]/50 disabled:opacity-50"
          >
            Mark {unread.length} as read
          </button>
        ) : null}
      </div>

      {thread.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-[var(--ink-muted)]">
          No messages yet. Outbound notifications and client replies will appear here.
        </div>
      ) : (
        <div className="flex flex-col gap-2 p-4">
          {thread.map((entry) => {
            if (entry.kind === "outbound") {
              const m = entry.msg;
              return (
                <div key={m.id} className="flex flex-col items-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-[var(--accent)] px-3.5 py-2.5 text-sm text-white shadow-sm">
                    <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--ink-muted)]">
                    <span>{formatMsgTime(m.sentAt ?? m.createdAt)}</span>
                    {m.type === "STAFF_REPLY" ? (
                      <span className="text-[var(--ink-muted)]">staff reply</span>
                    ) : (
                      <span className="capitalize text-[var(--ink-muted)]">
                        {m.type.replaceAll("_", " ").toLowerCase()}
                      </span>
                    )}
                    <DeliveryDot status={m.providerDeliveryStatus} />
                  </div>
                </div>
              );
            } else {
              const m = entry.msg;
              return (
                <div key={m.id} className="flex flex-col items-start">
                  <div className={`max-w-[80%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm shadow-sm ${m.isRead ? "bg-[var(--panel-strong)] text-[var(--ink)]" : "bg-[var(--panel-strong)] text-[var(--ink)] ring-2 ring-[var(--accent)]/30"}`}>
                    {m.body ? (
                      <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                    ) : m.mediaType ? (
                      <p className="italic text-[var(--ink-muted)]">
                        [{m.mediaType}]{m.mediaCaption ? `: ${m.mediaCaption}` : ""}
                      </p>
                    ) : (
                      <p className="italic text-[var(--ink-muted)]">[message]</p>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--ink-muted)]">
                    <span>{m.from}</span>
                    <span>{formatMsgTime(m.timestamp)}</span>
                    {!m.isRead ? (
                      <span className="font-semibold text-[var(--accent)]">unread</span>
                    ) : null}
                  </div>
                </div>
              );
            }
          })}
        </div>
      )}

      {clientPhone ? (
        <div className="border-t border-[var(--line)] p-3 space-y-2">
          {canSendQuote ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSendQuote}
                disabled={isSendingQuote}
                className="btn-premium-secondary rounded-xl px-3 py-1.5 text-sm disabled:opacity-50"
              >
                {isSendingQuote ? "Sending quote…" : "Send Quote PDF"}
              </button>
              {quoteError ? (
                <p className="text-xs text-red-600">{quoteError}</p>
              ) : null}
            </div>
          ) : null}
          <div className="flex gap-2 items-end">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Type a reply… (Enter to send, Shift+Enter for new line)"
              rows={2}
              disabled={isSending}
              className="min-h-[60px] flex-1 resize-none rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={isSending || !replyText.trim()}
              className="btn-premium shrink-0 rounded-xl px-4 py-2 text-sm disabled:opacity-50"
            >
              {isSending ? "Sending…" : "Send"}
            </button>
          </div>
          {sendError ? (
            <p className="text-xs text-red-600">{sendError}</p>
          ) : null}
          <p className="text-[10px] text-[var(--ink-muted)]">Sending to {clientPhone}</p>
        </div>
      ) : (
        <div className="border-t border-[var(--line)] px-4 py-3 text-xs text-[var(--ink-muted)]">
          No client phone number — cannot send reply.
        </div>
      )}
    </div>
  );
}

type Props = {
  role: Role;
  permissions?: string[];
  technicians: Array<{
    id: string;
    name: string;
    role: Role;
  }>;
  deviceHistory?: Array<{
    id: string;
    jobNumber: string;
    status: JobStatus;
    receivedAt: Date;
    completedAt: Date | null;
    updatedAt: Date;
  }>;
  job: {
    id: string;
    jobNumber: string;
    status: JobStatus;
    deviceType: string;
    brand: string;
    model: string;
    issueDescription: string;
    serviceType?: "HARDWARE" | "SOFTWARE" | "BOTH" | null;
    softwareOsInstall?: boolean;
    softwareDriversUpdates?: boolean;
    softwareDataBackupRestore?: boolean;
    softwareAccountSetup?: boolean;
    softwarePerformanceTune?: boolean;
    softwareThirdPartyApps?: boolean;
    softwareRequestedNotes?: string | null;
    softwareLicenseAttested?: boolean;
    softwareInstallerSource?:
      | "CLIENT_PROVIDED_INSTALLER"
      | "CLIENT_ACCOUNT_LOGIN"
      | "COMPANY_LICENSE"
      | "OPEN_SOURCE"
      | "OTHER"
      | null;
    softwareInstallerSourceNote?: string | null;
    workflowReason?:
      | "NONE"
      | "PARTS_PENDING"
      | "SPECIALIST_ESCALATION"
      | "CLIENT_DECLINED"
      | "UNREPAIRABLE"
      | "CUSTOMER_CANCELLED"
      | "OTHER"
      | null;
    statusNote?: string | null;
    updatedAt: Date;
    repairPath: "IN_HOUSE" | "EXTERNAL" | null;
    diagnosisNotes: string | null;
    externalDiagnosis: string | null;
    recommendationOption?:
      | "PROCEED_REPAIR"
      | "REPLACE_DEVICE"
      | "RETURN_UNREPAIRED"
      | null;
    communicationStatus?:
      | "NONE"
      | "AWAITING_RESPONSE"
      | "APPROVED"
      | "DECLINED"
      | null;
    clientConversationNote?: string | null;
    lastClientContactAt?: Date | null;
    partsNeeded: string | null;
    workDone: string | null;
    partsReplaced: string | null;
    externalTechBill: number | null;
    clientBill: number | null;
    vatApplicable?: boolean;
    externalTechFee?: number | null;
    externalPaid?: boolean;
    externalPaidAt?: Date | null;
    externalPaymentRef?: string | null;
    repairTimeline: string | null;
    timelineMinMinutes?: number | null;
    timelineMaxMinutes?: number | null;
    timelineConfidence?: "FIRM" | "ESTIMATED" | "PARTS_DEPENDENT" | null;
    timelineNote?: string | null;
    assignedTo?: { id: string; name: string; role: Role } | null;
    client?: { fullName: string; phone: string; email: string | null } | null;
    auditLogs: Array<{
      id: string;
      action: string;
      detail: string | null;
      createdAt: Date;
      user: { name: string };
    }>;
    photos: Array<{ id: string; url: string; label: string | null }>;
    inboundMessages?: Array<{
      id: string;
      from: string;
      body: string | null;
      mediaType: string | null;
      mediaCaption: string | null;
      timestamp: Date;
      isRead: boolean;
    }>;
    outboundMessages?: Array<{
      id: string;
      to: string;
      body: string;
      type: string;
      sentAt: Date | null;
      createdAt: Date;
      providerDeliveryStatus: string | null;
    }>;
    oneTimeExternalAssignment?: {
      technicianName: string;
      phone: string;
      specialization: string | null;
      agreedRepairCost: number | null;
      expectedPartsCost: number | null;
      partsNotes: string | null;
      assignedAt: Date;
      expectedReturnAt: Date | null;
      returnedAt: Date | null;
      instructions: string | null;
      progressNotes: string | null;
      finalOutcome: string | null;
    } | null;
  };
};

export function JobDetailTabs({ role, permissions = [], job, technicians, deviceHistory = [] }: Props) {
  const inboundMessages = job.inboundMessages ?? [];
  const outboundMessages = job.outboundMessages ?? [];
  const unreadCount = inboundMessages.filter((m) => !m.isRead).length;
  const router = useRouter();
  const [active, setActive] = useState<(typeof tabs)[number]>("overview");
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [showOneTimeForm, setShowOneTimeForm] = useState(false);
  const [isDiagnosisPending, startDiagnosisTransition] = useTransition();
  const [isOneTimeExternalPending, startOneTimeExternalTransition] = useTransition();
  const [isRepairPending, startRepairTransition] = useTransition();
  const [isFinancialPending, startFinancialTransition] = useTransition();
  const [isCommunicationPending, startCommunicationTransition] = useTransition();
  const [isStatusPending, startStatusTransition] = useTransition();

  useEffect(() => {
    if (!savedSection) return;
    const timer = setTimeout(() => setSavedSection(null), 2000);
    return () => clearTimeout(timer);
  }, [savedSection]);
  const permissionUser = { role, permissions };
  const canViewFinancials = can.viewFinancials(permissionUser);
  const canManageFinancials = can.approveInvoices(permissionUser);
  const canGenerateJobCard = can.generateJobCards(permissionUser);
  const canGenerateQuotation =
    ["ADMIN", "OPS", "TECHNICIAN_INTERNAL"].includes(role) ||
    canViewFinancials ||
    can.viewApprovedCost(permissionUser);
  const canGenerateInvoice = ["ADMIN", "OPS"].includes(role) || canManageFinancials;

  const isSoftwareJob = (job.serviceType ?? "HARDWARE") !== "HARDWARE";
  const canManagePayouts = role === "ADMIN" || can.reviewExternalBills(permissionUser);
  const canAssignJobs = can.assignJobs(permissionUser);
  const canUpdateClientCommunication = can.approveWork(permissionUser);
  const isIntake = role === "FRONT_DESK";

  const visibleTabs = tabs.filter((tab) => {
    if (tab === "client") return role !== "TECHNICIAN_EXTERNAL";
    if (tab === "financials") return canViewFinancials;
    if (tab === "timeline") return ["ADMIN", "OPS", "FRONT_DESK"].includes(role) || can.viewClientInfo(permissionUser);
    if ((tab === "diagnosis" || tab === "repair") && isIntake) return false;
    if (tab === "messages") return ["ADMIN", "OPS", "FRONT_DESK"].includes(role);
    return true;
  });

  const allowedStatusTransitions: Partial<Record<ReturnType<typeof normalizeJobStatus>, JobStatus[]>> = {
    RECEIVED: ["DIAGNOSING"],
    DIAGNOSING: ["REFERRED", "IN_REPAIR", "AWAITING_APPROVAL", "CLOSED"],
    REFERRED: ["IN_REPAIR", "AWAITING_APPROVAL", "READY_FOR_PICKUP", "COMPLETED", "CLOSED"],
    AWAITING_APPROVAL: ["IN_REPAIR", "CLOSED"],
    IN_REPAIR: ["READY_FOR_PICKUP", "COMPLETED", "CLOSED"],
    READY_FOR_PICKUP: ["COMPLETED", "CLOSED"],
    COMPLETED: [],
    CLOSED: [],
  };

  const statusKey = normalizeJobStatus(job.status);
  const statusActions = allowedStatusTransitions[statusKey] ?? [];
  const isTerminal = job.status === "COMPLETED" || job.status === "CLOSED";
  const existingMargin =
    typeof job.clientBill === "number" && typeof job.externalTechBill === "number"
      ? job.clientBill - job.externalTechBill
      : null;
  const vatApplicable = job.vatApplicable ?? true;
  const clientBillValue = typeof job.clientBill === "number" ? job.clientBill : 0;
  const repairCostBeforeVat = vatApplicable ? clientBillValue / 1.18 : clientBillValue;
  const vatAmount = vatApplicable ? Math.max(clientBillValue - repairCostBeforeVat, 0) : 0;
  const hasPayoutControls = canManagePayouts && job.repairPath === "EXTERNAL";
  const quotationEligibleByStatus = canGenerateQuotationForStatus(job.status);
  const invoiceEligibleByStatus = canGenerateInvoiceForStatus(job.status);
  const showJobCardAction = canGenerateJobCard;
  const showQuotationAction = canGenerateQuotation && quotationEligibleByStatus;
  const showInvoiceAction = canGenerateInvoice && invoiceEligibleByStatus;
  const documentHints: string[] = [];

  if (!showJobCardAction && !showQuotationAction && !showInvoiceAction) {
    documentHints.push("No document action is currently available for your role on this job.");
  }
  if (canGenerateQuotation && !quotationEligibleByStatus) {
    documentHints.push("Quotation unlocks after diagnosis starts.");
  }
  if (canGenerateInvoice && !invoiceEligibleByStatus) {
    documentHints.push("Invoice unlocks at Ready for Pickup, Completed, or Closed.");
  }

  const mobilePrimaryAction =
    job.status === "COMPLETED"
      ? { type: "tab" as const, label: "Mark Paid / Close", tab: "financials" as const }
      : showInvoiceAction
        ? { type: "link" as const, label: "Generate Invoice", href: `/api/jobs/${job.id}/invoice` }
        : showQuotationAction
          ? { type: "link" as const, label: "Generate Quote", href: `/api/jobs/${job.id}/quotation` }
          : showJobCardAction
            ? { type: "link" as const, label: "Generate Job Card", href: `/api/jobs/${job.id}/job-card` }
            : null;

  const expectedUpdatedAt = new Date(job.updatedAt).toISOString();
  const assignedRole = job.assignedTo?.role;
  const diagnosisMode: "internal" | "external" =
    assignedRole === "TECHNICIAN_EXTERNAL"
      ? "external"
      : assignedRole
          ? "internal"
          : job.repairPath === "EXTERNAL"
            ? "external"
            : "internal";
  const derivedRepairPath = assignedRole
    ? diagnosisMode === "external"
      ? "EXTERNAL (from assigned technician)"
      : "IN_HOUSE (from assigned technician)"
    : job.repairPath === "EXTERNAL"
      ? "EXTERNAL"
      : "IN_HOUSE";
  const repairCostLabel = diagnosisMode === "external" ? "External technician bill" : "Internal repair cost";
  const stageLabels = ["Intake", "Diagnosis", "Approval", "Repair", "Complete"] as const;
  const currentStageIndex =
    job.status === "RECEIVED"
      ? 0
      : job.status === "DIAGNOSING"
        ? 1
        : job.status === "AWAITING_APPROVAL"
          ? 2
          : (["REFERRED", "IN_REPAIR", "READY_FOR_PICKUP"] as JobStatus[]).includes(job.status)
            ? 3
            : 4;
  const nextActionByStatus: Record<ReturnType<typeof normalizeJobStatus>, string> = {
    RECEIVED: "Start diagnosis",
    DIAGNOSING: "Capture diagnosis and set repair path",
    REFERRED: "Capture referral notes and handoff details",
    AWAITING_APPROVAL: "Record client approval decision",
    IN_REPAIR: "Update repair log and progress",
    READY_FOR_PICKUP: "Confirm delivery to client",
    COMPLETED: "Archive and invoice follow-up only",
    CLOSED: "No further workflow action",
  };
  const statusAgeHours = hoursSince(job.updatedAt);
  const watchLabel = statusWatchLabel(job.status, statusAgeHours);
  const etaValue = job.repairTimeline
    ? `${job.repairTimeline}${job.timelineConfidence ? ` (${prettyEnum(job.timelineConfidence)})` : ""}`
    : "Not set";
  const clientDecision = communicationLabel(job.communicationStatus);
  const recommendation = recommendationLabel(job.recommendationOption);
  const assignedLabel = job.assignedTo?.name
    ? job.assignedTo.name
    : job.oneTimeExternalAssignment?.technicianName
      ? `One-time external: ${job.oneTimeExternalAssignment.technicianName}`
      : "No technician assigned yet.";
  const narrativeBits = [
    `Status is ${prettyEnum(job.status)}.`,
    assignedLabel === "No technician assigned yet." ? assignedLabel : `Assigned to ${assignedLabel}.`,
    `Client decision: ${clientDecision.toLowerCase()}.`,
    job.repairTimeline ? `ETA ${etaValue}.` : "ETA not set.",
    watchLabel ? `${watchLabel} (${statusAgeHours}h in this state).` : null,
  ].filter(Boolean) as string[];

  const canManageOneTimeExternal = role === "ADMIN" || role === "OPS" || role === "TECHNICIAN_INTERNAL";
  const oneTimeExternal = job.oneTimeExternalAssignment ?? null;
  const showOneTimeExternalPanel =
    canManageOneTimeExternal &&
    (
      showOneTimeForm ||
      Boolean(oneTimeExternal)
    );
  const oneTimeStatusOptions: Array<{ value: JobStatus; label: string }> = [
    { value: "REFERRED", label: "Referred" },
    { value: "COMPLETED", label: "Completed" },
  ];

  function dateInputValue(value: Date | null | undefined) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  }

  const rolePriorityBoost = (key: string) => {
    if (role === "FRONT_DESK") {
      if (key === "clientDecision") return 4;
      if (key === "lastContact") return 3;
      if (key === "nextAction") return 2;
    }
    if (role === "TECHNICIAN_INTERNAL") {
      if (key === "assigned") return 4;
      if (key === "eta") return 3;
      if (key === "nextAction") return 2;
    }
    if (role === "ADMIN" || role === "OPS") {
      if (key === "watch") return 4;
      if (key === "nextAction") return 3;
      if (key === "status") return 2;
    }
    return 0;
  };

  const quickSignals = [
    {
      key: "status",
      label: "Current Status",
      value: prettyEnum(job.status),
      tone: "text-[var(--accent)]",
      accent: "bg-[var(--accent)]/10 border-[var(--accent)]/30",
      priority: 90,
    },
    {
      key: "watch",
      label: "Watch",
      value: watchLabel ? `${watchLabel} (${statusAgeHours}h)` : `Healthy (${statusAgeHours}h in state)`,
      tone: watchLabel ? "text-[var(--ink)]" : "text-[var(--accent)]",
      accent: watchLabel ? "bg-[var(--panel-strong)] border-[var(--line)]" : "bg-[var(--accent)]/10 border-[var(--accent)]/30",
      priority: watchLabel ? 88 : 40,
    },
    {
      key: "assigned",
      label: "Assigned Tech",
      value: job.assignedTo?.name ?? job.oneTimeExternalAssignment?.technicianName ?? "Unassigned",
      tone: job.assignedTo?.name || job.oneTimeExternalAssignment?.technicianName ? "text-[var(--ink)]" : "text-[var(--ink)]",
      accent: job.assignedTo?.name || job.oneTimeExternalAssignment?.technicianName
        ? "bg-[var(--panel)] border-[var(--line)]"
        : "bg-[var(--panel-strong)] border-[var(--line)]",
      priority: job.assignedTo?.name || job.oneTimeExternalAssignment?.technicianName ? 70 : 95,
    },
    {
      key: "clientDecision",
      label: "Client Decision",
      value: clientDecision,
      tone: "text-[var(--ink)]",
      accent: "bg-[var(--panel)] border-[var(--line)]",
      priority: job.communicationStatus === "AWAITING_RESPONSE" ? 86 : 58,
    },
    {
      key: "recommendation",
      label: "Recommendation",
      value: recommendation,
      tone: "text-[var(--ink)]",
      accent: "bg-[var(--panel)] border-[var(--line)]",
      priority: 50,
    },
    {
      key: "eta",
      label: "ETA",
      value: etaValue,
      tone: "text-[var(--ink)]",
      accent: "bg-[var(--panel)] border-[var(--line)]",
      priority: job.repairTimeline ? 64 : 74,
    },
    {
      key: "nextAction",
      label: "Next Action",
      value: nextActionByStatus[statusKey],
      tone: job.status === "COMPLETED" || job.status === "CLOSED" ? "text-[var(--ink)]" : "text-[var(--ink)]",
      accent: job.status === "COMPLETED" || job.status === "CLOSED" ? "bg-[var(--panel)] border-[var(--line)]" : "bg-[var(--panel-strong)] border-[var(--line)]",
      priority: 84,
    },
    {
      key: "lastContact",
      label: "Last Client Contact",
      value: job.lastClientContactAt ? formatUtcDateTime(job.lastClientContactAt) : "Not recorded",
      tone: "text-[var(--ink)]",
      accent: "bg-[var(--panel)] border-[var(--line)]",
      priority: job.lastClientContactAt ? 52 : 80,
    },
    {
      key: "repairPath",
      label: "Repair Path",
      value: derivedRepairPath,
      tone: "text-[var(--ink)]",
      accent: "bg-[var(--panel)] border-[var(--line)]",
      priority: 54,
    },
    ...(canViewFinancials
      ? [
          {
            key: "clientBill",
            label: "Client Bill",
            value: typeof job.clientBill === "number" ? formatBillAmount(job.clientBill) : "Pending",
            tone: "text-[var(--ink)]",
            accent: "bg-[var(--panel)] border-[var(--line)]",
            priority: 56,
          },
        ]
      : []),
  ]
    .map((item) => ({ ...item, priority: item.priority + rolePriorityBoost(item.key) }))
    .sort((a, b) => b.priority - a.priority);

  return (
    <div className="min-w-0 space-y-4">
      <div>
        <Link href="/jobs" className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--ink-muted)] transition hover:text-[var(--ink)]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          All jobs
        </Link>
      </div>
      <div className={panelShellClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{job.jobNumber}</h1>
            <p className="text-sm text-[var(--ink-muted)] [overflow-wrap:anywhere]">
              {job.deviceType}{[job.brand, job.model].filter(v => v && v !== "Unknown").length > 0 ? " / " + [job.brand, job.model].filter(v => v && v !== "Unknown").join(" ") : ""}
            </p>
          </div>
          <JobStatusBadge status={job.status} />
        </div>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {visibleTabs.map((tab) => (
          <button
            type="button"
            key={tab}
            onClick={() => setActive(tab)}
            className={`shrink-0 whitespace-nowrap rounded-lg border px-3 py-2 text-sm capitalize transition active:opacity-80 ${
              active === tab
                ? "border-[var(--accent)] bg-[var(--accent)] font-semibold text-white"
                : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink)] hover:border-[var(--accent)]/50"
            }`}
          >
            {tab === "messages" && unreadCount > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                messages
                <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              </span>
            ) : tab}
          </button>
        ))}
      </div>

      <div className="hidden min-[1025px]:block rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">Documents</p>
          <div className="flex flex-wrap gap-2">
            {showJobCardAction ? (
              <a
                href={`/api/jobs/${job.id}/job-card`}
                target="_blank"
                rel="noreferrer"
                className="btn-premium-secondary inline-flex shrink-0 items-center justify-center rounded-lg px-3 py-1.5 text-[13px] sm:inline-block sm:w-auto sm:py-2 sm:text-sm"
              >
                Generate Job Card
              </a>
            ) : null}
            {showQuotationAction ? (
              <a
                href={`/api/jobs/${job.id}/quotation`}
                target="_blank"
                rel="noreferrer"
                className="btn-premium-secondary inline-flex shrink-0 items-center justify-center rounded-lg px-3 py-1.5 text-[13px] sm:inline-block sm:w-auto sm:py-2 sm:text-sm"
              >
                Generate Quotation
              </a>
            ) : null}
            {showInvoiceAction ? (
              <a
                href={`/api/jobs/${job.id}/invoice`}
                target="_blank"
                rel="noreferrer"
                className="btn-premium-secondary inline-flex shrink-0 items-center justify-center rounded-lg px-3 py-1.5 text-[13px] sm:inline-block sm:w-auto sm:py-2 sm:text-sm"
              >
                Generate Invoice
              </a>
            ) : null}
          </div>
          {documentHints.length > 0 ? (
            <div className="mt-2 space-y-1">
              {documentHints.map((hint) => (
                <p key={hint} className="text-xs text-[var(--ink-muted)]">
                  {hint}
                </p>
              ))}
            </div>
          ) : null}
        </div>

      {active === "overview" ? (
        <div className={panelShellClass}>
          <div className="mb-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Repair Journey</p>
            <div className="flex flex-wrap gap-2">
              {stageLabels.map((label, index) => {
                const isDone = index < currentStageIndex;
                const isCurrent = index === currentStageIndex;
                return (
                  <span
                    key={label}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      isCurrent
                        ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                        : isDone
                          ? "border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]"
                          : "border-[var(--line)] bg-[var(--panel)] text-[var(--ink-muted)]"
                    }`}
                  >
                    {index + 1}. {label}
                  </span>
                );
              })}
              {job.status === "CLOSED" ? (
                <span className="rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1 text-xs font-medium text-black">
                  Closed
                </span>
              ) : null}
            </div>
          </div>

          <div className="mb-4 rounded-md border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">Executive Brief</p>
            <p className="mt-1 text-sm text-[var(--ink)] [overflow-wrap:anywhere]">{narrativeBits.join(" ")}</p>
          </div>

          <div className="mb-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">At a Glance</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {quickSignals.map((signal) => (
                <div key={signal.label} className={`rounded-md border px-3 py-2 ${signal.accent}`}>
                  <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">{signal.label}</p>
                  <p className={`mt-1 text-sm font-medium ${signal.tone} [overflow-wrap:anywhere]`}>{signal.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className={softSectionClass}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Intake</p>
                <p className="mt-1 text-sm text-[var(--ink)] [overflow-wrap:anywhere]">{previewText(job.issueDescription, 260)}</p>
              </div>
              {role !== "TECHNICIAN_EXTERNAL" ? (
                <button type="button" onClick={() => router.push(`/jobs/${job.id}/edit`)} className="btn-premium-secondary rounded-lg px-3 py-1.5 text-xs">
                  Edit Job →
                </button>
              ) : null}
            </div>
          </div>

          <div className={`mt-4 ${softSectionClass}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Diagnosis Snapshot</p>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  Assigned: <span className="font-medium text-[var(--ink)]">{job.assignedTo?.name ?? job.oneTimeExternalAssignment?.technicianName ?? "Unassigned"}</span>
                </p>
                <p className="text-sm text-[var(--ink-muted)]">Repair path: {derivedRepairPath}</p>
              </div>
              <button type="button" onClick={() => setActive("diagnosis")} className="btn-premium-secondary rounded-lg px-3 py-1.5 text-xs">
                Open Diagnosis →
              </button>
            </div>
            {job.diagnosisNotes ? (
              <p className="mt-2 text-sm text-[var(--ink)] [overflow-wrap:anywhere]">Internal: {previewText(job.diagnosisNotes, 180)}</p>
            ) : null}
            {job.externalDiagnosis ? (
              <p className="mt-2 text-sm text-[var(--ink)] [overflow-wrap:anywhere]">External: {previewText(job.externalDiagnosis, 180)}</p>
            ) : null}
            {job.partsNeeded ? (
              <p className="mt-2 text-sm text-[var(--ink)] [overflow-wrap:anywhere]">Parts: {previewText(job.partsNeeded, 180)}</p>
            ) : null}
          </div>

          <div className={`mt-4 ${softSectionClass}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Client Approval & Workflow</p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">Decision, recommendation, workflow reason, ETA, and notes.</p>
              </div>
              <button type="button" onClick={() => setActive("timeline")} className="btn-premium-secondary rounded-lg px-3 py-1.5 text-xs">
                Open Timeline →
              </button>
            </div>
          </div>

          {deviceHistory.length > 0 ? (
            <div className={`mt-4 ${softSectionClass}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Device History</p>
              <p className="text-sm text-[var(--ink-muted)]">Past jobs linked to this device.</p>
              <div className="mt-2 grid gap-2">
                {deviceHistory.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => router.push(`/jobs/${h.id}`)}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-left transition hover:border-[var(--accent)]/40"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--ink)]">{h.jobNumber}</p>
                      <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                        {prettyEnum(h.status)} · Received {formatUtcDateTime(h.receivedAt)}
                        {h.completedAt ? ` · Completed ${formatUtcDateTime(h.completedAt)}` : ""}
                      </p>
                    </div>
                    <span className="rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                      Open
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {active === "client" && role !== "TECHNICIAN_EXTERNAL" ? (
        <div className={panelShellClass}>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Client Snapshot</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">Name</p>
              <p className="mt-1 text-sm font-medium text-[var(--ink)]">{job.client?.fullName ?? "-"}</p>
            </div>
            <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">Phone</p>
              <p className="mt-1 text-sm font-medium text-[var(--ink)]">{job.client?.phone ?? "-"}</p>
            </div>
            <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">Email</p>
              <p className="mt-1 text-sm font-medium text-[var(--ink)]">{job.client?.email ?? "-"}</p>
            </div>
          </div>
        </div>
      ) : null}

      {active === "diagnosis" ? (
        <div className="space-y-4">
          <form
            action={(formData) => {
              formData.set("jobId", job.id);
              formData.set("expectedUpdatedAt", expectedUpdatedAt);
              startDiagnosisTransition(async () => {
                const res = await updateJobAction(formData);
                if (res.error) {
                  toast.error(res.error);
                  return;
                }
                toast.success("Diagnosis updated");
                setSavedSection("diagnosis");
                router.refresh();
              });
            }}
            className={`${panelShellClass} space-y-3 [&_*]:min-w-0`}
          >
            {canAssignJobs && technicians.length > 0 ? (
              <div className={softSectionClass}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Assignment</p>
                    <p className="mt-1 text-xs text-[var(--ink-muted)]">Choose the technician responsible for this job.</p>
                  </div>
                </div>
                {showOneTimeForm || oneTimeExternal ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="min-w-0 sm:col-span-2">
                      <div className="flex items-center gap-2">
                        <label htmlFor="assignedToId" className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">
                          Assignment
                        </label>
                        {!oneTimeExternal && (
                          <button
                            type="button"
                            onClick={() => setShowOneTimeForm(false)}
                            className="text-[10px] text-[var(--accent)] underline"
                          >
                            ← Back to list
                          </button>
                        )}
                      </div>
                      <select
                        id="assignedToId"
                        name="assignedToId"
                        value="__one_time__"
                        className={fieldClass}
                        onChange={(e) => {
                          if (e.target.value === "__one_time__") {
                            setShowOneTimeForm(true);
                          } else {
                            setShowOneTimeForm(false);
                          }
                        }}
                      >
                        <option value="">Unassigned</option>
                        {technicians
                          .filter((technician) => !isSoftwareJob || technician.role !== "TECHNICIAN_EXTERNAL")
                          .map((technician) => (
                            <option key={technician.id} value={technician.id}>
                              {technician.name} ({technician.role === "TECHNICIAN_EXTERNAL" ? "External" : "Internal"})
                            </option>
                          ))}
                        <option value="__one_time__">One-Time External...</option>
                      </select>
                    </div>
                    <div className="min-w-0">
                      <p className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">Repair path</p>
                      <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)]">
                        <span className="font-medium">{derivedRepairPath}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="min-w-0">
                      <label htmlFor="assignedToId" className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">
                        Assigned Technician
                      </label>
                      <select
                        id="assignedToId"
                        name="assignedToId"
                        defaultValue={job.assignedTo?.id ?? ""}
                        className={fieldClass}
                        onChange={(e) => {
                          if (e.target.value === "__one_time__") {
                            setShowOneTimeForm(true);
                          }
                        }}
                      >
                        <option value="">Unassigned</option>
                        {technicians
                          .filter((technician) => !isSoftwareJob || technician.role !== "TECHNICIAN_EXTERNAL")
                          .map((technician) => (
                            <option key={technician.id} value={technician.id}>
                              {technician.name} ({technician.role === "TECHNICIAN_EXTERNAL" ? "External" : "Internal"})
                            </option>
                          ))}
                        <option value="__one_time__">One-Time External...</option>
                      </select>
                    </div>
                    <div className="min-w-0">
                      <p className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">Repair path</p>
                      <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)]">
                        <span className="font-medium">{derivedRepairPath}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {role !== "TECHNICIAN_EXTERNAL" && diagnosisMode !== "external" ? (
              <textarea
                name="diagnosisNotes"
                defaultValue={job.diagnosisNotes ?? ""}
                placeholder="Internal diagnosis notes"
                className={areaClass}
              />
            ) : null}
            {diagnosisMode !== "internal" ? (
              <textarea
                name="externalDiagnosis"
                defaultValue={job.externalDiagnosis ?? ""}
                placeholder="External diagnosis"
                className={areaClass}
              />
            ) : null}
            {diagnosisMode === "internal" ? (
              <p className="text-xs text-[var(--ink-muted)]">External diagnosis is hidden for internal technician flow.</p>
            ) : null}
            <textarea
              name="partsNeeded"
              defaultValue={job.partsNeeded ?? ""}
              placeholder="Parts needed"
              readOnly={isTerminal}
              className={areaClass}
            />

            <button
              disabled={isTerminal || !can.editDiagnosis(permissionUser) || isDiagnosisPending}
              className="btn-premium w-full rounded-lg px-3 py-1.5 text-[13px] disabled:opacity-60 sm:w-auto sm:py-2 sm:text-sm"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              disabled={isDiagnosisPending}
              className="btn-premium-secondary w-full rounded-lg px-3 py-1.5 text-[13px] disabled:opacity-60 sm:w-auto sm:py-2 sm:text-sm"
            >
              Cancel
            </button>
            {savedSection === "diagnosis" ? <p className="text-xs text-[var(--accent)]">Saved</p> : null}
          </form>

          {showOneTimeExternalPanel ? (
            <form
              action={(formData) => {
                formData.set("jobId", job.id);
                formData.set("expectedUpdatedAt", expectedUpdatedAt);
                startOneTimeExternalTransition(async () => {
                  const res = await updateOneTimeExternalAssignmentAction(formData);
                  if (res.error) {
                    toast.error(res.error);
                    return;
                  }
                  toast.success("One-time external technician saved");
                  setSavedSection("oneTimeExternal");
                  router.refresh();
                });
              }}
              className={`${panelShellClass} space-y-3 [&_*]:min-w-0`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">One-Time External Technician</p>
                  <p className="mt-1 text-xs text-[var(--ink-muted)]">
                    Use this when outsourcing a specific job without creating a technician login. Updates are captured internally.
                  </p>
                </div>
                <div className="shrink-0">
                  <select
                    name="outsourcingStatus"
                    defaultValue={oneTimeStatusOptions.some((o) => o.value === job.status) ? job.status : "PENDING_EXTERNAL_ASSIGNMENT"}
                    className={fieldClass}
                  >
                    {oneTimeStatusOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">Technician name</label>
                  <input name="technicianName" required defaultValue={oneTimeExternal?.technicianName ?? ""} className={fieldClass} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">Phone</label>
                  <input name="phone" required defaultValue={oneTimeExternal?.phone ?? ""} className={fieldClass} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">Specialization</label>
                  <input name="specialization" defaultValue={oneTimeExternal?.specialization ?? ""} className={fieldClass} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">Agreed repair cost</label>
                  <input name="agreedRepairCost" inputMode="decimal" defaultValue={oneTimeExternal?.agreedRepairCost ?? ""} className={fieldClass} />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">Parts involved / expected parts cost</label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input name="partsNotes" placeholder="Parts notes" defaultValue={oneTimeExternal?.partsNotes ?? ""} className={fieldClass} />
                    <input
                      name="expectedPartsCost"
                      inputMode="decimal"
                      placeholder="Expected parts cost"
                      defaultValue={oneTimeExternal?.expectedPartsCost ?? ""}
                      className={fieldClass}
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">Date assigned</label>
                  <input type="date" name="assignedDate" required defaultValue={dateInputValue(oneTimeExternal?.assignedAt ?? new Date())} className={fieldClass} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">Expected return date</label>
                  <input type="date" name="expectedReturnDate" defaultValue={dateInputValue(oneTimeExternal?.expectedReturnAt)} className={fieldClass} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">Returned / handover date</label>
                  <input type="date" name="returnedDate" defaultValue={dateInputValue(oneTimeExternal?.returnedAt)} className={fieldClass} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">Progress notes</label>
                  <input name="progressNotes" defaultValue={oneTimeExternal?.progressNotes ?? ""} className={fieldClass} />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">Notes / diagnosis / work instructions</label>
                  <textarea name="instructions" defaultValue={oneTimeExternal?.instructions ?? ""} className={areaClass} />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">Final outcome</label>
                  <textarea name="finalOutcome" defaultValue={oneTimeExternal?.finalOutcome ?? ""} className={areaClass} />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={isOneTimeExternalPending}
                  className="btn-premium w-full rounded-lg px-3 py-1.5 text-[13px] disabled:opacity-60 sm:w-auto sm:py-2 sm:text-sm"
                >
                  {oneTimeExternal ? "Update" : "Assign"}
                </button>
                {oneTimeExternal && (
                  <button
                    type="button"
                    onClick={() => setShowOneTimeForm(false)}
                    disabled={isOneTimeExternalPending}
                    className="btn-premium-secondary w-full rounded-lg px-3 py-1.5 text-[13px] disabled:opacity-60 sm:w-auto sm:py-2 sm:text-sm"
                  >
                    Cancel
                  </button>
                )}
                {savedSection === "oneTimeExternal" ? <p className="text-xs text-[var(--accent)]">Saved</p> : null}
              </div>
            </form>
          ) : null}
        </div>
      ) : null}

      {active === "repair" ? (
        <form
          action={(formData) => {
            formData.set("jobId", job.id);
            formData.set("expectedUpdatedAt", expectedUpdatedAt);
            startRepairTransition(async () => {
              const res = await updateJobAction(formData);
              if (res.error) {
                toast.error(res.error);
                return;
              }
              toast.success("Repair log updated");
              setSavedSection("repair");
              router.refresh();
            });
          }}
          className={`${panelShellClass} space-y-3 [&_*]:min-w-0`}
        >
          <textarea name="workDone" readOnly={isTerminal} defaultValue={job.workDone ?? ""} placeholder="Work done" className={areaClass} />
          <textarea name="partsReplaced" readOnly={isTerminal} defaultValue={job.partsReplaced ?? ""} placeholder="Parts replaced" className={areaClass} />
          <div className="flex flex-wrap items-center gap-2">
            <button disabled={isTerminal || isRepairPending} className="btn-premium w-full rounded-lg px-3 py-1.5 text-[13px] sm:w-auto sm:py-2 sm:text-sm">Save</button>
            <button type="button" onClick={() => setActive("overview")} disabled={isRepairPending} className="btn-premium-secondary w-full rounded-lg px-3 py-1.5 text-[13px] sm:w-auto sm:py-2 sm:text-sm">Cancel</button>
            {savedSection === "repair" ? <p className="text-xs text-[var(--accent)]">Saved</p> : null}
          </div>
        </form>
      ) : null}

      {active === "financials" && canViewFinancials ? (
        <form
          action={(formData) => {
            formData.set("jobId", job.id);
            formData.set("expectedUpdatedAt", expectedUpdatedAt);
            startFinancialTransition(async () => {
              const res = await updateJobAction(formData);
              if (res.error) {
                toast.error(res.error);
                return;
              }
              toast.success("Financials updated");
              setSavedSection("financials");
              router.refresh();
            });
          }}
          className={`${panelShellClass} space-y-3 [&_*]:min-w-0`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Billing</p>
          <input
            name="externalTechBill"
            type="number"
            step="0.01"
            defaultValue={job.externalTechBill ?? undefined}
            placeholder={repairCostLabel}
            className={fieldClass}
          />
          {!canManageFinancials ? (
            <p className="text-xs text-[var(--ink-muted)]">
              Client billing and payout controls are admin-only.
            </p>
          ) : null}
          {canManageFinancials ? (
            <input
              name="clientBill"
              type="number"
              step="0.01"
              defaultValue={job.clientBill ?? undefined}
              placeholder="Our bill to client"
              className={fieldClass}
            />
          ) : null}
          {canManageFinancials ? (
            <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
              <input
                type="checkbox"
                name="vatApplicable"
                value="true"
                defaultChecked={vatApplicable}
              />
              <input type="hidden" name="vatApplicable" value="false" />
              VAT applicable (18%)
            </label>
          ) : null}
          {canManageFinancials ? (
            <p className="text-xs text-[var(--ink-muted)]">
              Repair cost: {formatBillAmount(repairCostBeforeVat)} | VAT: {formatBillAmount(vatAmount)} | Total: {formatBillAmount(clientBillValue)}
            </p>
          ) : null}
          {canManageFinancials ? (
              <p className={`text-xs [overflow-wrap:anywhere] ${existingMargin !== null && existingMargin >= 0 ? "text-[var(--accent)]" : "text-black"}`}>
                Repair margin: {existingMargin === null ? "Set external tech bill and client bill" : `${existingMargin >= 0 ? "+" : ""}${formatBillAmount(existingMargin)}`}
              </p>
          ) : null}
          {hasPayoutControls ? (
            <div className={softSectionClass}>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">External Technician Payout</p>
              <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-[var(--ink-muted)]">Payout status</p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${job.externalPaid ? "bg-[var(--accent)] text-white" : "bg-[var(--accent)]/20 text-[var(--accent)]"}`}>
                    {job.externalPaid ? "Paid" : "Not paid"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">
                  External bill: {typeof job.externalTechBill === "number" ? formatBillAmount(job.externalTechBill) : "-"}
                  {" | "}
                  Payout amount: {typeof job.externalTechFee === "number" ? formatBillAmount(job.externalTechFee) : "-"}
                </p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">
                  {job.externalPaidAt ? `Paid on ${formatUtcDateTime(job.externalPaidAt)}` : "Awaiting payout confirmation"}
                </p>
              </div>
              <input
                name="externalTechFee"
                type="number"
                step="0.01"
                defaultValue={job.externalTechFee ?? undefined}
                placeholder="Amount to pay technician"
                className={fieldClass}
              />
              <input
                name="externalPaymentRef"
                defaultValue={job.externalPaymentRef ?? ""}
                placeholder="Payment reference (optional)"
                className={fieldClass}
              />
              <p className={`text-xs ${job.externalPaid ? "text-[var(--accent)]" : "text-[var(--accent)]"}`}>
                {job.externalPaidAt
                  ? `Paid on ${formatUtcDateTime(job.externalPaidAt)}`
                  : "Not yet marked as paid"}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={isFinancialPending || (isTerminal && !canManageFinancials)}
                  className="btn-premium w-full rounded-lg px-3 py-1.5 text-[13px] disabled:opacity-60 sm:w-auto sm:py-2 sm:text-sm"
                >
                  Save Billing
                </button>
                <button
                  type="button"
                  onClick={() => setActive("overview")}
                  disabled={isFinancialPending}
                  className="btn-premium-secondary w-full rounded-lg px-3 py-1.5 text-[13px] disabled:opacity-60 sm:w-auto sm:py-2 sm:text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  name="externalPaid"
                  value="true"
                  disabled={isFinancialPending || job.externalPaid === true}
                  className="btn-premium-success w-full rounded-lg px-3 py-1.5 text-[13px] disabled:opacity-60 sm:w-auto sm:py-2 sm:text-sm"
                >
                  Mark Paid
                </button>
                <button
                  type="submit"
                  name="externalPaid"
                  value="false"
                  disabled={isFinancialPending || job.externalPaid === false}
                  className="btn-premium-warning w-full rounded-lg px-3 py-1.5 text-[13px] disabled:opacity-60 sm:w-auto sm:py-2 sm:text-sm"
                >
                  Mark Unpaid
                </button>
              </div>
            </div>
          ) : null}
          {!hasPayoutControls && job.repairPath === "EXTERNAL" ? (
            <div className={softSectionClass}>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">External Technician Payout</p>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">
                You can view financial summaries, but payout controls require finance authorization.
              </p>
            </div>
          ) : null}
          {job.repairPath !== "EXTERNAL" ? (
            <div className={softSectionClass}>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">External Technician Payout</p>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">
                Payout controls appear only when this job is set to external repair.
              </p>
            </div>
          ) : null}
          {!hasPayoutControls ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                disabled={isFinancialPending || (isTerminal && !canManageFinancials)}
                className="btn-premium w-full rounded-lg px-3 py-1.5 text-[13px] disabled:opacity-60 sm:w-auto sm:py-2 sm:text-sm"
              >
                Save Billing
              </button>
              <button
                type="button"
                onClick={() => setActive("overview")}
                disabled={isFinancialPending}
                className="btn-premium-secondary w-full rounded-lg px-3 py-1.5 text-[13px] disabled:opacity-60 sm:w-auto sm:py-2 sm:text-sm"
              >
                Cancel
              </button>
            </div>
          ) : null}
          {savedSection === "financials" ? <p className="text-xs text-[var(--accent)]">Saved</p> : null}
        </form>
      ) : null}

      {active === "timeline" && ["ADMIN", "OPS", "FRONT_DESK"].includes(role) ? (
        <div className={panelShellClass}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Timeline Activity</p>

          {canUpdateClientCommunication ? (
            <form
              action={(formData) => {
                formData.set("jobId", job.id);
                formData.set("expectedUpdatedAt", expectedUpdatedAt);
                startCommunicationTransition(async () => {
                  const res = await updateJobAction(formData);
                  if (res.error) {
                    toast.error(res.error);
                    return;
                  }
                  toast.success("Workflow updated");
                  setSavedSection("workflow");
                  router.refresh();
                });
              }}
              className={`mb-4 space-y-2 ${softSectionClass} [&_*]:min-w-0`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Client Approval & Workflow</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">Client decision</label>
                  <select name="communicationStatus" defaultValue={job.communicationStatus ?? "NONE"} className={fieldClass}>
                    <option value="NONE">No update yet</option>
                    <option value="AWAITING_RESPONSE">Awaiting response</option>
                    <option value="APPROVED">Approved</option>
                    <option value="DECLINED">Declined</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">Recommendation</label>
                  <select name="recommendationOption" defaultValue={job.recommendationOption ?? ""} className={fieldClass}>
                    <option value="">Not set</option>
                    <option value="PROCEED_REPAIR">Proceed with repair</option>
                    <option value="REPLACE_DEVICE">Replace device</option>
                    <option value="RETURN_UNREPAIRED">Return unrepaired</option>
                  </select>
                </div>
              </div>

              <textarea
                name="clientConversationNote"
                defaultValue={job.clientConversationNote ?? ""}
                placeholder="Client communication note"
                className="min-h-20 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none transition focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14"
              />

              {job.lastClientContactAt ? (
                <p className="text-xs text-[var(--ink-muted)]">Last client contact: {formatUtcDateTime(job.lastClientContactAt)}</p>
              ) : (
                <p className="text-xs text-[var(--ink-muted)]">Last client contact: Not recorded</p>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">Workflow reason</label>
                  <select name="workflowReason" defaultValue={job.workflowReason ?? "NONE"} className={fieldClass}>
                    <option value="NONE">No specific reason</option>
                    <option value="PARTS_PENDING">Parts pending</option>
                    <option value="SPECIALIST_ESCALATION">Specialist escalation</option>
                    <option value="CLIENT_DECLINED">Client declined</option>
                    <option value="UNREPAIRABLE">Unrepairable</option>
                    <option value="CUSTOMER_CANCELLED">Customer cancelled</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">ETA</label>
                  <input name="repairTimeline" defaultValue={job.repairTimeline ?? ""} placeholder="e.g. 2-3 days" className={fieldClass} />
                </div>
              </div>

              <textarea
                name="statusNote"
                defaultValue={job.statusNote ?? ""}
                placeholder="Workflow note (optional)"
                className="min-h-20 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none transition focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14"
              />

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={isCommunicationPending}
                  className="btn-premium w-full rounded-lg px-3 py-1.5 text-[13px] disabled:opacity-60 sm:w-auto sm:py-2 sm:text-sm"
                >
                  Save Workflow
                </button>
                <button
                  type="button"
                  onClick={() => setActive("overview")}
                  disabled={isCommunicationPending}
                  className="btn-premium-secondary w-full rounded-lg px-3 py-1.5 text-[13px] disabled:opacity-60 sm:w-auto sm:py-2 sm:text-sm"
                >
                  Cancel
                </button>
                {savedSection === "workflow" ? <p className="text-xs text-[var(--accent)]">Saved</p> : null}
              </div>
            </form>
          ) : null}

          <AuditTimeline items={job.auditLogs} />
        </div>
      ) : null}

      {active === "photos" ? (
        <div className={panelShellClass}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Photo Evidence</p>
          <PhotoUploader jobId={job.id} photos={job.photos} canDelete={role === "ADMIN"} />
        </div>
      ) : null}

      {active === "messages" && ["ADMIN", "OPS", "FRONT_DESK"].includes(role) ? (
        <MessagesTab
          jobId={job.id}
          clientPhone={job.client?.phone ?? null}
          canSendQuote={canGenerateQuotation && !isIntake}
          inbound={inboundMessages}
          outbound={outboundMessages}
        />
      ) : null}

      {statusActions.length > 0 && !isTerminal && !isIntake ? (
        <form
          action={(formData) => {
            formData.set("jobId", job.id);
            formData.set("expectedUpdatedAt", expectedUpdatedAt);
            startStatusTransition(async () => {
              const res = await updateJobAction(formData);
              if (res.error) {
                toast.error(res.error);
                return;
              }
              toast.success("Status updated");
              setSavedSection("status");
              router.refresh();
            });
          }}
          className={`${panelShellClass} flex flex-wrap gap-2 [&_*]:min-w-0 mb-24 lg:mb-0`}
        >
          {job.workflowReason && job.workflowReason !== "NONE" ? (
            <p className="w-full text-xs text-[var(--ink-muted)]">
              Current reason: {job.workflowReason.replaceAll("_", " ")}
              {job.statusNote ? ` | Note: ${job.statusNote}` : ""}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 w-full">
            {statusActions.map((status) => (
              <button
                key={status}
                type="submit"
                name="nextStatus"
                value={status}
                disabled={isStatusPending}
                onClick={(event) => {
                  if (
                    status === "CLOSED" &&
                    !window.confirm("Close this job? This will mark it as non-repairable/declined.")
                  ) {
                    event.preventDefault();
                  }
                }}
                className="btn-premium-dark rounded-lg px-3 py-1.5 text-[13px]"
              >
                Set {prettyEnum(status)}
              </button>
            ))}
          </div>
          {job.status === "READY_FOR_PICKUP" ? (
            <div className="w-full border-t border-[var(--line)] pt-3 mt-2">
              <p className="text-xs font-medium text-[var(--ink)] mb-2">Delivery (Optional)</p>
              <div className="flex flex-wrap gap-2 items-center">
                <select
                  name="deliveryMethod"
                  className="rounded-md border border-[var(--line)] px-2 py-1.5 text-sm bg-[var(--panel)]"
                >
                  <option value="">Method</option>
                  <option value="PICKUP">Client Pickup</option>
                  <option value="DELIVERY">We Delivered</option>
                  <option value="COURIER">Courier</option>
                </select>
                <input
                  type="text"
                  name="deliveredTo"
                  placeholder="Received by (name)"
                  className="rounded-lg border border-[var(--line)] px-2 py-1.5 text-sm bg-[var(--panel)] flex-1 min-w-[120px]"
                />
              </div>
            </div>
          ) : null}
          {savedSection === "status" ? <p className="text-xs text-[var(--accent)]">Saved</p> : null}
        </form>
      ) : null}

      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--mobile-shell-bottom)+0.2rem)] z-30 px-3 lg:hidden">
        <div className="pointer-events-auto mx-auto flex max-w-lg items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--panel)]/96 p-2 shadow-[0_8px_32px_rgba(0,0,0,0.14)] backdrop-blur-md">
          {mobilePrimaryAction ? (
            mobilePrimaryAction.type === "link" ? (
              <a
                href={mobilePrimaryAction.href}
                target="_blank"
                rel="noreferrer"
                className="btn-premium flex-1 rounded-xl px-4 py-2.5 text-center text-sm font-bold"
              >
                {mobilePrimaryAction.label}
              </a>
            ) : (
              <button
                type="button"
                onClick={() => setActive(mobilePrimaryAction.tab)}
                className="btn-premium flex-1 rounded-xl px-4 py-2.5 text-sm font-bold"
              >
                {mobilePrimaryAction.label}
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={() => setActive("overview")}
              className="btn-premium-secondary flex-1 rounded-xl px-4 py-2.5 text-sm"
            >
              Open Details
            </button>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setMobileMoreOpen((v) => !v)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] transition hover:border-[var(--accent)]/30 hover:text-[var(--ink)]"
              aria-label="More actions"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
              </svg>
            </button>
            {mobileMoreOpen ? (
              <div className="absolute bottom-14 right-0 w-52 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] shadow-[0_8px_40px_rgba(0,0,0,0.18)]">
                {role !== "TECHNICIAN_EXTERNAL" ? (
                  <button type="button" onClick={() => { setMobileMoreOpen(false); router.push(`/jobs/${job.id}/edit`); }} className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--panel-strong)]">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit Job
                  </button>
                ) : null}
                <div className="mx-3 my-1 border-t border-[var(--line)]" />
                <button type="button" onClick={() => { setMobileMoreOpen(false); setActive("diagnosis"); }} className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--panel-strong)]">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  Diagnosis
                </button>
                <button type="button" onClick={() => { setMobileMoreOpen(false); setActive("repair"); }} className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--panel-strong)]">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                  Repair Log
                </button>
                {canViewFinancials ? (
                  <button type="button" onClick={() => { setMobileMoreOpen(false); setActive("financials"); }} className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--panel-strong)]">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    Financials
                  </button>
                ) : null}
                {showJobCardAction || showQuotationAction || showInvoiceAction ? (
                  <div className="mx-3 my-1 border-t border-[var(--line)]" />
                ) : null}
                {showJobCardAction ? (
                  <a href={`/api/jobs/${job.id}/job-card`} target="_blank" rel="noreferrer" className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--panel-strong)]">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    Print Job Card
                  </a>
                ) : null}
                {showQuotationAction ? (
                  <a href={`/api/jobs/${job.id}/quotation`} target="_blank" rel="noreferrer" className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--panel-strong)]">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                    Download Quote
                  </a>
                ) : null}
                {showInvoiceAction ? (
                  <a href={`/api/jobs/${job.id}/invoice`} target="_blank" rel="noreferrer" className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--panel-strong)]">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                    Download Invoice
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
