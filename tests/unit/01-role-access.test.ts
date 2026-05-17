import { test, expect } from "bun:test";
import { can } from "@/lib/permissions";
import type { Role } from "@prisma/client";

// Helper to build a minimal user object
function user(role: Role, permissions: string[] = []) {
  return { role, permissions };
}

// ── Test 1 ───────────────────────────────────────────────────────────────────
// TECHNICIAN_EXTERNAL cannot view client info
test("1: TECHNICIAN_EXTERNAL cannot view client info", () => {
  expect(can.viewClientInfo(user("TECHNICIAN_EXTERNAL"))).toBe(false);
});

// ── Test 2 ───────────────────────────────────────────────────────────────────
// TECHNICIAN_EXTERNAL cannot view financials
test("2: TECHNICIAN_EXTERNAL cannot view financials", () => {
  expect(can.viewFinancials(user("TECHNICIAN_EXTERNAL"))).toBe(false);
});

// ── Test 3 ───────────────────────────────────────────────────────────────────
// ADMIN can view client info and financials
test("3: ADMIN can view client info and financials", () => {
  const admin = user("ADMIN");
  expect(can.viewClientInfo(admin)).toBe(true);
  expect(can.viewFinancials(admin)).toBe(true);
});

// ── Test 4 ───────────────────────────────────────────────────────────────────
// FRONT_DESK can view client info and payment/POS workflows.
test("4: FRONT_DESK can view client info and financial workflows", () => {
  const frontDesk = user("FRONT_DESK");
  expect(can.viewClientInfo(frontDesk)).toBe(true);
  expect(can.viewFinancials(frontDesk)).toBe(true);
});

// ── Test 5 ───────────────────────────────────────────────────────────────────
// TECHNICIAN_INTERNAL cannot manage users
test("5: TECHNICIAN_INTERNAL cannot manage users", () => {
  expect(can.manageUsers(user("TECHNICIAN_INTERNAL"))).toBe(false);
});

// ── Test 6 ───────────────────────────────────────────────────────────────────
// ADMIN can manage users
test("6: ADMIN can manage users", () => {
  expect(can.manageUsers(user("ADMIN"))).toBe(true);
});

// ── Test 7 ───────────────────────────────────────────────────────────────────
// OPS can create jobs by role; TECHNICIAN_INTERNAL with can_intake permission can too
test("7: OPS can create jobs by role; TECHNICIAN_INTERNAL with can_intake permission can create jobs", () => {
  expect(can.createJob(user("OPS"))).toBe(true);
  expect(can.createJob(user("TECHNICIAN_INTERNAL"))).toBe(false);
  expect(can.createJob(user("TECHNICIAN_INTERNAL", ["can_intake"]))).toBe(true);
});

// ── Test 8 ───────────────────────────────────────────────────────────────────
// TECHNICIAN_EXTERNAL cannot search jobs by default, but can with can_search_jobs
test("8: TECHNICIAN_EXTERNAL cannot search jobs by default, but can with can_search_jobs", () => {
  expect(can.searchJobs(user("TECHNICIAN_EXTERNAL"))).toBe(false);
  expect(can.searchJobs(user("TECHNICIAN_EXTERNAL", ["can_search_jobs"]))).toBe(true);
});

// ── Test 9 ───────────────────────────────────────────────────────────────────
// can.editDiagnosis is true for TECHNICIAN_INTERNAL
test("9: TECHNICIAN_INTERNAL can edit diagnosis", () => {
  expect(can.editDiagnosis(user("TECHNICIAN_INTERNAL"))).toBe(true);
});

// ── Test 10 ──────────────────────────────────────────────────────────────────
// can.approveInvoices is false for OPS, true for ADMIN
test("10: OPS cannot approve invoices; ADMIN can", () => {
  expect(can.approveInvoices(user("OPS"))).toBe(false);
  expect(can.approveInvoices(user("ADMIN"))).toBe(true);
});
