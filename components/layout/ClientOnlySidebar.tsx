"use client";

import { AppSidebar } from "@/components/layout/AppSidebar";
import type { Role } from "@prisma/client";

type SidebarProps = {
  role: Role;
  permissions?: string[];
  isPlatformAdmin?: boolean;
  enabledModules?: Set<string>;
  orgName?: string | null;
  badges?: Record<string, number | undefined>;
};

export function ClientOnlySidebar({ role, permissions, isPlatformAdmin, orgName }: SidebarProps) {
  return <AppSidebar role={role} permissions={permissions} isPlatformAdmin={isPlatformAdmin} orgName={orgName} />;
}
