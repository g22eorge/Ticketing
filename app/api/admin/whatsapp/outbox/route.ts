import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserRole } from "@/lib/session";

const CHANNELS = ["WHATSAPP", "EMAIL"] as const;
const STATUSES = ["PENDING", "SENT", "FAILED", "DEAD"] as const;
const TYPES = [
  "REPAIR_REQUEST_CONFIRMATION",
  "FRONT_DESK_APPROVED",
  "FRONT_DESK_REJECTED",
  "INTAKE_APPROVED",
  "INTAKE_REJECTED",
  "JOB_CREATED",
  "JOB_COMPLETED",
  "REPAIR_REQUEST_EMAIL_ALERT",
  "ADMIN_TEST",
] as const;

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { user } = await getCurrentUserRole();
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const channel = request.nextUrl.searchParams.get("channel")?.toUpperCase();
  const status = request.nextUrl.searchParams.get("status")?.toUpperCase();
  const type = request.nextUrl.searchParams.get("type")?.toUpperCase();

  const normalizedChannel = CHANNELS.includes(channel as (typeof CHANNELS)[number])
    ? (channel as (typeof CHANNELS)[number])
    : undefined;
  const normalizedStatus = STATUSES.includes(status as (typeof STATUSES)[number])
    ? (status as (typeof STATUSES)[number])
    : undefined;

  const normalizedType = TYPES.includes(type as (typeof TYPES)[number])
    ? (type as (typeof TYPES)[number])
    : undefined;

  const rows = await prisma.outboundMessage.findMany({
    where: {
      ...(normalizedChannel ? { channel: normalizedChannel } : {}),
      ...(normalizedStatus ? { status: normalizedStatus } : {}),
      ...(normalizedType ? { type: normalizedType } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      channel: true,
      id: true,
      type: true,
      status: true,
      to: true,
      attemptCount: true,
      lastAttemptAt: true,
      nextAttemptAt: true,
      sentAt: true,
      provider: true,
      providerMessageId: true,
      providerDeliveryStatus: true,
      providerDeliveryAt: true,
      providerDeliveryErrorCode: true,
      providerDeliveryError: true,
      lastErrorCode: true,
      lastError: true,
      repairRequestId: true,
      jobId: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    ok: true,
    rows,
    filters: { channel: normalizedChannel, status: normalizedStatus, type: normalizedType },
  });
}
