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
        {pending ? "Saving..." : "Save notification settings"}
      </button>
    );
  }

  return (
    <form action={formAction} className="panel-shadow space-y-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
        <p className="text-[13px] font-semibold text-[var(--ink)]">Personal notification settings</p>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          Choose the ticket, client, and document alerts you want to receive.
        </p>
      </div>

      <div className="grid gap-2">
        <Toggle
          name="whatsappEnabled"
          label="Client WhatsApp messages"
          hint="Allow WhatsApp notifications when client messaging is configured."
          defaultChecked={prefs.whatsappEnabled}
        />
      </div>

      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Tickets</p>
      <div className="grid gap-2 md:grid-cols-2">
        <Toggle name="notifyJobCreated" label="Ticket created" hint="When a new ticket is opened." defaultChecked={prefs.notifyJobCreated} />
        <Toggle name="notifyRepairRequest" label="Client request received" hint="When a client submits a new service request." defaultChecked={prefs.notifyRepairRequest} />
        <Toggle name="notifyStatusChange" label="Status changed" hint="When a ticket moves to a new stage." defaultChecked={prefs.notifyStatusChange} />
        <Toggle name="notifyApprovalNeeded" label="Client approval needed" hint="When a ticket needs client approval." defaultChecked={prefs.notifyApprovalNeeded} />
        <Toggle name="notifyJobAssigned" label="Ticket assigned" hint="When a ticket is assigned to you." defaultChecked={prefs.notifyJobAssigned} />
        <Toggle name="notifyTimelineUpdated" label="Timeline updated" hint="When a ticket timeline changes." defaultChecked={prefs.notifyTimelineUpdated} />
      </div>

      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Documents</p>
      <div className="grid gap-2 md:grid-cols-2">
        <Toggle name="notifyQuotationStatus" label="Quotation status" hint="When a quotation is accepted, rejected, or updated." defaultChecked={prefs.notifyQuotationStatus} />
        <Toggle name="notifyPaymentReceived" label="Payment received" hint="When an invoice or receipt payment is recorded." defaultChecked={prefs.notifyPaymentReceived} />
      </div>

      {state.error ? <p className="text-sm text-[var(--ink)]">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-[var(--accent)]">{state.success}</p> : null}

      <SubmitButton />
    </form>
  );
}
