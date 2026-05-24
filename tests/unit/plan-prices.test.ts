import { describe, it, expect, mock, beforeEach } from "bun:test";

// ── Mock the DB-dependent module BEFORE importing plan-prices ────────────────
const mockGetPlatformSetting = mock(async (_key: string): Promise<string | null> => null);

mock.module("@/lib/platform-settings", () => ({
  getPlatformSetting: mockGetPlatformSetting,
}));

// Dynamic import so the mock is in place before the module is evaluated.
const { FALLBACK_PLAN_PRICES, getEffectivePlanPrices, getEffectivePlanPrice } =
  await import("@/lib/plan-prices");

// ── FALLBACK_PLAN_PRICES ─────────────────────────────────────────────────────

describe("FALLBACK_PLAN_PRICES", () => {
  it("has the correct base prices (35K / 75K / 120K)", () => {
    expect(FALLBACK_PLAN_PRICES.STARTER).toBe(35_000);
    expect(FALLBACK_PLAN_PRICES.PROFESSIONAL).toBe(75_000);
    expect(FALLBACK_PLAN_PRICES.ENTERPRISE).toBe(120_000);
  });

  it("covers exactly the three paid tiers", () => {
    expect(Object.keys(FALLBACK_PLAN_PRICES).sort()).toEqual(
      ["ENTERPRISE", "PROFESSIONAL", "STARTER"],
    );
  });

  it("does not include the FREE tier", () => {
    expect("FREE" in FALLBACK_PLAN_PRICES).toBe(false);
  });
});

// ── getEffectivePlanPrices() ─────────────────────────────────────────────────

describe("getEffectivePlanPrices()", () => {
  beforeEach(() => {
    mockGetPlatformSetting.mockReset();
    mockGetPlatformSetting.mockImplementation(async () => null);
  });

  it("returns fallback prices when the DB has nothing stored", async () => {
    const prices = await getEffectivePlanPrices();
    expect(prices).toEqual(FALLBACK_PLAN_PRICES);
  });

  it("overrides one plan when its DB price is valid", async () => {
    mockGetPlatformSetting.mockImplementation(async (key: string) => {
      if (key === "PLAN_PRICE_STARTER") return "50000";
      return null;
    });

    const prices = await getEffectivePlanPrices();
    expect(prices.STARTER).toBe(50_000);
    expect(prices.PROFESSIONAL).toBe(FALLBACK_PLAN_PRICES.PROFESSIONAL);
    expect(prices.ENTERPRISE).toBe(FALLBACK_PLAN_PRICES.ENTERPRISE);
  });

  it("overrides all three plans when all DB prices are valid", async () => {
    const overrides: Record<string, number> = {
      PLAN_PRICE_STARTER: 40_000,
      PLAN_PRICE_PROFESSIONAL: 80_000,
      PLAN_PRICE_ENTERPRISE: 150_000,
    };
    mockGetPlatformSetting.mockImplementation(async (key: string) =>
      overrides[key] != null ? String(overrides[key]) : null,
    );

    const prices = await getEffectivePlanPrices();
    expect(prices.STARTER).toBe(40_000);
    expect(prices.PROFESSIONAL).toBe(80_000);
    expect(prices.ENTERPRISE).toBe(150_000);
  });

  it("ignores a stored value of '0' and falls back", async () => {
    mockGetPlatformSetting.mockImplementation(async () => "0");
    const prices = await getEffectivePlanPrices();
    expect(prices).toEqual(FALLBACK_PLAN_PRICES);
  });

  it("ignores a negative stored value and falls back", async () => {
    mockGetPlatformSetting.mockImplementation(async () => "-5000");
    const prices = await getEffectivePlanPrices();
    expect(prices).toEqual(FALLBACK_PLAN_PRICES);
  });

  it("ignores a non-numeric stored value and falls back", async () => {
    mockGetPlatformSetting.mockImplementation(async () => "not-a-number");
    const prices = await getEffectivePlanPrices();
    expect(prices).toEqual(FALLBACK_PLAN_PRICES);
  });
});

// ── getEffectivePlanPrice() ──────────────────────────────────────────────────

describe("getEffectivePlanPrice()", () => {
  beforeEach(() => {
    mockGetPlatformSetting.mockReset();
    mockGetPlatformSetting.mockImplementation(async () => null);
  });

  it("returns the fallback price for STARTER when DB is empty", async () => {
    expect(await getEffectivePlanPrice("STARTER")).toBe(35_000);
  });

  it("returns the fallback price for PROFESSIONAL when DB is empty", async () => {
    expect(await getEffectivePlanPrice("PROFESSIONAL")).toBe(75_000);
  });

  it("returns the fallback price for ENTERPRISE when DB is empty", async () => {
    expect(await getEffectivePlanPrice("ENTERPRISE")).toBe(120_000);
  });

  it("returns null for an unknown plan key", async () => {
    expect(await getEffectivePlanPrice("UNKNOWN")).toBeNull();
    expect(await getEffectivePlanPrice("FREE")).toBeNull();
    expect(await getEffectivePlanPrice("")).toBeNull();
  });

  it("returns the DB price when one is stored", async () => {
    mockGetPlatformSetting.mockImplementation(async () => "99000");
    expect(await getEffectivePlanPrice("PROFESSIONAL")).toBe(99_000);
  });

  it("ignores zero stored value and falls back for known plans", async () => {
    mockGetPlatformSetting.mockImplementation(async () => "0");
    expect(await getEffectivePlanPrice("STARTER")).toBe(35_000);
  });
});
