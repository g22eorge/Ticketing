import type { ReactNode } from "react";

import { SettingsShell, type SettingsNavGroup } from "@/components/settings/SettingsShell";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const { user, orgId } = await requireOrgSession();

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true },
  }).catch(() => null);

  const permUser = { role: user.role, permissions: user.permissions };

  const groups: SettingsNavGroup[] = [
    {
      title: "Core",
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
              href: "/settings/branding",
              label: "Branding",
              description: "Company and document setup",
              icon: (
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 2c-3.866 0-7 1.343-7 3v10c0 1.657 3.134 3 7 3s7-1.343 7-3V5c0-1.657-3.134-3-7-3Zm0 1.5c3.314 0 5.5 1.074 5.5 1.5S13.314 6.5 10 6.5 4.5 5.426 4.5 5 6.686 3.5 10 3.5Z" clipRule="evenodd" />
                </svg>
              ),
            }
          : null,
        user.role === "ADMIN"
          ? {
              href: "/settings/billing",
              label: "Billing",
              description: "Payments and plans",
              icon: (
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path d="M1 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4Z" />
                  <path d="M1 10a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-6Z" />
                </svg>
              ),
            }
          : null,
        user.role === "ADMIN"
          ? {
              href: "/settings/groups",
              label: "Groups",
              description: "Team group settings",
              icon: (
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path d="M13 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  <path d="M2.046 15.253c-.18.01-.34-.092-.382-.266a6.5 6.5 0 0 1 11.672 0c-.042.174-.202.276-.382.266a34.816 34.816 0 0 0-10.908 0Z" />
                </svg>
              ),
            }
          : null,
        ["ADMIN", "OPS"].includes(user.role)
          ? {
              href: "/settings/branches",
              label: "Branches",
              description: "Multi-location branches",
              icon: (
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path fillRule="evenodd" d="M4 16.5a1.5 1.5 0 0 1 1.5-1.5h1a1.5 1.5 0 0 1 0 3h-1a1.5 1.5 0 0 1-1.5-1.5Z" clipRule="evenodd" />
                  <path d="M1.5 8.5a1.5 1.5 0 0 1 1.5-1.5h1a1.5 1.5 0 0 1 0 3H3a1.5 1.5 0 0 1-1.5-1.5Z" />
                  <path fillRule="evenodd" d="M4 16v-12h12v12H4Z" clipRule="evenodd" />
                </svg>
              ),
            }
          : null,
        ["ADMIN", "OPS"].includes(user.role)
          ? {
              href: "/settings/audit",
              label: "Audit",
              description: "System audit trail",
              icon: (
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.536-11.464a.75.75 0 0 0-1.06 0l-3.5 3.5a.75.75 0 0 0 0 1.06l1.5 1.5a.75.75 0 0 0 1.06-1.06L10.06 11l2.976-2.975a.75.75 0 0 0 0-1.06Z" clipRule="evenodd" />
                </svg>
              ),
            }
          : null,
      ].filter(Boolean) as SettingsNavGroup["items"],
    },
    {
      title: "Notifications",
      items: [
        user.role === "ADMIN" ? { href: "/settings/notifications/templates", label: "Templates", description: "WhatsApp and email" } : null,
        user.role === "ADMIN" ? { href: "/settings/notifications/whatsapp", label: "WhatsApp", description: "Provider connection" } : null,
        ["ADMIN", "OPS"].includes(user.role)
          ? { href: "/settings/notifications/outbox", label: "Outbox", description: "Delivery status" }
          : null,
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
    ...(user.role === "ADMIN" ? [{ href: "/settings/branding", label: "Branding", icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
        <path fillRule="evenodd" d="M10 2c-3.866 0-7 1.343-7 3v10c0 1.657 3.134 3 7 3s7-1.343 7-3V5c0-1.657-3.134-3-7-3Zm0 1.5c3.314 0 5.5 1.074 5.5 1.5S13.314 6.5 10 6.5 4.5 5.426 4.5 5 6.686 3.5 10 3.5Z" clipRule="evenodd" />
      </svg>
    )}] : []),
  ];

  return (
    <SettingsShell
      workspaceName={org?.name ?? "Workspace"}
      actorName={user.name}
      quickActions={quickActions}
      groups={groups}
    >
      {children}
    </SettingsShell>
  );
}
