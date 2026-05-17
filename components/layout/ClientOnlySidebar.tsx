"use client";

import dynamic from "next/dynamic";
import type { Role } from "@prisma/client";

type SidebarProps = {
  role: Role;
  permissions?: string[];
  isPlatformAdmin?: boolean;
  badges?: {
    jobs?: number;
    receivedJobs?: number;
    inventory?: number;
    paymentFollowups?: number;
    pendingRequests?: number;
    complaints?: number;
  };
};

const AppSidebar = dynamic(
  () => import("@/components/layout/AppSidebar").then((mod) => mod.AppSidebar),
  {
    ssr: false,
    loading: () => (
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:flex-col bg-[var(--sidebar-bg)] border-r border-[var(--line)]" />
    ),
  },
);

export function ClientOnlySidebar(props: SidebarProps) {
  return <AppSidebar {...props} />;
}
