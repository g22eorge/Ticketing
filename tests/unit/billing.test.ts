import { describe, it, expect } from "bun:test";
import { getExternalTechBill, getClientBill, resolveTechCost } from "../../lib/billing";

// ── getExternalTechBill() ─────────────────────────────────────────────────────

describe("getExternalTechBill()", () => {
  it("returns externalTechBill when it is a number", () => {
    expect(getExternalTechBill({ externalTechBill: 25000 })).toBe(25000);
    expect(getExternalTechBill({ externalTechBill: 0 })).toBe(0);
  });

  it("returns null when externalTechBill is null", () => {
    expect(getExternalTechBill({ externalTechBill: null })).toBeNull();
  });

  it("returns null when externalTechBill is undefined", () => {
    expect(getExternalTechBill({})).toBeNull();
  });

  it("does not fall back to other cost fields", () => {
    expect(getExternalTechBill({ externalTechBill: null, clientBill: 50000 })).toBeNull();
  });
});

// ── getClientBill() ───────────────────────────────────────────────────────────

describe("getClientBill()", () => {
  it("returns clientBill when it is a number", () => {
    expect(getClientBill({ clientBill: 75000 })).toBe(75000);
  });

  it("falls back to finalCost when clientBill is null", () => {
    expect(getClientBill({ clientBill: null, finalCost: 60000 })).toBe(60000);
  });

  it("falls back to finalCost when clientBill is undefined", () => {
    expect(getClientBill({ finalCost: 60000 })).toBe(60000);
  });

  it("returns null when both clientBill and finalCost are null", () => {
    expect(getClientBill({ clientBill: null, finalCost: null })).toBeNull();
  });

  it("returns null when no fields are set", () => {
    expect(getClientBill({})).toBeNull();
  });

  it("prefers clientBill over finalCost when both are set", () => {
    expect(getClientBill({ clientBill: 75000, finalCost: 60000 })).toBe(75000);
  });
});

// ── resolveTechCost() ─────────────────────────────────────────────────────────

describe("resolveTechCost()", () => {
  it("returns fee when fee is a positive number", () => {
    expect(resolveTechCost(30000, 20000)).toBe(30000);
  });

  it("falls back to bill when fee is null", () => {
    expect(resolveTechCost(null, 20000)).toBe(20000);
  });

  it("falls back to bill when fee is undefined", () => {
    expect(resolveTechCost(undefined, 20000)).toBe(20000);
  });

  it("falls back to bill when fee is 0 (explicit zero masks nothing)", () => {
    expect(resolveTechCost(0, 20000)).toBe(20000);
  });

  it("returns 0 when both fee and bill are null", () => {
    expect(resolveTechCost(null, null)).toBe(0);
  });

  it("returns 0 when both are 0", () => {
    expect(resolveTechCost(0, 0)).toBe(0);
  });

  it("returns 0 when both are undefined", () => {
    expect(resolveTechCost(undefined, undefined)).toBe(0);
  });

  it("skips a zero bill and returns 0", () => {
    expect(resolveTechCost(null, 0)).toBe(0);
  });
});
