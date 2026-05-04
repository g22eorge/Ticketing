import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginPayload;
    const email = String(body.email ?? "").trim();
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

    const origin = new URL(request.url).origin;
    const upstream = await fetch(`${origin}/api/auth/sign-in/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        origin,
      },
      body: JSON.stringify({
        email: resolved.email,
        password,
        callbackURL,
        rememberMe,
      }),
    });

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
