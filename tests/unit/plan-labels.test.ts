import { describe, it, expect } from "bun:test";
import { planLabel, PLAN_LABEL } from "../../lib/plan-labels";

describe("PLAN_LABEL", () => {
  it("has exactly four tiers", () => {
    expect(Object.keys(PLAN_LABEL)).toHaveLength(4);
  });

  it("maps each tier to a Luganda name", () => {
    expect(PLAN_LABEL.FREE).toBe("Ekyenfuna");
    expect(PLAN_LABEL.STARTER).toBe("Okutandika");
    expect(PLAN_LABEL.PROFESSIONAL).toBe("Enkola");
    expect(PLAN_LABEL.ENTERPRISE).toBe("Obugabi");
  });
});

describe("planLabel()", () => {
  it("returns the Luganda label for every known tier", () => {
    expect(planLabel("FREE")).toBe("Ekyenfuna");
    expect(planLabel("STARTER")).toBe("Okutandika");
    expect(planLabel("PROFESSIONAL")).toBe("Enkola");
    expect(planLabel("ENTERPRISE")).toBe("Obugabi");
  });

  it("falls back to the raw key for an unknown tier", () => {
    expect(planLabel("UNKNOWN")).toBe("UNKNOWN");
    expect(planLabel("custom_tier")).toBe("custom_tier");
    expect(planLabel("")).toBe("");
  });

  it("is case-sensitive — lowercase keys do not match", () => {
    expect(planLabel("free")).toBe("free");
    expect(planLabel("starter")).toBe("starter");
  });
});
