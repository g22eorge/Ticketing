"use client";

import { useActionState } from "react";

import { SubmitActionButton } from "@/components/settings/UserActionButtons";

type UserDetailsState = {
  error?: string;
  success?: string;
};

type UserDetailsFormProps = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  action: (state: UserDetailsState, formData: FormData) => Promise<UserDetailsState>;
};

export function UserDetailsForm({ id, name, email, phone, action }: UserDetailsFormProps) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form
      action={formAction}
      className="mb-3 grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto]"
    >
      <input type="hidden" name="id" value={id} />
      <input
        required
        name="name"
        defaultValue={name}
        placeholder="Full name"
        className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14"
      />
      <input
        required
        type="email"
        name="email"
        defaultValue={email}
        placeholder="Email"
        className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14"
      />
      <input
        name="phone"
        defaultValue={phone ?? ""}
        placeholder="Phone"
        className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14"
      />
      <SubmitActionButton
        idleLabel="Save Profile"
        pendingLabel="Saving..."
        className="btn-premium h-10 rounded-lg px-3 py-1.5 text-sm text-white md:w-fit"
      />
      {state.error ? <p className="text-sm text-[var(--ink)] md:col-span-2 xl:col-span-4">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-[var(--accent)] md:col-span-2 xl:col-span-4">{state.success}</p> : null}
    </form>
  );
}
