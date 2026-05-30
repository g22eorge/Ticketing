"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createSupplierAction } from "../actions";

export default function NewSupplierPage() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createSupplierAction(fd);
      if (result.error) { setError(result.error); return; }
      router.push(`/inventory/suppliers/${result.id}`);
    });
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="px-4 py-3">
          <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Inventory</p>
          <p className="text-[13px] font-bold text-[var(--ink)]">New Supplier</p>
          <p className="text-[13px] text-[var(--ink-muted)]">Add a supplier to raise purchase orders against.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-4">
        <Field name="name" label="Supplier Name" required />
        <Field name="contactName" label="Contact Person" />
        <Field name="email" label="Email" type="email" />
        <Field name="phone" label="Phone" />
        <div>
          <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">Address</label>
          <textarea
            name="address"
            rows={2}
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40 resize-none"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">Notes</label>
          <textarea
            name="notes"
            rows={2}
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40 resize-none"
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={pending} className="btn-premium rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {pending ? "Saving…" : "Save Supplier"}
          </button>
          <Link href="/inventory/suppliers" className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--ink-muted)] hover:bg-[var(--gold)]/5">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({ name, label, required, type = "text" }: { name: string; label: string; required?: boolean; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        name={name}
        type={type}
        required={required}
        className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
      />
    </div>
  );
}
