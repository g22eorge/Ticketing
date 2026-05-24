import { describe, it, expect } from "bun:test";
import {
  formatQuotationNumber,
  canGenerateInvoiceForStatus,
  canGenerateQuotationForStatus,
} from "../../lib/documents";

// ── formatQuotationNumber() ───────────────────────────────────────────────────

describe("formatQuotationNumber()", () => {
  const issued = new Date("2025-06-15T10:00:00Z");

  it("substitutes {PREFIX}, {YYYY}, and {SEQ} tokens", () => {
    const result = formatQuotationNumber("EI-2025-0042", issued, "QT", "{PREFIX}-{YYYY}-{SEQ}", 4);
    expect(result).toBe("QT-2025-0042");
  });

  it("substitutes {M} with the unpadded month number", () => {
    const result = formatQuotationNumber("EI-2025-0001", issued, "QT", "{PREFIX}/{M}/{YYYY}/{SEQ}", 4);
    expect(result).toBe("QT/6/2025/0001");
  });

  it("substitutes {MM} with the zero-padded month", () => {
    const result = formatQuotationNumber("EI-2025-0001", issued, "INV", "{PREFIX}-{MM}-{YYYY}-{SEQ}", 4);
    expect(result).toBe("INV-06-2025-0001");
  });

  it("pads the sequence number to the requested length", () => {
    const result = formatQuotationNumber("EI-2025-0007", issued, "QT", "{SEQ}", 6);
    expect(result).toBe("000007");
  });

  it("handles EIS-format job numbers", () => {
    const result = formatQuotationNumber("EIS-06/2025/99", issued, "QT", "{PREFIX}-{YYYY}-{SEQ}", 4);
    expect(result).toBe("QT-2025-0099");
  });

  it("falls back to the issuedAt year when the job number format is unrecognised", () => {
    const result = formatQuotationNumber("CUSTOM-JOB-7", issued, "QT", "{PREFIX}-{YYYY}-{SEQ}", 4);
    expect(result).toBe("QT-2025-0007");
  });
});

// ── canGenerateInvoiceForStatus() ─────────────────────────────────────────────

describe("canGenerateInvoiceForStatus()", () => {
  it("permits READY_FOR_PICKUP, COMPLETED, and CLOSED", () => {
    expect(canGenerateInvoiceForStatus("READY_FOR_PICKUP")).toBe(true);
    expect(canGenerateInvoiceForStatus("COMPLETED")).toBe(true);
    expect(canGenerateInvoiceForStatus("CLOSED")).toBe(true);
  });

  it("denies all earlier statuses", () => {
    const denied = [
      "RECEIVED", "DIAGNOSING", "REFERRED",
      "AWAITING_APPROVAL", "IN_REPAIR",
      "PENDING_EXTERNAL_ASSIGNMENT", "IN_EXTERNAL_REPAIR",
    ] as const;
    for (const s of denied) {
      expect(canGenerateInvoiceForStatus(s)).toBe(false);
    }
  });
});

// ── canGenerateQuotationForStatus() ──────────────────────────────────────────

describe("canGenerateQuotationForStatus()", () => {
  it("permits statuses from DIAGNOSING onwards", () => {
    const allowed = [
      "DIAGNOSING", "REFERRED", "AWAITING_APPROVAL",
      "IN_REPAIR", "READY_FOR_PICKUP", "COMPLETED", "CLOSED",
      "IN_EXTERNAL_REPAIR", "WAITING_FOR_PARTS", "RETURNED_FROM_EXTERNAL",
    ] as const;
    for (const s of allowed) {
      expect(canGenerateQuotationForStatus(s)).toBe(true);
    }
  });

  it("denies RECEIVED (too early — no diagnosis yet)", () => {
    expect(canGenerateQuotationForStatus("RECEIVED")).toBe(false);
  });

  it("denies PENDING_EXTERNAL_ASSIGNMENT", () => {
    expect(canGenerateQuotationForStatus("PENDING_EXTERNAL_ASSIGNMENT")).toBe(false);
  });
});
