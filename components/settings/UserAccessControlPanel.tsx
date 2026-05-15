"use client";

import { useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

type RoleOption = {
  value: string;
  label: string;
  description: string;
};

type PermissionOption = {
  key: string;
  group: string;
  action: string;
  label: string;
  description: string;
  permission?: string;
  mutable: boolean;
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn-premium rounded-lg px-4 py-2 text-sm text-white"
      disabled={pending}
    >
      {pending ? "Saving..." : "Save Changes"}
    </button>
  );
}

type Props = {
  userId: string;
  queryText: string;
  initialRole: string;
  initialPermissions: string[];
  roleOptions: RoleOption[];
  roleDefaultPermissions: Record<string, string[]>;
  roleDefaultCapabilities: Record<string, string[]>;
  permissions: PermissionOption[];
  saveAction: (formData: FormData) => Promise<void>;
};

export function UserAccessControlPanel({
  userId,
  queryText,
  initialRole,
  initialPermissions,
  roleOptions,
  roleDefaultPermissions,
  roleDefaultCapabilities,
  permissions,
  saveAction,
}: Props) {
  const [role, setRole] = useState(initialRole);
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(
    () => new Set(initialPermissions),
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  const defaultsForRole = useMemo(() => roleDefaultPermissions[role] ?? [], [role, roleDefaultPermissions]);
  const capabilitiesForRole = useMemo(() => roleDefaultCapabilities[role] ?? [], [role, roleDefaultCapabilities]);

  const byGroup = useMemo(() => {
    const map = new Map<string, PermissionOption[]>();
    for (const item of permissions) {
      if (!map.has(item.group)) map.set(item.group, []);
      map.get(item.group)?.push(item);
    }
    return Array.from(map.entries());
  }, [permissions]);

  const effectiveKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const item of permissions) {
      if (item.permission) {
        if (defaultsForRole.includes(item.permission) || selectedPermissions.has(item.permission)) {
          keys.add(item.key);
        }
      } else if (!item.mutable && capabilitiesForRole.includes(item.key)) {
        keys.add(item.key);
      }
    }
    return keys;
  }, [permissions, capabilitiesForRole, defaultsForRole, selectedPermissions]);

  const summaryText = useMemo(() => {
    const allowed = permissions.filter((item) => effectiveKeys.has(item.key));
    const blocked = permissions.filter((item) => !effectiveKeys.has(item.key));

    const lead = allowed.slice(0, 4).map((item) => item.label.toLowerCase());
    const sensitiveBlocked = blocked
      .filter((item) =>
        ["Delete records", "Approve invoices", "Manage users", "Admin settings"].includes(item.label),
      )
      .map((item) => item.label.toLowerCase());

    const allows = lead.length > 0 ? `This user can ${lead.join(", ")}` : "This user has limited access";
    const denies = sensitiveBlocked.length > 0
      ? `, but cannot ${sensitiveBlocked.join(" or ")}.`
      : ".";
    return `${allows}${denies}`;
  }, [permissions, effectiveKeys]);

  return (
    <>
    <ConfirmDialog
      open={confirmOpen}
      title="Apply access changes?"
      description="This will update the user's role and permissions. Changes take effect on their next action."
      confirmLabel="Save Changes"
      onCancel={() => setConfirmOpen(false)}
      onConfirm={() => {
        setConfirmOpen(false);
        formRef.current?.requestSubmit();
      }}
    />
    <form
      ref={formRef}
      action={saveAction}
      className="space-y-4"
      onSubmit={(event) => {
        const changedRole = role !== initialRole;
        const next = Array.from(selectedPermissions).sort().join("|");
        const prev = [...initialPermissions].sort().join("|");
        const changedPermissions = next !== prev;
        if ((changedRole || changedPermissions) && !confirmOpen) {
          event.preventDefault();
          setConfirmOpen(true);
        }
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="q" value={queryText} />
      <input type="hidden" name="role" value={role} />

      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 panel-shadow">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">Role</p>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
          {roleOptions.map((option) => {
            const active = role === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setRole(option.value);
                  setSelectedPermissions(new Set(roleDefaultPermissions[option.value] ?? []));
                }}
                className={`rounded-lg border px-3 py-2 text-left transition ${
                  active
                    ? "border-[var(--accent)] bg-[var(--accent)]/10"
                    : "border-[var(--line)] bg-[var(--panel-strong)] hover:border-[var(--accent)]/50"
                }`}
              >
                <p className="text-[13px] font-semibold text-[var(--ink)]">{option.label}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-[var(--ink-muted)]">{option.description}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] panel-shadow">
        <p className="px-3 pt-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">Permissions</p>
        <div className="mt-2 space-y-0 divide-y divide-[var(--line)]">
          {byGroup.map(([groupName, groupItems]) => (
            <div key={groupName} className="px-3 py-2.5">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">{groupName}</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {groupItems.map((item) => {
                  const inherited = Boolean(item.permission && defaultsForRole.includes(item.permission));
                  const checked = item.permission
                    ? inherited || selectedPermissions.has(item.permission)
                    : effectiveKeys.has(item.key);
                  const disabled = inherited || !item.mutable || !item.permission;

                  return (
                    <label key={item.key} className={`flex items-start gap-2.5 rounded-lg border px-2.5 py-2 transition ${checked ? "border-[var(--accent)]/30 bg-[var(--accent)]/6" : "border-[var(--line)] bg-[var(--panel-strong)]"}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        className="mt-0.5 shrink-0"
                        onChange={(event) => {
                          const permission = item.permission;
                          if (!permission || inherited || !item.mutable) return;
                          setSelectedPermissions((prev) => {
                            const next = new Set(prev);
                            if (event.target.checked) next.add(permission);
                            else next.delete(permission);
                            return next;
                          });
                        }}
                      />
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium leading-tight text-[var(--ink)]">
                          {item.label}
                          <span className="ml-1 text-[10px] font-normal uppercase tracking-[0.08em] text-[var(--ink-muted)]">{item.action}</span>
                        </p>
                        <p className="mt-0.5 text-[11px] leading-snug text-[var(--ink-muted)]">{item.description}</p>
                        {inherited ? <p className="mt-0.5 text-[10px] text-[var(--accent)]/70">Included in role</p> : null}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {Array.from(selectedPermissions).map((permission) => (
          <input key={permission} type="hidden" name="permissions" value={permission} />
        ))}
      </section>

      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 panel-shadow">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">Summary</p>
        <p className="mt-1.5 text-[13px] text-[var(--ink)]">{summaryText}</p>
      </section>

      <div className="flex items-center justify-end">
        <SaveButton />
      </div>
    </form>
    </>
  );
}
