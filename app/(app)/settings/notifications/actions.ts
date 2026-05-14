"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { requireOrgSession } from "@/lib/org-context";
import { updateUserPreferences } from "@/lib/notifications";
import { assertOrgCanMutate } from "@/lib/org-write";

const schema = z.object({
  whatsappEnabled: z.enum(["on"]).optional(),
  notifyStatusChange: z.enum(["on"]).optional(),
  notifyApprovalNeeded: z.enum(["on"]).optional(),
  notifyJobAssigned: z.enum(["on"]).optional(),
  notifyEstimateSubmitted: z.enum(["on"]).optional(),
  notifyPaymentReceived: z.enum(["on"]).optional(),
  notifyPayoutGenerated: z.enum(["on"]).optional(),
  notifyTimelineUpdated: z.enum(["on"]).optional(),
  notifyDelayNote: z.enum(["on"]).optional(),
});

export type UpdateNotificationPrefsState = {
  error?: string;
  success?: string;
};

function asBool(value: "on" | undefined) {
  return value === "on";
}

export async function updateNotificationPrefsAction(
  _prev: UpdateNotificationPrefsState,
  formData: FormData,
): Promise<UpdateNotificationPrefsState> {
  const { session, user, org } = await requireOrgSession();
  assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid preferences" };
  }

  try {
    await updateUserPreferences(session.user.id, {
      whatsappEnabled: asBool(parsed.data.whatsappEnabled),
      notifyStatusChange: asBool(parsed.data.notifyStatusChange),
      notifyApprovalNeeded: asBool(parsed.data.notifyApprovalNeeded),
      notifyJobAssigned: asBool(parsed.data.notifyJobAssigned),
      notifyEstimateSubmitted: asBool(parsed.data.notifyEstimateSubmitted),
      notifyPaymentReceived: asBool(parsed.data.notifyPaymentReceived),
      notifyPayoutGenerated: asBool(parsed.data.notifyPayoutGenerated),
      notifyTimelineUpdated: asBool(parsed.data.notifyTimelineUpdated),
      notifyDelayNote: asBool(parsed.data.notifyDelayNote),
    });
  } catch {
    return { error: "Could not save notification preferences" };
  }

  revalidatePath("/settings/notifications");
  revalidatePath("/dashboard");

  return { success: "Notification preferences saved" };
}
