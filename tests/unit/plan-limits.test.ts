import { describe, it, expect, mock } from "bun:test";

// Mock prisma before any import that chains to it
mock.module("@/lib/prisma", () => ({
  prisma: {
    organisation: { findUnique: mock(async () => null) },
    part: { count: mock(async () => 0) },
    $queryRaw: mock(async () => [{ 1: 1 }]),
  },
}));

const { PLAN_LIMITS, PLAN_LABELS, UPGRADE_PLAN } = await import("../../lib/plan-limits");

// ── PLAN_LIMITS ───────────────────────────────────────────────────────────────

describe("PLAN_LIMITS — FREE", () => {
  const limits = PLAN_LIMITS.FREE;

  it("has correct maxUsers", () => expect(limits.maxUsers).toBe(2));
  it("has correct maxJobsPerMonth", () => expect(limits.maxJobsPerMonth).toBe(20));
  it("has correct maxParts", () => expect(limits.maxParts).toBe(20));
  it("has correct maxBranches", () => expect(limits.maxBranches).toBe(1));
  it("customBranding is false", () => expect(limits.customBranding).toBe(false));
  it("inviteLinks is false", () => expect(limits.inviteLinks).toBe(false));
});

describe("PLAN_LIMITS — STARTER", () => {
  const limits = PLAN_LIMITS.STARTER;

  it("has correct maxUsers", () => expect(limits.maxUsers).toBe(5));
  it("has correct maxJobsPerMonth", () => expect(limits.maxJobsPerMonth).toBe(100));
  it("has correct maxParts", () => expect(limits.maxParts).toBe(100));
  it("customBranding is false", () => expect(limits.customBranding).toBe(false));
  it("inviteLinks is true", () => expect(limits.inviteLinks).toBe(true));
});

describe("PLAN_LIMITS — PROFESSIONAL", () => {
  const limits = PLAN_LIMITS.PROFESSIONAL;

  it("has correct maxUsers", () => expect(limits.maxUsers).toBe(20));
  it("has correct maxJobsPerMonth", () => expect(limits.maxJobsPerMonth).toBe(1000));
  it("has correct maxBranches", () => expect(limits.maxBranches).toBe(5));
  it("customBranding is true", () => expect(limits.customBranding).toBe(true));
  it("inviteLinks is true", () => expect(limits.inviteLinks).toBe(true));
});

describe("PLAN_LIMITS — ENTERPRISE", () => {
  const limits = PLAN_LIMITS.ENTERPRISE;

  it("maxUsers is Infinity", () => expect(limits.maxUsers).toBe(Infinity));
  it("maxJobsPerMonth is Infinity", () => expect(limits.maxJobsPerMonth).toBe(Infinity));
  it("maxParts is Infinity", () => expect(limits.maxParts).toBe(Infinity));
  it("maxBranches is Infinity", () => expect(limits.maxBranches).toBe(Infinity));
  it("customBranding is true", () => expect(limits.customBranding).toBe(true));
  it("inviteLinks is true", () => expect(limits.inviteLinks).toBe(true));
});

// ── PLAN_LABELS ───────────────────────────────────────────────────────────────

describe("PLAN_LABELS", () => {
  it("FREE → 'Free'", () => expect(PLAN_LABELS.FREE).toBe("Free"));
  it("STARTER → 'Starter'", () => expect(PLAN_LABELS.STARTER).toBe("Starter"));
  it("PROFESSIONAL → 'Professional'", () => expect(PLAN_LABELS.PROFESSIONAL).toBe("Professional"));
  it("ENTERPRISE → 'Enterprise'", () => expect(PLAN_LABELS.ENTERPRISE).toBe("Enterprise"));
});

// ── UPGRADE_PLAN ──────────────────────────────────────────────────────────────

describe("UPGRADE_PLAN", () => {
  it("FREE upgrades to STARTER", () => expect(UPGRADE_PLAN.FREE).toBe("STARTER"));
  it("STARTER upgrades to PROFESSIONAL", () => expect(UPGRADE_PLAN.STARTER).toBe("PROFESSIONAL"));
  it("PROFESSIONAL upgrades to ENTERPRISE", () => expect(UPGRADE_PLAN.PROFESSIONAL).toBe("ENTERPRISE"));
  it("ENTERPRISE has no upgrade path", () => expect(UPGRADE_PLAN.ENTERPRISE).toBeUndefined());
});
