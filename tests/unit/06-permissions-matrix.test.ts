/**
 * Group 6 — Comprehensive role × permission matrix (tests 45–80)
 *
 * Verifies every can.* function against every relevant Role combination
 * without touching the database. Pure unit tests.
 */

import { test, expect } from "bun:test";
import { can } from "@/lib/permissions";
import type { Role } from "@prisma/client";

function u(role: Role, permissions: string[] = []) {
  return { role, permissions };
}

// ── viewClientInfo ──────────────────────────────────────────────────────────

test("45: viewClientInfo — ADMIN, MANAGER, OPS, FINANCE all return true", () => {
  for (const role of ["ADMIN", "MANAGER", "OPS", "FINANCE"] as Role[]) {
    expect(can.viewClientInfo(u(role)), `role=${role}`).toBe(true);
  }
});

test("46: viewClientInfo — TECHNICIAN_EXTERNAL without extra permission returns false", () => {
  expect(can.viewClientInfo(u("TECHNICIAN_EXTERNAL"))).toBe(false);
});

test("47: viewClientInfo — TECHNICIAN_INTERNAL without extra permission returns false", () => {
  expect(can.viewClientInfo(u("TECHNICIAN_INTERNAL"))).toBe(false);
});

test("48: viewClientInfo — TECHNICIAN_INTERNAL with can_intake returns true", () => {
  expect(can.viewClientInfo(u("TECHNICIAN_INTERNAL", ["can_intake"]))).toBe(true);
});

// ── viewFinancials ──────────────────────────────────────────────────────────

test("49: viewFinancials — ADMIN, MANAGER, FINANCE, OPS all return true", () => {
  for (const role of ["ADMIN", "MANAGER", "FINANCE", "OPS"] as Role[]) {
    expect(can.viewFinancials(u(role)), `role=${role}`).toBe(true);
  }
});

test("50: viewFinancials — TECHNICIAN_EXTERNAL and TECHNICIAN_INTERNAL return false", () => {
  expect(can.viewFinancials(u("TECHNICIAN_EXTERNAL"))).toBe(false);
  expect(can.viewFinancials(u("TECHNICIAN_INTERNAL"))).toBe(false);
});

test("51: viewFinancials — TECHNICIAN_EXTERNAL with can_review_external_bills returns true", () => {
  expect(can.viewFinancials(u("TECHNICIAN_EXTERNAL", ["can_review_external_bills"]))).toBe(true);
});

// ── createJob ───────────────────────────────────────────────────────────────

test("52: createJob — ADMIN, OPS, SALES, SALES_MANAGER all return true", () => {
  for (const role of ["ADMIN", "OPS", "SALES", "SALES_MANAGER"] as Role[]) {
    expect(can.createJob(u(role)), `role=${role}`).toBe(true);
  }
});

test("53: createJob — TECHNICIAN_EXTERNAL returns false", () => {
  expect(can.createJob(u("TECHNICIAN_EXTERNAL"))).toBe(false);
});

test("54: createJob — TECH_MANAGER returns true by role", () => {
  expect(can.createJob(u("TECH_MANAGER"))).toBe(true);
});

// ── editDiagnosis ────────────────────────────────────────────────────────────

test("55: editDiagnosis — TECHNICIAN_INTERNAL, TECHNICIAN_EXTERNAL, ADMIN, TECH_FIELD all return true", () => {
  for (const role of ["TECHNICIAN_INTERNAL", "TECHNICIAN_EXTERNAL", "ADMIN", "TECH_FIELD"] as Role[]) {
    expect(can.editDiagnosis(u(role)), `role=${role}`).toBe(true);
  }
});

test("56: editDiagnosis — OPS returns false without extra permission", () => {
  expect(can.editDiagnosis(u("OPS"))).toBe(false);
});

test("57: editDiagnosis — OPS with can_run_internal_repairs returns true", () => {
  expect(can.editDiagnosis(u("OPS", ["can_run_internal_repairs"]))).toBe(true);
});

// ── assignJobs & approveWork ─────────────────────────────────────────────────

test("58: assignJobs — ADMIN, MANAGER, OPS, TECH_MANAGER return true", () => {
  for (const role of ["ADMIN", "MANAGER", "OPS", "TECH_MANAGER"] as Role[]) {
    expect(can.assignJobs(u(role)), `role=${role}`).toBe(true);
  }
});

test("59: assignJobs — TECHNICIAN_INTERNAL, TECHNICIAN_EXTERNAL return false", () => {
  expect(can.assignJobs(u("TECHNICIAN_INTERNAL"))).toBe(false);
  expect(can.assignJobs(u("TECHNICIAN_EXTERNAL"))).toBe(false);
});

test("60: approveWork — mirrors assignJobs for base roles", () => {
  expect(can.approveWork(u("ADMIN"))).toBe(true);
  expect(can.approveWork(u("TECHNICIAN_EXTERNAL"))).toBe(false);
});

// ── Finance functions ────────────────────────────────────────────────────────

test("61: approvePayouts — only ADMIN, MANAGER, FINANCE return true", () => {
  expect(can.approvePayouts(u("ADMIN"))).toBe(true);
  expect(can.approvePayouts(u("FINANCE"))).toBe(true);
  expect(can.approvePayouts(u("OPS"))).toBe(false);
  expect(can.approvePayouts(u("SALES"))).toBe(false);
});

test("62: runFinancialReports — ADMIN, MANAGER, FINANCE, SALES_MANAGER return true", () => {
  for (const role of ["ADMIN", "MANAGER", "FINANCE", "SALES_MANAGER"] as Role[]) {
    expect(can.runFinancialReports(u(role)), `role=${role}`).toBe(true);
  }
  expect(can.runFinancialReports(u("OPS"))).toBe(false);
});

test("63: voidInvoices — only ADMIN and FINANCE return true by role", () => {
  expect(can.voidInvoices(u("ADMIN"))).toBe(true);
  expect(can.voidInvoices(u("FINANCE"))).toBe(true);
  expect(can.voidInvoices(u("OPS"))).toBe(false);
  expect(can.voidInvoices(u("MANAGER"))).toBe(false);
});

// ── POS functions ────────────────────────────────────────────────────────────

test("64: openPosSession — ADMIN, MANAGER, OPS, FRONT_DESK, SALES return true", () => {
  for (const role of ["ADMIN", "MANAGER", "OPS", "FRONT_DESK", "SALES"] as Role[]) {
    expect(can.openPosSession(u(role)), `role=${role}`).toBe(true);
  }
});

test("65: openPosSession — TECHNICIAN_INTERNAL returns false without extra permission", () => {
  expect(can.openPosSession(u("TECHNICIAN_INTERNAL"))).toBe(false);
});

test("66: applyPosDiscount — only ADMIN, MANAGER, SALES_MANAGER return true by role", () => {
  expect(can.applyPosDiscount(u("ADMIN"))).toBe(true);
  expect(can.applyPosDiscount(u("SALES_MANAGER"))).toBe(true);
  expect(can.applyPosDiscount(u("SALES"))).toBe(false);
  expect(can.applyPosDiscount(u("OPS"))).toBe(false);
});

// ── Inventory ────────────────────────────────────────────────────────────────

test("67: adjustStock — only ADMIN and FINANCE return true by role", () => {
  expect(can.adjustStock(u("ADMIN"))).toBe(true);
  expect(can.adjustStock(u("FINANCE"))).toBe(true);
  expect(can.adjustStock(u("OPS"))).toBe(false);
  expect(can.adjustStock(u("MANAGER"))).toBe(false);
});

test("68: adjustStock — OPS with can_adjust_stock extra permission returns true", () => {
  expect(can.adjustStock(u("OPS", ["can_adjust_stock"]))).toBe(true);
});

test("69: manageInventory — ADMIN, MANAGER, OPS, TECH_MANAGER return true", () => {
  for (const role of ["ADMIN", "MANAGER", "OPS", "TECH_MANAGER"] as Role[]) {
    expect(can.manageInventory(u(role)), `role=${role}`).toBe(true);
  }
  expect(can.manageInventory(u("SALES"))).toBe(false);
});

// ── Targets ──────────────────────────────────────────────────────────────────

test("70: setTargets — ADMIN, MANAGER, SALES_MANAGER, TECH_MANAGER return true", () => {
  for (const role of ["ADMIN", "MANAGER", "SALES_MANAGER", "TECH_MANAGER"] as Role[]) {
    expect(can.setTargets(u(role)), `role=${role}`).toBe(true);
  }
  expect(can.setTargets(u("SALES"))).toBe(false);
});

test("71: viewTeamTargets — FINANCE can view but not set targets", () => {
  expect(can.viewTeamTargets(u("FINANCE"))).toBe(true);
  expect(can.setTargets(u("FINANCE"))).toBe(false);
});

// ── Field work ───────────────────────────────────────────────────────────────

test("72: manageFieldVisits — ADMIN, MANAGER, OPS, TECH_MANAGER, TECH_FIELD return true", () => {
  for (const role of ["ADMIN", "MANAGER", "OPS", "TECH_MANAGER", "TECH_FIELD"] as Role[]) {
    expect(can.manageFieldVisits(u(role)), `role=${role}`).toBe(true);
  }
  expect(can.manageFieldVisits(u("SALES"))).toBe(false);
});

test("73: recordFieldSignoffs — only ADMIN and TECH_FIELD return true by role", () => {
  expect(can.recordFieldSignoffs(u("ADMIN"))).toBe(true);
  expect(can.recordFieldSignoffs(u("TECH_FIELD"))).toBe(true);
  expect(can.recordFieldSignoffs(u("OPS"))).toBe(false);
  expect(can.recordFieldSignoffs(u("MANAGER"))).toBe(false);
});

// ── Users & notifications ────────────────────────────────────────────────────

test("74: manageUsers — only ADMIN returns true", () => {
  const nonAdmin: Role[] = ["MANAGER", "OPS", "SALES", "TECHNICIAN_INTERNAL", "TECHNICIAN_EXTERNAL", "FINANCE"];
  for (const role of nonAdmin) {
    expect(can.manageUsers(u(role)), `role=${role}`).toBe(false);
  }
  expect(can.manageUsers(u("ADMIN"))).toBe(true);
});

test("75: viewNotifications — FRONT_DESK returns false, all other base roles return true", () => {
  expect(can.viewNotifications(u("FRONT_DESK"))).toBe(false);
  for (const role of ["ADMIN", "MANAGER", "OPS", "TECHNICIAN_INTERNAL", "SALES"] as Role[]) {
    expect(can.viewNotifications(u(role)), `role=${role}`).toBe(true);
  }
});

// ── Extra permissions override role ─────────────────────────────────────────

test("76: TECHNICIAN_EXTERNAL with can_manage_field_visits can manage field visits", () => {
  expect(can.manageFieldVisits(u("TECHNICIAN_EXTERNAL", ["can_manage_field_visits"]))).toBe(true);
});

test("77: TECHNICIAN_EXTERNAL with can_record_field_signoffs can record signoffs", () => {
  expect(can.recordFieldSignoffs(u("TECHNICIAN_EXTERNAL", ["can_record_field_signoffs"]))).toBe(true);
});

test("78: SALES role can create quotations without extra permission", () => {
  expect(can.createQuotations(u("SALES"))).toBe(true);
  expect(can.approveQuotations(u("SALES"))).toBe(false);
});

test("79: SALES_MANAGER can approve quotations and override discounts", () => {
  expect(can.approveQuotations(u("SALES_MANAGER"))).toBe(true);
  expect(can.overrideDiscount(u("SALES_MANAGER"))).toBe(true);
});

test("80: processRefunds — only ADMIN, MANAGER, SALES_MANAGER, FINANCE return true by role", () => {
  expect(can.processRefunds(u("ADMIN"))).toBe(true);
  expect(can.processRefunds(u("FINANCE"))).toBe(true);
  expect(can.processRefunds(u("SALES_MANAGER"))).toBe(true);
  expect(can.processRefunds(u("SALES"))).toBe(false);
  expect(can.processRefunds(u("OPS"))).toBe(false);
});
