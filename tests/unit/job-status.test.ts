import { describe, it, expect } from "bun:test";
import { normalizeJobStatus, JOB_STATUSES, UI_JOB_STATUSES } from "../../lib/job-status";
import type { UiJobStatus } from "../../lib/job-status";

// ── Status constants ──────────────────────────────────────────────────────────

describe("JOB_STATUSES", () => {
  it("contains at least all UI statuses", () => {
    for (const s of UI_JOB_STATUSES) {
      expect(JOB_STATUSES).toContain(s);
    }
  });

  it("contains the legacy external-assignment statuses", () => {
    expect(JOB_STATUSES).toContain("PENDING_EXTERNAL_ASSIGNMENT");
    expect(JOB_STATUSES).toContain("ASSIGNED_ONE_TIME_EXTERNAL");
    expect(JOB_STATUSES).toContain("IN_EXTERNAL_REPAIR");
    expect(JOB_STATUSES).toContain("WAITING_FOR_PARTS");
    expect(JOB_STATUSES).toContain("RETURNED_FROM_EXTERNAL");
  });
});

// ── normalizeJobStatus() ──────────────────────────────────────────────────────

describe("normalizeJobStatus()", () => {
  it("passes through standard UI statuses unchanged", () => {
    const passThrough: UiJobStatus[] = [
      "RECEIVED", "DIAGNOSING", "AWAITING_APPROVAL",
      "IN_REPAIR", "COMPLETED", "CLOSED",
    ];
    for (const status of passThrough) {
      expect(normalizeJobStatus(status)).toBe(status);
    }
  });

  it("collapses legacy external assignment states to REFERRED", () => {
    expect(normalizeJobStatus("PENDING_EXTERNAL_ASSIGNMENT")).toBe("REFERRED");
    expect(normalizeJobStatus("ASSIGNED_ONE_TIME_EXTERNAL")).toBe("REFERRED");
  });

  it("collapses legacy external progress states to IN_REPAIR", () => {
    expect(normalizeJobStatus("IN_EXTERNAL_REPAIR")).toBe("IN_REPAIR");
    expect(normalizeJobStatus("WAITING_FOR_PARTS")).toBe("IN_REPAIR");
    expect(normalizeJobStatus("RETURNED_FROM_EXTERNAL")).toBe("IN_REPAIR");
  });

  it("maps DELIVERED to COMPLETED", () => {
    expect(normalizeJobStatus("DELIVERED")).toBe("COMPLETED");
  });

  it("maps REFERRED as a standard UI status (no legacy collapse)", () => {
    expect(normalizeJobStatus("REFERRED")).toBe("REFERRED");
  });

  it("maps READY_FOR_PICKUP as a standard UI status", () => {
    expect(normalizeJobStatus("READY_FOR_PICKUP")).toBe("READY_FOR_PICKUP");
  });
});
