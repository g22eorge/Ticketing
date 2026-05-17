/**
 * Group 8 — Input boundary & validation (tests 89–100)
 *
 * Verifies sanitization functions handle edge cases correctly:
 * whitespace normalization, very long strings, special chars, null handling.
 * No database required — pure unit tests.
 */

import { test, expect } from "bun:test";
import { sanitizeText, sanitizeOptionalText } from "@/lib/sanitize";

// ── sanitizeText ─────────────────────────────────────────────────────────────

test("89: sanitizeText collapses multiple spaces into one", () => {
  expect(sanitizeText("hello   world")).toBe("hello world");
});

test("90: sanitizeText trims leading and trailing whitespace", () => {
  expect(sanitizeText("  hello  ")).toBe("hello");
});

test("91: sanitizeText normalizes newlines and tabs to single spaces", () => {
  expect(sanitizeText("hello\tworld\nnewline")).toBe("hello world newline");
});

test("92: sanitizeText handles an empty string without throwing", () => {
  expect(sanitizeText("")).toBe("");
});

test("93: sanitizeText preserves Unicode characters and emoji", () => {
  const input = "  Ünïcödé  résumé  ";
  expect(sanitizeText(input)).toBe("Ünïcödé résumé");
});

test("94: sanitizeText with 10,000 character input does not truncate or throw", () => {
  const big = "a ".repeat(5000).trimEnd(); // 9999 chars
  const result = sanitizeText("  " + big + "  ");
  expect(result).toBe(big);
  expect(result.length).toBe(9999);
});

test("95: sanitizeText preserves special characters like < > & quotes", () => {
  const input = `<script>alert("xss")</script>`;
  // sanitizeText only normalizes whitespace — it does NOT strip HTML
  expect(sanitizeText(input)).toBe(input.trim());
});

// ── sanitizeOptionalText ─────────────────────────────────────────────────────

test("96: sanitizeOptionalText returns null for null input", () => {
  expect(sanitizeOptionalText(null)).toBeNull();
});

test("97: sanitizeOptionalText returns null for undefined input", () => {
  expect(sanitizeOptionalText(undefined)).toBeNull();
});

test("98: sanitizeOptionalText returns null for whitespace-only string", () => {
  expect(sanitizeOptionalText("   ")).toBeNull();
  expect(sanitizeOptionalText("\t\n")).toBeNull();
});

test("99: sanitizeOptionalText returns trimmed string for valid input", () => {
  expect(sanitizeOptionalText("  hello world  ")).toBe("hello world");
});

test("100: sanitizeOptionalText collapses whitespace before checking emptiness", () => {
  expect(sanitizeOptionalText(" ")).toBeNull();
  expect(sanitizeOptionalText("  x  ")).toBe("x");
});
