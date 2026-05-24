import { describe, it, expect } from "bun:test";
import { getOrgAccess } from "../../lib/billing-access";
import type { OrgBillingSnapshot } from "../../lib/billing-access";

function snap(plan: OrgBillingSnapshot["plan"], isActive: boolean): OrgBillingSnapshot {
  return { plan, isActive };
}

describe("getOrgAccess()", () => {
  it("returns not-suspended for a null org (graceful degradation)", () => {
    const access = getOrgAccess(null);
    expect(access.isSuspended).toBe(false);
    expect(access.reason).toBeNull();
  });

  it("returns not-suspended for an active FREE org", () => {
    const access = getOrgAccess(snap("FREE", true));
    expect(access.isSuspended).toBe(false);
    expect(access.reason).toBeNull();
  });

  it("returns not-suspended for an active STARTER org", () => {
    const access = getOrgAccess(snap("STARTER", true));
    expect(access.isSuspended).toBe(false);
    expect(access.reason).toBeNull();
  });

  it("returns not-suspended for an active PROFESSIONAL org", () => {
    const access = getOrgAccess(snap("PROFESSIONAL", true));
    expect(access.isSuspended).toBe(false);
    expect(access.reason).toBeNull();
  });

  it("returns not-suspended for an active ENTERPRISE org", () => {
    const access = getOrgAccess(snap("ENTERPRISE", true));
    expect(access.isSuspended).toBe(false);
    expect(access.reason).toBeNull();
  });

  it("suspends an inactive org with reason INACTIVE", () => {
    const access = getOrgAccess(snap("STARTER", false));
    expect(access.isSuspended).toBe(true);
    expect(access.reason).toBe("INACTIVE");
  });

  it("suspends even an ENTERPRISE org when isActive is false", () => {
    const access = getOrgAccess(snap("ENTERPRISE", false));
    expect(access.isSuspended).toBe(true);
    expect(access.reason).toBe("INACTIVE");
  });

  it("suspends a FREE org when isActive is false", () => {
    const access = getOrgAccess(snap("FREE", false));
    expect(access.isSuspended).toBe(true);
    expect(access.reason).toBe("INACTIVE");
  });
});
