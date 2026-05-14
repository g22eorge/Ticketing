import type { ReactNode } from "react";

import { SettingsShell, type SettingsNavGroup } from "@/components/settings/SettingsShell";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const { user, orgId } = await requireOrgSession();

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true, updatedAt: true },
  }).catch(() => null);

  const lastEditedAt = (org?.updatedAt ?? new Date()).toLocaleString();

  const permUser = { role: user.role, permissions: user.permissions };

  const groups: SettingsNavGroup[] = [
    {
      title: "Personal",
      items: [
        {
          href: "/settings/profile",
          label: "Profile",
          description: "Your account details",
          icon: (
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
              <path fillRule="evenodd" d="M10 2.75a4.25 4.25 0 1 0 0 8.5 4.25 4.25 0 0 0 0-8.5ZM4.5 16.25A5.5 5.5 0 0 1 10 11.5h0a5.5 5.5 0 0 1 5.5 4.75.75.75 0 0 1-.743.875H5.243a.75.75 0 0 1-.743-.875Z" clipRule="evenodd" />
            </svg>
          ),
        },
        can.viewNotifications(permUser)
          ? {
              href: "/settings/notifications",
              label: "Notifications",
              description: "Alerts and personal preferences",
              icon: (
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path d="M9.5 2.5a.5.5 0 0 1 1 0v.25a6.5 6.5 0 0 1 5.5 6.428v2.656c0 .555.22 1.086.612 1.478l.284.284a.75.75 0 0 1-.53 1.28H3.634a.75.75 0 0 1-.53-1.28l.284-.284A2.09 2.09 0 0 0 4 11.834V9.178A6.5 6.5 0 0 1 9.5 2.75V2.5Z" />
                  <path d="M7.25 15.5a2.75 2.75 0 0 0 5.5 0h-5.5Z" />
                </svg>
              ),
            }
          : null,
      ].filter(Boolean) as SettingsNavGroup["items"],
    },
    {
      title: "Workspace",
      items: [
        user.role === "ADMIN"
          ? {
              href: "/settings/billing",
              label: "Billing",
              description: "Plan, renewal, and invoices",
              icon: (
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM9.25 5.5a.75.75 0 0 1 1.5 0v.34c.8.1 1.52.43 2.05.92a.75.75 0 0 1-1.02 1.1 2.27 2.27 0 0 0-1.03-.55V9.5c.65.18 1.26.5 1.76.92.6.5.96 1.15.96 1.83s-.36 1.33-.96 1.83c-.5.42-1.11.74-1.76.92v.4a.75.75 0 0 1-1.5 0v-.35a4.66 4.66 0 0 1-2.26-1.07.75.75 0 1 1 .95-1.16c.38.31.83.52 1.31.62V11a3.9 3.9 0 0 1-1.46-.74c-.52-.43-.84-1.02-.84-1.66s.32-1.23.84-1.66c.41-.34.93-.58 1.46-.71V5.5Z" clipRule="evenodd" />
                </svg>
              ),
            }
          : null,
        user.role === "ADMIN"
          ? {
              href: "/settings/users",
              label: "Users",
              description: "Roles and access",
              icon: (
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path d="M11 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  <path d="M2.046 15.253c-.18.01-.34-.092-.382-.266a6.5 6.5 0 0 1 11.672 0c-.042.174-.202.276-.382.266a34.816 34.816 0 0 0-10.908 0Z" />
                  <path d="M16.75 9.5a.75.75 0 0 0-1.5 0v1.25H14a.75.75 0 0 0 0 1.5h1.25V13.5a.75.75 0 0 0 1.5 0v-1.25H18a.75.75 0 0 0 0-1.5h-1.25V9.5Z" />
                </svg>
              ),
            }
          : null,
        user.role === "ADMIN"
          ? {
              href: "/settings/groups",
              label: "Groups",
              description: "Groups and permissions",
              icon: (
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 2.75a7.25 7.25 0 0 0-6.65 4.36.75.75 0 1 0 1.38.59A5.75 5.75 0 0 1 15.5 10a.75.75 0 0 0 1.5 0A7.25 7.25 0 0 0 10 2.75Zm-6.5 9a.75.75 0 0 0-1.5 0A7.25 7.25 0 0 0 10 19.25a7.25 7.25 0 0 0 6.65-4.36.75.75 0 0 0-1.38-.59A5.75 5.75 0 0 1 4.5 11.75Z" clipRule="evenodd" />
                  <path d="M6 9.25a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5h-5A.75.75 0 0 1 6 9.25Zm2 3a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 0 1.5h-3a.75.75 0 0 1-.75-.75Z" />
                </svg>
              ),
            }
          : null,
        user.role === "ADMIN"
          ? {
              href: "/settings/branches",
              label: "Branches",
              description: "Branches and locations",
              icon: (
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path d="M15.5 2A1.5 1.5 0 0 0 14 3.5v13a1.5 1.5 0 0 0 3 0v-13A1.5 1.5 0 0 0 15.5 2ZM9.5 6A1.5 1.5 0 0 0 8 7.5v9a1.5 1.5 0 0 0 3 0v-9A1.5 1.5 0 0 0 9.5 6ZM3.5 10A1.5 1.5 0 0 0 2 11.5v5a1.5 1.5 0 0 0 3 0v-5A1.5 1.5 0 0 0 3.5 10Z" />
                </svg>
              ),
            }
          : null,
        user.role === "ADMIN"
          ? {
              href: "/settings/branding",
              label: "Branding",
              description: "Company + documents",
              icon: (
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 2c-3.866 0-7 1.343-7 3v10c0 1.657 3.134 3 7 3s7-1.343 7-3V5c0-1.657-3.134-3-7-3Zm0 1.5c3.314 0 5.5 1.074 5.5 1.5S13.314 6.5 10 6.5 4.5 5.426 4.5 5 6.686 3.5 10 3.5Zm5.5 4.05c-1.2.76-3.22 1.2-5.5 1.2s-4.3-.44-5.5-1.2V10c0 .426 2.186 1.5 5.5 1.5s5.5-1.074 5.5-1.5V7.55Zm0 4c-1.2.76-3.22 1.2-5.5 1.2s-4.3-.44-5.5-1.2V14c0 .426 2.186 1.5 5.5 1.5s5.5-1.074 5.5-1.5v-2.45Z" clipRule="evenodd" />
                </svg>
              ),
            }
          : null,
      ].filter(Boolean) as SettingsNavGroup["items"],
    },
    {
      title: "Messages",
      items: [
        ["ADMIN", "OPS"].includes(user.role)
          ? { href: "/settings/notifications/templates", label: "Templates", description: "WhatsApp and email" }
            : null,
        user.role === "ADMIN" ? { href: "/settings/notifications/whatsapp", label: "WhatsApp", description: "Provider connection" } : null,
        ["ADMIN", "OPS"].includes(user.role)
          ? { href: "/settings/notifications/outbox", label: "Outbox", description: "Delivery status" }
          : null,
      ].filter(Boolean) as SettingsNavGroup["items"],
    },
    {
      title: "Tools",
      items: [
        user.role === "ADMIN" ? { href: "/settings/data-heal", label: "Data Heal", description: "Diagnostics and repairs" } : null,
      ].filter(Boolean) as SettingsNavGroup["items"],
    },
  ].filter((g) => g.items.length > 0);

  const quickActions = [
    {
      href: "/settings/profile",
      label: "Edit profile",
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
          <path d="M13.586 3.586a2 2 0 0 1 2.828 2.828l-8.25 8.25a2 2 0 0 1-.878.51l-3 1a.75.75 0 0 1-.948-.948l1-3a2 2 0 0 1 .51-.878l8.25-8.25Z" />
          <path d="M11.793 5.379 14.621 8.207" />
        </svg>
      ),
    },
    ...(user.role === "ADMIN" ? [{ href: "/settings/users", label: "Manage users", icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
        <path d="M11 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        <path d="M2.046 15.253c-.18.01-.34-.092-.382-.266a6.5 6.5 0 0 1 11.672 0c-.042.174-.202.276-.382.266a34.816 34.816 0 0 0-10.908 0Z" />
      </svg>
    )}] : []),
    ...(user.role === "ADMIN" ? [{ href: "/settings/billing", label: "Billing", icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
        <path fillRule="evenodd" d="M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM9.25 5.5a.75.75 0 0 1 1.5 0v.34c.8.1 1.52.43 2.05.92a.75.75 0 0 1-1.02 1.1 2.27 2.27 0 0 0-1.03-.55V9.5c.65.18 1.26.5 1.76.92.6.5.96 1.15.96 1.83s-.36 1.33-.96 1.83c-.5.42-1.11.74-1.76.92v.4a.75.75 0 0 1-1.5 0v-.35a4.66 4.66 0 0 1-2.26-1.07.75.75 0 1 1 .95-1.16c.38.31.83.52 1.31.62V11a3.9 3.9 0 0 1-1.46-.74c-.52-.43-.84-1.02-.84-1.66s.32-1.23.84-1.66c.41-.34.93-.58 1.46-.71V5.5Z" clipRule="evenodd" />
      </svg>
    )}] : []),
  ];

  return (
    <SettingsShell
      workspaceName={org?.name ?? "Workspace"}
      actorName={user.name}
      lastEditedAt={lastEditedAt}
      quickActions={quickActions}
      groups={groups}
    >
      {children}
    </SettingsShell>
  );
}
