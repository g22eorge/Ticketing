import { NextResponse } from "next/server";

import { assertPlatformAdmin } from "@/lib/platform-admin";

export const dynamic = "force-dynamic";

function maskValue(value?: string) {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length <= 8) return "***";
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

export async function GET() {
  const user = await assertPlatformAdmin();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  const tursoToken = process.env.TURSO_AUTH_TOKEN?.trim();
  const databaseUrl = process.env.DATABASE_URL?.trim();

  const mode = tursoUrl ? "turso" : "sqlite";
  const warnings: string[] = [];

  if (!tursoUrl) {
    warnings.push("TURSO_DATABASE_URL is missing; runtime falls back to sqlite mode.");
  }
  if (tursoUrl && !tursoToken) {
    warnings.push("TURSO_AUTH_TOKEN is missing while TURSO_DATABASE_URL is set.");
  }
  if (databaseUrl?.startsWith("file:")) {
    warnings.push("DATABASE_URL is a local file URL.");
  }

  return NextResponse.json({
    ok: true,
    mode,
    env: {
      hasTursoDatabaseUrl: Boolean(tursoUrl),
      hasTursoAuthToken: Boolean(tursoToken),
      hasDatabaseUrl: Boolean(databaseUrl),
      databaseUrlKind: databaseUrl
        ? databaseUrl.startsWith("file:")
          ? "sqlite-file"
          : databaseUrl.startsWith("libsql://")
            ? "libsql"
            : "other"
        : "unset",
      tursoDatabaseUrlMasked: maskValue(tursoUrl),
      databaseUrlMasked: maskValue(databaseUrl),
    },
    warnings,
  });
}
