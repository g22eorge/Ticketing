"use client";

import { useActionState, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
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
    <>
      <ConfirmDialog
        open={confirmOpen}
        title="Reset password?"
        description="This will update the user's password and sign them out on all devices."
        confirmLabel="Reset Password"
        variant="danger"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          formRef.current?.requestSubmit();
        }}
      />
      <form
        ref={formRef}
        action={formAction}
        className="grid gap-2 md:grid-cols-[1fr_1fr_auto]"
        onSubmit={(event) => {
          if (!confirmOpen) {
            event.preventDefault();
            setConfirmOpen(true);
          }
        }}
      >
        <input type="hidden" name="userId" value={userId} />
        <input
          ref={passwordRef}
          required
          minLength={8}
          type="password"
          name="password"
          placeholder="New password (min 8)"
          className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14"
        />
        <input
          ref={confirmRef}
          required
          minLength={8}
          type="password"
          name="confirm"
          placeholder="Confirm password"
          className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isGenerating}
            onClick={() => { void generateAndCopy(); }}
            className="btn-premium-secondary rounded-lg px-3 py-1.5 text-[13px]"
            title="Generate a temp password and copy to clipboard"
          >
            {isGenerating ? "…" : "Generate"}
          </button>
          <button className="btn-premium rounded-lg px-3 py-1.5 text-[13px] text-white">Reset</button>
        </div>

        {state.error ? <p className="text-[13px] text-red-400 md:col-span-3">{state.error}</p> : null}
        {state.success ? <p className="text-[13px] text-[var(--accent)] md:col-span-3">{state.success}</p> : null}
        <p className="text-[11px] text-[var(--ink-muted)] md:col-span-3">Generate copies a temp password to clipboard — share it via WhatsApp.</p>
      </form>
    </>
  );
}
