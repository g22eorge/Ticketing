import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/survey
 * Body: { ticketId: string, rating: number (1-5), comment?: string }
 * Records a customer satisfaction survey (CSAT) for a completed ticket.
 */
export async function POST(req: NextRequest) {
  const session = auth ? await auth.api.getSession({ headers: req.headers }) : null;
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { orgId: true, isActive: true },
  });
  if (!user?.isActive || !user.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ticketId = String(body.ticketId ?? "").trim();
  const rating = Number(body.rating);
  const comment = body.comment ? String(body.comment).trim() : undefined;

  if (!ticketId || !Number.isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "ticketId and rating (1-5) required" }, { status: 400 });
  }

  // Verify the ticket exists and belongs to the org (or is a global ticket without orgId)
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { orgId: true },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  if (ticket.orgId && ticket.orgId !== user.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const survey = await prisma.survey.create({
    data: {
      ticketId,
      rating,
      comment,
      orgId: user.orgId,
    },
  });

  return NextResponse.json(survey, { status: 201 });
}
