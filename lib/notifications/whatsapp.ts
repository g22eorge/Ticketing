import { renderCommunicationTemplate } from "@/lib/notifications/templates";
import { getOrgWhatsAppConfig } from "@/lib/org-whatsapp-config";

async function sendRenderedWhatsApp(
  phone: string,
  rendered: { body: string; metaTemplateName: string | null; metaLanguageCode: string; metaParamValues: string[] },
  cfg?: WhatsAppConfig
): Promise<{ success: boolean; messageId?: string; error?: string; errorCode?: string }> {
  if (rendered.metaTemplateName) {
    return sendWhatsAppTemplateMessage(phone, rendered.metaTemplateName, rendered.metaLanguageCode, rendered.metaParamValues, cfg);
  }
  return sendWhatsAppMessageInternal({ to: phone, message: rendered.body, cfg });
}

interface WhatsAppConfig {
  businessNumber: string;
  provider: string;
  accessToken: string;
  phoneNumberId: string;
  businessAccountId?: string;
}

function getConfig(): WhatsAppConfig | null {
  const businessNumber = process.env.WHATSAPP_BUSINESS_NUMBER;
  const provider = process.env.WHATSAPP_PROVIDER;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

  if (!businessNumber || !accessToken || !phoneNumberId) {
    console.warn("[WhatsApp] Missing configuration - notifications disabled");
    return null;
  }

  return {
    businessNumber,
    provider: provider || "meta",
    accessToken,
    phoneNumberId,
    businessAccountId: businessAccountId || undefined,
  };
}

export function whatsappConfigSummary() {
  const cfg = getConfig();
  return {
    configured: Boolean(cfg),
    provider: cfg?.provider ?? null,
    businessNumber: cfg?.businessNumber ?? null,
    phoneNumberId: cfg?.phoneNumberId ?? null,
    businessAccountId: cfg?.businessAccountId ?? null,
  };
}

export function whatsappIsConfigured() {
  return Boolean(getConfig());
}

async function getConfigForOrg(orgId?: string): Promise<WhatsAppConfig | null> {
  if (orgId) {
    const orgCfg = await getOrgWhatsAppConfig(orgId);
    if (orgCfg) {
      return {
        businessNumber: orgCfg.businessNumber,
        provider: orgCfg.provider || "meta",
        accessToken: orgCfg.accessToken,
        phoneNumberId: orgCfg.phoneNumberId,
        businessAccountId: orgCfg.businessAccountId || undefined,
      };
    }
  }
  return getConfig();
}

async function healthCheckWithConfig(config: WhatsAppConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${config.phoneNumberId}?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating`,
      { headers: { Authorization: `Bearer ${config.accessToken}` } },
    );
    if (!response.ok) {
      const body = await response.text();
      return { ok: false, error: `WhatsApp health failed: ${response.status} ${body.slice(0, 200)}` };
    }
    const data = await response.json().catch(() => null);
    return {
      ok: true,
      display_phone_number: data?.display_phone_number,
      verified_name: data?.verified_name,
      code_verification_status: data?.code_verification_status,
      quality_rating: data?.quality_rating,
    } as unknown as { ok: boolean };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function whatsappHealthCheckForOrg(orgId: string): Promise<{ ok: boolean; error?: string }> {
  const config = await getConfigForOrg(orgId);
  if (!config) return { ok: false, error: "WhatsApp not configured" };
  return healthCheckWithConfig(config);
}

export async function whatsappHealthCheck(): Promise<{ ok: boolean; error?: string }> {
  const config = getConfig();
  if (!config) return { ok: false, error: "WhatsApp not configured" };
  return healthCheckWithConfig(config);
}

export async function sendRepairRequestConfirmation(
  phone?: string,
  customerName?: string,
  requestNumber?: string,
  orgId?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!phone || !customerName || !requestNumber) {
    return { success: false, error: "Missing required parameters" };
  }
  const cfg = await getConfigForOrg(orgId);
  if (!cfg) return { success: false, error: "WhatsApp not configured" };

  const fallback = `Hello ${customerName},\n\nThank you for submitting your repair request (${requestNumber}).\n\nWe have received your device and will contact you shortly.\n\nBest regards,\nYour Repair Team`;
  const rendered = await renderCommunicationTemplate({
    key: "REPAIR_REQUEST_CONFIRMATION",
    channel: "WHATSAPP",
    variables: { customerName, requestNumber },
    fallback: { body: fallback },
  });
  return sendRenderedWhatsApp(phone, rendered, cfg);
}

export async function sendIntakeApprovalNotification(
  phone: string,
  customerName: string,
  requestNumber: string,
  preferredDropoffDate?: string | null,
  orgId?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const cfg = await getConfigForOrg(orgId);
  if (!cfg) return { success: false, error: "WhatsApp not configured" };

  const preferredDropoffDateLine = preferredDropoffDate ? `Preferred drop-off date: ${preferredDropoffDate}` : "";
  const fallback = `Hello ${customerName},\n\nYour repair request (${requestNumber}) has been APPROVED.\n\nPlease bring your device to our shop at your convenience.\n\nBest regards,\nYour Repair Team`;
  const rendered = await renderCommunicationTemplate({
    key: "FRONT_DESK_APPROVED",
    channel: "WHATSAPP",
    variables: { customerName, requestNumber, preferredDropoffDateLine },
    fallback: { body: fallback },
  });
  return sendRenderedWhatsApp(phone, rendered, cfg);
}

export async function sendIntakeRejectionNotification(
  phone: string,
  customerName: string,
  requestNumber: string,
  orgId?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const cfg = await getConfigForOrg(orgId);
  if (!cfg) return { success: false, error: "WhatsApp not configured" };

  const fallback = `Hello ${customerName},\n\nUnfortunately, we are unable to process your repair request (${requestNumber}) at this time.\n\nPlease contact us for more information.\n\nBest regards,\nYour Repair Team`;
  const rendered = await renderCommunicationTemplate({
    key: "FRONT_DESK_REJECTED",
    channel: "WHATSAPP",
    variables: { customerName, requestNumber },
    fallback: { body: fallback },
  });
  return sendRenderedWhatsApp(phone, rendered, cfg);
}

export async function sendJobCreatedNotification(
  phone: string,
  customerName: string,
  jobNumber: string,
  orgId?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const cfg = await getConfigForOrg(orgId);
  if (!cfg) return { success: false, error: "WhatsApp not configured" };

  const fallback = `Hello ${customerName},\n\nYour device has been registered as Job #${jobNumber}.\n\nWe will update you as the repair progresses.\n\nBest regards,\nYour Repair Team`;
  const rendered = await renderCommunicationTemplate({
    key: "JOB_CREATED",
    channel: "WHATSAPP",
    variables: { customerName, jobNumber },
    fallback: { body: fallback },
  });
  return sendRenderedWhatsApp(phone, rendered, cfg);
}

export async function sendJobCompletionNotification(
  phone: string,
  customerName: string,
  jobNumber: string,
  orgId?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const cfg = await getConfigForOrg(orgId);
  if (!cfg) return { success: false, error: "WhatsApp not configured" };

  const fallback = `Hello ${customerName},\n\nGreat news! Your device (Job #${jobNumber}) is ready for pickup.\n\nPlease visit our shop to collect your device.\n\nBest regards,\nYour Repair Team`;
  const rendered = await renderCommunicationTemplate({
    key: "JOB_COMPLETED",
    channel: "WHATSAPP",
    variables: { customerName, jobNumber },
    fallback: { body: fallback },
  });
  return sendRenderedWhatsApp(phone, rendered, cfg);
}

export async function sendCustomWhatsAppMessage(
  to: string,
  message: string,
  cfg?: WhatsAppConfig
): Promise<{ success: boolean; messageId?: string; error?: string; errorCode?: string }> {
  return sendWhatsAppMessageInternal({ to, message, cfg });
}

/**
 * Send a Meta-approved template message (business-initiated conversation).
 * `variables` must be in the same positional order as {{1}}, {{2}}… in the approved template body.
 */
export async function sendWhatsAppTemplateMessage(
  to: string,
  templateName: string,
  languageCode: string,
  variables: string[],
  cfg?: WhatsAppConfig
): Promise<{ success: boolean; messageId?: string; error?: string; errorCode?: string }> {
  const config = cfg ?? getConfig();
  if (!config) return { success: false, error: "WhatsApp not configured" };

  const normalizedPhone = normalizeWhatsAppRecipient(to);

  const components =
    variables.length > 0
      ? [
          {
            type: "body",
            parameters: variables.map((v) => ({ type: "text", text: v })),
          },
        ]
      : [];

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: normalizedPhone,
          type: "template",
          template: {
            name: templateName,
            language: { code: languageCode },
            ...(components.length > 0 ? { components } : {}),
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      let metaCode: string | undefined;
      try {
        const parsed = JSON.parse(errorText);
        const code = parsed?.error?.code;
        if (typeof code === "number" || typeof code === "string") metaCode = String(code);
      } catch {
        // ignore
      }
      return {
        success: false,
        errorCode: metaCode,
        error: `WhatsApp template API error: ${response.status} ${errorText.slice(0, 200)}`,
      };
    }

    const data = await response.json();
    const messageId = data.messages?.[0]?.id;
    if (messageId) {
      console.log("[WhatsApp] Template message sent:", templateName, messageId);
      return { success: true, messageId };
    }
    return { success: false, error: "No message ID returned" };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg };
  }
}

async function sendWhatsAppMessageInternal({
  to,
  message,
  cfg,
}: {
  to?: string;
  message?: string;
  cfg?: WhatsAppConfig;
}): Promise<{ success: boolean; messageId?: string; error?: string; errorCode?: string }> {
  if (!to || !message) {
    return { success: false, error: "Missing to or message" };
  }
  const config = cfg ?? getConfig();
  if (!config) {
    return { success: false, error: "WhatsApp not configured" };
  }

  try {
    // WhatsApp Cloud API expects international digits only (no leading "+", no spaces).
    const normalizedPhone = normalizeWhatsAppRecipient(to);
    
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: normalizedPhone,
          type: "text",
          text: { body: message },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[WhatsApp] API error:", response.status, errorText);

      // Best-effort parse Meta error payload
      let metaCode: string | undefined;
      try {
        const parsed = JSON.parse(errorText);
        const code = parsed?.error?.code;
        if (typeof code === "number" || typeof code === "string") metaCode = String(code);
      } catch {
        // ignore
      }

      return {
        success: false,
        errorCode: metaCode,
        error: `WhatsApp API error: ${response.status} ${errorText.slice(0, 200)}`,
      };
    }

    const data = await response.json();
    const messageId = data.messages?.[0]?.id;

    if (messageId) {
      console.log("[WhatsApp] Message sent:", messageId);
      return { success: true, messageId };
    }

    return { success: false, error: "No message ID returned" };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[WhatsApp] Send error:", errorMessage);
    return { success: false, error: errorMessage };
  }
}

function normalizeWhatsAppRecipient(input: string): string {
  const digits = input.replace(/\D+/g, "");

  // Uganda convenience: allow 0xxxxxxxxx or +256xxxxxxxxx inputs.
  if (digits.startsWith("256")) return digits;
  if (digits.length === 10 && digits.startsWith("0")) return `256${digits.slice(1)}`;

  return digits;
}

export async function uploadWhatsAppMedia(
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
  cfg?: WhatsAppConfig,
): Promise<{ ok: true; mediaId: string } | { ok: false; error: string }> {
  const config = cfg ?? getConfig();
  if (!config) return { ok: false, error: "WhatsApp not configured" };

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  form.append(
    "file",
    new Blob([new Uint8Array(fileBuffer)], { type: mimeType }),
    filename,
  );

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${config.phoneNumberId}/media`,
      { method: "POST", headers: { Authorization: `Bearer ${config.accessToken}` }, body: form },
    );
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Media upload failed: ${res.status} ${text.slice(0, 200)}` };
    }
    const data = await res.json();
    if (!data.id) return { ok: false, error: "No media ID returned" };
    return { ok: true, mediaId: String(data.id) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendWhatsAppDocument(
  to: string,
  mediaId: string,
  filename: string,
  caption?: string,
  cfg?: WhatsAppConfig,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const config = cfg ?? getConfig();
  if (!config) return { success: false, error: "WhatsApp not configured" };

  const normalizedPhone = normalizeWhatsAppRecipient(to);

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: normalizedPhone,
          type: "document",
          document: {
            id: mediaId,
            filename,
            ...(caption ? { caption } : {}),
          },
        }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `Document send failed: ${res.status} ${text.slice(0, 200)}` };
    }
    const data = await res.json();
    const messageId = data.messages?.[0]?.id;
    return messageId ? { success: true, messageId } : { success: false, error: "No message ID returned" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
