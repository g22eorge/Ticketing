"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { updateProfileAction, type UpdateProfileState } from "@/app/(app)/settings/profile/actions";

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-premium rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? "Saving..." : "Save changes"}
    </button>
  );
}

export function ProfileForm({
  name,
  email,
  role,
  phone,
}: {
  name: string;
  email: string;
  role: string;
  phone: string | null;
}) {
  const router = useRouter();
  const initialState: UpdateProfileState = {};
  const [state, formAction] = useActionState(updateProfileAction, initialState);

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [router, state.success]);

  const fieldClass =
    "w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none transition focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14";

  return (
    <form action={formAction} className="panel-shadow space-y-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">Profile Summary</p>
        <p className="mt-1 text-sm text-[var(--ink)]">Keep your contact details current so internal handoffs and approvals remain accurate.</p>
      </div>

      <div>
        <label htmlFor="name" className="mb-1 block text-sm text-[var(--ink-muted)]">
          Name
        </label>
        <input
          id="name"
          name="name"
          defaultValue={name}
          required
          minLength={2}
          maxLength={80}
          className={fieldClass}
        />
      </div>

      <div>
        <label htmlFor="phone" className="mb-1 block text-sm text-[var(--ink-muted)]">
          Phone
        </label>
        <input
          id="phone"
          name="phone"
          defaultValue={phone ?? ""}
          maxLength={30}
          placeholder="e.g. +2567..."
          className={fieldClass}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">Email</p>
          <p className="mt-1 text-sm font-medium text-[var(--ink)]">{email}</p>
        </div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">Role</p>
          <p className="mt-1 text-sm font-medium text-[var(--ink)]">{role}</p>
        </div>
      </div>

      {state.error ? <p className="text-sm text-[var(--ink)] md:col-span-2">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-[var(--accent)]">{state.success}</p> : null}

      <SaveButton />
    </form>
  );
}
