"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { createOrganization, type CreateOrgState } from "./actions";

const initial: CreateOrgState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-premium w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
    >
      {pending ? "Creating workspace…" : "Create workspace →"}
    </button>
  );
}

export function OnboardingForm() {
  const [state, action] = useActionState(createOrganization, initial);

  return (
    <form action={action} className="space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
      <div className="space-y-1.5">
        <label htmlFor="businessName" className="block text-sm font-medium text-[var(--ink)]">
          Business name
        </label>
        <input
          id="businessName"
          name="businessName"
          type="text"
          placeholder="Your business name"
          required
          minLength={2}
          maxLength={100}
          autoFocus
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]"
        />
        {state.fieldErrors?.businessName && (
          <p className="text-xs text-red-500">{state.fieldErrors.businessName[0]}</p>
        )}
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
