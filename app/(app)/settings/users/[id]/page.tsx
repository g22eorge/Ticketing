import { hashPassword } from "better-auth/crypto";
import { Role } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { assertOrgCanMutate } from "@/lib/org-write";
import { EXTRA_PERMISSIONS } from "@/lib/permissions";

import { UserDetailsForm } from "@/components/settings/UserDetailsForm";
import { UserPasswordResetForm } from "@/components/settings/UserPasswordResetForm";
import { UserAccessControlPanel } from "@/components/settings/UserAccessControlPanel";

const updateUserDetailsSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(80),
  email: z.string().email(),
  phone: z.string().optional(),
});

const resetPasswordSchema = z
  .object({
    userId: z.string().min(1),
    password: z.string().min(8),
    confirm: z.string().min(8),
  })
  .refine((data) => data.password === data.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

const setAccessModeSchema = z.object({
  userId: z.string().min(1),
  accessMode: z.enum(["FULL", "READ_ONLY"]),
});

type UserDetailsState = { error?: string; success?: string };
type UserPasswordResetState = { error?: string; success?: string };

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
  { value: Role.MANAGER, label: "Manager", description: "Oversees operations, staff workload, and pipeline health across all departments." },
  { value: Role.TECH_MANAGER, label: "Tech Manager", description: "Oversees technician performance, repair turnaround, workload balance, and quality metrics." },
  { value: Role.FINANCE, label: "Finance", description: "Reviews invoices, approves costs, manages settlements and financial reports." },
  { value: Role.SALES, label: "Sales", description: "Handles intake, client approvals, quotes, and revenue pipeline tracking." },
  { value: Role.SALES_MANAGER, label: "Sales Manager", description: "Manages sales team, quotations, targets, and commissions." },
  { value: Role.SALES_CORPORATE, label: "Corporate Sales", description: "Handles corporate accounts, invoices, and bulk quotations." },
  { value: Role.SALES_RETAIL, label: "Retail Sales", description: "Handles walk-in retail sales, quotations, and handovers." },
  { value: Role.SALES_POS, label: "POS Operator", description: "Runs point-of-sale transactions and cashier sessions." },
  { value: Role.OPS, label: "Operations/Accounts", description: "Coordinates workflow, billing, settlement, and daily operations." },
  { value: Role.FRONT_DESK, label: "Front Desk", description: "Handles front desk intake, customer details, and handover documents." },
  { value: Role.TECH_FIELD, label: "Field Technician", description: "Handles on-site visits, collections, deliveries, and sign-offs." },
  { value: Role.TECHNICIAN_INTERNAL, label: "Internal Technician", description: "Works diagnosis and in-house repair execution." },
  { value: Role.TECHNICIAN_EXTERNAL, label: "External Technician", description: "External workflow access without client identity or billing history." },
];

const roleDefaults: Partial<Record<Role, Array<(typeof EXTRA_PERMISSIONS)[number]>>> = {
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
  MANAGER: [
    "can_manage_intake",
    "can_search_jobs",
    "can_generate_job_cards",
    "can_assign_jobs",
    "can_view_approved_cost",
    "can_view_external_updates",
    "can_view_external_quotes",
    "can_review_external_bills",
    "can_view_accounts_summary",
    "can_approve_invoices",
  ],
  TECH_MANAGER: [
    "can_run_internal_repairs",
    "can_manage_intake",
    "can_search_jobs",
    "can_generate_job_cards",
    "can_assign_jobs",
    "can_view_job_progress",
    "can_view_approved_cost",
    "can_view_external_updates",
    "can_view_external_quotes",
    "can_review_external_bills",
  ],
  FINANCE: [
    "can_search_jobs",
    "can_view_approved_cost",
    "can_view_external_quotes",
    "can_review_external_bills",
    "can_view_accounts_summary",
    "can_approve_invoices",
  ],
  SALES: [
    "can_intake",
    "can_manage_intake",
    "can_search_jobs",
    "can_generate_job_cards",
    "can_view_job_progress",
    "can_view_approved_cost",
    "can_view_external_quotes",
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

const roleCapabilities: Partial<Record<Role, string[]>> = {
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
  MANAGER: [
    "dashboard_view",
    "jobs_view",
    "jobs_assign",
    "jobs_create",
    "intake_manage",
    "device_records",
    "client_records",
    "parts_bills",
    "invoices_view",
    "invoices_approve",
    "reports_export",
    "approval_cost",
    "download_docs",
  ],
  TECH_MANAGER: [
    "dashboard_view",
    "jobs_view",
    "jobs_assign",
    "jobs_create",
    "intake_manage",
    "device_records",
    "client_records",
    "tech_notes",
    "parts_bills",
    "approval_cost",
    "download_docs",
  ],
  FINANCE: [
    "dashboard_view",
    "jobs_view",
    "client_records",
    "parts_bills",
    "invoices_view",
    "invoices_approve",
    "reports_export",
    "approval_cost",
    "download_docs",
  ],
  SALES: [
    "dashboard_view",
    "jobs_view",
    "jobs_create",
    "intake_manage",
    "device_records",
    "client_records",
    "invoices_view",
    "reports_export",
    "approval_cost",
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
  INTAKE: [
    "dashboard_view",
    "jobs_view",
    "jobs_create",
    "intake_manage",
    "device_records",
    "client_records",
    "download_docs",
  ],
  TECHNICIAN_INTERNAL: ["dashboard_view", "jobs_view", "device_records", "tech_notes", "download_docs"],
  TECHNICIAN_EXTERNAL: ["dashboard_view", "jobs_view", "tech_notes"],
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
  if (role === "MANAGER") return "Manager";
  if (role === "TECH_MANAGER") return "Tech Manager";
  if (role === "FINANCE") return "Finance";
  if (role === "SALES") return "Sales";
  return "Admin";
}

function allowedExtraPermissionsForRole(role: Role, values: Array<(typeof EXTRA_PERMISSIONS)[number]>) {
  if (role === "TECHNICIAN_EXTERNAL") return [];
  return Array.from(new Set(values));
}

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session: _session, user: actor, orgId: actorOrgId, org: _org } = await requireOrgSession();
  if (actor.role !== "ADMIN") redirect("/dashboard");

  const target = await prisma.user.findFirst({
    where: { id, orgId: actorOrgId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      accessMode: true,
      isActive: true,
      updatedAt: true,
      sessions: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } },
      auditLogs: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });

  if (!target) notFound();

  const accessMode = ((target.accessMode as unknown as "FULL" | "READ_ONLY") ?? "FULL");

  let initialPermissions: string[] = [];
  try {
    const rows = await prisma.$queryRaw<Array<{ permission: string }>>`
      SELECT permission FROM "UserPermission" WHERE userId = ${target.id}
    `;
    initialPermissions = rows.map((r) => r.permission).filter(Boolean);
  } catch {
    initialPermissions = [];
  }

  let accessAudit: Array<{ id: string; action: string; detail: string | null; createdAt: Date; actorUser: { name: string } }> = [];
  try {
    accessAudit = await prisma.userAccessAudit.findMany({
      where: { targetUserId: target.id },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, action: true, detail: true, createdAt: true, actorUser: { select: { name: true } } },
    });
  } catch {
    accessAudit = [];
  }

  async function updateUserDetails(state: UserDetailsState, formData: FormData): Promise<UserDetailsState> {
    "use server";

    const { session, user: actor, orgId: actorOrgId, org } = await requireOrgSession();
    if (actor.role !== "ADMIN") return { error: "Not authorized" };
    assertOrgCanMutate({ access: org.access, userRole: actor.role, userAccessMode: actor.accessMode, kind: "GENERAL" });

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

    await prisma.user.update({
      where: { id: parsed.data.id },
      data: { name: parsed.data.name, email: parsed.data.email, phone: nextPhone },
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

    revalidatePath(`/settings/users/${parsed.data.id}`);
    revalidatePath("/settings/users");
    return { success: "User details saved" };
  }

  async function resetUserPassword(state: UserPasswordResetState, formData: FormData): Promise<UserPasswordResetState> {
    "use server";

    const { session, user: actor, orgId: actorOrgId, org } = await requireOrgSession();
    if (actor.role !== "ADMIN") return { error: "Not authorized" };
    assertOrgCanMutate({ access: org.access, userRole: actor.role, userAccessMode: actor.accessMode, kind: "GENERAL" });

    const parsed = resetPasswordSchema.safeParse({
      userId: String(formData.get("userId") ?? "").trim(),
      password: String(formData.get("password") ?? ""),
      confirm: String(formData.get("confirm") ?? ""),
    });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid password" };

    const target = await prisma.user.findFirst({
      where: { id: parsed.data.userId, orgId: actorOrgId },
      select: { id: true },
    });
    if (!target) return { error: "User not found" };

    const hashed = await hashPassword(parsed.data.password);

    await prisma.$transaction(async (tx) => {
      const updated = await tx.account.updateMany({
        where: { userId: parsed.data.userId, providerId: "credential" },
        data: { password: hashed },
      });
      if (updated.count === 0) {
        await tx.account.create({
          data: { accountId: parsed.data.userId, providerId: "credential", userId: parsed.data.userId, password: hashed },
        });
      }

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

    revalidatePath(`/settings/users/${parsed.data.userId}`);
    return { success: "Password reset. User has been signed out." };
  }

  async function setUserAccessMode(formData: FormData) {
    "use server";

    const { session, user: actor, orgId: actorOrgId, org } = await requireOrgSession();
    if (actor.role !== "ADMIN") return;
    assertOrgCanMutate({ access: org.access, userRole: actor.role, userAccessMode: actor.accessMode, kind: "GENERAL" });

    const parsed = setAccessModeSchema.safeParse({
      userId: String(formData.get("userId") ?? "").trim(),
      accessMode: String(formData.get("accessMode") ?? ""),
    });
    if (!parsed.success) return;

    if (parsed.data.userId === session.user.id && parsed.data.accessMode === "READ_ONLY") return;

    const existing = await prisma.user.findFirst({
      where: { id: parsed.data.userId, orgId: actorOrgId },
      select: { id: true, accessMode: true },
    });
    if (!existing) return;

    const prevAccessMode = (existing.accessMode as unknown as "FULL" | "READ_ONLY") ?? "FULL";
    if (prevAccessMode === parsed.data.accessMode) return;

    await prisma.user.updateMany({ where: { id: parsed.data.userId, orgId: actorOrgId }, data: { accessMode: parsed.data.accessMode } });

    try {
      await prisma.userAccessAudit.create({
        data: {
          actorUserId: session.user.id,
          targetUserId: parsed.data.userId,
          action: "ACCESS_MODE_UPDATED",
          detail: JSON.stringify({ from: prevAccessMode, to: parsed.data.accessMode }),
        },
      });
    } catch {
      // ignore
    }

    revalidatePath(`/settings/users/${parsed.data.userId}`);
    revalidatePath("/settings/users");
  }

  async function saveAccessChanges(formData: FormData) {
    "use server";

    const { session, user: actor, orgId: actorOrgId, org } = await requireOrgSession();
    if (actor.role !== "ADMIN") return;
    assertOrgCanMutate({ access: org.access, userRole: actor.role, userAccessMode: actor.accessMode, kind: "GENERAL" });

    const targetUserId = String(formData.get("userId") ?? "").trim();
    const nextRole = String(formData.get("role") ?? "") as Role;
    const submittedPermissionValues = formData
      .getAll("permissions")
      .map((value) => String(value).trim())
      .filter((value): value is (typeof EXTRA_PERMISSIONS)[number] =>
        EXTRA_PERMISSIONS.includes(value as (typeof EXTRA_PERMISSIONS)[number]),
      );

    if (!targetUserId || !Object.values(Role).includes(nextRole)) return;
    const permissionValues = allowedExtraPermissionsForRole(nextRole, submittedPermissionValues);

    const target = await prisma.user.findFirst({ where: { id: targetUserId, orgId: actorOrgId }, select: { id: true, role: true } });
    if (!target) return;

    if (target.id === session.user.id && nextRole !== "ADMIN") return;

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

    await prisma.$transaction(async (tx) => {
      await tx.user.updateMany({ where: { id: targetUserId, orgId: actorOrgId }, data: { role: nextRole } });
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
          detail: JSON.stringify({ fromRole: target.role, toRole: nextRole, added, removed }),
        },
      });
    } catch {
      // ignore
    }

    revalidatePath(`/settings/users/${targetUserId}`);
    revalidatePath("/settings/users");
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        {/* Left column */}
        <div className="space-y-3">
          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Settings · User</p>
                <p className="mt-0.5 text-[13px] font-semibold text-[var(--ink)]">{target.name}</p>
                <p className="text-[13px] text-[var(--ink-muted)]">{target.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-0.5 text-[12px] font-semibold text-[var(--ink-muted)]">{roleLabel(target.role)}</span>
                <span className="rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-0.5 text-[12px] font-semibold text-[var(--ink-muted)]">{accessMode === "READ_ONLY" ? "Read-only" : "Full"}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[12px] font-semibold ${target.isActive ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-[var(--line)] text-[var(--ink-muted)]"}`}>{target.isActive ? "Active" : "Inactive"}</span>
              </div>
            </div>
            <p className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">Profile</p>
            <UserDetailsForm id={target.id} name={target.name} email={target.email} phone={target.phone} action={updateUserDetails} />
          </section>

          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
            <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">Access Mode</p>
            <form action={setUserAccessMode} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="userId" value={target.id} />
              <select
                name="accessMode"
                defaultValue={accessMode}
                className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50"
                disabled={target.id === actor.id}
              >
                <option value="FULL">Full access</option>
                <option value="READ_ONLY">Read-only</option>
              </select>
              <button type="submit" className="btn-premium-secondary rounded-lg px-3 py-1.5 text-[13px]" disabled={target.id === actor.id}>Apply</button>
              {target.id === actor.id ? (
                <p className="text-[13px] text-[var(--ink-muted)]">Cannot change your own mode.</p>
              ) : null}
            </form>
          </section>

          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
            <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">Reset Password</p>
            <UserPasswordResetForm userId={target.id} action={resetUserPassword} />
          </section>

          {/* Audit log */}
          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            <p className="px-3 pt-3 text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">Access Log</p>
            <div className="mt-1 divide-y divide-[var(--line)]">
              {accessAudit.length > 0 ? (
                accessAudit.map((entry) => (
                  <div key={entry.id} className="px-3 py-2">
                    <p className="text-[13px] font-medium text-[var(--ink)]">{entry.action}</p>
                    <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">{entry.actorUser.name} · {entry.createdAt.toLocaleString()}</p>
                  </div>
                ))
              ) : (
                <p className="px-3 py-3 text-[13px] text-[var(--ink-muted)]">No access changes recorded yet.</p>
              )}
            </div>
          </section>
        </div>

        {/* Right column: Permissions */}
        <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
          <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">Permissions</p>
          <UserAccessControlPanel
            key={target.id}
            userId={target.id}
            queryText=""
            initialRole={target.role}
            initialPermissions={initialPermissions}
            roleOptions={roleOptions}
            roleDefaultPermissions={roleDefaults}
            roleDefaultCapabilities={roleCapabilities}
            permissions={permissionOptions}
            saveAction={saveAccessChanges}
          />
        </section>
      </div>
    </div>
  );
}
