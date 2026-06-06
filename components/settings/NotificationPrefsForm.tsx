"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  updateNotificationPrefsAction,
  type UpdateNotificationPrefsState,
} from "@/app/(app)/settings/notifications/actions";

type Prefs = {
  whatsappEnabled: boolean;
  notifyStatusChange: boolean;
  notifyApprovalNeeded: boolean;
  notifyJobAssigned: boolean;
  notifyEstimateSubmitted: boolean;
  notifyPaymentReceived: boolean;
  notifyPayoutGenerated: boolean;
  notifyTimelineUpdated: boolean;
  notifyDelayNote: boolean;
  notifyStockAlert: boolean;
  notifyJobCreated: boolean;
  notifyRepairRequest: boolean;
  notifyQuotationStatus: boolean;
  notifyLeadStatus: boolean;
  notifyPurchaseRequest: boolean;
  notifyStockMovement: boolean;
  notifyFieldVisit: boolean;
  notifyCreditNote: boolean;
};

function Toggle({ name, label, hint, defaultChecked }: { name: keyof Prefs; label: string; hint: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-3">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[var(--ink)]">{label}</span>
        <span className="mt-0.5 block text-xs text-[var(--ink-muted)]">{hint}</span>
      </span>
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
      />
    </label>
  );
}

export function NotificationPrefsForm({ prefs }: { prefs: Prefs }) {
  const initialState: UpdateNotificationPrefsState = {};
  const [state, formAction] = useActionState(updateNotificationPrefsAction, initialState);

  function SubmitButton() {
    const { pending } = useFormStatus();
    return (
      <button
        disabled={pending}
        className="btn-premium rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "Saving..." : "Save Preferences"}
      </button>
    );
  }

  return (
    <form action={formAction} className="panel-shadow space-y-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2">
        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">Alert Scope</p>
        <p className="mt-1 text-sm text-[var(--ink)]">These switches control which notifications are generated for you.</p>
      </div>

      <div className="grid gap-2">
        <Toggle
          name="whatsappEnabled"
          label="WhatsApp Alerts"
          hint="Allow WhatsApp messages for client-facing events (when configured)."
          defaultChecked={prefs.whatsappEnabled}
        />
      </div>

      {/* Jobs & Repairs */}
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Jobs &amp; Repairs</p>
      <div className="grid gap-2 md:grid-cols-2">
        <Toggle name="notifyJobCreated"     label="Job Created"         hint="When a new job is opened."                    defaultChecked={prefs.notifyJobCreated} />
        <Toggle name="notifyRepairRequest"  label="Repair Requests"     hint="When a new online repair request arrives."    defaultChecked={prefs.notifyRepairRequest} />
        <Toggle name="notifyStatusChange"   label="Status Changes"      hint="When a job moves to a new stage."             defaultChecked={prefs.notifyStatusChange} />
        <Toggle name="notifyApprovalNeeded" label="Approval Needed"     hint="When a job requires client approval."         defaultChecked={prefs.notifyApprovalNeeded} />
        <Toggle name="notifyJobAssigned"    label="Job Assigned"        hint="When a job is assigned to you."               defaultChecked={prefs.notifyJobAssigned} />
        <Toggle name="notifyEstimateSubmitted" label="Estimate Submitted" hint="When a tech submits an estimate."           defaultChecked={prefs.notifyEstimateSubmitted} />
        <Toggle name="notifyTimelineUpdated" label="Timeline Updated"   hint="When ETA or timeline changes."                defaultChecked={prefs.notifyTimelineUpdated} />
        <Toggle name="notifyDelayNote"      label="Delay Notes"         hint="When a delay note is added."                  defaultChecked={prefs.notifyDelayNote} />
        <Toggle name="notifyFieldVisit"     label="Field Visits"        hint="When a field visit is completed."             defaultChecked={prefs.notifyFieldVisit} />
      </div>

      {/* Finance */}
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Finance</p>
      <div className="grid gap-2 md:grid-cols-2">
        <Toggle name="notifyPaymentReceived"  label="Payment Received"   hint="When a client payment is recorded."          defaultChecked={prefs.notifyPaymentReceived} />
        <Toggle name="notifyPayoutGenerated"  label="Payout Generated"   hint="When a technician payout is recorded."       defaultChecked={prefs.notifyPayoutGenerated} />
        <Toggle name="notifyQuotationStatus"  label="Quotation Accepted / Rejected" hint="When a quotation changes status." defaultChecked={prefs.notifyQuotationStatus} />
        <Toggle name="notifyCreditNote"       label="Credit Notes &amp; Refunds"    hint="When a credit note or refund is issued." defaultChecked={prefs.notifyCreditNote} />
      </div>

      {/* Sales */}
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Sales &amp; CRM</p>
      <div className="grid gap-2 md:grid-cols-2">
        <Toggle name="notifyLeadStatus" label="Lead Won / Lost" hint="When a lead is marked won or lost." defaultChecked={prefs.notifyLeadStatus} />
      </div>

      {/* Inventory */}
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Inventory</p>
      <div className="grid gap-2 md:grid-cols-2">
        <Toggle name="notifyStockAlert"     label="Low / Out of Stock"    hint="When a part hits the reorder level or runs out." defaultChecked={prefs.notifyStockAlert} />
        <Toggle name="notifyStockMovement"  label="Stock Received / Transfers / Counts" hint="When goods are received, transfers complete, or stock counts are approved." defaultChecked={prefs.notifyStockMovement} />
        <Toggle name="notifyPurchaseRequest" label="Purchase Requests"    hint="When a purchase request is submitted or approved." defaultChecked={prefs.notifyPurchaseRequest} />
      </div>

      {state.error ? <p className="text-sm text-[var(--ink)]">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-[var(--accent)]">{state.success}</p> : null}

      <SubmitButton />
    </form>
  );
}
