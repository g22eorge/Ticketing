import { prisma } from "@/lib/prisma";
import { getPlatformSetting } from "@/lib/platform-settings";

export const AUDIT_RETENTION_SETTING_KEY = "AUDIT_RETENTION_DAYS";
export const DEFAULT_AUDIT_RETENTION_DAYS = 365;
export const MIN_AUDIT_RETENTION_DAYS = 30;
export const MAX_AUDIT_RETENTION_DAYS = 3650;

export function normalizeAuditRetentionDays(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_AUDIT_RETENTION_DAYS;
  return Math.max(MIN_AUDIT_RETENTION_DAYS, Math.min(MAX_AUDIT_RETENTION_DAYS, Math.floor(parsed)));
}

export async function getAuditRetentionDays() {
  const stored = await getPlatformSetting(AUDIT_RETENTION_SETTING_KEY);
  return normalizeAuditRetentionDays(stored);
}

export async function pruneSystemAuditEvents(days: number) {
  const safeDays = normalizeAuditRetentionDays(days);
  const cutoff = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
  const result = await prisma.systemAuditEvent.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return { deleted: result.count, cutoff, days: safeDays };
}
