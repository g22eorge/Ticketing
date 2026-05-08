export interface AtSmsConfig {
  apiKey: string;
  username: string;
  senderId?: string;
}

export function getAtConfig(
  orgCfg?: { atApiKey?: string | null; atUsername?: string | null; atSenderId?: string | null } | null,
): AtSmsConfig | null {
  if (orgCfg?.atApiKey && orgCfg?.atUsername) {
    return {
      apiKey: orgCfg.atApiKey,
      username: orgCfg.atUsername,
      senderId: orgCfg.atSenderId ?? undefined,
    };
  }
  const apiKey = process.env.AT_API_KEY;
  const username = process.env.AT_USERNAME;
  if (!apiKey || !username) return null;
  return { apiKey, username, senderId: process.env.AT_SENDER_ID };
}

export function smsIsConfigured(
  orgCfg?: { atApiKey?: string | null; atUsername?: string | null } | null,
): boolean {
  return Boolean(getAtConfig(orgCfg));
}

export async function sendSms(
  phone: string,
  message: string,
  cfg?: AtSmsConfig | null,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const config = cfg ?? getAtConfig();
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
  const config = cfg ?? getAtConfig();
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
