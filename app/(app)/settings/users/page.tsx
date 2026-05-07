import { hashPassword } from "better-auth/crypto";
import { Role } from "@prisma/client";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { UserAccessControlPanel } from "@/components/settings/UserAccessControlPanel";
import { UserDetailsForm } from "@/components/settings/UserDetailsForm";
import { UserPasswordResetForm } from "@/components/settings/UserPasswordResetForm";
import { EXTRA_PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";

type SearchParams = {
  q?: string;
  userId?: string;
};

type UserDetailsState = {
  error?: string;
  success?: string;
};

type UserPasswordResetState = {
  error?: string;
  success?: string;
};

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(8),
  role: z.nativeEnum(Role),
});

const updateUserDetailsSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(80),
  email: z.string().email(),
  phone: z.string().optional(),
});

const resetPasswordSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(8),
  confirm: z.string().min(8),
}).refine((data) => data.password === data.confirm, {
  message: "Passwords do not match",
  path: ["confirm"],
});

type PermissionOption = {
  key: string;
  group: string;
  action: string;
  label: string;
  description: string;
  permission?: (typeof EXTRA_PERMISSIONS)[number];
  mutable: boolean;
};

const roleOptions: Array<{ value: Role; label: string; description: string }> = [
  { value: Role.ADMIN, label: "Admin", description: "Full platform control including user management and financial approvals." },
  { value: Role.FRONT_DESK, label: "Front Desk", description: "Handles front desk intake, customer details, and handover documents." },
  { value: Role.TECHNICIAN_INTERNAL, label: "Internal Technician", description: "Works diagnosis and in-house repair execution." },
  { value: Role.TECHNICIAN_EXTERNAL, label: "External Technician", description: "External workflow access without client identity or billing history." },
  { value: Role.OPS, label: "Operations/Accounts", description: "Coordinates workflow, billing, settlement, and daily operations." },
];

const roleDefaults: Record<Role, Array<(typeof EXTRA_PERMISSIONS)[number]>> = {
  ADMIN: [
    "can_run_internal_repairs",
    "can_intake",
    "can_manage_intake",
    "can_search_jobs",
    "can_generate_job_cards",
    "can_view_job_progress",
    "can_view_approved_cost",
    "can_assign_jobs",
    "can_view_external_updates",
    "can_view_external_quotes",
    "can_review_external_bills",
    "can_view_accounts_summary",
    "can_approve_invoices",
  ],
  OPS: [
    "can_manage_intake",
    "can_search_jobs",
    "can_generate_job_cards",
    "can_assign_jobs",
    "can_view_external_updates",
    "can_view_external_quotes",
    "can_review_external_bills",
    "can_view_accounts_summary",
    "can_approve_invoices",
  ],
  FRONT_DESK: [
    "can_intake",
    "can_manage_intake",
    "can_generate_job_cards",
    "can_view_job_progress",
    "can_search_jobs",
  ],
  // Legacy alias.
  INTAKE: [
    "can_intake",
    "can_manage_intake",
    "can_generate_job_cards",
    "can_view_job_progress",
    "can_search_jobs",
  ],
  TECHNICIAN_INTERNAL: [
    "can_run_internal_repairs",
    "can_search_jobs",
    "can_view_job_progress",
    "can_view_external_updates",
  ],
  TECHNICIAN_EXTERNAL: [],
};

const roleCapabilities: Record<Role, string[]> = {
  ADMIN: [
    "dashboard_view",
    "jobs_view",
    "jobs_assign",
    "jobs_create",
    "intake_manage",
    "device_records",
    "client_records",
    "tech_notes",
    "parts_bills",
    "invoices_view",
    "invoices_approve",
    "reports_export",
    "users_manage",
    "settings_admin",
    "approval_cost",
    "delete_records",
    "download_docs",
  ],
  OPS: [
    "dashboard_view",
    "jobs_view",
    "jobs_assign",
    "jobs_create",
    "intake_manage",
    "device_records",
    "client_records",
    "tech_notes",
    "parts_bills",
    "invoices_view",
    "invoices_approve",
    "reports_export",
    "approval_cost",
    "download_docs",
  ],
  FRONT_DESK: [
    "dashboard_view",
    "jobs_view",
    "jobs_create",
    "intake_manage",
    "device_records",
    "client_records",
    "download_docs",
  ],
  // Legacy alias.
  INTAKE: [
    "dashboard_view",
    "jobs_view",
    "jobs_create",
    "intake_manage",
    "device_records",
    "client_records",
    "download_docs",
  ],
  TECHNICIAN_INTERNAL: [
    "dashboard_view",
    "jobs_view",
    "device_records",
    "tech_notes",
    "download_docs",
  ],
  TECHNICIAN_EXTERNAL: [
    "dashboard_view",
    "jobs_view",
    "tech_notes",
  ],
};

const permissionOptions: PermissionOption[] = [
  { key: "dashboard_view", group: "Dashboard Access", action: "View", label: "Dashboard overview", description: "Access the operational dashboard and queue counters.", mutable: false },
  { key: "jobs_view", group: "Job Management", action: "View", label: "View jobs", description: "Open job queues and job detail screens.", permission: "can_search_jobs", mutable: true },
  { key: "jobs_assign", group: "Job Management", action: "Assign", label: "Assign jobs", description: "Assign jobs to internal or external technicians.", permission: "can_assign_jobs", mutable: true },
  { key: "jobs_create", group: "Job Management", action: "Create", label: "Create jobs", description: "Create intake jobs and convert requests into active jobs.", permission: "can_intake", mutable: true },
  { key: "intake_manage", group: "Intake Process", action: "Edit", label: "Manage intake", description: "Update intake funnel and intake stage ownership.", permission: "can_manage_intake", mutable: true },
  { key: "device_records", group: "Device Records", action: "Edit", label: "Update device records", description: "Edit serial, accessories, and condition records.", permission: "can_view_job_progress", mutable: true },
  { key: "client_records", group: "Client Records", action: "View", label: "View client records", description: "Access client profile and contact details.", mutable: false },
  { key: "tech_notes", group: "Technician Updates", action: "Edit", label: "Technician updates", description: "Add diagnosis, repair notes, and update progress.", permission: "can_run_internal_repairs", mutable: true },
  { key: "parts_bills", group: "Parts and Bills", action: "View", label: "Review parts and external bills", description: "Review billables tied to parts and external costs.", permission: "can_review_external_bills", mutable: true },
  { key: "invoices_view", group: "Invoices and Payments", action: "View", label: "View invoice and settlement", description: "Open invoice workspace and settlement records.", permission: "can_view_accounts_summary", mutable: true },
  { key: "invoices_approve", group: "Invoices and Payments", action: "Approve", label: "Approve invoices", description: "Approve invoice-sensitive actions and finance approvals.", permission: "can_approve_invoices", mutable: true },
  { key: "reports_export", group: "Reports", action: "Export", label: "Export reports", description: "View and export operational and finance reports.", permission: "can_view_accounts_summary", mutable: true },
  { key: "users_manage", group: "User Management", action: "Edit", label: "Manage users", description: "Create, update, deactivate, and assign user access.", mutable: false },
  { key: "settings_admin", group: "Settings", action: "Edit", label: "Admin settings", description: "Manage branding and system-level settings.", mutable: false },
  { key: "approval_cost", group: "Approvals", action: "Approve", label: "Approve quoted cost", description: "Approve and publish final approved costs.", permission: "can_view_approved_cost", mutable: true },
  { key: "delete_records", group: "Delete/Edit Restrictions", action: "Delete", label: "Delete records", description: "Delete/archive sensitive records when policy allows.", mutable: false },
  { key: "download_docs", group: "Delete/Edit Restrictions", action: "Download", label: "Download documents", description: "Download handover, quotation, and invoice PDFs.", permission: "can_generate_job_cards", mutable: true },
];

function roleLabel(role: Role) {
  if (role === "TECHNICIAN_INTERNAL") return "Internal Technician";
  if (role === "TECHNICIAN_EXTERNAL") return "External Technician";
  if (role === "FRONT_DESK" || role === "INTAKE") return "Front Desk";
  if (role === "OPS") return "Operations/Accounts";
  return "Admin";
}

function formatDateTime(value?: Date | null) {
  if (!value) return "No activity yet";
  return value.toLocaleString();
}

function searchMatches(user: {
  name: string;
  email: string;
  phone: string | null;
  role: Role;
}, query: string) {
  if (!query) return true;
  const haystack = [
    user.name,
    user.email,
    user.phone ?? "",
    user.role,
    roleLabel(user.role),
  ].join(" ").toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user, orgId } = await requireOrgSession();
  if (user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  async function updateUserDetails(state: UserDetailsState, formData: FormData): Promise<UserDetailsState> {
    "use server";

    const { session, user: actor, orgId: actorOrgId } = await requireOrgSession();
    if (actor.role !== "ADMIN") return { error: "Not authorized" };

    const parsed = updateUserDetailsSchema.safeParse({
      id: String(formData.get("id") ?? "").trim(),
      name: String(formData.get("name") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim().toLowerCase(),
      phone: String(formData.get("phone") ?? "").trim(),
    });

    if (!parsed.success) return { error: "Invalid user details" };

    const existing = await prisma.user.findFirst({
      where: { id: parsed.data.id, orgId: actorOrgId },
      select: { id: true, name: true, email: true, phone: true },
    });
    if (!existing) return { error: "User not found" };

    const emailConflict = await prisma.user.findFirst({
      where: { email: parsed.data.email, NOT: { id: parsed.data.id } },
      select: { id: true },
    });
    if (emailConflict) return { error: "Email is already in use by another user" };

    const nextPhone = parsed.data.phone ? parsed.data.phone : null;
    const changed = {
      name: existing.name !== parsed.data.name,
      email: existing.email !== parsed.data.email,
      phone: (existing.phone ?? null) !== nextPhone,
    };

    if (!changed.name && !changed.email && !changed.phone) {
      return { success: "No changes to save" };
    }

    await prisma.user.update({
      where: { id: parsed.data.id },
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        phone: nextPhone,
      },
    });

    try {
      await prisma.userAccessAudit.create({
        data: {
          actorUserId: session.user.id,
          targetUserId: parsed.data.id,
          action: "USER_DETAILS_UPDATED",
          detail: JSON.stringify({
            from: { name: existing.name, email: existing.email, phone: existing.phone ?? null },
            to: { name: parsed.data.name, email: parsed.data.email, phone: nextPhone },
          }),
        },
      });
    } catch {
      // ignore if audit table isn't migrated yet
    }

    revalidatePath("/settings/users");
    return { success: "User details saved" };
  }

  async function resetUserPassword(state: UserPasswordResetState, formData: FormData): Promise<UserPasswordResetState> {
    "use server";

    const { session, user: actor } = await requireOrgSession();
    if (actor.role !== "ADMIN") return { error: "Not authorized" };

    const parsed = resetPasswordSchema.safeParse({
      userId: String(formData.get("userId") ?? "").trim(),
      password: String(formData.get("password") ?? ""),
      confirm: String(formData.get("confirm") ?? ""),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid password" };
    }

    const target = await prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true } });
    if (!target) return { error: "User not found" };

    const hashed = await hashPassword(parsed.data.password);

    await prisma.$transaction(async (tx) => {
      const updated = await tx.account.updateMany({
        where: { userId: parsed.data.userId, providerId: "credential" },
        data: { password: hashed },
      });
      if (updated.count === 0) {
        await tx.account.create({
          data: {
            accountId: parsed.data.userId,
            providerId: "credential",
            userId: parsed.data.userId,
            password: hashed,
          },
        });
      }

      // Force re-login everywhere after reset.
      await tx.session.deleteMany({ where: { userId: parsed.data.userId } });
    });

    try {
      await prisma.userAccessAudit.create({
        data: {
          actorUserId: session.user.id,
          targetUserId: parsed.data.userId,
          action: "PASSWORD_RESET",
          detail: JSON.stringify({ method: "ADMIN_RESET", signedOutAllSessions: true }),
        },
      });
    } catch {
      // ignore
    }

    revalidatePath("/settings/users");
    return { success: "Password reset. User has been signed out." };
  }

  async function saveAccessChanges(formData: FormData) {
    "use server";

    const { session, user: actor } = await requireOrgSession();
    if (actor.role !== "ADMIN") return;

    const targetUserId = String(formData.get("userId") ?? "").trim();
    const q = String(formData.get("q") ?? "").trim();
    const nextRole = String(formData.get("role") ?? "") as Role;
    const permissionValues = formData
      .getAll("permissions")
      .map((value) => String(value).trim())
      .filter((value): value is (typeof EXTRA_PERMISSIONS)[number] =>
        EXTRA_PERMISSIONS.includes(value as (typeof EXTRA_PERMISSIONS)[number]),
      );

    if (!targetUserId || !Object.values(Role).includes(nextRole)) {
      redirect(`/settings/users?${new URLSearchParams({ q, userId: targetUserId }).toString()}`);
    }

    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        role: true,
      },
    });
    if (!target) {
      redirect(`/settings/users${q ? `?${new URLSearchParams({ q }).toString()}` : ""}`);
    }

    if (target.id === session.user.id && nextRole !== "ADMIN") {
      redirect(`/settings/users?${new URLSearchParams({ q, userId: targetUserId }).toString()}`);
    }

    let currentPermissionValues: string[] = [];
    try {
      const rows = await prisma.$queryRaw<Array<{ permission: string }>>`
        SELECT permission FROM "UserPermission" WHERE userId = ${targetUserId}
      `;
      currentPermissionValues = rows.map((row) => row.permission).filter(Boolean);
    } catch {
      currentPermissionValues = [];
    }

    const currentPermissions = new Set<string>(currentPermissionValues);
    const nextPermissions = new Set<string>(permissionValues);

    const added = [...nextPermissions].filter((permission) => !currentPermissions.has(permission));
    const removed = [...currentPermissions].filter((permission) => !nextPermissions.has(permission));
    const roleChanged = target.role !== nextRole;
    const permissionChanged = added.length > 0 || removed.length > 0;

    if (!roleChanged && !permissionChanged) {
      redirect(`/settings/users?${new URLSearchParams({ q, userId: targetUserId }).toString()}`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: targetUserId }, data: { role: nextRole } });
      await tx.userPermission.deleteMany({ where: { userId: targetUserId } });

      if (permissionValues.length > 0) {
        await tx.userPermission.createMany({
          data: permissionValues.map((permission) => ({ userId: targetUserId, permission })),
        });
      }
    });

    try {
      await prisma.userAccessAudit.create({
        data: {
          actorUserId: session.user.id,
          targetUserId,
          action: roleChanged ? "ROLE_AND_PERMISSION_UPDATED" : "PERMISSION_UPDATED",
          detail: JSON.stringify({
            fromRole: target.role,
            toRole: nextRole,
            added,
            removed,
          }),
        },
      });
    } catch {
      // Keep access updates successful even when audit table is not yet migrated.
    }

    revalidatePath("/settings/users");
    redirect(`/settings/users?${new URLSearchParams({ q, userId: targetUserId }).toString()}`);
  }

  async function createUser(formData: FormData) {
    "use server";

    const { user: actor, orgId: actorOrgId } = await requireOrgSession();
    if (actor.role !== "ADMIN") return;

    const parsed = createUserSchema.safeParse({
      name: String(formData.get("name") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim().toLowerCase(),
      phone: String(formData.get("phone") ?? "").trim(),
      password: String(formData.get("password") ?? ""),
      role: String(formData.get("role") ?? "OPS"),
    });

    if (!parsed.success) {
      revalidatePath("/settings/users");
      redirect("/settings/users");
    }

    const created = await prisma.user.create({
      data: {
        orgId: actorOrgId,
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone || null,
        role: parsed.data.role,
        emailVerified: true,
      },
    });

    await prisma.account.create({
      data: {
        accountId: created.id,
        providerId: "credential",
        userId: created.id,
        password: await hashPassword(parsed.data.password),
      },
    });

    revalidatePath("/settings/users");
    redirect(`/settings/users?${new URLSearchParams({ userId: created.id }).toString()}`);
  }

  let q = "";
  let filteredUsers: Array<{
    id: string;
    name: string;
    email: string;
    phone: string | null;
    role: Role;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    sessions: Array<{ updatedAt: Date }>;
    auditLogs: Array<{ createdAt: Date }>;
    permissionGrants: Array<{ permission: string }>;
  }> = [];
  let selectedUser: (typeof filteredUsers)[number] | null = null;
  let accessAudit: Array<{
    id: string;
    action: string;
    detail: string | null;
    createdAt: Date;
    actorUser: { name: string };
  }> = [];

  try {
    const params = await searchParams;
    q = typeof params.q === "string" ? params.q.trim() : "";

    const users = await prisma.user.findMany({
      where: { orgId },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        sessions: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { updatedAt: true },
        },
        auditLogs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    let permissionMap = new Map<string, string[]>();
    try {
      const rows = await prisma.$queryRaw<Array<{ userId: string; permission: string }>>`
        SELECT userId, permission FROM "UserPermission"
      `;
      permissionMap = rows.reduce((acc, row) => {
        if (!acc.has(row.userId)) acc.set(row.userId, []);
        acc.get(row.userId)?.push(row.permission);
        return acc;
      }, new Map<string, string[]>());
    } catch {
      permissionMap = new Map();
    }

    const usersWithPermissions = users.map((entry) => ({
      ...entry,
      permissionGrants: (permissionMap.get(entry.id) ?? []).map((permission) => ({ permission })),
    }));

    filteredUsers = usersWithPermissions.filter((item) => searchMatches(item, q));
    selectedUser = filteredUsers.find((item) => item.id === params.userId) ?? filteredUsers[0] ?? null;

    if (selectedUser) {
      try {
        accessAudit = await prisma.userAccessAudit.findMany({
          where: { targetUserId: selectedUser.id },
          orderBy: { createdAt: "desc" },
          take: 12,
          select: {
            id: true,
            action: true,
            detail: true,
            createdAt: true,
            actorUser: { select: { name: true } },
          },
        });
      } catch {
        accessAudit = [];
      }
    }
  } catch (error) {
    console.error("[settings/users] failed to load", error);
    return (
      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-6 text-sm text-[var(--ink-muted)]">
        Could not load user access controls right now. Please retry after a moment.
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Create User</p>
        <form action={createUser} className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          <input required name="name" placeholder="Name" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
          <input required type="email" name="email" placeholder="Email" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
          <input name="phone" placeholder="Phone" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
          <input required minLength={8} type="password" name="password" placeholder="Password" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
          <select name="role" defaultValue="OPS" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14">
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button className="btn-premium rounded-lg px-3 py-1.5 text-sm text-white md:col-span-2 xl:col-span-1">Create User</button>
        </form>
      </section>

      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">User Selection</p>
        <form method="GET" className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search by name, phone, email, or role"
            className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14"
          />
          <div className="flex gap-2">
            <button className="btn-premium-secondary rounded-lg px-3 py-1.5 text-sm">Search</button>
            <Link href="/settings/users" className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)]">
              Reset
            </Link>
          </div>
        </form>

        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {filteredUsers.map((item) => (
            <Link
              key={item.id}
              href={`/settings/users?${new URLSearchParams({ q, userId: item.id }).toString()}`}
              className={`rounded-lg border px-3 py-2 transition ${selectedUser?.id === item.id ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--line)] bg-[var(--panel-strong)] hover:border-[var(--accent)]/45"}`}
            >
              <p className="font-medium text-[var(--ink)]">{item.name}</p>
              <p className="text-xs text-[var(--ink-muted)]">{item.email}</p>
              <p className="mt-1 text-[11px] text-[var(--ink-muted)]">{roleLabel(item.role)} • {item.isActive ? "Active" : "Inactive"}</p>
            </Link>
          ))}
        </div>
      </section>

      {selectedUser ? (
        <>
          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Profile Summary</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
                <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">Name</p>
                <p className="mt-1 text-sm font-semibold text-[var(--ink)]">{selectedUser.name}</p>
              </div>
              <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
                <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">Contact</p>
                <p className="mt-1 text-sm text-[var(--ink)]">{selectedUser.email}</p>
                <p className="text-xs text-[var(--ink-muted)]">{selectedUser.phone ?? "No phone on file"}</p>
              </div>
              <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
                <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">Current Role</p>
                <p className="mt-1 text-sm font-semibold text-[var(--ink)]">{roleLabel(selectedUser.role)}</p>
              </div>
              <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
                <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">Status</p>
                <p className="mt-1 text-sm font-semibold text-[var(--ink)]">{selectedUser.isActive ? "Active" : "Inactive"}</p>
              </div>
              <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
                <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">Last Activity</p>
                <p className="mt-1 text-sm text-[var(--ink)]">
                  {formatDateTime(
                    selectedUser.sessions[0]?.updatedAt
                    ?? selectedUser.auditLogs[0]?.createdAt
                    ?? selectedUser.updatedAt,
                  )}
                </p>
              </div>
              <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
                <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">Branch / Location</p>
                <p className="mt-1 text-sm text-[var(--ink)]">Not assigned</p>
              </div>
            </div>
          </section>

          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Edit User Details</p>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">Update name, email, and phone. Email changes take effect immediately.</p>
            <div className="mt-3">
              <UserDetailsForm
                id={selectedUser.id}
                name={selectedUser.name}
                email={selectedUser.email}
                phone={selectedUser.phone}
                action={updateUserDetails}
              />
            </div>
          </section>

          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Reset Password</p>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">Use this when a user forgets their password. A reset signs them out everywhere.</p>
            <div className="mt-3">
              <UserPasswordResetForm userId={selectedUser.id} action={resetUserPassword} />
            </div>
          </section>

          <UserAccessControlPanel
            key={selectedUser.id}
            userId={selectedUser.id}
            queryText={q}
            initialRole={selectedUser.role}
            initialPermissions={selectedUser.permissionGrants.map((grant) => grant.permission)}
            roleOptions={roleOptions}
            roleDefaultPermissions={roleDefaults}
            roleDefaultCapabilities={roleCapabilities}
            permissions={permissionOptions}
            saveAction={saveAccessChanges}
          />

          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Access Audit Trail</p>
            <div className="mt-3 space-y-2">
              {accessAudit.length > 0 ? (
                accessAudit.map((entry) => {
                  let detail = "No detail";
                  try {
                    const parsed = entry.detail ? JSON.parse(entry.detail) as { added?: string[]; removed?: string[]; fromRole?: string; toRole?: string } : null;
                    const roleLine = parsed && parsed.fromRole !== parsed.toRole
                      ? `Role ${parsed.fromRole} -> ${parsed.toRole}`
                      : "Role unchanged";
                    const addedLine = parsed?.added?.length ? `Added: ${parsed.added.join(", ")}` : "Added: none";
                    const removedLine = parsed?.removed?.length ? `Removed: ${parsed.removed.join(", ")}` : "Removed: none";
                    detail = `${roleLine} • ${addedLine} • ${removedLine}`;
                  } catch {
                    detail = entry.detail ?? "No detail";
                  }
                  return (
                    <div key={entry.id} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3 text-xs text-[var(--ink-muted)]">
                      <p className="font-semibold text-[var(--ink)]">{entry.action}</p>
                      <p className="mt-1">Changed by {entry.actorUser.name} • {entry.createdAt.toLocaleString()}</p>
                      <p className="mt-1">{detail}</p>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-[var(--ink-muted)]">No access changes recorded yet for this user.</p>
              )}
            </div>
          </section>
        </>
      ) : (
        <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-6 text-sm text-[var(--ink-muted)]">
          No users match this search filter.
        </section>
      )}
    </div>
  );
}
