import { checkSmsQuota, incrementSmsUsage } from "@/lib/notifications/sms-quota";
import { getPlatformSettings } from "@/lib/platform-settings";

export interface AtSmsConfig {
  apiKey: string;
  username: string;
  senderId?: string;
}

export async function resolveAtConfig(
  orgCfg?: { atApiKey?: string | null; atUsername?: string | null; atSenderId?: string | null } | null,
): Promise<AtSmsConfig | null> {
  // 1) Org-level override (optional)
  if (orgCfg?.atApiKey && orgCfg?.atUsername) {
    return {
      apiKey: orgCfg.atApiKey,
      username: orgCfg.atUsername,
      senderId: orgCfg.atSenderId ?? undefined,
    };
  }

  // 2) Platform settings (DB) override
  const stored = await getPlatformSettings(["AT_API_KEY", "AT_USERNAME", "AT_SENDER_ID"]);
  const dbApiKey = stored.AT_API_KEY?.trim();
  const dbUsername = stored.AT_USERNAME?.trim();
  if (dbApiKey && dbUsername) {
    const dbSenderId = stored.AT_SENDER_ID?.trim();
    return {
      apiKey: dbApiKey,
      username: dbUsername,
      senderId: dbSenderId ? dbSenderId : undefined,
    };
  }

  // 3) Environment variables fallback
  const apiKey = process.env.AT_API_KEY;
  const username = process.env.AT_USERNAME;
  if (!apiKey || !username) return null;
  return { apiKey, username, senderId: process.env.AT_SENDER_ID };
}

export function smsIsConfigured(
  orgCfg?: { atApiKey?: string | null; atUsername?: string | null } | null,
): boolean {
  // Fast sync check for org-level override only.
  return Boolean(orgCfg?.atApiKey && orgCfg?.atUsername);
}

export async function sendSms(
  phone: string,
  message: string,
  cfg?: AtSmsConfig | null,
  orgId?: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // Quota check
  if (orgId) {
    const quota = await checkSmsQuota(orgId);
    if (!quota.allowed) {
      console.warn(`[SMS] Quota exceeded for org ${orgId}: ${quota.used}/${quota.limit}`);
      return { success: false, error: `SMS quota exceeded (${quota.used}/${quota.limit} used this month)` };
    }
  }

  const config = cfg ?? (await resolveAtConfig());
  if (!config) return { success: false, error: "SMS not configured" };

  const to = normalizePhone(phone);
  const params = new URLSearchParams({ username: config.username, to, message });
  if (config.senderId) params.set("from", config.senderId);

  try {
    const res = await fetch("https://api.africastalking.com/version1/messaging", {
      method: "POST",
      headers: {
        apiKey: config.apiKey,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `AT SMS error: ${res.status} ${text.slice(0, 200)}` };
    }

    const data = await res.json();
    const recipient = data?.SMSMessageData?.Recipients?.[0];
    if (recipient?.statusCode === 101) {
      if (orgId) void incrementSmsUsage(orgId);
      return { success: true, messageId: String(recipient.messageId) };
    }
    return { success: false, error: recipient?.status ?? "Unknown SMS error" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function smsHealthCheck(
  cfg?: AtSmsConfig | null,
): Promise<{ ok: boolean; error?: string }> {
  const config = cfg ?? (await resolveAtConfig());
  if (!config) return { ok: false, error: "SMS not configured" };

  try {
    const res = await fetch(
      `https://api.africastalking.com/version1/user?username=${encodeURIComponent(config.username)}`,
      {
        headers: { apiKey: config.apiKey, Accept: "application/json" },
      },
    );
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `AT API error: ${res.status} ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function normalizePhone(input: string): string {
  const digits = input.replace(/\D+/g, "");
  if (digits.startsWith("256")) return `+${digits}`;
  if (digits.length === 10 && digits.startsWith("0")) return `+256${digits.slice(1)}`;
  return `+${digits}`;
}
