import { NextRequest, NextResponse } from "next/server";
import { sanitizeOptionalText } from "@/lib/sanitize";
import { requireOrgSession } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";

const VALID_STATUSES = [
  "OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "WAITING_FOR_APPROVAL",
  "WAITING_FOR_PAYMENT", "RESOLVED", "CLOSED", "CANCELLED",
];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { orgId } = await requireOrgSession();
    const { id } = await params;
    const body = await request.json();

    const ticket = await prisma.ticket.findFirst({
      where: { id, orgId },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};

    if (body.status && VALID_STATUSES.includes(body.status)) {
      updateData.status = body.status;
      if (body.status === "RESOLVED" && !ticket.resolvedAt) updateData.resolvedAt = new Date();
      if (body.status === "CLOSED" && !ticket.closedAt) updateData.closedAt = new Date();
    }

    if (body.priority && ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(body.priority)) {
      updateData.priority = body.priority;
    }

    if (body.assignedToId !== undefined) {
      updateData.assignedToId = body.assignedToId || null;
    }

    if (typeof body.isSLACovered === "boolean") {
      updateData.isSLACovered = body.isSLACovered;
    }

    if (body.estimatedCost !== undefined) {
      updateData.estimatedCost = body.estimatedCost === null ? null : parseFloat(body.estimatedCost);
    }

    if (typeof body.resolution === "string") {
      updateData.resolution = sanitizeOptionalText(body.resolution) ?? body.resolution;
    }

    if (typeof body.notes === "string") {
      updateData.notes = sanitizeOptionalText(body.notes) ?? body.notes;
    }

    if (typeof body.clientId === "string") {
      const client = await prisma.client.findFirst({ where: { id: body.clientId, orgId } });
      if (client) updateData.clientId = body.clientId;
    }

    const updated = await prisma.ticket.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, ticket: updated });
  } catch (error) {
    console.error("[TicketAPI PATCH] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
