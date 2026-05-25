import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCurrentUserRoleOptional } from "@/lib/session";

const VALID_RATINGS = new Set(["HELPFUL", "NOT_HELPFUL"]);

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit(`ai-feedback:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return Response.json({ error: "Rate limit exceeded." }, { status: 429 });

  const { user } = await getCurrentUserRoleOptional();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { feature?: string; question?: string; answer?: string; rating?: string; comment?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const feature = (body.feature ?? "AI_GUIDE").trim().slice(0, 80);
  const question = (body.question ?? "").trim().slice(0, 4000);
  const answer = (body.answer ?? "").trim().slice(0, 8000);
  const rating = (body.rating ?? "").trim().toUpperCase();
  const comment = body.comment?.trim().slice(0, 2000) || null;

  if (!question || !answer) return Response.json({ error: "Question and answer are required." }, { status: 400 });
  if (!VALID_RATINGS.has(rating)) return Response.json({ error: "Invalid rating." }, { status: 400 });

  try {
    await prisma.aiFeedback.create({
      data: { orgId: user.orgId, userId: user.id, feature, question, answer, rating, comment },
    });
  } catch {
    return Response.json({ error: "AI feedback storage is not ready yet." }, { status: 503 });
  }

  return Response.json({ ok: true });
}
