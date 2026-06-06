"use server";

import { revalidatePath } from "next/cache";

import { requireOrgSession } from "@/lib/org-context";
import { getWhatsAppConfigForOrg, sendWhatsAppTemplateMessage } from "@/lib/notifications/whatsapp";
import { getOrgWhatsAppConfig, saveOrgWhatsAppConfig, deleteOrgWhatsAppConfig } from "@/lib/org-whatsapp-config";
import { prisma } from "@/lib/prisma";
import { assertOrgCanMutate } from "@/lib/org-write";

export type SendTestResult =
  | { ok: true; messageId: string; to: string; from: string }
  | { ok: false; error: string };

export async function sendTestWhatsAppAction(
  _prev: SendTestResult | null,
  formData: FormData
): Promise<SendTestResult> {
  const { user, orgId, org } = await requireOrgSession();
  if (user.role !== "ADMIN") return { ok: false, error: "Forbidden" };
  assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

  const whatsappCfg = await getWhatsAppConfigForOrg(orgId);
  if (!whatsappCfg) return { ok: false, error: "WhatsApp is not configured for your organisation." };

  const to = (formData.get("to") as string | null)?.trim() ?? "";
  if (!to) return { ok: false, error: "Recipient number is required." };

  const result = await sendWhatsAppTemplateMessage(to, "hello_world", "en_US", [], whatsappCfg);

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
      orgId,
    },
    select: { id: true },
  });

  revalidatePath("/settings/notifications/whatsapp");

  if (!result.success) return { ok: false, error: result.error ?? "Send failed." };
  return { ok: true, messageId: result.messageId!, to, from: whatsappCfg.businessNumber };
}

export async function saveWhatsAppConfigAction(
  _prev: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const { user, orgId, org } = await requireOrgSession();
  if (user.role !== "ADMIN") return { ok: false, error: "Forbidden" };
  assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

  const businessNumber = (formData.get("businessNumber") as string | null)?.trim() ?? "";
  const phoneNumberId = (formData.get("phoneNumberId") as string | null)?.trim() ?? "";
  const accessTokenInput = (formData.get("accessToken") as string | null)?.trim() ?? "";
  const businessAccountId = (formData.get("businessAccountId") as string | null)?.trim() ?? "";

  if (!businessNumber || !phoneNumberId) {
    return { ok: false, error: "Business Number and Phone Number ID are required." };
  }

  // If access token was left blank (update case), keep existing
  let accessToken = accessTokenInput;
  if (!accessToken) {
    const existing = await getOrgWhatsAppConfig(orgId);
    if (!existing?.accessToken) return { ok: false, error: "Access Token is required." };
    accessToken = existing.accessToken;
  }

  try {
    const existing = await getOrgWhatsAppConfig(orgId);
    await saveOrgWhatsAppConfig(orgId, {
      businessNumber,
      phoneNumberId,
      accessToken,
      businessAccountId,
      provider: "meta",
      atApiKey: existing?.atApiKey ?? null,
      atUsername: existing?.atUsername ?? null,
      atSenderId: existing?.atSenderId ?? null,
      smsFallback: existing?.smsFallback ?? false,
    });
    revalidatePath("/settings/notifications/whatsapp");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }
}

export async function deleteWhatsAppConfigAction(): Promise<{ ok: boolean; error?: string }> {
  const { user, orgId, org } = await requireOrgSession();
  if (user.role !== "ADMIN") return { ok: false, error: "Forbidden" };
  assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

  try {
    await deleteOrgWhatsAppConfig(orgId);
    revalidatePath("/settings/notifications/whatsapp");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Delete failed" };
  }
}

export async function saveATConfigAction(
  _prev: { ok: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const { user, orgId } = await requireOrgSession();
  if (user.role !== "ADMIN") return { ok: false, error: "Forbidden" };

  const smsFallback = formData.get("smsFallback") === "on";
  const existing = await getOrgWhatsAppConfig(orgId);

  try {
    await saveOrgWhatsAppConfig(orgId, {
      businessNumber: existing?.businessNumber ?? "",
      phoneNumberId: existing?.phoneNumberId ?? "",
      accessToken: existing?.accessToken ?? "",
      businessAccountId: existing?.businessAccountId ?? "",
      provider: existing?.provider ?? "meta",
      atApiKey: existing?.atApiKey ?? null,
      atUsername: existing?.atUsername ?? null,
      atSenderId: existing?.atSenderId ?? null,
      smsFallback,
    });
    revalidatePath("/settings/notifications/whatsapp");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }
}
