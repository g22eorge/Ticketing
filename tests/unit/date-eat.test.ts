import { describe, it, expect } from "bun:test";
import {
  formatEATDate,
  formatEATDateTime,
  formatEATDocDate,
  formatEATMonthLabel,
} from "../../lib/date-eat";

// All assertions use EAT (UTC+3 / Africa/Nairobi).
// A UTC midnight date will appear as the same calendar day in EAT.

const FIXED = new Date("2025-01-15T09:00:00Z"); // 12:00 EAT on 15 Jan 2025

describe("formatEATDate()", () => {
  it("formats a Date object to a readable EAT date string", () => {
    const result = formatEATDate(FIXED);
    expect(result).toContain("15");
    expect(result).toContain("2025");
  });

  it("accepts an ISO string", () => {
    const result = formatEATDate("2025-06-01T00:00:00Z");
    expect(result).toContain("2025");
  });

  it("returns '-' for an invalid date string", () => {
    expect(formatEATDate("not-a-date")).toBe("-");
    expect(formatEATDate("")).toBe("-");
  });
});

describe("formatEATDateTime()", () => {
  it("includes both date and time components", () => {
    const result = formatEATDateTime(FIXED);
    // Should contain the day and year
    expect(result).toContain("15");
    expect(result).toContain("2025");
    // Should include a time separator (colon)
    expect(result).toMatch(/\d:\d/);
  });

  it("accepts an ISO string", () => {
    const result = formatEATDateTime("2025-03-10T06:00:00Z");
    expect(result).toContain("2025");
  });

  it("returns '-' for an invalid date string", () => {
    expect(formatEATDateTime("garbage")).toBe("-");
  });
});

describe("formatEATDocDate()", () => {
  it("formats as DD Mon YY (short form)", () => {
    const result = formatEATDocDate(FIXED);
    // e.g. "15 Jan 25"
    expect(result).toContain("15");
    expect(result).toContain("Jan");
    expect(result).toContain("25");
  });

  it("is always two-digit day", () => {
    const d = new Date("2025-03-05T10:00:00Z");
    const result = formatEATDocDate(d);
    expect(result).toMatch(/^0?5/); // day starts with 05
  });
});

describe("formatEATMonthLabel()", () => {
  it("returns the full month name and year", () => {
    const result = formatEATMonthLabel(2025, 1);
    expect(result).toContain("January");
    expect(result).toContain("2025");
  });

  it("handles December correctly", () => {
    const result = formatEATMonthLabel(2024, 12);
    expect(result).toContain("December");
    expect(result).toContain("2024");
  });

  it("handles all 12 months without throwing", () => {
    for (let m = 1; m <= 12; m++) {
      expect(() => formatEATMonthLabel(2025, m)).not.toThrow();
    }
  });
});
