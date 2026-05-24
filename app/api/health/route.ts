import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  let db: "ok" | "error" = "error";

  try {
    await prisma.$queryRaw`SELECT 1`;
    db = "ok";
  } catch {
    return NextResponse.json(
      { ok: false, db: "error", uptime: process.uptime() },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    db,
    uptime: Math.floor(process.uptime()),
  });
}
