import { describe, it, expect, mock, beforeEach } from "bun:test";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockQueryRaw = mock(async (): Promise<any[]> => []);
const mockCheckRateLimit = mock(async () => ({ allowed: true, retryAfterMs: 0 }));

mock.module("@/lib/prisma", () => ({
  prisma: { $queryRaw: mockQueryRaw },
}));

mock.module("@/lib/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
  rateLimitHeaders: mock(() => ({})),
}));

const { POST } = await import("../../../app/api/login/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePost(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/login — input validation", () => {
  beforeEach(() => {
    mockCheckRateLimit.mockImplementation(async () => ({ allowed: true, retryAfterMs: 0 }));
    mockQueryRaw.mockImplementation(async (): Promise<[]> => []);
  });

  it("returns 400 when email is missing", async () => {
    const res = await POST(makePost({ password: "secret" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is missing", async () => {
    const res = await POST(makePost({ email: "user@example.com" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when both email and password are empty strings", async () => {
    const res = await POST(makePost({ email: "", password: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 with a descriptive message", async () => {
    const res = await POST(makePost({}));
    const body = await res.json();
    expect(typeof body.message).toBe("string");
    expect(body.message.length).toBeGreaterThan(0);
  });

  it("returns 401 when no user matches the email", async () => {
    mockQueryRaw.mockImplementation(async (): Promise<[]> => []);
    const res = await POST(makePost({ email: "ghost@example.com", password: "wrong" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user account is deactivated (isActive = 0)", async () => {
    mockQueryRaw.mockImplementation(async () => [
      { id: "u1", email: "disabled@example.com", isActive: 0 },
    ]);
    const res = await POST(makePost({ email: "disabled@example.com", password: "pass" }));
    expect(res.status).toBe(403);
  });

  it("returns 403 with ACCOUNT_DISABLED code", async () => {
    mockQueryRaw.mockImplementation(async () => [
      { id: "u1", email: "disabled@example.com", isActive: 0 },
    ]);
    const res = await POST(makePost({ email: "disabled@example.com", password: "pass" }));
    const body = await res.json();
    expect(body.code).toBe("ACCOUNT_DISABLED");
  });
});

describe("POST /api/login — rate limiting", () => {
  it("returns 429 when rate limit is exceeded", async () => {
    mockCheckRateLimit.mockImplementation(async () => ({
      allowed: false,
      retryAfterMs: 30_000,
    }));
    const res = await POST(makePost({ email: "a@b.com", password: "pw" }));
    expect(res.status).toBe(429);
  });

  it("returns RATE_LIMITED code on 429", async () => {
    mockCheckRateLimit.mockImplementation(async () => ({
      allowed: false,
      retryAfterMs: 30_000,
    }));
    const res = await POST(makePost({ email: "a@b.com", password: "pw" }));
    const body = await res.json();
    expect(body.code).toBe("RATE_LIMITED");
  });
});
