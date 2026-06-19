"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { acceptInvite, type AcceptInviteState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 w-full rounded-xl bg-[#E6C65C] py-3 text-sm font-semibold text-black transition hover:bg-[#c9a430] disabled:opacity-50"
    >
      {pending ? "Setting up your account…" : "Join workspace"}
    </button>
  );
}

const initial: AcceptInviteState = {};

export function AcceptForm({ token, email }: { token: string; email: string }) {
  const [state, action] = useActionState(acceptInvite, initial);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      {/* Pre-filled email (read-only) */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-[0.12em] text-white/40">
          Email
        </label>
        <div className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/50">
          {email}
        </div>
      </div>

      {/* Name */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-[0.12em] text-white/40" htmlFor="name">
          Your name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoFocus
          autoComplete="name"
          placeholder="Jane Doe"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#E6C65C]/50 focus:ring-2 focus:ring-[#E6C65C]/15"
        />
        {state.fieldErrors?.name && (
          <p className="text-xs text-red-400">{state.fieldErrors.name[0]}</p>
        )}
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-[0.12em] text-white/40" htmlFor="password">
          Set a password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="new-password"
            placeholder="Min. 8 characters"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-20 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#E6C65C]/50 focus:ring-2 focus:ring-[#E6C65C]/15"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-medium text-white/30 transition hover:text-white/60"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        {state.fieldErrors?.password && (
          <p className="text-xs text-red-400">{state.fieldErrors.password[0]}</p>
        )}
      </div>

      {/* Confirm */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-[0.12em] text-white/40" htmlFor="confirm">
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type={showPassword ? "text" : "password"}
          required
          autoComplete="new-password"
          placeholder="Repeat password"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#E6C65C]/50 focus:ring-2 focus:ring-[#E6C65C]/15"
        />
        {state.fieldErrors?.confirm && (
          <p className="text-xs text-red-400">{state.fieldErrors.confirm[0]}</p>
        )}
      </div>

      {state.error && (
        <p className="rounded-xl bg-red-900/20 px-4 py-3 text-sm text-red-400">
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
