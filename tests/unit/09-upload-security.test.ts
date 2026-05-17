/**
 * Group 9 — Upload security (tests 101–110)
 *
 * Tests the MIME type allowlist, magic byte validation, and file size limit
 * by exercising the logic extracted from app/api/upload/route.ts directly.
 * No HTTP server needed.
 */

import { test, expect } from "bun:test";

// ── Mirror the upload route's security logic ──────────────────────────────────

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function hasValidImageSignature(contentType: string, bytes: Uint8Array): boolean {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (contentType === "image/webp") {
    return (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }
  return false;
}

// ── MIME type allowlist ───────────────────────────────────────────────────────

test("101: ALLOWED_TYPES accepts image/jpeg, image/png, image/webp", () => {
  expect(ALLOWED_TYPES.has("image/jpeg")).toBe(true);
  expect(ALLOWED_TYPES.has("image/png")).toBe(true);
  expect(ALLOWED_TYPES.has("image/webp")).toBe(true);
});

test("102: ALLOWED_TYPES rejects image/gif, application/pdf, text/html", () => {
  expect(ALLOWED_TYPES.has("image/gif")).toBe(false);
  expect(ALLOWED_TYPES.has("application/pdf")).toBe(false);
  expect(ALLOWED_TYPES.has("text/html")).toBe(false);
});

test("103: ALLOWED_TYPES rejects empty string and wildcard", () => {
  expect(ALLOWED_TYPES.has("")).toBe(false);
  expect(ALLOWED_TYPES.has("*/*")).toBe(false);
});

// ── MAX_SIZE ──────────────────────────────────────────────────────────────────

test("104: MAX_SIZE is exactly 5 MB (5 * 1024 * 1024)", () => {
  expect(MAX_SIZE).toBe(5242880);
});

test("105: a 5 MB buffer is within limit; a 5 MB + 1 byte buffer is not", () => {
  const exactlyMax = MAX_SIZE;
  const overLimit = MAX_SIZE + 1;
  expect(exactlyMax <= MAX_SIZE).toBe(true);
  expect(overLimit <= MAX_SIZE).toBe(false);
});

// ── Magic byte validation — JPEG ──────────────────────────────────────────────

test("106: hasValidImageSignature accepts a valid JPEG magic header", () => {
  const validJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  expect(hasValidImageSignature("image/jpeg", validJpeg)).toBe(true);
});

test("107: hasValidImageSignature rejects a PNG file declared as JPEG (magic mismatch)", () => {
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(hasValidImageSignature("image/jpeg", pngBytes)).toBe(false);
});

// ── Magic byte validation — PNG ───────────────────────────────────────────────

test("108: hasValidImageSignature accepts a valid PNG magic header", () => {
  const validPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  expect(hasValidImageSignature("image/png", validPng)).toBe(true);
});

test("109: hasValidImageSignature rejects too-short PNG buffer", () => {
  const short = new Uint8Array([0x89, 0x50]);
  expect(hasValidImageSignature("image/png", short)).toBe(false);
});

// ── Magic byte validation — WebP ──────────────────────────────────────────────

test("110: hasValidImageSignature accepts a valid WebP magic header (RIFF....WEBP)", () => {
  const validWebp = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, // RIFF
    0x00, 0x00, 0x00, 0x00, // file size (placeholder)
    0x57, 0x45, 0x42, 0x50, // WEBP
  ]);
  expect(hasValidImageSignature("image/webp", validWebp)).toBe(true);
});
