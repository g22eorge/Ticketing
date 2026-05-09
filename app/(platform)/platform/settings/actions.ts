"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUserRole } from "@/lib/session";
import { setPlatformSetting, deletePlatformSetting } from "@/lib/platform-settings";
import { registerIpn, getRegisteredIpns } from "@/lib/pesapal";

async function requirePlatformAdmin() {
  const { user } = await getCurrentUserRole();
  const platformEmail = process.env.PLATFORM_ADMIN_EMAIL;
  if (!platformEmail || user!.email !== platformEmail) redirect("/dashboard");
  return user!;
}

export async function savePesapalSettingsAction(
  _prev: { ok: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requirePlatformAdmin();

  const consumerKey = (formData.get("PESAPAL_CONSUMER_KEY") as string | null)?.trim() ?? "";
  const consumerSecret = (formData.get("PESAPAL_CONSUMER_SECRET") as string | null)?.trim() ?? "";

  try {
    if (consumerKey) await setPlatformSetting("PESAPAL_CONSUMER_KEY", consumerKey);
    if (consumerSecret) await setPlatformSetting("PESAPAL_CONSUMER_SECRET", consumerSecret);
    revalidatePath("/platform/settings");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }
}

export async function clearPlatformKeyAction(
  _prev: { ok: boolean } | null,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requirePlatformAdmin();
  const key = formData.get("key") as string | null;
  const allowed = [
    "PESAPAL_CONSUMER_KEY",
    "PESAPAL_CONSUMER_SECRET",
    "PESAPAL_IPN_ID",
    "AT_API_KEY",
    "AT_USERNAME",
    "AT_SENDER_ID",
  ];
  if (!key || !allowed.includes(key)) {
    return { ok: false, error: "Invalid key" };
  }
  try {
    await deletePlatformSetting(key);
    revalidatePath("/platform/settings");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Delete failed" };
  }
}

// Backwards compatible export name
export const clearPesapalKeyAction = clearPlatformKeyAction;

export async function saveAtSettingsAction(
  _prev: { ok: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requirePlatformAdmin();

  const apiKey = (formData.get("AT_API_KEY") as string | null)?.trim() ?? "";
  const username = (formData.get("AT_USERNAME") as string | null)?.trim() ?? "";
  const senderId = (formData.get("AT_SENDER_ID") as string | null)?.trim() ?? "";

  try {
    if (apiKey) await setPlatformSetting("AT_API_KEY", apiKey);
    if (username) await setPlatformSetting("AT_USERNAME", username);
    if (senderId) await setPlatformSetting("AT_SENDER_ID", senderId);
    revalidatePath("/platform/settings");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }
}

export async function registerIpnAction(
  _prev: { ok: boolean; ipnId?: string; error?: string } | null,
  _formData: FormData,
): Promise<{ ok: boolean; ipnId?: string; error?: string }> {
  await requirePlatformAdmin();
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const ipnUrl = `${baseUrl}/api/webhooks/pesapal`;

    // Check if already registered
    const existing = await getRegisteredIpns().catch(() => []);
    const found = existing.find((i) => i.url === ipnUrl && i.status === "Active");
    if (found) {
      await setPlatformSetting("PESAPAL_IPN_ID", found.ipn_id);
      revalidatePath("/platform/settings");
      return { ok: true, ipnId: found.ipn_id };
    }

    const ipnId = await registerIpn(ipnUrl);
    await setPlatformSetting("PESAPAL_IPN_ID", ipnId);
    revalidatePath("/platform/settings");
    return { ok: true, ipnId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "IPN registration failed" };
  }
}
