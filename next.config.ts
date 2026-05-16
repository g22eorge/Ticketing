import type { NextConfig } from "next";

/**
 * Content-Security-Policy
 *
 * 'unsafe-inline' for styles — required by Recharts (inline style attributes)
 * and Tailwind's dynamic class generation in dev mode.
 *
 * 'unsafe-inline' for scripts — required by Next's bootstrap/runtime scripts in
 * this deployment mode. Keep 'strict-dynamic' out unless per-request nonces are
 * added, otherwise some browsers reject same-origin Next.js chunks.
 *
 * CSP is sent only in production. React/Next/Turbopack dev mode uses eval and
 * runtime style injection for debugging/HMR, so applying CSP locally can leave
 * pages as unstyled HTML.
 *
 * data: for images — PDF previews and chart data-URIs.
 *
 * blob: for images — object-URL previews before file upload.
 *
 * https://vercel.live — Vercel preview comments widget (safe in prod; no-op
 * when not in a preview deployment).
 */
const isProduction = process.env.NODE_ENV === "production";

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://vercel.live https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://vercel.live wss://ws-us3.pusher.com https://*.turso.io https://va.vercel-analytics.com",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      ...(isProduction ? [{ key: "Content-Security-Policy", value: CSP }] : []),
    ];

    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
