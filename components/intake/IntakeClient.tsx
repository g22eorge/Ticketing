"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RepairRequest, RepairRequestStatus } from "@prisma/client";
import { toast } from "sonner";

import {
  deleteRepairRequestAction,
  listRepairRequestsAction,
  setRepairRequestStatusAction,
  updateRepairRequestDetailsAction,
} from "@/app/(app)/intake/actions";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

/* ── helpers ── */
const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING_INTAKE:       { label: "Pending",       cls: "bg-[var(--panel-strong)] text-[var(--ink)]" },
  PENDING_FRONT_DESK:   { label: "Pending",       cls: "bg-[var(--panel-strong)] text-[var(--ink)]" },
  APPROVED:         { label: "Approved",       cls: "bg-[var(--accent)] text-white" },
  REJECTED:         { label: "Rejected",       cls: "bg-[#0b0b0b] text-white/90 border border-white/10" },
  CONVERTED_TO_JOB: { label: "Converted",     cls: "bg-[#0b0b0b] text-white/90 border border-white/10" },
};

const HANDOVER_LABEL: Record<string, string> = {
  SELF_DROPOFF:              "Drop-off",
  SEND_WITH_DELIVERY_PERSON: "Delivery",
  REQUEST_PICKUP:            "Pickup",
};

const DEVICE_LABEL: Record<string, string> = {
  PHONE_ANDROID: "Android Phone",
  PHONE_IPHONE:  "iPhone",
  TABLET:        "Tablet",
  WINDOWS_PC:    "Windows PC / Laptop",
  MAC:           "Mac",
  OTHER:         "Other",
};

function fmt(d: Date | string) {
  return new Date(d).toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" });
}

/* ── status badge ── */
function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, cls: "bg-[var(--panel-strong)] text-[var(--ink-muted)]" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

/* ── detail row ── */
function DRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 text-sm py-1.5 border-b border-[var(--line)] last:border-0">
      <span className="w-40 shrink-0 text-[var(--ink-muted)] font-medium">{label}</span>
      <span className="text-[var(--ink)] break-words min-w-0">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--ink-muted)] mb-2">{title}</p>
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-1">{children}</div>
    </div>
  );
}

/* ── action button ── */
function ActionBtn({
  label, icon, className, onClick, disabled,
}: {
  label: string; icon: React.ReactNode; className: string;
  onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >
      {icon}{label}
    </button>
  );
}

/* ── drawer ── */
function RequestDrawer({
  req,
  onClose,
  onStatusChange,
  onRequestUpdate,
  canManageIntake,
  isAdmin,
  defaultEditMode,
}: {
  req: RepairRequest;
  onClose: () => void;
  onStatusChange: (id: string, status: string) => void;
  onRequestUpdate: (updated: RepairRequest) => void;
  canManageIntake: boolean;
  isAdmin: boolean;
  defaultEditMode: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [localStatus, setLocalStatus] = useState(req.requestStatus);
  const [editMode, setEditMode] = useState(defaultEditMode);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const router = useRouter();

  function act(status: string) {
    startTransition(async () => {
      const res = await setRepairRequestStatusAction({ id: req.id, status: status as RepairRequestStatus });
      if (res && "error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if (res && "jobId" in res && res.jobId) {
        router.push(`/jobs/${res.jobId}`);
        return;
      }
      if (res && "requestStatus" in res && res.requestStatus) {
        setLocalStatus(res.requestStatus as RepairRequestStatus);
        onStatusChange(req.id, res.requestStatus);
      }
    });
  }

  function saveEdits(formData: FormData) {
    formData.set("id", req.id);
    startTransition(async () => {
      const res = await updateRepairRequestDetailsAction(formData);
      if (res && "error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if (res && "success" in res && res.success) {
        onRequestUpdate(res.request);
        setEditMode(false);
        toast.success("Request updated");
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", req.id);
      const res = await deleteRepairRequestAction(fd);
      if (res && "error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if (res && "success" in res && res.success) {
        onStatusChange(req.id, "__deleted__");
        onClose();
        toast.success("Request deleted");
      }
    });
  }

  const isPending   = localStatus === "PENDING_FRONT_DESK" || localStatus === "PENDING_INTAKE";
  const isApproved  = localStatus === "APPROVED";
  const isConverted = localStatus === "CONVERTED_TO_JOB";
  const isRejected  = localStatus === "REJECTED";

  return (
    <>
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${req.requestNumber}?`}
        description="This repair request will be permanently removed. This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => { setConfirmDelete(false); remove(); }}
      />
      {/* backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm" onClick={onClose} />

      {/* drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-[var(--panel)] shadow-2xl z-50 flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--line)] bg-[var(--panel)]">
          <div>
            <p className="text-[11px] font-bold tracking-widest uppercase text-[var(--ink-muted)]">Repair Request</p>
            <h2 className="text-lg font-bold text-[var(--ink)]">{req.requestNumber}</h2>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={localStatus} />
            {canManageIntake ? (
              <button
                type="button"
                onClick={() => setEditMode((v) => !v)}
                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] hover:border-[var(--accent)]/40 transition-colors"
              >
                {editMode ? "Done" : "Edit"}
              </button>
            ) : null}
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
              >
                Delete
              </button>
            ) : null}
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-[var(--ink-muted)] hover:bg-[var(--panel-strong)] hover:text-[var(--ink)] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        {/* converted — open job banner */}
        {isConverted && req.linkedJobId && (
          <div className="px-6 py-3 border-b border-[var(--line)] bg-[var(--panel-strong)] flex items-center justify-between gap-3">
            <p className="text-xs text-[var(--ink)] font-medium">This request was converted to a job.</p>
            <a
              href={`/jobs/${req.linkedJobId}`}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              Open Job
            </a>
          </div>
        )}

        {/* actions bar */}
        {canManageIntake && !isConverted && !isRejected && (
          <div className="px-6 py-3 border-b border-[var(--line)] bg-[var(--panel)] flex items-center gap-2 flex-wrap">
            {isPending && (
              <>
                <ActionBtn
                  label="Approve"
                  disabled={pending}
                  className="bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
                  onClick={() => act("APPROVED")}
                  icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
                />
                <ActionBtn
                  label="Reject"
                  disabled={pending}
                  className="bg-black text-white border border-black hover:bg-black/80"
                  onClick={() => act("REJECTED")}
                  icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>}
                />
              </>
            )}
            {isApproved && (
              <ActionBtn
                label="Convert to Job"
                disabled={pending}
                className="bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
                onClick={() => act("CONVERTED_TO_JOB")}
                icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>}
              />
            )}
            {pending && (
              <span className="text-xs text-[var(--ink-muted)] ml-1">Saving…</span>
            )}
          </div>
        )}

        {/* body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {editMode && canManageIntake ? (
            <form action={saveEdits} className="mb-6 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 panel-shadow">
              <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--ink-muted)] mb-3">Edit Request</p>
              <div className="grid grid-cols-1 gap-3">
                <input
                  name="customerName"
                  defaultValue={req.customerName}
                  className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
                  placeholder="Customer name"
                />
                <input
                  name="phone"
                  defaultValue={req.phone}
                  className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
                  placeholder="Phone"
                />
                <input
                  name="email"
                  defaultValue={req.email ?? ""}
                  className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
                  placeholder="Email"
                />
                <input
                  name="brand"
                  defaultValue={req.brand}
                  className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
                  placeholder="Brand"
                />
                <input
                  name="model"
                  defaultValue={req.model ?? ""}
                  className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
                  placeholder="Model"
                />
                <input
                  name="serialNumber"
                  defaultValue={req.serialNumber ?? ""}
                  className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
                  placeholder="Serial / IMEI"
                />
                <textarea
                  name="problemDescription"
                  defaultValue={req.problemDescription}
                  className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
                  placeholder="Problem description"
                  rows={4}
                />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg px-3 py-2 text-xs font-semibold bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-40"
                >
                  Save
                </button>
                {pending ? <span className="text-xs text-[var(--ink-muted)]">Saving…</span> : null}
              </div>
            </form>
          ) : null}

          <Section title="Customer">
            <DRow label="Name"              value={req.customerName} />
            <DRow label="Phone"             value={req.phone} />
            <DRow label="Email"             value={req.email} />
            <DRow label="Preferred Contact" value={req.preferredContactMethod} />
          </Section>

          <Section title="Device">
            <DRow label="Type"          value={DEVICE_LABEL[req.deviceType] ?? req.deviceType} />
            <DRow label="Brand"         value={req.brand} />
            <DRow label="Model"         value={req.model || "—"} />
            <DRow label="Serial Number" value={req.serialNumber} />
          </Section>

          <Section title="Issue">
            <div className="py-2 text-sm text-[var(--ink)] whitespace-pre-wrap">{req.problemDescription}</div>
          </Section>

          <Section title="Handover">
            <DRow label="Method" value={HANDOVER_LABEL[req.handoverMethod] ?? req.handoverMethod} />
            {req.handoverMethod === "SELF_DROPOFF" && (
              <>
                <DRow label="Preferred Date" value={req.preferredDropoffDate} />
                <DRow label="Preferred Time" value={req.preferredDropoffTime} />
                <DRow label="Notes"          value={req.dropoffNotes} />
              </>
            )}
            {req.handoverMethod === "SEND_WITH_DELIVERY_PERSON" && (
              <>
                <DRow label="Delivery Person"    value={req.deliveryPersonName} />
                <DRow label="Delivery Phone"     value={req.deliveryPersonPhone} />
                <DRow label="Courier Company"    value={req.deliveryCompany} />
                <DRow label="Dispatch Date"      value={req.dispatchDate} />
                <DRow label="Expected Arrival"   value={req.expectedArrivalTime} />
                <DRow label="Tracking Ref"       value={req.deliveryTrackingReference} />
                <DRow label="Fee Responsibility" value={req.deliveryFeeResponsibility} />
                <DRow label="Notes"              value={req.deliveryNotes} />
              </>
            )}
            {req.handoverMethod === "REQUEST_PICKUP" && (
              <>
                <DRow label="Address"        value={req.pickupAddress} />
                <DRow label="Landmark"       value={req.pickupLandmark} />
                <DRow label="Preferred Date" value={req.preferredPickupDate} />
                <DRow label="Preferred Time" value={req.preferredPickupTime} />
                <DRow label="Alt. Contact"   value={req.alternateContactPerson} />
                <DRow label="Alt. Phone"     value={req.alternateContactPhone} />
                <DRow label="Pickup Notes"   value={req.pickupNotes} />
              </>
            )}
          </Section>

          <Section title="Meta">
            <DRow label="Submitted" value={fmt(req.createdAt)} />
            <DRow label="Request #" value={req.requestNumber} />
          </Section>
        </div>
      </div>
    </>
  );
}

/* ── inline row actions (table + card) ── */
function RowActions({
  req,
  onStatusChange,
  onEdit,
  onDelete,
  canManageIntake,
  isAdmin,
}: {
  req: RepairRequest;
  onStatusChange: (id: string, status: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  canManageIntake: boolean;
  isAdmin: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function act(status: string, e: React.MouseEvent) {
    e.stopPropagation();
    startTransition(async () => {
      const res = await setRepairRequestStatusAction({ id: req.id, status: status as RepairRequestStatus });
      if (res && "error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if (res && "jobId" in res && res.jobId) {
        router.push(`/jobs/${res.jobId}`);
        return;
      }
      if (res && "requestStatus" in res && res.requestStatus) {
        onStatusChange(req.id, res.requestStatus);
      }
    });
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
      {canManageIntake && (req.requestStatus === "PENDING_FRONT_DESK" || req.requestStatus === "PENDING_INTAKE") && (
        <>
          <button
            disabled={pending}
            onClick={(e) => act("APPROVED", e)}
            title="Approve"
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 hover:bg-[var(--accent)]/30 disabled:opacity-40 transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Approve
          </button>
          <button
            disabled={pending}
            onClick={(e) => act("REJECTED", e)}
            title="Reject"
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold bg-black text-white border border-black hover:bg-black/80 disabled:opacity-40 transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
            Reject
          </button>
        </>
      )}
      {canManageIntake && req.requestStatus === "APPROVED" && (
        <button
          disabled={pending}
          onClick={(e) => act("CONVERTED_TO_JOB", e)}
          title="Convert to Job"
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold bg-[var(--panel-strong)] text-[var(--ink-muted)] border border-[var(--line)] hover:bg-[var(--panel-strong)] disabled:opacity-40 transition-colors"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          Convert to Job
        </button>
      )}
      {req.requestStatus === "CONVERTED_TO_JOB" && req.linkedJobId && (
        <a
          href={`/jobs/${req.linkedJobId}`}
          onClick={(e) => e.stopPropagation()}
          title="Open Job"
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold bg-[var(--panel-strong)] text-[var(--ink-muted)] border border-[var(--line)] hover:bg-[var(--panel-strong)] transition-colors"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          Open Job
        </a>
      )}
      {canManageIntake ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          title="Edit"
          className="inline-flex items-center rounded-md p-1.5 text-[var(--ink-muted)] hover:bg-[var(--panel-strong)] hover:text-[var(--ink)] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
        </button>
      ) : null}
      {isAdmin ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete"
          className="inline-flex items-center rounded-md p-1.5 text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        </button>
      ) : null}
    </div>
  );
}

/* ── status strip colour per request status ── */
function requestStripClass(status: string): string {
  if (status === "PENDING_INTAKE" || status === "PENDING_FRONT_DESK") return "bg-amber-400";
  if (status === "APPROVED") return "bg-[var(--accent)]";
  if (status === "CONVERTED_TO_JOB") return "bg-emerald-400";
  if (status === "REJECTED") return "bg-slate-400";
  return "bg-slate-200";
}

/* ── mobile card — Jobs flat-row pattern ── */
function MobileCard({
  req,
  onSelect,
}: {
  req: RepairRequest;
  onStatusChange: (id: string, status: string) => void;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canManageIntake: boolean;
  isAdmin: boolean;
}) {
  const device = [req.brand, req.model].filter(Boolean).join(" ") || (DEVICE_LABEL[req.deviceType] ?? req.deviceType);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      className="relative border-b border-[var(--line)] bg-[var(--panel)] last:border-b-0 transition-colors hover:bg-[var(--panel-strong)]/40 active:bg-[var(--panel-strong)]/55 cursor-pointer"
    >
      <span className={`absolute inset-y-0 left-0 w-[5px] ${requestStripClass(req.requestStatus)}`} aria-hidden="true" />
      <div className="px-4 py-3 pl-6">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="mono text-[10px] font-medium tracking-wide text-[var(--ink-muted)]/50">{req.requestNumber}</span>
          <StatusBadge status={req.requestStatus} />
        </div>
        <p className="truncate text-[15px] font-bold leading-snug tracking-tight text-[var(--ink)]">{req.customerName}</p>
        <div className="mt-1 flex items-center gap-1 text-[11px] text-[var(--ink-muted)]">
          <span className="truncate font-medium">{device}</span>
          <span className="shrink-0 opacity-40">·</span>
          <span className="shrink-0">{HANDOVER_LABEL[req.handoverMethod] ?? req.handoverMethod}</span>
          <span className="shrink-0 opacity-40">·</span>
          <span className="shrink-0">{fmt(req.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-unused-vars */
/* ── main ── */
export function IntakeClient({
  initialRequests,
  pending,
  canManageIntake,
  isAdmin,
}: {
  initialRequests: RepairRequest[];
  pending: number;
  canManageIntake: boolean;
  isAdmin: boolean;
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [selected, setSelected]   = useState<RepairRequest | null>(null);
  const [filter, setFilter]       = useState<string>("ALL");
  const [loading, startLoading] = useTransition();
  const [drawerMode, setDrawerMode] = useState<"view" | "edit">("view");
  const [pendingDelete, setPendingDelete] = useState<RepairRequest | null>(null);

  function handleStatusChange(id: string, status: string) {
    if (status === "__deleted__") {
      setRequests((prev) => prev.filter((r) => r.id !== id));
      if (selected?.id === id) setSelected(null);
      return;
    }
    const s = status as RepairRequestStatus;
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, requestStatus: s } : r))
    );
    if (selected?.id === id) {
      setSelected((prev) => prev ? { ...prev, requestStatus: s } : null);
    }
  }

  function handleRequestUpdate(updated: RepairRequest) {
    setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    if (selected?.id === updated.id) setSelected(updated);
  }

  function deleteRequest(req: RepairRequest) {
    startLoading(async () => {
      const fd = new FormData();
      fd.set("id", req.id);
      const res = await deleteRepairRequestAction(fd);
      if (res && "error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if (res && "success" in res && res.success) {
        handleStatusChange(req.id, "__deleted__");
        toast.success("Request deleted");
      }
    });
  }

  function refresh() {
    startLoading(async () => {
      const res = await listRepairRequestsAction({ take: 200 });
      if (res && "error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if (res && "success" in res && res.success) {
        setRequests(res.requests);
        toast.success("Intake refreshed");
      }
    });
  }

  const counts = requests.reduce<Record<string, number>>((acc, r) => {
    acc[r.requestStatus] = (acc[r.requestStatus] ?? 0) + 1;
    return acc;
  }, {});

  const filtered = filter === "ALL" ? requests : requests.filter((r) => r.requestStatus === filter);

  const tabs = [
    { key: "ALL",              label: "All" },
    { key: "PENDING_FRONT_DESK",   label: "Pending" },
    { key: "PENDING_INTAKE",       label: "Pending (Legacy)" },
    { key: "APPROVED",         label: "Approved" },
    { key: "REJECTED",         label: "Rejected" },
    { key: "CONVERTED_TO_JOB", label: "Converted" },
  ];

  const pendingCount = (counts["PENDING_FRONT_DESK"] ?? 0) + (counts["PENDING_INTAKE"] ?? 0);
  const brief = filter !== "ALL"
    ? `Showing ${STATUS_META[filter]?.label ?? filter} requests. Tap a card or row to open the full detail and take action.`
    : pendingCount > 0
      ? `${pendingCount} request${pendingCount !== 1 ? "s" : ""} awaiting review. Approve to queue for conversion, reject to close, or convert an approved request directly to a job.`
      : "All incoming website repair requests appear here. Review each submission, approve or reject, then convert approved requests to jobs.";

  return (
    <>
      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete ${pendingDelete?.requestNumber ?? "request"}?`}
        description="This repair request will be permanently removed. This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteRequest(pendingDelete);
          setPendingDelete(null);
        }}
      />
      {/* brief */}
      <details className="panel-shadow mb-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3" open={pendingCount > 0}>
        <summary className="list-none">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Intake Brief</p>
            <span className="text-[11px] text-[var(--ink-muted)]">Expand</span>
          </div>
        </summary>
        <p className="mt-2 border-t border-[var(--line)] pt-2 text-xs text-[var(--ink-muted)] [overflow-wrap:anywhere]">{brief}</p>
      </details>

      {/* filter tabs */}
      <div className="mb-4 flex items-center gap-2">
        <div className="-mx-1 min-w-0 flex-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          <div className="flex w-max items-center gap-1.5">
        {tabs.map((tab) => {
          const count = tab.key === "ALL" ? requests.length : (counts[tab.key] ?? 0);
          const active = filter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors
                ${active
                  ? "bg-black text-white"
                  : "bg-[var(--panel)] border border-[var(--line)] text-[var(--ink-muted)] hover:bg-[var(--panel-strong)]"
                }`}
            >
              {tab.label}
              {count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${active ? "bg-white/20" : "bg-[var(--panel-strong)] text-[var(--ink-muted)]"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] hover:bg-[var(--panel)] disabled:opacity-40"
          aria-label="Refresh requests"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--line)] py-16 text-center text-[var(--ink-muted)] text-sm">
          No requests in this category.
        </div>
      ) : (
        <>
          {/* ── MOBILE CARD VIEW ── */}
          <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] panel-shadow lg:hidden">
            {filtered.map((req) => (
              <MobileCard
                key={req.id}
                req={req}
                onStatusChange={handleStatusChange}
                onSelect={() => {
                  setDrawerMode("view");
                  setSelected(req);
                }}
                onEdit={() => {
                  setDrawerMode("edit");
                  setSelected(req);
                }}
                onDelete={() => setPendingDelete(req)}
                canManageIntake={canManageIntake}
                isAdmin={isAdmin}
              />
            ))}
          </div>

          {/* ── DESKTOP TABLE VIEW ── */}
          <div className="hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden panel-shadow lg:block">
            <table className="min-w-full text-[13px]">
              <thead className="bg-[var(--panel-strong)]/50 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">
                <tr>
                  <th className="px-4 py-2.5">Request #</th>
                  <th className="px-4 py-2.5">Customer</th>
                  <th className="hidden px-4 py-2.5 md:table-cell">Device</th>
                  <th className="hidden px-4 py-2.5 lg:table-cell">Handover</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="hidden px-4 py-2.5 lg:table-cell">Date</th>
                  <th className="hidden px-4 py-2.5 text-right lg:table-cell">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {filtered.map((req) => (
                  <tr
                    key={req.id}
                    onClick={() => setSelected(req)}
                    className="cursor-pointer transition-colors hover:bg-[var(--panel-strong)]/40 group"
                  >
                    <td className="px-4 py-3 text-sm font-mono font-semibold text-[var(--ink)] whitespace-nowrap">
                      {req.requestNumber}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm font-medium text-[var(--ink)]">{req.customerName}</div>
                      <div className="text-xs text-[var(--ink-muted)] md:hidden">{req.phone}</div>
                    </td>
                    <td className="hidden px-4 py-3 whitespace-nowrap md:table-cell">
                      <div className="text-sm text-[var(--ink)]">{req.brand}{req.model && <span className="text-[var(--ink-muted)]"> {req.model}</span>}</div>
                      <div className="text-xs text-[var(--ink-muted)]">{DEVICE_LABEL[req.deviceType] ?? req.deviceType}</div>
                    </td>
                    <td className="hidden px-4 py-3 whitespace-nowrap lg:table-cell">
                      <span className="text-xs text-[var(--ink-muted)]">{HANDOVER_LABEL[req.handoverMethod] ?? req.handoverMethod}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={req.requestStatus} />
                    </td>
                    <td className="hidden px-4 py-3 whitespace-nowrap text-xs text-[var(--ink-muted)] lg:table-cell">
                      {fmt(req.createdAt)}
                    </td>
                    <td className="hidden px-4 py-3 whitespace-nowrap text-right lg:table-cell">
                      <RowActions
                        req={req}
                        onStatusChange={handleStatusChange}
                        onEdit={() => {
                          setDrawerMode("edit");
                          setSelected(req);
                        }}
                        onDelete={() => setPendingDelete(req)}
                        canManageIntake={canManageIntake}
                        isAdmin={isAdmin}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {selected && (
        <RequestDrawer
          req={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
          onRequestUpdate={handleRequestUpdate}
          canManageIntake={canManageIntake}
          isAdmin={isAdmin}
          defaultEditMode={drawerMode === "edit"}
        />
      )}
    </>
  );
}
