import { describe, it, expect, mock, beforeEach } from "bun:test";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockCheckRateLimit = mock(async () => ({ allowed: true, retryAfterMs: 0 }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUserFindUnique = mock(async (): Promise<any> => null);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockOrgFindUnique = mock(async (): Promise<any> => null);

mock.module("@/lib/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
  rateLimitHeaders: mock(() => ({})),
}));

mock.module("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
    organisation: { findUnique: mockOrgFindUnique },
    $transaction: mock(async () => ({ org: {}, user: {} })),
  },
}));

// better-auth/crypto used by the route for hashPassword
mock.module("better-auth/crypto", () => ({
  hashPassword: mock(async (pw: string) => `hashed:${pw}`),
}));

const { POST } = await import("../../../app/api/org/signup/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePost(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/org/signup", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  orgName: "Acme Corp",
  adminName: "Alice Admin",
  email: "alice@acme.com",
  password: "Str0ngPass!",
};

// ── Input validation ──────────────────────────────────────────────────────────

describe("POST /api/org/signup — validation", () => {
  beforeEach(() => {
    mockCheckRateLimit.mockImplementation(async () => ({ allowed: true, retryAfterMs: 0 }));
    mockUserFindUnique.mockImplementation(async () => null);
    mockOrgFindUnique.mockImplementation(async () => null);
  });

  it("returns 400 for malformed JSON", async () => {
    const req = new NextRequest("http://localhost/api/org/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 422 when orgName is missing", async () => {
    const { orgName: _orgName, ...rest } = validBody;
    const res = await POST(makePost(rest));
    expect(res.status).toBe(422);
  });

  it("returns 422 when email is invalid", async () => {
    const res = await POST(makePost({ ...validBody, email: "not-an-email" }));
    expect(res.status).toBe(422);
  });

  it("returns 422 when password is too short (< 8 chars)", async () => {
    const res = await POST(makePost({ ...validBody, password: "short" }));
    expect(res.status).toBe(422);
  });

  it("returns 422 with a fieldErrors object", async () => {
    const res = await POST(makePost({ ...validBody, email: "bad" }));
    const body = await res.json();
    expect(body.issues).toBeDefined();
    expect(body.issues.email).toBeDefined();
  });

  it("returns 422 when orgName is too short (< 2 chars)", async () => {
    const res = await POST(makePost({ ...validBody, orgName: "A" }));
    expect(res.status).toBe(422);
  });
});

// ── Duplicate detection ───────────────────────────────────────────────────────

describe("POST /api/org/signup — duplicate checks", () => {
  beforeEach(() => {
    mockCheckRateLimit.mockImplementation(async () => ({ allowed: true, retryAfterMs: 0 }));
    mockOrgFindUnique.mockImplementation(async () => null);
  });

  it("returns 409 when email already exists", async () => {
    mockUserFindUnique.mockImplementation(async () => ({ id: "existing-user" }));
    const res = await POST(makePost(validBody));
    expect(res.status).toBe(409);
  });

  it("returns an error message on 409", async () => {
    mockUserFindUnique.mockImplementation(async () => ({ id: "existing-user" }));
    const res = await POST(makePost(validBody));
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });
});

// ── Rate limiting ─────────────────────────────────────────────────────────────

describe("POST /api/org/signup — rate limiting", () => {
  it("returns 429 when rate limit is exceeded", async () => {
    mockCheckRateLimit.mockImplementation(async () => ({
      allowed: false,
      retryAfterMs: 60_000,
    }));
    const res = await POST(makePost(validBody));
    expect(res.status).toBe(429);
  });
});
