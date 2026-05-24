import { describe, it, expect, mock } from "bun:test";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockOrgFindUnique = mock(async (): Promise<any> => null);
const mockPartCount = mock(async () => 0);

mock.module("@/lib/prisma", () => ({
  prisma: {
    organisation: { findUnique: mockOrgFindUnique },
    part: { count: mockPartCount },
    $queryRaw: mock(async () => [{ 1: 1 }]),
  },
}));

const {
  PLAN_LIMITS,
  PLAN_LABELS,
  UPGRADE_PLAN,
  getOrgPlan,
  getLimitsForOrg,
  checkPartLimit,
} = await import("../../lib/plan-limits");

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

// ── getOrgPlan() ──────────────────────────────────────────────────────────────

describe("getOrgPlan()", () => {
  it("returns the org's plan when found", async () => {
    mockOrgFindUnique.mockImplementation(async () => ({ plan: "PROFESSIONAL" }));
    const plan = await getOrgPlan("org-123");
    expect(plan).toBe("PROFESSIONAL");
  });

  it("defaults to FREE when org is not found", async () => {
    mockOrgFindUnique.mockImplementation(async () => null);
    const plan = await getOrgPlan("nonexistent");
    expect(plan).toBe("FREE");
  });

  it("returns ENTERPRISE for an enterprise org", async () => {
    mockOrgFindUnique.mockImplementation(async () => ({ plan: "ENTERPRISE" }));
    const plan = await getOrgPlan("big-org");
    expect(plan).toBe("ENTERPRISE");
  });
});

// ── getLimitsForOrg() ─────────────────────────────────────────────────────────

describe("getLimitsForOrg()", () => {
  it("returns STARTER limits when org is on STARTER plan", async () => {
    mockOrgFindUnique.mockImplementation(async () => ({ plan: "STARTER" }));
    const limits = await getLimitsForOrg("org-starter");
    expect(limits.maxUsers).toBe(5);
    expect(limits.maxJobsPerMonth).toBe(100);
    expect(limits.plan).toBe("STARTER");
  });

  it("returns ENTERPRISE (Infinity) limits for an enterprise org", async () => {
    mockOrgFindUnique.mockImplementation(async () => ({ plan: "ENTERPRISE" }));
    const limits = await getLimitsForOrg("org-enterprise");
    expect(limits.maxUsers).toBe(Infinity);
    expect(limits.plan).toBe("ENTERPRISE");
  });

  it("includes the plan field alongside the limits", async () => {
    mockOrgFindUnique.mockImplementation(async () => ({ plan: "FREE" }));
    const limits = await getLimitsForOrg("org-free");
    expect(limits.plan).toBe("FREE");
    expect(typeof limits.maxParts).toBe("number");
  });
});

// ── checkPartLimit() ─────────────────────────────────────────────────────────

describe("checkPartLimit()", () => {
  it("returns allowed: true with no orgId (graceful degradation)", async () => {
    const result = await checkPartLimit(undefined);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(Infinity);
  });

  it("returns allowed: true when parts are below the plan limit", async () => {
    mockOrgFindUnique.mockImplementation(async () => ({ plan: "FREE" }));
    mockPartCount.mockImplementation(async () => 5); // FREE limit is 20
    const result = await checkPartLimit("org-free");
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(5);
    expect(result.limit).toBe(20);
    expect(result.reason).toBeUndefined();
  });

  it("returns allowed: false when parts meet or exceed the plan limit", async () => {
    mockOrgFindUnique.mockImplementation(async () => ({ plan: "FREE" }));
    mockPartCount.mockImplementation(async () => 20); // exactly at the FREE limit of 20
    const result = await checkPartLimit("org-free");
    expect(result.allowed).toBe(false);
    expect(result.current).toBe(20);
    expect(typeof result.reason).toBe("string");
    expect(result.reason).toContain("Part limit reached");
  });

  it("reason message includes current count, limit, and plan name", async () => {
    mockOrgFindUnique.mockImplementation(async () => ({ plan: "STARTER" }));
    mockPartCount.mockImplementation(async () => 100); // STARTER limit is 100
    const result = await checkPartLimit("org-starter");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("100/100");
    expect(result.reason).toContain("STARTER");
  });
});
