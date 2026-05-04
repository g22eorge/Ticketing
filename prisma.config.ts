import path from "node:path";

import { defineConfig } from "prisma/config";

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL || "file:./dev.db";

  // Allow Prisma CLI to target Turso/libSQL when explicitly configured.
  // (Needed for prod `prisma migrate deploy`.)
  if (url.startsWith("libsql:")) {
    return url;
  }

  // Prisma CLI expects a `file:` URL for local sqlite.
  if (!url.startsWith("file:")) {
    const raw = url.replace(/^file:/, "");
    return `file:${path.resolve(process.cwd(), raw)}`;
  }

  const rawPath = url.slice("file:".length);
  if (!rawPath || rawPath.startsWith("/")) return url;

  // Prisma's `file:./dev.db` is resolved relative to `schema.prisma` (./prisma),
  // but the CLI config runs from repo root. Normalize so CLI and runtime match.
  if (rawPath === "dev.db" || rawPath === "./dev.db") {
    return `file:${path.resolve(process.cwd(), "prisma", "dev.db")}`;
  }

  return `file:${path.resolve(process.cwd(), rawPath)}`;
}

// Set the env var so prisma schema can use it
process.env.DATABASE_URL = getDatabaseUrl();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: getDatabaseUrl(),
  },
});
