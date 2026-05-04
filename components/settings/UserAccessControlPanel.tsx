"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

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
    <form
      action={saveAction}
      className="space-y-4"
      onSubmit={(event) => {
        const changedRole = role !== initialRole;
        const next = Array.from(selectedPermissions).sort().join("|");
        const prev = [...initialPermissions].sort().join("|");
        const changedPermissions = next !== prev;
        if (changedRole || changedPermissions) {
          const confirmed = window.confirm("Apply these role and permission changes for this user?");
          if (!confirmed) event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="q" value={queryText} />
      <input type="hidden" name="role" value={role} />

      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 panel-shadow">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Role Assignment</p>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">Single-role mode is active in this deployment. Select one role, then customize permission grants.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
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
                <p className="text-sm font-semibold text-[var(--ink)]">{option.label}</p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">{option.description}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 panel-shadow">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Permissions Checklist</p>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">Inherited permissions are locked by role. Manual grants can be toggled and saved.</p>

        <div className="mt-3 space-y-2">
          {byGroup.map(([groupName, groupItems], index) => (
            <details key={groupName} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3" open={index < 2}>
              <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--ink)]">{groupName}</summary>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {groupItems.map((item) => {
                  const inherited = Boolean(item.permission && defaultsForRole.includes(item.permission));
                  const checked = item.permission
                    ? inherited || selectedPermissions.has(item.permission)
                    : effectiveKeys.has(item.key);
                  const disabled = inherited || !item.mutable || !item.permission;

                  return (
                    <label key={item.key} className="flex items-start gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
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
                        <p className="text-sm font-medium text-[var(--ink)]">
                          {item.label}
                          <span className="ml-1 text-[11px] font-normal uppercase tracking-[0.08em] text-[var(--ink-muted)]">{item.action}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{item.description}</p>
                        <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
                          {inherited
                            ? "Inherited from role"
                            : item.permission && selectedPermissions.has(item.permission)
                              ? "Manual override"
                              : item.mutable
                                ? "Not granted"
                                : "Role-controlled"}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </details>
          ))}
        </div>

        {Array.from(selectedPermissions).map((permission) => (
          <input key={permission} type="hidden" name="permissions" value={permission} />
        ))}
      </section>

      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 panel-shadow">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Permission Summary</p>
        <p className="mt-2 text-sm text-[var(--ink)]">{summaryText}</p>
      </section>

      <div className="flex items-center justify-end">
        <SaveButton />
      </div>
    </form>
  );
}
