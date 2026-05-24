import { describe, it, expect, mock, beforeEach } from "bun:test";

// ── Mock prisma before importing the route handler ────────────────────────────

const mockQueryRaw = mock(async () => [{ 1: 1 }]);

mock.module("@/lib/prisma", () => ({
  prisma: { $queryRaw: mockQueryRaw },
}));

const { GET } = await import("../../../app/api/health/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest() {
  return new Request("http://localhost/api/health");
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/health — DB healthy", () => {
  beforeEach(() => {
    mockQueryRaw.mockImplementation(async () => [{ 1: 1 }]);
  });

  it("returns HTTP 200", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("returns ok: true", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns db: 'ok'", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.db).toBe("ok");
  });

  it("includes uptime as a non-negative number", async () => {
    const res = await GET();
    const body = await res.json();
    expect(typeof body.uptime).toBe("number");
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it("returns Content-Type: application/json", async () => {
    const res = await GET();
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

describe("GET /api/health — DB unreachable", () => {
  beforeEach(() => {
    mockQueryRaw.mockImplementation(async () => {
      throw new Error("SQLITE_ERROR: database is locked");
    });
  });

  it("returns HTTP 503", async () => {
    const res = await GET();
    expect(res.status).toBe(503);
  });

  it("returns ok: false", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("returns db: 'error'", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.db).toBe("error");
  });

  it("still includes uptime in the error response", async () => {
    const res = await GET();
    const body = await res.json();
    expect(typeof body.uptime).toBe("number");
  });
});
