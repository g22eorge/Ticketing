"use client";

import { useEffect, useRef, useActionState, useState } from "react";

type SourceOption = {
  key: string;
  label: string;
};

type Props = {
  sourceOptions: SourceOption[];
  baseCurrency: string;
  paymentMethods: string[];
  action: (prev: null, formData: FormData) => Promise<null>;
  initialOpen?: boolean;
};

export function CreateReceiptDialog({ sourceOptions, baseCurrency, paymentMethods, action, initialOpen = false }: Props) {
  const [open, setOpen] = useState(initialOpen);
  const formRef = useRef<HTMLFormElement>(null);
  const [, formAction, pending] = useActionState(async (prev: null, formData: FormData) => {
    const result = await action(prev, formData);
    setOpen(false);
    formRef.current?.reset();
    return result;
  }, null);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-premium rounded-lg px-3 py-1.5 text-[12px] font-semibold"
      >
        + Receipt
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Create Receipt"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* Panel */}
          <div className="panel-shadow relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <p className="text-[13px] font-semibold text-[var(--ink)]">Create Receipt from Invoice or Sale</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--ink-muted)] transition hover:bg-[var(--panel-strong)] hover:text-[var(--ink)]"
                aria-label="Close"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Form */}
            <form ref={formRef} action={formAction} className="flex flex-col gap-3 p-4">
              <select
                name="sourceKey"
                required
                className="h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 text-sm text-[var(--ink)]"
              >
                <option value="">Select invoice or sale...</option>
                {sourceOptions.map((inv) => (
                  <option key={inv.key} value={inv.key}>{inv.label}</option>
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
                <select
                  name="method"
                  defaultValue="CASH"
                  className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 text-sm text-[var(--ink)]"
                >
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
                  onClick={() => setOpen(false)}
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
          </div>
        </div>
      )}
    </>
  );
}
