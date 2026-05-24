import { describe, it, expect } from "bun:test";
import { sanitizeText, sanitizeOptionalText } from "../../lib/sanitize";

describe("sanitizeText()", () => {
  it("trims leading and trailing whitespace", () => {
    expect(sanitizeText("  hello  ")).toBe("hello");
    expect(sanitizeText("\thello\n")).toBe("hello");
  });

  it("collapses internal whitespace to a single space", () => {
    expect(sanitizeText("hello   world")).toBe("hello world");
    expect(sanitizeText("foo\t\tbar")).toBe("foo bar");
    expect(sanitizeText("a  b  c")).toBe("a b c");
  });

  it("handles a string that is already clean", () => {
    expect(sanitizeText("hello world")).toBe("hello world");
  });

  it("handles an empty string", () => {
    expect(sanitizeText("")).toBe("");
  });

  it("handles a string of only whitespace", () => {
    expect(sanitizeText("   ")).toBe("");
  });
});

describe("sanitizeOptionalText()", () => {
  it("returns a cleaned string when the input has content", () => {
    expect(sanitizeOptionalText("  hello  ")).toBe("hello");
    expect(sanitizeOptionalText("foo   bar")).toBe("foo bar");
  });

  it("returns null for null input", () => {
    expect(sanitizeOptionalText(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(sanitizeOptionalText(undefined)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(sanitizeOptionalText("")).toBeNull();
  });

  it("returns null for a whitespace-only string", () => {
    expect(sanitizeOptionalText("   ")).toBeNull();
  });
});
