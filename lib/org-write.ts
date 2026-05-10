import { canRecordPaymentsWhenSuspended, suspensionMessage, type OrgAccess } from "@/lib/billing-access";

export function assertOrgCanMutate(params: {
  access: OrgAccess;
  userRole: string;
  kind: "GENERAL" | "PAYMENT";
}) {
  if (!params.access.isSuspended) return;
  if (params.kind === "PAYMENT" && canRecordPaymentsWhenSuspended(params.userRole)) return;
  const msg = suspensionMessage(params.access) ?? "Workspace is read-only.";
  throw new Error(msg);
}
