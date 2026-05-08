"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUserRole } from "@/lib/session";
import { setPlatformSetting, deletePlatformSetting } from "@/lib/platform-settings";

async function requirePlatformAdmin() {
  const { user } = await getCurrentUserRole();
  const platformEmail = process.env.PLATFORM_ADMIN_EMAIL;
  if (!platformEmail || user!.email !== platformEmail) redirect("/dashboard");
  return user!;
}

export async function saveFlutterwaveSettingsAction(
  _prev: { ok: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requirePlatformAdmin();

  const secretKey = (formData.get("FLW_SECRET_KEY") as string | null)?.trim() ?? "";
  const publicKey = (formData.get("FLW_PUBLIC_KEY") as string | null)?.trim() ?? "";
  const webhookSecret = (formData.get("FLW_WEBHOOK_SECRET") as string | null)?.trim() ?? "";

  try {
    if (secretKey) {
      await setPlatformSetting("FLW_SECRET_KEY", secretKey);
    }
    if (publicKey) {
      await setPlatformSetting("FLW_PUBLIC_KEY", publicKey);
    }
    if (webhookSecret) {
      await setPlatformSetting("FLW_WEBHOOK_SECRET", webhookSecret);
    }
    revalidatePath("/platform/settings");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }
}

export async function clearFlutterwaveKeyAction(
  _prev: { ok: boolean } | null,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requirePlatformAdmin();
  const key = formData.get("key") as string | null;
  if (!key || !["FLW_SECRET_KEY", "FLW_PUBLIC_KEY", "FLW_WEBHOOK_SECRET"].includes(key)) {
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
