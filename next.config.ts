import type { NextConfig } from "next";

/**
 * Content-Security-Policy
 *
 * 'unsafe-inline' for styles — required by Recharts (inline style attributes)
 * and Tailwind's dynamic class generation in dev mode.
 *
 * 'unsafe-eval' is intentionally EXCLUDED (no eval-based libraries).
 *
 * data: for images — PDF previews and chart data-URIs.
 *
 * blob: for images — object-URL previews before file upload.
 *
 * https://vercel.live — Vercel preview comments widget (safe in prod; no-op
 * when not in a preview deployment).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://vercel.live",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://vercel.live wss://ws-us3.pusher.com https://*.turso.io",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: CSP },
        ],
      },
    ];
  },
};

export default nextConfig;
