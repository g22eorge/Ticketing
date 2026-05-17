"use client";

import { useState, useTransition } from "react";
import { createBranchAction, updateBranchAction } from "./actions";

type Branch = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  isDefault: boolean;
  isActive: boolean;
  _count: { users: number; jobs: number };
};

export function BranchList({ branches }: { branches: Branch[] }) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--line)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
            Locations ({branches.length})
          </p>
          <button
            type="button"
            onClick={() => { setCreating(true); setEditingId(null); }}
            className="rounded-md bg-[var(--gold)]/15 px-3 py-1 text-xs font-semibold text-[var(--gold)] hover:bg-[var(--gold)]/25"
          >
            + Add Branch
          </button>
        </div>

        {branches.length === 0 && !creating ? (
          <p className="py-8 text-center text-sm text-[var(--ink-muted)]">No branches yet.</p>
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {branches.map((b) =>
              editingId === b.id ? (
                <BranchForm
                  key={b.id}
                  branch={b}
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <div key={b.id} className="flex items-start justify-between px-5 py-4 gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[var(--ink)] text-sm">{b.name}</span>
                      {b.isDefault && (
                        <span className="rounded-full bg-[var(--gold)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--gold)]">DEFAULT</span>
                      )}
                      {!b.isActive && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">INACTIVE</span>
                      )}
                    </div>
                    {b.address && <p className="mt-0.5 text-xs text-[var(--ink-muted)] truncate">{b.address}</p>}
                    {b.phone && <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{b.phone}</p>}
                    <p className="mt-1 text-[10px] text-[var(--ink-muted)]">
                      {b._count.users} user{b._count.users !== 1 ? "s" : ""} · {b._count.jobs} job{b._count.jobs !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setEditingId(b.id); setCreating(false); }}
                    className="shrink-0 text-xs font-semibold text-[var(--gold)] hover:underline"
                  >
                    Edit
                  </button>
                </div>
              ),
            )}
          </div>
        )}

        {creating && (
          <div className="border-t border-[var(--line)]">
            <BranchForm onDone={() => setCreating(false)} />
          </div>
        )}
      </div>
    </div>
  );
}

function BranchForm({
  branch,
  onDone,
}: {
  branch?: Branch;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    if (branch) fd.set("id", branch.id);

    startTransition(async () => {
      const action = branch ? updateBranchAction : createBranchAction;
      const result = await action(fd);
      if (result.error) { setError(result.error); return; }
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4 bg-[var(--gold)]/5">
      <p className="text-xs font-semibold text-[var(--ink)]">{branch ? "Edit Branch" : "New Branch"}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
            Branch Name <span className="text-red-500">*</span>
          </label>
          <input
            name="name"
            required
            defaultValue={branch?.name ?? ""}
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">Phone</label>
          <input
            name="phone"
            defaultValue={branch?.phone ?? ""}
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">Address</label>
        <textarea
          name="address"
          rows={2}
          defaultValue={branch?.address ?? ""}
          className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/40 resize-none"
        />
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm text-[var(--ink)] cursor-pointer">
          <input
            type="checkbox"
            name="isDefault"
            value="1"
            defaultChecked={branch?.isDefault ?? false}
            className="h-4 w-4 rounded border-[var(--line)] accent-[var(--gold)]"
          />
          Set as default branch
        </label>
        {branch && (
          <label className="flex items-center gap-2 text-sm text-[var(--ink)] cursor-pointer">
            <input
              type="checkbox"
              name="isActive"
              value="1"
              defaultChecked={branch.isActive}
              className="h-4 w-4 rounded border-[var(--line)] accent-[var(--gold)]"
            />
            Active
          </label>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="btn-premium rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {pending ? "Saving…" : branch ? "Save Changes" : "Create Branch"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--ink-muted)] hover:bg-[var(--gold)]/5"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
