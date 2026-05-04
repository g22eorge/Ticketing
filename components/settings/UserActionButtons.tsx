"use client";

import clsx from "clsx";
import { useFormStatus } from "react-dom";

type SubmitActionButtonProps = {
  idleLabel: string;
  pendingLabel: string;
  className?: string;
};

export function SubmitActionButton({ idleLabel, pendingLabel, className }: SubmitActionButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={clsx(className)}>
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

type RoleActionButtonProps = {
  role: string;
  currentRole: string;
  label: string;
};

export function RoleActionButton({ role, currentRole, label }: RoleActionButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      name="role"
      value={role}
      className={clsx(
        "w-full rounded-lg border px-3 py-2 text-center text-xs font-medium transition",
        currentRole === role
          ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
          : "border-[var(--line)] bg-[var(--panel)] text-[var(--ink)] hover:border-[var(--accent)]/50 hover:bg-[var(--panel-strong)]",
      )}
    >
      {pending ? "Updating..." : label}
    </button>
  );
}
