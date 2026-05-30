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
import { inviteSchema, INVITE_TTL_DAYS, type InviteState } from "@/lib/invites";
import { InvitePanel } from "@/components/settings/InvitePanel";
import { checkUserLimit, getLimitsForOrg } from "@/lib/plan-limits";
import { PlanBanner } from "@/components/shared/PlanBanner";
import { rateLimit } from "@/lib/rate-limit";

type SearchParams = {
  q?: string;
  userId?: string;
  limitError?: string;
  add?: string;
  tab?: string;
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
  { value: Role.MANAGER, label: "Manager", description: "Oversees operations, staff workload, and pipeline health across all departments." },
  { value: Role.TECH_MANAGER, label: "Tech Manager", description: "Oversees technician performance, repair turnaround, workload balance, and quality metrics." },
  { value: Role.FINANCE, label: "Finance", description: "Reviews invoices, approves costs, manages settlements and financial reports." },
  { value: Role.SALES, label: "Sales", description: "Handles intake, client approvals, quotes, and revenue pipeline tracking." },
  { value: Role.SALES_MANAGER, label: "Sales Manager", description: "Manages sales team, quotations, targets, and commissions." },
  { value: Role.SALES_CORPORATE, label: "Corporate Sales", description: "Handles corporate accounts, invoices, and bulk quotations." },
  { value: Role.SALES_RETAIL, label: "Retail Sales", description: "Handles walk-in retail sales, quotations, and handovers." },
  { value: Role.SALES_POS, label: "POS Operator", description: "Runs point-of-sale transactions and daily cashier sessions." },
  { value: Role.OPS, label: "Operations/Accounts", description: "Coordinates workflow, billing, settlement, and daily operations." },
  { value: Role.FRONT_DESK, label: "Front Desk", description: "Handles front desk intake, customer details, and handover documents." },
  { value: Role.TECH_FIELD, label: "Field Technician", description: "Handles on-site visits, collections, deliveries, and client sign-offs." },
  { value: Role.TECHNICIAN_INTERNAL, label: "Internal Technician", description: "Works diagnosis and in-house repair execution." },
  { value: Role.TECHNICIAN_EXTERNAL, label: "External Technician", description: "External workflow access without client identity or billing history." },
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
  SALES_MANAGER: [
    "can_search_jobs",
    "can_view_job_progress",
    "can_view_approved_cost",
    "can_view_accounts_summary",
    "can_approve_invoices",
    "can_create_leads",
    "can_view_all_sales",
    "can_create_quotations",
    "can_approve_quotations",
    "can_override_discount",
    "can_create_invoices",
    "can_manage_commissions",
    "can_set_targets",
    "can_view_team_targets",
  ],
  SALES_CORPORATE: [
    "can_search_jobs",
    "can_create_leads",
    "can_create_quotations",
    "can_create_invoices",
  ],
  SALES_RETAIL: [
    "can_search_jobs",
    "can_create_leads",
    "can_create_quotations",
    "can_open_pos_session",
  ],
  SALES_POS: [
    "can_open_pos_session",
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
  TECH_FIELD: [
    "can_search_jobs",
    "can_view_job_progress",
    "can_manage_field_visits",
    "can_record_field_signoffs",
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
  SALES_MANAGER: [
    "dashboard_view",
    "jobs_view",
    "jobs_create",
    "client_records",
    "invoices_view",
    "invoices_approve",
    "reports_export",
    "approval_cost",
    "download_docs",
  ],
  SALES_CORPORATE: [
    "dashboard_view",
    "jobs_view",
    "client_records",
    "invoices_view",
    "download_docs",
  ],
  SALES_RETAIL: [
    "dashboard_view",
    "jobs_view",
    "client_records",
    "download_docs",
  ],
  SALES_POS: [
    "dashboard_view",
    "jobs_view",
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
  TECH_FIELD: [
    "dashboard_view",
    "jobs_view",
    "device_records",
    "tech_notes",
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
  if (role === "MANAGER") return "Manager";
  if (role === "TECH_MANAGER") return "Tech Manager";
  if (role === "FINANCE") return "Finance";
  if (role === "SALES") return "Sales";
  const found = roleOptions.find((r) => r.value === role);
  if (found) return found.label;
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

  async function toggleUserActive(formData: FormData) {
    "use server";
    const { user: actor, orgId: actorOrgId, session } = await requireOrgSession();
    if (actor.role !== "ADMIN") return;
    const targetId = String(formData.get("userId") ?? "").trim();
    const q = String(formData.get("q") ?? "").trim();
    if (!targetId || targetId === session.user.id) return; // can't deactivate yourself
    const target = await prisma.user.findUnique({ where: { id: targetId, orgId: actorOrgId }, select: { id: true, isActive: true } });
    if (!target) return;
    await prisma.user.update({ where: { id: targetId }, data: { isActive: !target.isActive } });
    // Revoke all active sessions when deactivating
    if (target.isActive) {
      await prisma.session.deleteMany({ where: { userId: targetId } }).catch(() => {});
    }
    revalidatePath("/settings/users");
    redirect(`/settings/users?${new URLSearchParams({ q, userId: targetId }).toString()}`);
  }

  async function inviteUser(_prev: InviteState, formData: FormData): Promise<InviteState> {
    "use server";

    const { user: actor, orgId: actorOrgId } = await requireOrgSession();
    if (actor.role !== "ADMIN") return { error: "Only admins can invite users." };

    const rl = rateLimit.invite(actorOrgId);
    if (!rl.allowed) return { error: "Too many invites sent recently. Please wait before generating more." };

    const parsed = inviteSchema.safeParse({
      email: String(formData.get("email") ?? "").trim().toLowerCase(),
      role: String(formData.get("role") ?? "OPS"),
    });
    if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

    const { email, role } = parsed.data;

    // Block if email already belongs to this org.
    const existing = await prisma.user.findFirst({
      where: { email, orgId: actorOrgId },
      select: { id: true },
    });
    if (existing) return { error: "That email already has an account in this workspace." };

    // Enforce plan user limit.
    const userLimit = await checkUserLimit(actorOrgId);
    if (!userLimit.allowed) return { error: userLimit.reason };

    // Expire any previous pending invites for this email in this org.
    await prisma.userInvite.updateMany({
      where: { email, orgId: actorOrgId, usedAt: null },
      data: { expiresAt: new Date() },
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_TTL_DAYS);

    const invite = await prisma.userInvite.create({
      data: { email, role, orgId: actorOrgId, invitedById: actor.id, expiresAt },
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const inviteUrl = `${baseUrl}/invite/${invite.token}`;

    return { inviteUrl };
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

    const userLimit = await checkUserLimit(actorOrgId);
    if (!userLimit.allowed) {
      // Can't return from a void server action — redirect with error param
      redirect(`/settings/users?limitError=${encodeURIComponent(userLimit.reason)}`);
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

  // Fetch plan limits and current usage for the banner.
  const planInfo = await getLimitsForOrg(orgId);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [activeUserCount, jobsThisMonth, partCount] = await Promise.all([
    prisma.user.count({ where: { orgId, isActive: true } }),
    prisma.job.count({ where: { orgId, receivedAt: { gte: monthStart } } }),
    prisma.part.count({ where: { orgId, isActive: true } }),
  ]);

  const params = await searchParams;
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

  const limitError = typeof params.limitError === "string" ? params.limitError : null;
  const showAdd = params.add === "1";
  const tab = params.tab ?? "profile";

  function tabHref(t: string) {
    return `/settings/users?${new URLSearchParams({ ...(q && { q }), ...(selectedUser && { userId: selectedUser.id }), tab: t }).toString()}`;
  }

  const tabs = [
    { key: "profile", label: "Profile" },
    { key: "access", label: "Access" },
    { key: "security", label: "Security" },
    { key: "log", label: "Log" },
  ];

  return (
    <div className="space-y-3">
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        <p className="text-[13px] font-bold text-[var(--ink)]">User Management</p>
        <p className="text-[13px] text-[var(--ink-muted)]">Manage team access, roles and permissions</p>
      </div>

      <PlanBanner plan={planInfo.plan} limits={planInfo} usage={{ users: activeUserCount, jobsThisMonth, parts: partCount }} />

      {limitError && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-400">
          {limitError}
        </p>
      )}

      {/* Add User — inline, toggled by URL param */}
      {showAdd && (
        <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">Add User</p>
            <Link href="/settings/users" className="text-[13px] text-[var(--ink-muted)] hover:text-[var(--ink)]">✕ Close</Link>
          </div>
          <InvitePanel inviteAction={inviteUser} roleOptions={roleOptions} />
          <div className="mt-3 border-t border-[var(--line)] pt-3">
            <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Or create directly</p>
            <form action={createUser} className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
              <input required name="name" placeholder="Name" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
              <input required type="email" name="email" placeholder="Email" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
              <input name="phone" placeholder="Phone" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
              <input required minLength={8} type="password" name="password" placeholder="Password (min 8)" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
              <select name="role" defaultValue="OPS" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14">
                {roleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button type="submit" className="btn-premium rounded-lg px-3 py-1.5 text-[13px] text-white">Create</button>
            </form>
          </div>
        </section>
      )}

      {/* Main two-column layout */}
      <div className="grid gap-3 lg:grid-cols-[260px_1fr]">

        {/* Left: search + user list */}
        <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2">
            <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">Users</p>
            <Link
              href={showAdd ? "/settings/users" : "/settings/users?add=1"}
              className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1 text-[13px] font-semibold text-[var(--ink-muted)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]"
            >
              {showAdd ? "Close" : "+ Add"}
            </Link>
          </div>
          <form method="GET" className="flex gap-1 border-b border-[var(--line)] px-2 py-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search…"
              className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50"
            />
            {q ? (
              <Link href="/settings/users" className="flex items-center rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 text-[13px] text-[var(--ink-muted)] hover:text-[var(--ink)]">✕</Link>
            ) : null}
          </form>
          <div className="divide-y divide-[var(--line)]">
            {filteredUsers.map((item) => (
              <Link
                key={item.id}
                href={`/settings/users?${new URLSearchParams({ ...(q && { q }), userId: item.id }).toString()}`}
                className={`flex items-center gap-2.5 px-3 py-2.5 transition ${selectedUser?.id === item.id ? "bg-[var(--accent)]/8" : "hover:bg-[var(--panel-strong)]/40"}`}
              >
                <span className={`h-5 w-0.5 shrink-0 rounded-full transition-all ${selectedUser?.id === item.id ? "bg-[var(--accent)]" : "bg-transparent"}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[var(--ink)]">{item.name}</p>
                  <p className="truncate text-[13px] text-[var(--ink-muted)]">{roleLabel(item.role)}</p>
                </div>
                {!item.isActive && (
                  <span className="shrink-0 rounded-full border border-[var(--line)] px-1.5 py-0.5 text-[12px] text-[var(--ink-muted)]">Off</span>
                )}
              </Link>
            ))}
            {filteredUsers.length === 0 && (
              <p className="px-3 py-5 text-center text-[13px] text-[var(--ink-muted)]">No users found.</p>
            )}
          </div>
        </section>

        {/* Right: selected user */}
        {selectedUser ? (
          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            {/* User header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-[var(--ink)]">{selectedUser.name}</p>
                <p className="truncate text-[13px] text-[var(--ink-muted)]">{selectedUser.email} · {roleLabel(selectedUser.role)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className={`rounded-full border px-2 py-0.5 text-[12px] font-semibold ${selectedUser.isActive ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-[var(--line)] text-[var(--ink-muted)]"}`}>
                  {selectedUser.isActive ? "Active" : "Inactive"}
                </span>
                {user.role === "ADMIN" && selectedUser.id !== user.id && (
                  <form action={toggleUserActive}>
                    <input type="hidden" name="userId" value={selectedUser.id} />
                    <input type="hidden" name="q" value={q} />
                    <button
                      type="submit"
                      className={`rounded border px-2 py-0.5 text-[12px] font-semibold transition-colors ${selectedUser.isActive ? "border-red-400/30 text-red-600 hover:bg-red-500/10 dark:text-red-400" : "border-emerald-400/30 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"}`}
                    >
                      {selectedUser.isActive ? "Deactivate" : "Reactivate"}
                    </button>
                  </form>
                )}
                <span className="text-[13px] text-[var(--ink-muted)]">
                  Last seen {formatDateTime(selectedUser.sessions[0]?.updatedAt ?? selectedUser.auditLogs[0]?.createdAt ?? selectedUser.updatedAt)}
                </span>
              </div>
            </div>

            {/* Tab strip */}
            <div className="flex border-b border-[var(--line)]">
              {tabs.map(({ key, label }) => (
                <Link
                  key={key}
                  href={tabHref(key)}
                  className={`px-4 py-2.5 text-[13px] font-medium transition ${tab === key ? "border-b-2 border-[var(--accent)] text-[var(--ink)]" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"}`}
                >
                  {label}
                </Link>
              ))}
            </div>

            {/* Tab content */}
            <div className="p-3">
              {tab === "profile" && (
                <UserDetailsForm
                  id={selectedUser.id}
                  name={selectedUser.name}
                  email={selectedUser.email}
                  phone={selectedUser.phone}
                  action={updateUserDetails}
                />
              )}
              {tab === "access" && (
                <UserAccessControlPanel
                  key={selectedUser.id}
                  userId={selectedUser.id}
                  queryText={q}
                  initialRole={selectedUser.role}
                  initialPermissions={selectedUser.permissionGrants.map((g) => g.permission)}
                  roleOptions={roleOptions}
                  roleDefaultPermissions={roleDefaults}
                  roleDefaultCapabilities={roleCapabilities}
                  permissions={permissionOptions}
                  saveAction={saveAccessChanges}
                />
              )}
              {tab === "security" && (
                <UserPasswordResetForm userId={selectedUser.id} action={resetUserPassword} />
              )}
              {tab === "log" && (
                <div className="divide-y divide-[var(--line)]">
                  {accessAudit.length > 0 ? (
                    accessAudit.map((entry) => {
                      let detail = "";
                      try {
                        const parsed = entry.detail ? JSON.parse(entry.detail) as { added?: string[]; removed?: string[]; fromRole?: string; toRole?: string } : null;
                        const parts = [
                          parsed?.fromRole !== parsed?.toRole ? `Role → ${parsed?.toRole}` : null,
                          parsed?.added?.length ? `+${parsed.added.join(", ")}` : null,
                          parsed?.removed?.length ? `−${parsed.removed.join(", ")}` : null,
                        ].filter(Boolean);
                        detail = parts.join(" · ");
                      } catch {
                        detail = entry.detail ?? "";
                      }
                      return (
                        <div key={entry.id} className="py-2">
                          <p className="text-[13px] font-medium text-[var(--ink)]">{entry.action}</p>
                          <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">{entry.actorUser.name} · {entry.createdAt.toLocaleString()}</p>
                          {detail ? <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">{detail}</p> : null}
                        </div>
                      );
                    })
                  ) : (
                    <p className="py-4 text-center text-[13px] text-[var(--ink-muted)]">No access changes recorded yet.</p>
                  )}
                </div>
              )}
            </div>
          </section>
        ) : (
          <div className="panel-shadow flex items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--panel)] p-12 text-[13px] text-[var(--ink-muted)]">
            Select a user to manage their profile and access.
          </div>
        )}
      </div>
    </div>
  );
}
