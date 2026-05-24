import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
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

const ACTIVE_USER = { id: "u1", email: "alice@example.com", isActive: 1 };

function makePost(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Replace globalThis.fetch with a mock that always returns the given response. */
function stubFetch(response: Response): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.fetch = mock(async () => response) as any;
}

function makeBetterAuthResponse(status: number, body = "{}", cookie?: string): Response {
  const headers: HeadersInit = { "content-type": "application/json" };
  return new Response(body, { status, headers: cookie ? { ...headers, "set-cookie": cookie } : headers });
}

// ── Input validation ──────────────────────────────────────────────────────────

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

  it("returns 401 with INVALID_EMAIL_OR_PASSWORD code", async () => {
    mockQueryRaw.mockImplementation(async (): Promise<[]> => []);
    const res = await POST(makePost({ email: "ghost@example.com", password: "wrong" }));
    const body = await res.json();
    expect(body.code).toBe("INVALID_EMAIL_OR_PASSWORD");
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

// ── Success path (active user → BetterAuth upstream) ─────────────────────────

describe("POST /api/login — success path", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    mockCheckRateLimit.mockImplementation(async () => ({ allowed: true, retryAfterMs: 0 }));
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mockQueryRaw.mockReset();
  });

  it("proxies the BetterAuth 200 response to the caller", async () => {
    mockQueryRaw
      .mockImplementationOnce(async () => [ACTIVE_USER])
      .mockImplementationOnce(async (): Promise<[]> => []);
    stubFetch(makeBetterAuthResponse(200, '{"token":"abc"}'));
    const res = await POST(makePost({ email: "alice@example.com", password: "Pass1!" }));
    expect(res.status).toBe(200);
  });

  it("sets x-login-redirect header on success", async () => {
    mockQueryRaw
      .mockImplementationOnce(async () => [ACTIVE_USER])
      .mockImplementationOnce(async (): Promise<[]> => []);
    stubFetch(makeBetterAuthResponse(200, '{"token":"abc"}'));
    const res = await POST(makePost({ email: "alice@example.com", password: "Pass1!" }));
    expect(res.headers.get("x-login-redirect")).toBeTruthy();
  });

  it("forwards set-cookie from BetterAuth response", async () => {
    mockQueryRaw
      .mockImplementationOnce(async () => [ACTIVE_USER])
      .mockImplementationOnce(async (): Promise<[]> => []);
    stubFetch(
      makeBetterAuthResponse(200, '{"token":"abc"}', "session=xyz; Path=/; HttpOnly"),
    );
    const res = await POST(makePost({ email: "alice@example.com", password: "Pass1!" }));
    const cookie = res.headers.get("set-cookie");
    expect(cookie).toContain("session=xyz");
  });

  it("returns 500 with LOGIN_FAILED code when fetch throws", async () => {
    mockQueryRaw
      .mockImplementationOnce(async () => [ACTIVE_USER])
      .mockImplementationOnce(async (): Promise<[]> => []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.fetch = mock(async () => { throw new Error("network error"); }) as any;
    const res = await POST(makePost({ email: "alice@example.com", password: "Pass1!" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("LOGIN_FAILED");
  });

  it("redirects platform admin to /platform-admin", async () => {
    // Second queryRaw returns a platform_admin permission row
    mockQueryRaw
      .mockImplementationOnce(async () => [ACTIVE_USER])
      .mockImplementationOnce(async () => [{ permission: "platform_admin" }]);
    stubFetch(makeBetterAuthResponse(200, '{"token":"abc"}'));
    const res = await POST(makePost({ email: "alice@example.com", password: "Pass1!" }));
    expect(res.headers.get("x-login-redirect")).toBe("/platform-admin");
  });
});

// ── Rate limiting ─────────────────────────────────────────────────────────────

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
