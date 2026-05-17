import { Role } from "@prisma/client";

export const EXTRA_PERMISSIONS = [
  // Jobs & repairs
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
  // Finance
  "can_view_accounts_summary",
  "can_approve_invoices",
  "can_approve_payouts",
  "can_run_financial_reports",
  // Sales
  "can_create_leads",
  "can_view_all_sales",
  "can_create_quotations",
  "can_approve_quotations",
  "can_override_discount",
  "can_create_invoices",
  "can_void_invoices",
  "can_manage_commissions",
  "can_set_targets",
  // POS
  "can_open_pos_session",
  "can_apply_pos_discount",
  "can_process_refunds",
  // Inventory
  "can_manage_inventory",
  "can_adjust_stock",
  // Targets
  "can_view_team_targets",
  "can_manage_targets",
  // Field
  "can_manage_field_visits",
  "can_record_field_signoffs",
] as const;

export type ExtraPermission = (typeof EXTRA_PERMISSIONS)[number];

type PermissionUser = {
  role: Role;
  permissions?: string[];
};

function hasExtraPermission(user: PermissionUser, permission: ExtraPermission) {
  return Boolean(user.permissions?.includes(permission));
}

// Roles that have full internal staff access by default
const ADMIN_ROLES: Role[] = ["ADMIN"];
const OPS_ROLES: Role[] = ["ADMIN", "OPS"];
const SALES_ROLES: Role[] = ["ADMIN", "OPS", "SALES_MANAGER", "SALES_CORPORATE", "SALES_RETAIL"];
const TECH_ROLES: Role[] = ["ADMIN", "TECH_MANAGER", "TECHNICIAN_INTERNAL"];
const FINANCE_ROLES: Role[] = ["ADMIN", "FINANCE"];
const MANAGER_ROLES: Role[] = ["ADMIN", "SALES_MANAGER", "TECH_MANAGER"];

export const can = {
  // ── Client & Job visibility ──────────────────────────────────────────────
  viewClientInfo: (user: PermissionUser) =>
    ["ADMIN", "OPS", "FRONT_DESK", "SALES_MANAGER", "SALES_CORPORATE", "SALES_RETAIL", "FINANCE"].includes(user.role)
    || hasExtraPermission(user, "can_intake"),

  viewFinancials: (user: PermissionUser) =>
    [...OPS_ROLES, ...FINANCE_ROLES, "SALES_MANAGER"].includes(user.role)
    || hasExtraPermission(user, "can_review_external_bills")
    || hasExtraPermission(user, "can_approve_invoices")
    || hasExtraPermission(user, "can_view_accounts_summary"),

  // ── Jobs ─────────────────────────────────────────────────────────────────
  createJob: (user: PermissionUser) =>
    ["ADMIN", "OPS", "FRONT_DESK", "SALES_MANAGER", "SALES_CORPORATE", "SALES_RETAIL"].includes(user.role)
    || hasExtraPermission(user, "can_intake"),

  editDiagnosis: (user: PermissionUser) =>
    ["ADMIN", "TECH_MANAGER", "TECHNICIAN_INTERNAL", "TECHNICIAN_EXTERNAL", "TECH_FIELD"].includes(user.role)
    || hasExtraPermission(user, "can_run_internal_repairs"),

  assignJobs: (user: PermissionUser) =>
    ["ADMIN", "OPS", "TECH_MANAGER"].includes(user.role)
    || hasExtraPermission(user, "can_assign_jobs"),

  approveWork: (user: PermissionUser) =>
    ["ADMIN", "OPS", "TECH_MANAGER"].includes(user.role)
    || hasExtraPermission(user, "can_assign_jobs"),

  searchJobs: (user: PermissionUser) =>
    user.role !== "TECHNICIAN_EXTERNAL"
    || hasExtraPermission(user, "can_search_jobs"),

  generateJobCards: (user: PermissionUser) =>
    ["ADMIN", "OPS", "FRONT_DESK", "TECH_MANAGER", "TECHNICIAN_INTERNAL"].includes(user.role)
    || hasExtraPermission(user, "can_generate_job_cards"),

  viewApprovedCost: (user: PermissionUser) =>
    ["ADMIN", "OPS", "FRONT_DESK", "SALES_MANAGER", "TECH_MANAGER", "FINANCE"].includes(user.role)
    || hasExtraPermission(user, "can_view_approved_cost"),

  reviewExternalBills: (user: PermissionUser) =>
    ["ADMIN", "TECH_MANAGER"].includes(user.role)
    || hasExtraPermission(user, "can_review_external_bills"),

  // ── Finance ──────────────────────────────────────────────────────────────
  viewAccountsSummary: (user: PermissionUser) =>
    ["ADMIN", "OPS", "SALES_MANAGER", "FINANCE"].includes(user.role)
    || hasExtraPermission(user, "can_view_accounts_summary"),

  approveInvoices: (user: PermissionUser) =>
    ["ADMIN", "SALES_MANAGER", "TECH_MANAGER", "FINANCE"].includes(user.role)
    || hasExtraPermission(user, "can_approve_invoices"),

  approvePayouts: (user: PermissionUser) =>
    [...FINANCE_ROLES].includes(user.role)
    || hasExtraPermission(user, "can_approve_payouts"),

  runFinancialReports: (user: PermissionUser) =>
    ["ADMIN", "SALES_MANAGER", "FINANCE"].includes(user.role)
    || hasExtraPermission(user, "can_run_financial_reports"),

  // ── Intake ───────────────────────────────────────────────────────────────
  manageIntake: (user: PermissionUser) =>
    ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role)
    || hasExtraPermission(user, "can_manage_intake"),

  viewIntake: (user: PermissionUser) =>
    ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role)
    || hasExtraPermission(user, "can_intake")
    || hasExtraPermission(user, "can_manage_intake"),

  // ── Sales & CRM ──────────────────────────────────────────────────────────
  createLeads: (user: PermissionUser) =>
    [...SALES_ROLES].includes(user.role)
    || hasExtraPermission(user, "can_create_leads"),

  viewAllSales: (user: PermissionUser) =>
    ["ADMIN", "SALES_MANAGER", "FINANCE"].includes(user.role)
    || hasExtraPermission(user, "can_view_all_sales"),

  createQuotations: (user: PermissionUser) =>
    [...SALES_ROLES, "TECH_MANAGER", "TECHNICIAN_INTERNAL"].includes(user.role)
    || hasExtraPermission(user, "can_create_quotations"),

  approveQuotations: (user: PermissionUser) =>
    ["ADMIN", "SALES_MANAGER", "TECH_MANAGER"].includes(user.role)
    || hasExtraPermission(user, "can_approve_quotations"),

  overrideDiscount: (user: PermissionUser) =>
    ["ADMIN", "SALES_MANAGER"].includes(user.role)
    || hasExtraPermission(user, "can_override_discount"),

  createInvoices: (user: PermissionUser) =>
    [...SALES_ROLES].includes(user.role)
    || hasExtraPermission(user, "can_create_invoices"),

  voidInvoices: (user: PermissionUser) =>
    ["ADMIN", "FINANCE"].includes(user.role)
    || hasExtraPermission(user, "can_void_invoices"),

  manageCommissions: (user: PermissionUser) =>
    ["ADMIN", "SALES_MANAGER", "FINANCE"].includes(user.role)
    || hasExtraPermission(user, "can_manage_commissions"),

  // ── POS ──────────────────────────────────────────────────────────────────
  openPosSession: (user: PermissionUser) =>
    ["ADMIN", "SALES_MANAGER", "SALES_RETAIL", "SALES_POS"].includes(user.role)
    || hasExtraPermission(user, "can_open_pos_session"),

  applyPosDiscount: (user: PermissionUser) =>
    ["ADMIN", "SALES_MANAGER"].includes(user.role)
    || hasExtraPermission(user, "can_apply_pos_discount"),

  processRefunds: (user: PermissionUser) =>
    ["ADMIN", "SALES_MANAGER", "FINANCE"].includes(user.role)
    || hasExtraPermission(user, "can_process_refunds"),

  // ── Inventory ────────────────────────────────────────────────────────────
  manageInventory: (user: PermissionUser) =>
    ["ADMIN", "OPS", "TECH_MANAGER"].includes(user.role)
    || hasExtraPermission(user, "can_manage_inventory"),

  adjustStock: (user: PermissionUser) =>
    ["ADMIN", "FINANCE"].includes(user.role)
    || hasExtraPermission(user, "can_adjust_stock"),

  // ── Targets ──────────────────────────────────────────────────────────────
  setTargets: (user: PermissionUser) =>
    [...MANAGER_ROLES].includes(user.role)
    || hasExtraPermission(user, "can_set_targets"),

  viewTeamTargets: (user: PermissionUser) =>
    [...MANAGER_ROLES, "FINANCE"].includes(user.role)
    || hasExtraPermission(user, "can_view_team_targets"),

  // ── Field work ───────────────────────────────────────────────────────────
  manageFieldVisits: (user: PermissionUser) =>
    ["ADMIN", "OPS", "TECH_MANAGER", "TECH_FIELD"].includes(user.role)
    || hasExtraPermission(user, "can_manage_field_visits"),

  recordFieldSignoffs: (user: PermissionUser) =>
    ["ADMIN", "TECH_FIELD"].includes(user.role)
    || hasExtraPermission(user, "can_record_field_signoffs"),

  // ── Users & system ───────────────────────────────────────────────────────
  manageUsers: (user: PermissionUser) => ADMIN_ROLES.includes(user.role),

  viewNotifications: (user: PermissionUser) =>
    user.role !== "FRONT_DESK",
};

export function asPermissionUser(role: Role, permissions?: string[]): PermissionUser {
  return { role, permissions };
}
