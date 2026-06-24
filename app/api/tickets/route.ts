import { NextRequest, NextResponse } from "next/server";
import { sanitizeText, sanitizeOptionalText } from "@/lib/sanitize";
import { orgDb, prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

const TIIS_ORG_ID = "org_tiis_01";

const ALLOWED_ORIGINS = new Set([
  process.env.ALLOWED_ORIGIN_1 || "https://app.eagleinfosolutions.com",
  process.env.ALLOWED_ORIGIN_2 || "https://www.eagleinfosolutions.com",
  "https://eagleinfosolutions.com",
  "https://care.eagleinfosolutions.com",
].filter(Boolean));

function getCorsHeaders(origin: string | null) {
  const isDev = process.env.NODE_ENV !== "production" && origin?.startsWith("http://localhost");
  const allowedOrigin = origin && (ALLOWED_ORIGINS.has(origin) || isDev) ? origin : "https://app.eagleinfosolutions.com";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(origin) });
}

function normalizeUgandaPhone(input: string): string {
  const trimmed = input.replace(/\s+/g, "").replace(/-/g, "");
  if (trimmed.startsWith("+")) return trimmed;
  if (trimmed.startsWith("256")) return "+" + trimmed;
  if (trimmed.startsWith("0")) return "+256" + trimmed.slice(1);
  return trimmed;
}

function validateTicket(body: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (!body.reporter_name?.toString().trim()) errors.push("Full name is required");
  if (!body.reporter_phone?.toString().trim()) errors.push("Phone is required");
  if (!body.subject?.toString().trim()) errors.push("Subject is required");
  if (!body.category?.toString().trim()) errors.push("Category is required");
  if (!body.description?.toString().trim()) errors.push("Description is required");
  return errors;
}

function buildTicketNumber(seq: number): string {
  const now = new Date();
  const shortYear = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const paddedSeq = String(seq).padStart(4, "0");
  return "TKT-" + shortYear + month + "-" + paddedSeq;
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const rl = await checkRateLimit("ticket-submission:" + ip, { limit: 10, windowMs: 60 * 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many submissions. Please try again later." },
      { status: 429, headers: { ...corsHeaders, ...rateLimitHeaders(rl.retryAfterMs) } });
  }

  try {
    const body = await request.json();

    if (typeof body._hp === "string" && body._hp.trim().length > 0) {
      return NextResponse.json({ success: true, ticket_number: "TKT-" + Date.now(), message: "Your ticket has been submitted successfully." },
        { headers: corsHeaders });
    }

    const errors = validateTicket(body);
    if (errors.length > 0) {
      return NextResponse.json({ success: false, errors }, { status: 400, headers: corsHeaders });
    }

    let resolvedOrgId: string = TIIS_ORG_ID;
    if (typeof body.org_slug === "string" && body.org_slug.trim()) {
      const org = await prisma.organization.findUnique({
        where: { slug: body.org_slug.trim() },
        select: { id: true, isActive: true },
      });
      if (org?.isActive) resolvedOrgId = org.id;
    }

    const db = orgDb(resolvedOrgId);
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const normalizedPhone = normalizeUgandaPhone(String(body.reporter_phone ?? ""));

    const phoneCount = await db.ticket.count({
      where: { reporterPhone: normalizedPhone, createdAt: { gte: oneHourAgo } },
    });
    if (phoneCount > 10) {
      return NextResponse.json(
        { success: false, error: "Too many tickets from this number. Please wait an hour or call us directly on +256 772 006 344." },
        { status: 429, headers: corsHeaders });
    }

    const orgIdForSeq = resolvedOrgId === TIIS_ORG_ID ? "_public" : resolvedOrgId;
    const orgIdForTicket = resolvedOrgId === TIIS_ORG_ID ? null : resolvedOrgId;
    const year = now.getFullYear();

    const seqRecord = await prisma.ticketSequence.upsert({
      where: { orgId_year: { orgId: orgIdForSeq, year: year } },
      create: { orgId: orgIdForSeq, year: year, value: 1 },
      update: { value: { increment: 1 } },
    });

    const ticketNumber = buildTicketNumber(seqRecord.value);

    const ticket = await db.ticket.create({
      data: {
        ticketNumber,
        status: "OPEN",
        priority: (body.priority as string)?.toUpperCase() || "MEDIUM",
        category: (body.category as string)?.toUpperCase() || "OTHER",
        orgId: orgIdForTicket,
        reporterName: sanitizeText(String(body.reporter_name)),
        reporterPhone: normalizedPhone,
        reporterEmail: body.reporter_email ? sanitizeOptionalText(String(body.reporter_email)) ?? undefined : undefined,
        reporterCompany: body.reporter_company ? sanitizeOptionalText(String(body.reporter_company)) ?? undefined : undefined,
        subject: sanitizeText(String(body.subject)),
        description: sanitizeText(String(body.description)),
        deviceInfo: body.device_info ? sanitizeOptionalText(String(body.device_info)) ?? undefined : undefined,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Your ticket has been submitted successfully.",
      ticket_number: ticket.ticketNumber,
      ticket_id: ticket.id,
    }, { headers: corsHeaders });

  } catch (error) {
    console.error("[TicketAPI] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" },
      { status: 500, headers: corsHeaders });
  }
}
