"use client";

import { useActionState, useRef, useState } from "react";

type UserPasswordResetState = {
  error?: string;
  success?: string;
};

export function UserPasswordResetForm({
  userId,
  action,
}: {
  userId: string;
  action: (state: UserPasswordResetState, formData: FormData) => Promise<UserPasswordResetState>;
}) {
  const [state, formAction] = useActionState(action, {});
  const [isGenerating, setIsGenerating] = useState(false);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const confirmRef = useRef<HTMLInputElement | null>(null);

  function generateTempPassword(length = 14) {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const values = new Uint32Array(length);
    crypto.getRandomValues(values);
    let out = "";
    for (let i = 0; i < values.length; i += 1) {
      out += alphabet[values[i] % alphabet.length];
    }
    return out;
  }

  async function generateAndCopy() {
    setIsGenerating(true);
    try {
      const temp = generateTempPassword();
      if (passwordRef.current) passwordRef.current.value = temp;
      if (confirmRef.current) confirmRef.current.value = temp;
      await navigator.clipboard.writeText(temp);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <form
      action={formAction}
      className="grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3 md:grid-cols-[1fr_1fr_auto]"
      onSubmit={(event) => {
        const ok = window.confirm("Reset this user's password? This will sign them out on all devices.");
        if (!ok) event.preventDefault();
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <input
        ref={passwordRef}
        required
        minLength={8}
        type="password"
        name="password"
        placeholder="New password (min 8 chars)"
        className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14"
      />
      <input
        ref={confirmRef}
        required
        minLength={8}
        type="password"
        name="confirm"
        placeholder="Confirm password"
        className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14"
      />
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          disabled={isGenerating}
          onClick={() => {
            void generateAndCopy();
          }}
          className="btn-premium-secondary rounded-lg px-3 py-1.5 text-sm"
          title="Generates a temporary password and copies it"
        >
          {isGenerating ? "Generating..." : "Generate & Copy"}
        </button>
        <button className="btn-premium rounded-lg px-3 py-1.5 text-sm text-white">
          Reset Password
        </button>
      </div>

      {state.error ? <p className="text-sm text-[var(--ink)] md:col-span-3">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-[var(--accent)] md:col-span-3">{state.success}</p> : null}
      <p className="text-[11px] text-[var(--ink-muted)] md:col-span-3">
        Tip: use Generate & Copy, then paste the temporary password to the staff member over WhatsApp.
      </p>
    </form>
  );
}
