import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

type LoginPayload = {
  email?: string;
  password?: string;
  callbackURL?: string;
  rememberMe?: boolean;
};

type ResolvedUser = {
  email: string;
  isActive: number;
};

function toHostOnlyCookie(cookie: string) {
  // Prevent cross-domain cookie mismatches between custom and vercel domains.
  // If BetterAuth emits a Domain attribute tied to one host, remove it so the
  // browser stores the cookie for the current host only.
  return cookie.replace(/;\s*Domain=[^;]*/gi, "");
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  try {
    const body = (await request.json()) as LoginPayload;
    const email = String(body.email ?? "").trim();

    // Platform super admin is never rate-limited.
    const platformAdmin = process.env.PLATFORM_ADMIN_EMAIL?.toLowerCase();
    const isSuperAdmin = platformAdmin && email.toLowerCase() === platformAdmin;

    if (!isSuperAdmin) {
      const rl = checkRateLimit(`login:${ip}`, { limit: 10, windowMs: 60_000 });
      if (!rl.allowed) {
        return NextResponse.json(
          { message: "Too many login attempts. Please wait a minute.", code: "RATE_LIMITED" },
          { status: 429, headers: rateLimitHeaders(rl.retryAfterMs) },
        );
      }
    }
    const password = String(body.password ?? "");
    const callbackURL = typeof body.callbackURL === "string" && body.callbackURL.length > 0 ? body.callbackURL : "/dashboard";
    const rememberMe = Boolean(body.rememberMe);

    if (!email || !password) {
      return NextResponse.json({ message: "Email and password are required" }, { status: 400 });
    }

    const rows = await prisma.$queryRaw<ResolvedUser[]>`
      SELECT email, isActive
      FROM "User"
      WHERE lower(email) = lower(${email})
      LIMIT 1
    `;

    const resolved = rows[0] ?? null;
    if (!resolved) {
      return NextResponse.json(
        { message: "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD" },
        { status: 401 },
      );
    }

    if (!resolved.isActive) {
      return NextResponse.json(
        { message: "This account is deactivated. Contact an administrator.", code: "ACCOUNT_DISABLED" },
        { status: 403 },
      );
    }

    // Call BetterAuth in-process — avoids HTTP self-fetch which is unreliable
    // in serverless environments where the origin URL may not match BETTER_AUTH_URL.
    const authBaseURL =
      process.env.BETTER_AUTH_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      new URL(request.url).origin;

    const syntheticRequest = new Request(`${authBaseURL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: new Headers({
        "content-type": "application/json",
        accept: "application/json",
        origin: authBaseURL,
      }),
      body: JSON.stringify({
        email: resolved.email,
        password,
        callbackURL,
        rememberMe,
      }),
    });

    const upstream = await auth.handler(syntheticRequest);

    const text = await upstream.text();
    const response = new NextResponse(text, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
      },
    });

    const setCookies = upstream.headers.getSetCookie?.() ?? [];
    if (setCookies.length > 0) {
      for (const cookie of setCookies) {
        response.headers.append("set-cookie", toHostOnlyCookie(cookie));
      }
    } else {
      const singleSetCookie = upstream.headers.get("set-cookie");
      if (singleSetCookie) {
        response.headers.set("set-cookie", toHostOnlyCookie(singleSetCookie));
      }
    }

    return response;
  } catch {
    return NextResponse.json(
      { message: "Sign in failed. Please try again.", code: "LOGIN_FAILED" },
      { status: 500 },
    );
  }
}
