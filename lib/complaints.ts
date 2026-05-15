import { prisma } from "@/lib/prisma";

export async function generateComplaintNumber(orgId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.complaint.count({ where: { orgId } });
  return `CMP-${year}-${String(count + 1).padStart(4, "0")}`;
}

export const COMPLAINT_CATEGORY_LABELS: Record<string, string> = {
  SERVICE_QUALITY: "Service Quality",
  REPAIR_DELAY: "Repair Delay",
  BILLING: "Billing Issue",
  STAFF_CONDUCT: "Staff Conduct",
  DAMAGE_CAUSED: "Damage Caused",
  UNRESOLVED_FAULT: "Unresolved Fault",
  OTHER: "Other",
};

export const COMPLAINT_STATUS_LABELS: Record<string, string> = {
  RECEIVED: "Received",
  ACKNOWLEDGED: "Acknowledged",
  INVESTIGATING: "Investigating",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export const COMPLAINT_STATUS_STYLES: Record<string, string> = {
  RECEIVED: "border-amber-200 bg-amber-50 text-amber-700",
  ACKNOWLEDGED: "border-sky-200 bg-sky-50 text-sky-700",
  INVESTIGATING: "border-violet-200 bg-violet-50 text-violet-700",
  RESOLVED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  CLOSED: "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",
};

export const SLA_HOURS = {
  acknowledgement: 24,
  resolution: 72,
};
