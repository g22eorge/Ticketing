"use client";

import { useEffect, useRef, useActionState } from "react";

type InvoiceOption = {
  id: string;
  invoiceNumber: string;
  label: string;
};

type Props = {
  invoiceOptions: InvoiceOption[];
  baseCurrency: string;
  paymentMethods: string[];
  action: (prev: null, formData: FormData) => Promise<null>;
};

export function CreateReceiptDialog({ invoiceOptions, baseCurrency, paymentMethods, action }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [, formAction, pending] = useActionState(action, null);

  // Close dialog after successful submission (page revalidates, dialog closes)
  useEffect(() => {
    if (!pending && dialogRef.current?.open) {
      dialogRef.current.close();
    }
  }, [pending]);

  function open() {
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="btn-premium rounded-lg px-3 py-1.5 text-[12px] font-semibold"
      >
        + Receipt
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-md rounded-xl border border-[var(--line)] bg-[var(--panel)] p-0 shadow-2xl backdrop:bg-black/50"
        onClick={(e) => { if (e.target === dialogRef.current) close(); }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <p className="text-[13px] font-semibold text-[var(--ink)]">Create Receipt from Invoice</p>
          <button
            type="button"
            onClick={close}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--ink-muted)] transition hover:bg-[var(--panel-strong)] hover:text-[var(--ink)]"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form action={formAction} className="flex flex-col gap-3 p-4">
          <select name="invoiceId" required className="h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 text-sm text-[var(--ink)]">
            <option value="">Select invoice…</option>
            {invoiceOptions.map((inv) => (
              <option key={inv.id} value={inv.id}>{inv.label}</option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-3">
            <input
              name="amount"
              required
              inputMode="decimal"
              placeholder="Amount"
              className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] outline-none focus:border-[var(--accent)]/50 focus:ring-1 focus:ring-[var(--accent)]/20"
            />
            <select name="method" defaultValue="CASH" className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 text-sm text-[var(--ink)]">
              {paymentMethods.map((m) => (
                <option key={m} value={m}>{m.replaceAll("_", " ")}</option>
              ))}
            </select>
          </div>

          <input
            name="reference"
            placeholder="Reference (optional)"
            className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] outline-none focus:border-[var(--accent)]/50 focus:ring-1 focus:ring-[var(--accent)]/20"
          />
          <input type="hidden" name="currency" value={baseCurrency} />

          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={close}
              className="flex-1 rounded-lg border border-[var(--line)] py-2 text-sm font-medium text-[var(--ink-muted)] transition hover:bg-[var(--panel-strong)] hover:text-[var(--ink)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 btn-premium rounded-lg py-2 text-sm font-semibold disabled:opacity-60"
            >
              {pending ? "Creating…" : "Create Receipt"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
