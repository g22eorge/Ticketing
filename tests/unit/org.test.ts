import { describe, it, expect } from "bun:test";
import {
  EIS_ORG_ID,
  EIS_ORG_SLUG,
  EIS_ORG_NAME,
  isCareDomain,
  isAppDomain,
  slugify,
} from "../../lib/org";

// ── Constants ─────────────────────────────────────────────────────────────────

describe("EIS constants", () => {
  it("EIS_ORG_ID is the well-known fixed ID", () => {
    expect(EIS_ORG_ID).toBe("org_eis_01");
  });

  it("EIS_ORG_SLUG is correct", () => {
    expect(EIS_ORG_SLUG).toBe("eagle-info-solutions");
  });

  it("EIS_ORG_NAME is correct", () => {
    expect(EIS_ORG_NAME).toBe("Eagle Info Solutions");
  });
});

// ── isCareDomain() ────────────────────────────────────────────────────────────

describe("isCareDomain()", () => {
  it("returns true for care. subdomain", () => {
    expect(isCareDomain("care.eagleinfosolutions.com")).toBe(true);
  });

  it("returns true for any care. prefix", () => {
    expect(isCareDomain("care.localhost")).toBe(true);
  });

  it("returns false for app. subdomain", () => {
    expect(isCareDomain("app.eagleinfosolutions.com")).toBe(false);
  });

  it("returns false for localhost", () => {
    expect(isCareDomain("localhost")).toBe(false);
  });

  it("returns false for www.", () => {
    expect(isCareDomain("www.eagleinfosolutions.com")).toBe(false);
  });
});

// ── isAppDomain() ─────────────────────────────────────────────────────────────

describe("isAppDomain()", () => {
  it("returns true for app. subdomain", () => {
    expect(isAppDomain("app.eagleinfosolutions.com")).toBe(true);
  });

  it("returns true for bare localhost", () => {
    expect(isAppDomain("localhost")).toBe(true);
  });

  it("returns true for localhost with port", () => {
    expect(isAppDomain("localhost:3000")).toBe(true);
  });

  it("returns true for localhost:4173 (preview)", () => {
    expect(isAppDomain("localhost:4173")).toBe(true);
  });

  it("returns false for care. subdomain", () => {
    expect(isAppDomain("care.eagleinfosolutions.com")).toBe(false);
  });

  it("returns false for www. subdomain", () => {
    expect(isAppDomain("www.eagleinfosolutions.com")).toBe(false);
  });
});

// ── slugify() ─────────────────────────────────────────────────────────────────

describe("slugify()", () => {
  it("lowercases input", () => {
    expect(slugify("ACME")).toBe("acme");
  });

  it("replaces spaces with hyphens", () => {
    expect(slugify("Acme Corp")).toBe("acme-corp");
  });

  it("strips special characters", () => {
    expect(slugify("Acme Corp (Uganda)")).toBe("acme-corp-uganda");
  });

  it("collapses multiple spaces into one hyphen", () => {
    expect(slugify("Foo   Bar")).toBe("foo-bar");
  });

  it("collapses consecutive hyphens", () => {
    expect(slugify("foo--bar")).toBe("foo-bar");
  });

  it("trims leading and trailing spaces", () => {
    expect(slugify("  hello world  ")).toBe("hello-world");
  });

  it("handles already-slugified input unchanged", () => {
    expect(slugify("my-org-slug")).toBe("my-org-slug");
  });

  it("truncates to 60 characters", () => {
    const long = "a".repeat(80);
    expect(slugify(long).length).toBeLessThanOrEqual(60);
  });

  it("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });

  it("strips ampersands and punctuation", () => {
    expect(slugify("Tech & Repair!")).toBe("tech-repair");
  });
});
