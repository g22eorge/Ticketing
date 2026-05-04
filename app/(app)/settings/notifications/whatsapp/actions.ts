"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserRole } from "@/lib/session";
import { sendCustomWhatsAppMessage, whatsappIsConfigured } from "@/lib/notifications/whatsapp";
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
  const message = (formData.get("message") as string | null)?.trim() ?? "";

  if (!to) return { ok: false, error: "Recipient number is required." };
  if (!message) return { ok: false, error: "Message body is required." };
  if (message.length > 1500) return { ok: false, error: "Message must be under 1500 characters." };

  const from = process.env.WHATSAPP_BUSINESS_NUMBER ?? "Unknown";

  const result = await sendCustomWhatsAppMessage(to, message);

  await prisma.outboundMessage.create({
    data: {
      channel: "WHATSAPP",
      status: result.success ? "SENT" : "FAILED",
      type: "ADMIN_TEST",
      to,
      body: message,
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
