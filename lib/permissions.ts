import { Role } from "@prisma/client";

export const EXTRA_PERMISSIONS = [
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
] as const;

export type ExtraPermission = (typeof EXTRA_PERMISSIONS)[number];

type PermissionUser = {
  role: Role;
  permissions?: string[];
};

function hasExtraPermission(user: PermissionUser, permission: ExtraPermission) {
  return Boolean(user.permissions?.includes(permission));
}

export const can = {
  viewClientInfo: (user: PermissionUser) =>
    ["ADMIN", "MANAGER", "FINANCE", "SALES", "OPS", "FRONT_DESK"].includes(user.role) || hasExtraPermission(user, "can_intake"),
  viewFinancials: (user: PermissionUser) =>
    ["ADMIN", "MANAGER", "FINANCE", "OPS"].includes(user.role)
    || hasExtraPermission(user, "can_review_external_bills")
    || hasExtraPermission(user, "can_approve_invoices"),
  createJob: (user: PermissionUser) =>
    ["ADMIN", "MANAGER", "SALES", "OPS", "FRONT_DESK"].includes(user.role) || hasExtraPermission(user, "can_intake"),
  editDiagnosis: (user: PermissionUser) =>
    ["ADMIN", "TECHNICIAN_INTERNAL", "TECHNICIAN_EXTERNAL"].includes(user.role) || hasExtraPermission(user, "can_run_internal_repairs"),
  manageUsers: (user: PermissionUser) => user.role === "ADMIN",
  approveWork: (user: PermissionUser) =>
    ["ADMIN", "MANAGER", "OPS"].includes(user.role) || hasExtraPermission(user, "can_assign_jobs"),
  assignJobs: (user: PermissionUser) =>
    ["ADMIN", "MANAGER", "OPS"].includes(user.role) || hasExtraPermission(user, "can_assign_jobs"),
  searchJobs: (user: PermissionUser) =>
    user.role !== "TECHNICIAN_EXTERNAL" || hasExtraPermission(user, "can_search_jobs"),
  generateJobCards: (user: PermissionUser) =>
    ["ADMIN", "MANAGER", "OPS", "FRONT_DESK", "TECHNICIAN_INTERNAL"].includes(user.role) || hasExtraPermission(user, "can_generate_job_cards"),
  viewApprovedCost: (user: PermissionUser) =>
    ["ADMIN", "MANAGER", "FINANCE", "OPS", "FRONT_DESK"].includes(user.role) || hasExtraPermission(user, "can_view_approved_cost"),
  reviewExternalBills: (user: PermissionUser) =>
    ["ADMIN", "MANAGER", "FINANCE"].includes(user.role) || hasExtraPermission(user, "can_review_external_bills"),
  viewAccountsSummary: (user: PermissionUser) =>
    ["ADMIN", "MANAGER", "FINANCE", "OPS"].includes(user.role) || hasExtraPermission(user, "can_view_accounts_summary"),
  approveInvoices: (user: PermissionUser) =>
    ["ADMIN", "MANAGER", "FINANCE"].includes(user.role) || hasExtraPermission(user, "can_approve_invoices"),
  manageIntake: (user: PermissionUser) =>
    ["ADMIN", "MANAGER", "OPS", "FRONT_DESK"].includes(user.role) || hasExtraPermission(user, "can_manage_intake"),
  viewIntake: (user: PermissionUser) =>
    ["ADMIN", "MANAGER", "OPS", "FRONT_DESK"].includes(user.role) || hasExtraPermission(user, "can_intake") || hasExtraPermission(user, "can_manage_intake"),
  viewNotifications: (user: PermissionUser) =>
    user.role !== "FRONT_DESK",
};

export function asPermissionUser(role: Role, permissions?: string[]): PermissionUser {
  return { role, permissions };
}
