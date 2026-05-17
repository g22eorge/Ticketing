"use client";

import { useActionState, useMemo, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Role } from "@prisma/client";

import { type InviteState } from "@/lib/invites";

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-premium rounded-lg px-3 py-1.5 text-sm text-white disabled:opacity-60"
    >
      {pending ? "Generating…" : "Generate invite link"}
    </button>
  );
}

type Props = {
  inviteAction: (prev: InviteState, formData: FormData) => Promise<InviteState>;
  roleOptions: Array<{ value: Role; label: string }>;
};

const initial: InviteState = {};

export function InvitePanel({ inviteAction, roleOptions }: Props) {
  const [state, action] = useActionState(inviteAction, initial);
  const urlRef = useRef<HTMLInputElement>(null);
  const uniqueRoleOptions = useMemo(() => {
    const seen = new Set<Role>();
    return roleOptions.filter((option) => {
      if (seen.has(option.value)) return false;
      seen.add(option.value);
      return true;
    });
  }, [roleOptions]);

  const handleCopy = () => {
    if (!state.inviteUrl) return;
    navigator.clipboard.writeText(state.inviteUrl).then(() => {
      toast.success("Invite link copied to clipboard");
    });
  };

  return (
    <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Invite Team Member</p>
      <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
        Generate a 7-day invite link. Send it via WhatsApp, email, or any channel.
      </p>

      <form action={action} className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_auto]">
        <input
          required
          type="email"
          name="email"
          placeholder="teammate@example.com"
          className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14"
        />
        <select
          name="role"
          defaultValue="OPS"
          className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14"
        >
          {uniqueRoleOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <SendButton />
      </form>

      {/* Field errors */}
      {(state.fieldErrors?.email || state.fieldErrors?.role) && (
        <p className="mt-1.5 text-xs text-red-500">
          {state.fieldErrors.email?.[0] ?? state.fieldErrors.role?.[0]}
        </p>
      )}

      {/* General error */}
      {state.error && (
        <p className="mt-1.5 text-xs text-red-500">{state.error}</p>
      )}

      {/* Success — show copyable link */}
      {state.inviteUrl && (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs text-[var(--ink-muted)]">
            ✅ Invite link ready — valid for 7 days. Copy and send it to your teammate.
          </p>
          <div className="flex gap-2">
            <input
              ref={urlRef}
              readOnly
              value={state.inviteUrl ?? ""}
              onClick={() => urlRef.current?.select()}
              className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-xs text-[var(--ink-muted)] outline-none cursor-pointer"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="btn-premium-secondary rounded-lg px-3 py-1.5 text-xs"
            >
              Copy
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
