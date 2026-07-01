"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { createTicketAction } from "@/app/(app)/tickets/new/actions";

type ClientOption = {
  id: string;
  fullName: string;
  phone: string;
  isSLACovered: boolean;
};

const inputCls =
  "w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/20 placeholder:text-[var(--ink-muted)]";
const selectCls =
  "w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/20";

export function NewTicketForm({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(createTicketAction, { error: null });

  return (
    <form action={formAction} className="mx-auto max-w-2xl space-y-8">
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[var(--ink)]">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand)] text-xs font-bold text-white">1</span>
          Client
        </h2>
        {clients.length > 0 ? (
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--ink-muted)]">Existing client</label>
            <select name="clientId" className={selectCls} defaultValue="">
              <option value="">Create or match by phone below</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.fullName} - {client.phone}{client.isSLACovered ? " - SLA" : ""}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--ink-muted)]">Contact person *</label>
            <input name="reporterName" className={inputCls} placeholder="Jane Doe" required />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--ink-muted)]">Phone *</label>
            <input name="reporterPhone" className={inputCls} placeholder="+256 7XX XXX XXX" required />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--ink-muted)]">Email</label>
            <input name="reporterEmail" type="email" className={inputCls} placeholder="client@example.com" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--ink-muted)]">Company / organization</label>
            <input name="reporterCompany" className={inputCls} placeholder="Optional" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--ink-muted)]">Client type</label>
            <select name="clientType" className={selectCls} defaultValue="INDIVIDUAL">
              <option value="INDIVIDUAL">Individual</option>
              <option value="COMPANY">Company</option>
              <option value="SCHOOL">School</option>
              <option value="NGO">NGO</option>
              <option value="GOVERNMENT">Government</option>
            </select>
          </div>
          <label className="flex items-center gap-2 self-end rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            <input name="isSLACovered" type="checkbox" className="h-4 w-4 rounded border-emerald-300 text-emerald-700" />
            Covered under SLA
          </label>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[var(--ink)]">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand)] text-xs font-bold text-white">2</span>
          Ticket
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--ink-muted)]">Priority</label>
            <select name="priority" className={selectCls} defaultValue="MEDIUM">
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--ink-muted)]">Service type</label>
            <select name="category" className={selectCls} defaultValue="OTHER">
              <option value="HARDWARE">Hardware</option>
              <option value="SOFTWARE">Software</option>
              <option value="NETWORK">Network</option>
              <option value="INTERNET">Internet</option>
              <option value="EMAIL">Email</option>
              <option value="PRINTER">Printer</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-[var(--ink-muted)]">Subject *</label>
          <input name="subject" className={inputCls} placeholder="Email not syncing on staff laptops" required />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-[var(--ink-muted)]">Device or service</label>
          <input name="deviceInfo" className={inputCls} placeholder="HP laptop, printer, network, Microsoft 365..." />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-[var(--ink-muted)]">Issue description *</label>
          <textarea name="description" className={`${inputCls} min-h-[120px] resize-y`} placeholder="Describe the support request..." required />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-[var(--ink-muted)]">Estimated cost</label>
          <input name="estimatedCost" type="number" min="0" step="0.01" className={inputCls} placeholder="Optional" />
        </div>
      </section>

      {state.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {state.error}
        </div>
      ) : null}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-6 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Creating..." : "Create Ticket"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-xl border border-[var(--line)] px-5 py-3 text-sm font-semibold text-[var(--ink-muted)] transition hover:border-[var(--accent)]/40 hover:text-[var(--ink)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}