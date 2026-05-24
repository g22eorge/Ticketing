import { describe, it, expect } from "bun:test";
import {
  formatMoney,
  formatMoneyCompact,
  normalizeCurrency,
  isSupportedCurrency,
  parseSupportedCurrencies,
  toBaseAmount,
} from "../../lib/currency";

// ── normalizeCurrency() ───────────────────────────────────────────────────────

describe("normalizeCurrency()", () => {
  it("uppercases and trims the input", () => {
    expect(normalizeCurrency("ugx", "USD")).toBe("UGX");
    expect(normalizeCurrency("  eur  ", "USD")).toBe("EUR");
  });

  it("returns the fallback when input is empty", () => {
    expect(normalizeCurrency("", "UGX")).toBe("UGX");
    expect(normalizeCurrency(null, "UGX")).toBe("UGX");
    expect(normalizeCurrency(undefined, "UGX")).toBe("UGX");
  });

  it("returns the fallback when input is not a string", () => {
    expect(normalizeCurrency(123 as unknown as string, "UGX")).toBe("UGX");
  });
});

// ── isSupportedCurrency() ─────────────────────────────────────────────────────

describe("isSupportedCurrency()", () => {
  it("returns true for supported currencies", () => {
    expect(isSupportedCurrency("UGX")).toBe(true);
    expect(isSupportedCurrency("USD")).toBe(true);
    expect(isSupportedCurrency("EUR")).toBe(true);
    expect(isSupportedCurrency("KES")).toBe(true);
  });

  it("returns false for unsupported currencies", () => {
    expect(isSupportedCurrency("XYZ")).toBe(false);
    expect(isSupportedCurrency("")).toBe(false);
    expect(isSupportedCurrency("ugx")).toBe(false); // case-sensitive
  });
});

// ── parseSupportedCurrencies() ────────────────────────────────────────────────

describe("parseSupportedCurrencies()", () => {
  it("parses a comma-separated list of supported currencies", () => {
    expect(parseSupportedCurrencies("UGX,USD,EUR", "UGX")).toEqual(["UGX", "USD", "EUR"]);
  });

  it("uppercases tokens before matching", () => {
    expect(parseSupportedCurrencies("ugx,usd", "UGX")).toEqual(["UGX", "USD"]);
  });

  it("drops unsupported currency tokens", () => {
    expect(parseSupportedCurrencies("UGX,XYZ,USD", "UGX")).toEqual(["UGX", "USD"]);
  });

  it("deduplicates repeated currencies", () => {
    expect(parseSupportedCurrencies("UGX,UGX,USD", "UGX")).toEqual(["UGX", "USD"]);
  });

  it("returns the fallback in an array when raw is empty", () => {
    expect(parseSupportedCurrencies("", "UGX")).toEqual(["UGX"]);
    expect(parseSupportedCurrencies(null, "USD")).toEqual(["USD"]);
  });

  it("falls back to UGX when both raw and fallback are invalid", () => {
    expect(parseSupportedCurrencies("", "XYZ")).toEqual(["UGX"]);
  });
});

// ── toBaseAmount() ────────────────────────────────────────────────────────────

describe("toBaseAmount()", () => {
  it("returns the amount as-is when currency matches the base currency", () => {
    expect(toBaseAmount({ amount: 1000, currency: "UGX", baseCurrency: "UGX", exchangeRateToBase: null }))
      .toBe(1000);
  });

  it("converts using the exchange rate when currencies differ", () => {
    expect(toBaseAmount({ amount: 10, currency: "USD", baseCurrency: "UGX", exchangeRateToBase: 3700 }))
      .toBe(37_000);
  });

  it("returns 0 when the exchange rate is null", () => {
    expect(toBaseAmount({ amount: 10, currency: "USD", baseCurrency: "UGX", exchangeRateToBase: null }))
      .toBe(0);
  });

  it("returns 0 when the exchange rate is 0", () => {
    expect(toBaseAmount({ amount: 10, currency: "USD", baseCurrency: "UGX", exchangeRateToBase: 0 }))
      .toBe(0);
  });

  it("returns 0 when amount is non-finite", () => {
    expect(toBaseAmount({ amount: NaN, currency: "UGX", baseCurrency: "UGX", exchangeRateToBase: null }))
      .toBe(0);
    expect(toBaseAmount({ amount: Infinity, currency: "UGX", baseCurrency: "UGX", exchangeRateToBase: null }))
      .toBe(0);
  });

  it("treats null currency as the base currency", () => {
    expect(toBaseAmount({ amount: 500, currency: null, baseCurrency: "UGX", exchangeRateToBase: null }))
      .toBe(500);
  });
});

// ── formatMoney() ─────────────────────────────────────────────────────────────

describe("formatMoney()", () => {
  it("formats UGX with no decimal places", () => {
    expect(formatMoney(1000, "UGX")).toBe("UGX 1,000");
    expect(formatMoney(1_500_000, "UGX")).toBe("UGX 1,500,000");
  });

  it("formats USD with two decimal places", () => {
    expect(formatMoney(1000, "USD")).toBe("USD 1,000.00");
    expect(formatMoney(9.99, "USD")).toBe("USD 9.99");
  });

  it("formats zero correctly", () => {
    expect(formatMoney(0, "UGX")).toBe("UGX 0");
  });

  it("uses APP_CURRENCY env var as default currency", () => {
    const original = process.env.APP_CURRENCY;
    process.env.APP_CURRENCY = "USD";
    expect(formatMoney(100)).toBe("USD 100.00");
    if (original !== undefined) process.env.APP_CURRENCY = original;
    else delete process.env.APP_CURRENCY;
  });
});

// ── formatMoneyCompact() ──────────────────────────────────────────────────────

describe("formatMoneyCompact()", () => {
  it("abbreviates millions", () => {
    expect(formatMoneyCompact(2_000_000, "UGX")).toBe("UGX 2M");
    expect(formatMoneyCompact(1_500_000, "UGX")).toBe("UGX 1.5M");
  });

  it("abbreviates thousands", () => {
    expect(formatMoneyCompact(35_000, "UGX")).toBe("UGX 35K");
    expect(formatMoneyCompact(75_500, "UGX")).toBe("UGX 75.5K");
  });

  it("does not abbreviate small amounts", () => {
    expect(formatMoneyCompact(500, "UGX")).toBe("UGX 500");
  });

  it("handles negative amounts", () => {
    expect(formatMoneyCompact(-50_000, "UGX")).toBe("-UGX 50K");
  });

  it("handles zero", () => {
    expect(formatMoneyCompact(0, "UGX")).toBe("UGX 0");
  });
});
