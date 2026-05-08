import { NextRequest, NextResponse } from "next/server";
import { sanitizeText, sanitizeOptionalText } from "@/lib/sanitize";
import { createRepairRequest } from "@/lib/repairs/request";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { deliverOutboundMessage, enqueueEmailMessage, enqueueWhatsAppMessage } from "@/lib/notifications/whatsapp-outbox";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
const ALLOWED_ORIGINS = [
  process.env.ALLOWED_ORIGIN_1,
  process.env.ALLOWED_ORIGIN_2,
  appUrl,
].filter(Boolean) as string[];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.includes(origin)
      ? origin
      : (ALLOWED_ORIGINS[0] ?? "*");

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

function normalizeUgandaPhone(input: string): string {
  const trimmed = input.replace(/\s+/g, "").replace(/-/g, "");
  if (trimmed.startsWith("+")) return trimmed;
  if (trimmed.startsWith("256")) return `+${trimmed}`;
  if (trimmed.startsWith("0")) return `+256${trimmed.slice(1)}`;
  return trimmed;
}

const ALLOWED_DEVICE_TYPES = [
  "PHONE_ANDROID",
  "PHONE_IPHONE",
  "TABLET",
  "WINDOWS_PC",
  "MAC",
  "OTHER",
];

const ALLOWED_HANDOVER_METHODS = [
  "SELF_DROPOFF",
  "SEND_WITH_DELIVERY_PERSON",
  "REQUEST_PICKUP",
];

interface DeviceEntry {
  device_type: string;
  brand: string;
  model?: string;
  problem_description: string;
}

function validateCustomerAndHandover(body: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const phone = body.phone || body.customer_phone;
  const handoverMethod = body.handover_method || "SELF_DROPOFF";

  if (!body.customer_name?.toString().trim()) errors.push("Customer name is required");
  if (!phone?.toString().trim()) errors.push("Phone is required");

  const hm = handoverMethod?.toString().toLowerCase();
  if (hm === "self_dropoff") {
    if (!body.preferred_dropoff_date?.toString().trim() && !body.preferred_date?.toString().trim())
      errors.push("Preferred date is required for self drop-off");
  }
  if (hm === "send_with_delivery_person") {
    if (!body.delivery_person_name?.toString().trim()) errors.push("Delivery person name is required");
    if (!body.delivery_person_phone?.toString().trim()) errors.push("Delivery person phone is required");
  }
  if (hm === "request_pickup") {
    if (!body.pickup_address?.toString().trim()) errors.push("Pickup address is required");
    if (!body.preferred_pickup_date?.toString().trim()) errors.push("Preferred pickup date is required");
  }
  return errors;
}

function validateSingleDevice(body: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (!body.device_type?.toString().trim()) errors.push("Device type is required");
  if (!(body.brand || body.device_brand)?.toString().trim()) errors.push("Device brand is required");
  if (!(body.problem_description || body.issue_description)?.toString().trim()) errors.push("Issue description is required");
  return errors;
}

function validateDeviceEntry(device: DeviceEntry, index: number): string[] {
  const errors: string[] = [];
  if (!device.device_type?.trim()) errors.push(`Device ${index + 1}: device_type is required`);
  else if (!ALLOWED_DEVICE_TYPES.includes(device.device_type.toUpperCase())) errors.push(`Device ${index + 1}: invalid device_type`);
  if (!device.brand?.trim()) errors.push(`Device ${index + 1}: brand is required`);
  if (!device.problem_description?.trim()) errors.push(`Device ${index + 1}: problem_description is required`);
  return errors;
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function buildSharedFields(body: Record<string, unknown>, ip: string) {
  const phone = body.phone || body.customer_phone;
  const email = body.email || body.customer_email;
  const handoverMethod = ((body.handover_method as string) || "SELF_DROPOFF").toUpperCase() as
    "SELF_DROPOFF" | "SEND_WITH_DELIVERY_PERSON" | "REQUEST_PICKUP";

  return {
    customerName: sanitizeText((body.customer_name as string) || ""),
    phone: normalizeUgandaPhone((phone as string) || ""),
    email: email ? (sanitizeOptionalText(email as string) ?? undefined) : undefined,
    handoverMethod,
    preferredDropoffDate: (body.preferred_dropoff_date || body.preferred_date)
      ? sanitizeOptionalText((body.preferred_dropoff_date as string) || (body.preferred_date as string)) ?? undefined
      : undefined,
    preferredDropoffTime: body.preferred_dropoff_time ? sanitizeOptionalText(body.preferred_dropoff_time as string) ?? undefined : undefined,
    dropoffNotes: body.dropoff_notes ? sanitizeOptionalText(body.dropoff_notes as string) ?? undefined : undefined,
    deliveryPersonName: body.delivery_person_name ? sanitizeOptionalText(body.delivery_person_name as string) ?? undefined : undefined,
    deliveryPersonPhone: body.delivery_person_phone ? normalizeUgandaPhone(body.delivery_person_phone as string) : undefined,
    deliveryCompany: body.delivery_company ? sanitizeOptionalText(body.delivery_company as string) ?? undefined : undefined,
    dispatchDate: body.dispatch_date ? sanitizeOptionalText(body.dispatch_date as string) ?? undefined : undefined,
    expectedArrivalTime: body.expected_arrival_time ? sanitizeOptionalText(body.expected_arrival_time as string) ?? undefined : undefined,
    deliveryTrackingReference: body.delivery_tracking_reference ? sanitizeOptionalText(body.delivery_tracking_reference as string) ?? undefined : undefined,
    deliveryFeeResponsibility: body.delivery_fee_responsibility ? sanitizeOptionalText(body.delivery_fee_responsibility as string) ?? undefined : undefined,
    deliveryNotes: body.delivery_notes ? sanitizeOptionalText(body.delivery_notes as string) ?? undefined : undefined,
    pickupAddress: body.pickup_address ? sanitizeOptionalText(body.pickup_address as string) ?? undefined : undefined,
    pickupLandmark: body.pickup_landmark ? sanitizeOptionalText(body.pickup_landmark as string) ?? undefined : undefined,
    preferredPickupDate: body.preferred_pickup_date ? sanitizeOptionalText(body.preferred_pickup_date as string) ?? undefined : undefined,
    preferredPickupTime: body.preferred_pickup_time ? sanitizeOptionalText(body.preferred_pickup_time as string) ?? undefined : undefined,
    alternateContactPerson: body.alternate_contact_person ? sanitizeOptionalText(body.alternate_contact_person as string) ?? undefined : undefined,
    alternateContactPhone: body.alternate_contact_phone ? normalizeUgandaPhone(body.alternate_contact_phone as string) : undefined,
    pickupNotes: body.pickup_notes ? sanitizeOptionalText(body.pickup_notes as string) ?? undefined : undefined,
    submissionIp: ip,
  };
}

async function deliverInline(outboxId: string) {
  await Promise.race([
    deliverOutboundMessage(outboxId),
    new Promise((resolve) => setTimeout(() => resolve(null), 2500)),
  ]);
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = checkRateLimit(`repair-request:${ip}`, { limit: 5, windowMs: 60 * 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many submissions. Please try again later." },
      { status: 429, headers: { ...corsHeaders, ...rateLimitHeaders(rl.retryAfterMs) } },
    );
  }

  try {
    const body = await request.json();

    // ── Honeypot check ──────────────────────────────────────────────────────
    if (typeof body._hp === "string" && body._hp.trim().length > 0) {
      return NextResponse.json(
        { success: true, request_number: `REQ-${Date.now()}`, message: "Your repair request has been submitted successfully. We'll contact you shortly." },
        { headers: corsHeaders }
      );
    }

    const isBatch = Array.isArray(body.devices) && body.devices.length > 0;

    // ── Validation ──────────────────────────────────────────────────────────
    const customerErrors = validateCustomerAndHandover(body);
    const deviceErrors = isBatch
      ? body.devices.flatMap((d: DeviceEntry, i: number) => validateDeviceEntry(d, i))
      : validateSingleDevice(body);

    const errors = [...customerErrors, ...deviceErrors];
    if (errors.length > 0) {
      return NextResponse.json({ success: false, errors }, { status: 400, headers: corsHeaders });
    }

    // ── Rate limiting ────────────────────────────────────────────────────────
    const ip = getClientIp(request);
    const rawPhone = (body.phone || body.customer_phone || "") as string;
    const normalizedPhoneForCheck = normalizeUgandaPhone(rawPhone);
    const deviceCount = isBatch ? body.devices.length : 1;

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const phoneCount = await prisma.repairRequest.count({
      where: { phone: normalizedPhoneForCheck, createdAt: { gte: oneDayAgo } },
    });
    if (phoneCount + deviceCount > 5) {
      return NextResponse.json(
        { success: false, error: "Too many requests from this number. Please wait 24 hours before submitting again, or call us directly on +256 772 006 344." },
        { status: 429, headers: corsHeaders }
      );
    }

    if (ip !== "unknown") {
      const ipCount = await prisma.repairRequest.count({
        where: { submissionIp: ip, createdAt: { gte: oneHourAgo } },
      });
      if (ipCount + deviceCount > 10) {
        return NextResponse.json(
          { success: false, error: "Too many requests from your network. Please try again later." },
          { status: 429, headers: corsHeaders }
        );
      }
    }

    // ── Validate device types ────────────────────────────────────────────────
    const handoverMethod = ((body.handover_method as string) || "SELF_DROPOFF").toUpperCase();
    if (!ALLOWED_HANDOVER_METHODS.includes(handoverMethod)) {
      return NextResponse.json({ success: false, errors: ["Invalid handover_method"] }, { status: 400, headers: corsHeaders });
    }

    // ── Create repair request(s) ─────────────────────────────────────────────
    const shared = buildSharedFields(body, ip);
    const results: Array<{ requestNumber: string; requestId: string; brand: string; deviceType: string; problemDescription: string }> = [];

    if (isBatch) {
      for (const device of body.devices as DeviceEntry[]) {
        const dt = device.device_type.toUpperCase();
        const result = await createRepairRequest({
          ...shared,
          deviceType: dt,
          brand: sanitizeText(device.brand),
          model: device.model ? sanitizeOptionalText(device.model) ?? undefined : undefined,
          problemDescription: sanitizeText(device.problem_description),
        });
        if (!result.success || !result.requestId || !result.requestNumber) {
          return NextResponse.json(
            { success: false, error: result.error || "Failed to create one or more requests" },
            { status: 500, headers: corsHeaders }
          );
        }
        results.push({ requestNumber: result.requestNumber, requestId: result.requestId, brand: device.brand, deviceType: dt, problemDescription: sanitizeText(device.problem_description) });
      }
    } else {
      const dt = (body.device_type as string).toUpperCase();
      if (!ALLOWED_DEVICE_TYPES.includes(dt)) {
        return NextResponse.json({ success: false, errors: ["Invalid device_type"] }, { status: 400, headers: corsHeaders });
      }
      const result = await createRepairRequest({
        ...shared,
        deviceType: dt,
        brand: sanitizeText((body.brand as string) || (body.device_brand as string) || ""),
        model: sanitizeOptionalText((body.model as string) || (body.device_model as string)) ?? undefined,
        problemDescription: sanitizeText((body.problem_description as string) || (body.issue_description as string) || ""),
      });
      if (!result.success || !result.requestId || !result.requestNumber) {
        return NextResponse.json(
          { success: false, error: result.error || "Failed to create request" },
          { status: 500, headers: corsHeaders }
        );
      }
      results.push({ requestNumber: result.requestNumber, requestId: result.requestId, brand: (body.brand || body.device_brand) as string, deviceType: dt, problemDescription: sanitizeText((body.problem_description as string) || (body.issue_description as string) || "") });
    }

    // ── WhatsApp confirmation (one message for all devices) ──────────────────
    const customerName = String(body.customer_name ?? "Customer");
    const deviceLines = results.map((r) => `• ${r.requestNumber} — ${r.brand} (${r.deviceType.replace(/_/g, " ")})`).join("\n");
    const whatsappMessage = isBatch
      ? `Hello ${customerName},\n\nThank you! We've received your repair requests:\n\n${deviceLines}\n\nWe'll contact you shortly to confirm details for each device.\n\nBest regards,\nYour Repair Team`
      : `Hello ${customerName},\n\nThank you for submitting your repair request (${results[0].requestNumber}).\n\nWe have received your device and will contact you shortly to confirm the diagnosis and timeline.\n\nBest regards,\nYour Repair Team`;

    let confirmation: "queued" | "sent" | "skipped" = "skipped";
    let outboxId: string | undefined;

    const enqueueResult = await enqueueWhatsAppMessage({
      to: shared.phone,
      body: whatsappMessage,
      type: "REPAIR_REQUEST_CONFIRMATION",
      repairRequestId: results[0].requestId,
      provider: "meta",
    }).catch((err) => {
      console.error("[RepairRequest] WhatsApp enqueue failed:", err);
      return null;
    });

    if (enqueueResult && "outboxId" in enqueueResult && enqueueResult.outboxId) {
      confirmation = "queued";
      outboxId = enqueueResult.outboxId;
      await deliverInline(enqueueResult.outboxId);
    } else if (enqueueResult && "sent" in enqueueResult && enqueueResult.sent) {
      confirmation = "sent";
    }

    // ── Email alert for staff ────────────────────────────────────────────────
    const alertTo = process.env.REPAIR_REQUEST_ALERT_EMAIL;
    if (alertTo) {
      const subject = isBatch
        ? `New Batch Repair Request — ${results.length} devices (${results.map((r) => r.requestNumber).join(", ")})`
        : `New Repair Request ${results[0].requestNumber}`;

      const deviceDetails = results
        .map((r) => `  ${r.requestNumber}: ${r.brand} ${r.deviceType.replace(/_/g, " ")}\n    Problem: ${r.problemDescription}`)
        .join("\n");

      const details = [
        `Name: ${shared.customerName}`,
        `Phone: ${shared.phone}`,
        `Email: ${shared.email || ""}`,
        `Handover: ${shared.handoverMethod}`,
        "",
        isBatch ? `Devices (${results.length}):` : "Device:",
        deviceDetails,
      ].join("\n");

      const emailResult = await enqueueEmailMessage({
        to: alertTo,
        subject,
        body: details,
        type: "REPAIR_REQUEST_EMAIL_ALERT",
        // For batch, omit repairRequestId so deliverEmail uses the plain-text body
        // which already lists all devices. Single device gets the rich HTML template.
        repairRequestId: isBatch ? undefined : results[0].requestId,
      }).catch((err) => {
        console.error("[RepairRequest] Email enqueue failed:", err);
        return null;
      });

      if (emailResult && "outboxId" in emailResult && emailResult.outboxId) {
        await deliverInline(emailResult.outboxId);
      }
    }

    // ── Response ─────────────────────────────────────────────────────────────
    const responseBase = {
      success: true,
      message: isBatch
        ? `Your ${results.length} repair requests have been submitted. We'll contact you shortly.`
        : "Your repair request has been submitted successfully. We'll contact you shortly.",
      confirmation,
      ...(outboxId ? { outbox_id: outboxId } : {}),
    };

    if (isBatch) {
      return NextResponse.json({
        ...responseBase,
        request_numbers: results.map((r) => r.requestNumber),
        devices: results.map((r) => ({ request_number: r.requestNumber, brand: r.brand, device_type: r.deviceType })),
      }, { headers: corsHeaders });
    }

    return NextResponse.json({
      ...responseBase,
      request_number: results[0].requestNumber,
    }, { headers: corsHeaders });

  } catch (error) {
    console.error("[RepairRequestAPI] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
