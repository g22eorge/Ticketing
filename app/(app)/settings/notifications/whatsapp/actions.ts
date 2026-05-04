"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserRole } from "@/lib/session";
import { sendWhatsAppTemplateMessage, whatsappIsConfigured } from "@/lib/notifications/whatsapp";
import { prisma } from "@/lib/prisma";

export type SendTestResult =
  | { ok: true; messageId: string; to: string; from: string }
  | { ok: false; error: string };

export async function sendTestWhatsAppAction(
  _prev: SendTestResult | null,
  formData: FormData
): Promise<SendTestResult> {
  const { user } = await getCurrentUserRole();
  if (user.role !== "ADMIN") return { ok: false, error: "Forbidden" };

  if (!whatsappIsConfigured()) return { ok: false, error: "WhatsApp is not configured on this server." };

  const to = (formData.get("to") as string | null)?.trim() ?? "";

  if (!to) return { ok: false, error: "Recipient number is required." };

  const from = process.env.WHATSAPP_BUSINESS_NUMBER ?? "Unknown";

  // Use the approved hello_world template — free-form text is silently dropped
  // by Meta for business-initiated conversations outside the 24-hour window.
  const result = await sendWhatsAppTemplateMessage(to, "hello_world", "en_US", []);

  await prisma.outboundMessage.create({
    data: {
      channel: "WHATSAPP",
      status: result.success ? "SENT" : "FAILED",
      type: "ADMIN_TEST",
      to,
      body: "hello_world template",
      provider: "meta",
      providerMessageId: result.messageId ?? null,
      sentAt: result.success ? new Date() : null,
      attemptCount: 1,
      lastAttemptAt: new Date(),
      nextAttemptAt: new Date(0),
      lastErrorCode: result.success ? null : result.errorCode ? `API_ERROR_${result.errorCode}` : "WHATSAPP_ERROR",
      lastError: result.success ? null : (result.error ?? "Unknown error"),
    },
    select: { id: true },
  });

  revalidatePath("/settings/notifications/whatsapp");

  if (!result.success) return { ok: false, error: result.error ?? "Send failed." };
  return { ok: true, messageId: result.messageId!, to, from };
}
