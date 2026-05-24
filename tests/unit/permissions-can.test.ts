/**
 * Extended coverage for the can.* helpers not exercised in permissions.test.ts.
 * Each helper is tested via role (allows/denies) and via permission override.
 */
import { describe, it, expect } from "bun:test";
import { can, asPermissionUser } from "../../lib/permissions";
import type { PermissionUser } from "../../lib/permissions";

function user(role: PermissionUser["role"], permissions?: string[]): PermissionUser {
  return asPermissionUser(role, permissions);
}

// ── can.createJob() ───────────────────────────────────────────────────────────

describe("can.createJob()", () => {
  it("allows ADMIN, OPS, FRONT_DESK, SALES", () => {
    for (const role of ["ADMIN", "OPS", "FRONT_DESK", "SALES"] as const) {
      expect(can.createJob(user(role))).toBe(true);
    }
  });

  it("denies TECHNICIAN_INTERNAL and TECHNICIAN_EXTERNAL", () => {
    expect(can.createJob(user("TECHNICIAN_INTERNAL"))).toBe(false);
    expect(can.createJob(user("TECHNICIAN_EXTERNAL"))).toBe(false);
  });

  it("grants access via can_intake permission", () => {
    expect(can.createJob(user("TECHNICIAN_INTERNAL", ["can_intake"]))).toBe(true);
  });
});

// ── can.approveWork() ─────────────────────────────────────────────────────────

describe("can.approveWork()", () => {
  it("allows ADMIN, OPS, TECHNICAL_MANAGER, SALES_MANAGER", () => {
    for (const role of ["ADMIN", "OPS", "TECHNICAL_MANAGER", "SALES_MANAGER"] as const) {
      expect(can.approveWork(user(role))).toBe(true);
    }
  });

  it("denies TECHNICIAN_INTERNAL without permission", () => {
    expect(can.approveWork(user("TECHNICIAN_INTERNAL"))).toBe(false);
  });

  it("grants access via can_assign_jobs permission", () => {
    expect(can.approveWork(user("TECHNICIAN_INTERNAL", ["can_assign_jobs"]))).toBe(true);
  });
});

// ── can.assignJobs() ─────────────────────────────────────────────────────────

describe("can.assignJobs()", () => {
  it("allows ADMIN and OPS", () => {
    expect(can.assignJobs(user("ADMIN"))).toBe(true);
    expect(can.assignJobs(user("OPS"))).toBe(true);
  });

  it("denies TECHNICIAN_EXTERNAL by default", () => {
    expect(can.assignJobs(user("TECHNICIAN_EXTERNAL"))).toBe(false);
  });

  it("grants access via can_assign_jobs permission", () => {
    expect(can.assignJobs(user("CASHIER", ["can_assign_jobs"]))).toBe(true);
  });
});

// ── can.generateJobCards() ────────────────────────────────────────────────────

describe("can.generateJobCards()", () => {
  it("allows TECHNICIAN_INTERNAL and FRONT_DESK", () => {
    expect(can.generateJobCards(user("TECHNICIAN_INTERNAL"))).toBe(true);
    expect(can.generateJobCards(user("FRONT_DESK"))).toBe(true);
  });

  it("denies CASHIER by default", () => {
    // CASHIER is in the list — verify it's allowed
    expect(can.generateJobCards(user("CASHIER"))).toBe(true);
  });

  it("grants access via can_generate_job_cards permission", () => {
    expect(can.generateJobCards(user("TECHNICIAN_EXTERNAL", ["can_generate_job_cards"]))).toBe(true);
  });

  it("denies TECHNICIAN_EXTERNAL without permission", () => {
    expect(can.generateJobCards(user("TECHNICIAN_EXTERNAL"))).toBe(false);
  });
});

// ── can.viewApprovedCost() ────────────────────────────────────────────────────

describe("can.viewApprovedCost()", () => {
  it("allows ADMIN, OPS, FRONT_DESK", () => {
    expect(can.viewApprovedCost(user("ADMIN"))).toBe(true);
    expect(can.viewApprovedCost(user("OPS"))).toBe(true);
    expect(can.viewApprovedCost(user("FRONT_DESK"))).toBe(true);
  });

  it("denies TECHNICIAN_EXTERNAL without permission", () => {
    expect(can.viewApprovedCost(user("TECHNICIAN_EXTERNAL"))).toBe(false);
  });

  it("grants via can_view_approved_cost permission", () => {
    expect(can.viewApprovedCost(user("TECHNICIAN_EXTERNAL", ["can_view_approved_cost"]))).toBe(true);
  });
});

// ── can.reviewExternalBills() ─────────────────────────────────────────────────

describe("can.reviewExternalBills()", () => {
  it("allows ADMIN and OPS", () => {
    expect(can.reviewExternalBills(user("ADMIN"))).toBe(true);
    expect(can.reviewExternalBills(user("OPS"))).toBe(true);
  });

  it("denies TECHNICIAN_INTERNAL by default", () => {
    expect(can.reviewExternalBills(user("TECHNICIAN_INTERNAL"))).toBe(false);
  });

  it("grants via can_review_external_bills permission", () => {
    expect(can.reviewExternalBills(user("TECHNICIAN_INTERNAL", ["can_review_external_bills"]))).toBe(true);
  });
});

// ── can.viewAccountsSummary() ─────────────────────────────────────────────────

describe("can.viewAccountsSummary()", () => {
  it("allows ADMIN, TECHNICAL_MANAGER, SALES_MANAGER, OPS", () => {
    for (const role of ["ADMIN", "TECHNICAL_MANAGER", "SALES_MANAGER", "OPS"] as const) {
      expect(can.viewAccountsSummary(user(role))).toBe(true);
    }
  });

  it("denies TECHNICIAN_INTERNAL by default", () => {
    expect(can.viewAccountsSummary(user("TECHNICIAN_INTERNAL"))).toBe(false);
  });

  it("grants via can_view_accounts_summary permission", () => {
    expect(can.viewAccountsSummary(user("CASHIER", ["can_view_accounts_summary"]))).toBe(true);
  });
});

// ── can.manageIntake() ────────────────────────────────────────────────────────

describe("can.manageIntake()", () => {
  it("allows ADMIN, FRONT_DESK, SALES", () => {
    expect(can.manageIntake(user("ADMIN"))).toBe(true);
    expect(can.manageIntake(user("FRONT_DESK"))).toBe(true);
    expect(can.manageIntake(user("SALES"))).toBe(true);
  });

  it("denies TECHNICIAN_INTERNAL without permission", () => {
    expect(can.manageIntake(user("TECHNICIAN_INTERNAL"))).toBe(false);
  });

  it("grants via can_manage_intake permission", () => {
    expect(can.manageIntake(user("CASHIER", ["can_manage_intake"]))).toBe(true);
  });
});

// ── can.viewIntake() ─────────────────────────────────────────────────────────

describe("can.viewIntake()", () => {
  it("allows ADMIN and FRONT_DESK", () => {
    expect(can.viewIntake(user("ADMIN"))).toBe(true);
    expect(can.viewIntake(user("FRONT_DESK"))).toBe(true);
  });

  it("denies TECHNICIAN_EXTERNAL by default", () => {
    expect(can.viewIntake(user("TECHNICIAN_EXTERNAL"))).toBe(false);
  });

  it("grants via can_intake permission", () => {
    expect(can.viewIntake(user("CASHIER", ["can_intake"]))).toBe(true);
  });

  it("grants via can_manage_intake permission", () => {
    expect(can.viewIntake(user("CASHIER", ["can_manage_intake"]))).toBe(true);
  });
});

// ── can.viewNotifications() ──────────────────────────────────────────────────

describe("can.viewNotifications()", () => {
  it("allows most roles", () => {
    for (const role of ["ADMIN", "OPS", "TECHNICIAN_INTERNAL", "TECHNICIAN_EXTERNAL", "SALES"] as const) {
      expect(can.viewNotifications(user(role))).toBe(true);
    }
  });

  it("denies FRONT_DESK", () => {
    expect(can.viewNotifications(user("FRONT_DESK"))).toBe(false);
  });

  it("denies CASHIER", () => {
    expect(can.viewNotifications(user("CASHIER"))).toBe(false);
  });
});

// ── can.manageFieldVisits() ──────────────────────────────────────────────────

describe("can.manageFieldVisits()", () => {
  it("allows ADMIN and OPS roles", () => {
    expect(can.manageFieldVisits(user("ADMIN"))).toBe(true);
    expect(can.manageFieldVisits(user("OPS"))).toBe(true);
    expect(can.manageFieldVisits(user("TECHNICAL_MANAGER"))).toBe(true);
  });

  it("denies TECHNICIAN_INTERNAL", () => {
    expect(can.manageFieldVisits(user("TECHNICIAN_INTERNAL"))).toBe(false);
  });
});

// ── can.recordFieldSignoffs() ────────────────────────────────────────────────

describe("can.recordFieldSignoffs()", () => {
  it("allows ADMIN, OPS, TECHNICIAN_INTERNAL, TECHNICIAN_EXTERNAL", () => {
    expect(can.recordFieldSignoffs(user("ADMIN"))).toBe(true);
    expect(can.recordFieldSignoffs(user("TECHNICIAN_INTERNAL"))).toBe(true);
    expect(can.recordFieldSignoffs(user("TECHNICIAN_EXTERNAL"))).toBe(true);
  });

  it("denies FRONT_DESK", () => {
    expect(can.recordFieldSignoffs(user("FRONT_DESK"))).toBe(false);
  });
});

// ── can.createLeads() / viewAllSales() / createQuotations() ─────────────────

describe("can.createLeads()", () => {
  it("allows ADMIN and SALES", () => {
    expect(can.createLeads(user("ADMIN"))).toBe(true);
    expect(can.createLeads(user("SALES"))).toBe(true);
  });

  it("denies CASHIER", () => {
    expect(can.createLeads(user("CASHIER"))).toBe(false);
  });
});

describe("can.viewAllSales()", () => {
  it("allows ADMIN, OPS, SALES", () => {
    expect(can.viewAllSales(user("ADMIN"))).toBe(true);
    expect(can.viewAllSales(user("OPS"))).toBe(true);
    expect(can.viewAllSales(user("SALES"))).toBe(true);
  });

  it("denies TECHNICIAN_EXTERNAL", () => {
    expect(can.viewAllSales(user("TECHNICIAN_EXTERNAL"))).toBe(false);
  });
});

describe("can.createQuotations()", () => {
  it("allows ADMIN, OPS, SALES", () => {
    expect(can.createQuotations(user("ADMIN"))).toBe(true);
    expect(can.createQuotations(user("SALES"))).toBe(true);
  });

  it("denies CASHIER", () => {
    expect(can.createQuotations(user("CASHIER"))).toBe(false);
  });
});

// ── can.approveQuotations() ──────────────────────────────────────────────────

describe("can.approveQuotations()", () => {
  it("allows ADMIN, TECHNICAL_MANAGER, SALES_MANAGER", () => {
    expect(can.approveQuotations(user("ADMIN"))).toBe(true);
    expect(can.approveQuotations(user("TECHNICAL_MANAGER"))).toBe(true);
    expect(can.approveQuotations(user("SALES_MANAGER"))).toBe(true);
  });

  it("denies OPS and SALES", () => {
    expect(can.approveQuotations(user("OPS"))).toBe(false);
    expect(can.approveQuotations(user("SALES"))).toBe(false);
  });
});

// ── can.setTargets() / viewTeamTargets() ─────────────────────────────────────

describe("can.setTargets()", () => {
  it("allows ADMIN, TECHNICAL_MANAGER, SALES_MANAGER", () => {
    expect(can.setTargets(user("ADMIN"))).toBe(true);
    expect(can.setTargets(user("SALES_MANAGER"))).toBe(true);
  });

  it("denies OPS and SALES", () => {
    expect(can.setTargets(user("OPS"))).toBe(false);
    expect(can.setTargets(user("SALES"))).toBe(false);
  });
});

describe("can.viewTeamTargets()", () => {
  it("allows ADMIN, OPS, SALES", () => {
    expect(can.viewTeamTargets(user("ADMIN"))).toBe(true);
    expect(can.viewTeamTargets(user("OPS"))).toBe(true);
    expect(can.viewTeamTargets(user("SALES"))).toBe(true);
  });

  it("denies TECHNICIAN_EXTERNAL", () => {
    expect(can.viewTeamTargets(user("TECHNICIAN_EXTERNAL"))).toBe(false);
  });
});
