import { describe, it, expect } from "bun:test";
import {
  ALL_MODULES,
  MODULE_LABELS,
  MODULE_ICONS,
  getOrgModules,
  type OrgModule,
} from "../../lib/module-access";

// ── ALL_MODULES ───────────────────────────────────────────────────────────────

describe("ALL_MODULES", () => {
  it("contains the expected 10 modules", () => {
    const expected: OrgModule[] = [
      "JOBS", "INVENTORY", "POS", "PURCHASE_ORDERS",
      "INVOICING", "COMPLAINTS", "REPORTS", "SALES", "FIELD", "TARGETS",
    ];
    expect(ALL_MODULES).toEqual(expected);
  });

  it("has 10 entries", () => {
    expect(ALL_MODULES.length).toBe(10);
  });

  it("contains no duplicates", () => {
    const set = new Set(ALL_MODULES);
    expect(set.size).toBe(ALL_MODULES.length);
  });
});

// ── MODULE_LABELS ─────────────────────────────────────────────────────────────

describe("MODULE_LABELS", () => {
  it("has a label for every module in ALL_MODULES", () => {
    for (const mod of ALL_MODULES) {
      expect(MODULE_LABELS[mod]).toBeTruthy();
    }
  });

  it("JOBS label is 'Jobs & Repairs'", () => {
    expect(MODULE_LABELS.JOBS).toBe("Jobs & Repairs");
  });

  it("POS label is 'Point of Sale'", () => {
    expect(MODULE_LABELS.POS).toBe("Point of Sale");
  });

  it("INVOICING label is 'Invoicing & Documents'", () => {
    expect(MODULE_LABELS.INVOICING).toBe("Invoicing & Documents");
  });

  it("covers exactly the same set of keys as ALL_MODULES", () => {
    const labelKeys = Object.keys(MODULE_LABELS).sort();
    const moduleKeys = [...ALL_MODULES].sort();
    expect(labelKeys).toEqual(moduleKeys);
  });
});

// ── MODULE_ICONS ──────────────────────────────────────────────────────────────

describe("MODULE_ICONS", () => {
  it("has an icon for every module in ALL_MODULES", () => {
    for (const mod of ALL_MODULES) {
      expect(MODULE_ICONS[mod]).toBeTruthy();
    }
  });

  it("covers exactly the same set of keys as ALL_MODULES", () => {
    const iconKeys = Object.keys(MODULE_ICONS).sort();
    const moduleKeys = [...ALL_MODULES].sort();
    expect(iconKeys).toEqual(moduleKeys);
  });

  it("JOBS icon is a wrench emoji", () => {
    expect(MODULE_ICONS.JOBS).toBe("🔧");
  });

  it("INVENTORY icon is a box emoji", () => {
    expect(MODULE_ICONS.INVENTORY).toBe("📦");
  });
});

// ── getOrgModules() ───────────────────────────────────────────────────────────

describe("getOrgModules()", () => {
  it("returns a Set", async () => {
    const result = await getOrgModules("any-org-id");
    expect(result).toBeInstanceOf(Set);
  });

  it("returns all 10 modules regardless of orgId", async () => {
    const result = await getOrgModules("some-org");
    expect(result.size).toBe(ALL_MODULES.length);
  });

  it("includes every module from ALL_MODULES", async () => {
    const result = await getOrgModules("org-123");
    for (const mod of ALL_MODULES) {
      expect(result.has(mod)).toBe(true);
    }
  });

  it("works with an empty string orgId", async () => {
    const result = await getOrgModules("");
    expect(result.size).toBe(10);
  });
});
