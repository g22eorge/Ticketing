"use client";

import { useState, useTransition } from "react";
import { updateSupplierAction } from "../actions";

type Supplier = {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
};

export function SupplierEditForm({ supplier }: { supplier: Supplier }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const fd = new FormData(e.currentTarget);
    fd.set("id", supplier.id);
    startTransition(async () => {
      const result = await updateSupplierAction(fd);
      if (result.error) { setError(result.error); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Supplier Details</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field name="name" label="Supplier Name" defaultValue={supplier.name} required />
        <Field name="contactName" label="Contact Person" defaultValue={supplier.contactName ?? ""} />
        <Field name="email" label="Email" type="email" defaultValue={supplier.email ?? ""} />
        <Field name="phone" label="Phone" defaultValue={supplier.phone ?? ""} />
      </div>
      <div>
        <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">Address</label>
        <textarea
          name="address"
          rows={2}
          defaultValue={supplier.address ?? ""}
          className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40 resize-none"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">Notes</label>
        <textarea
          name="notes"
          rows={2}
          defaultValue={supplier.notes ?? ""}
          className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40 resize-none"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          name="isActive"
          id="isActive"
          value="1"
          defaultChecked={supplier.isActive}
          className="h-4 w-4 rounded border-[var(--line)] accent-[var(--gold)]"
        />
        <label htmlFor="isActive" className="text-sm text-[var(--ink)]">Active</label>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {saved && <p className="text-xs text-green-600">Saved successfully.</p>}
      <button
        type="submit"
        disabled={pending}
        className="btn-premium rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save Changes"}
      </button>
    </form>
  );
}

function Field({
  name, label, required, type = "text", defaultValue,
}: {
  name: string; label: string; required?: boolean; type?: string; defaultValue?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
      />
    </div>
  );
}
